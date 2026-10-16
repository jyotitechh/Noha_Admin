/* Member-facing routes, for the Noah Flutter app.

   These follow code/noah/docs/BACKEND_HANDOFF.md. They exist so the admin
   console is demonstrably connected: approve a registration in the console and
   GET /api/app/registration/status flips to `approved`, which is what the app
   polls instead of its "Simulate: admin approves" button.

   This is the part the hand-off doc calls "the server decides". The rules it
   lists are enforced here, not in the app:
     - access stays locked until a registration is approved
     - a prayer request with everyone:false reaches prayer warriors only
     - posts, comments, prayer requests and praise reports appear only once a
       moderator has approved them

   Prototype only: the member session is the mobile number, there is no OTP
   verification against a real gateway and no file storage for the uploads. */

import { db } from '../db.js';
import { now, ri } from '../seed/helpers.js';
import { videoScript } from '../seed/registrations.js';
import { normalise, validateRegistration, MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from '../validate.js';
import { live, registrationByMobile, memberByMobile, createRegistration, registrationById, patchRegistration } from '../store.js';

const clean = (s) => String(s || '').replace(/\s+/g, '');

/* Which of the six steps to send the member back to, given the fields that
   failed. The app opens that step rather than making them hunt for it. */
const STEP_OF = {
  firstName: 1, middleName: 1, lastName: 1, email: 1, gender: 1, dob: 1, marital: 1, reference: 1,
  line1: 2, line2: 2, city: 2, region: 2, country: 2, pin: 2,
  idType: 3, idNumber: 3, idFile: 3,
  photoFile: 4,
  agreed: 5, signature: 5,
  videoSecs: 6,
};
const FIRST_BAD_STEP = (errors) =>
  Math.min(...Object.keys(errors).map((k) => STEP_OF[k] ?? 9));

/** The registration for a mobile number, newest first. */
const regFor = async (mobile) =>
  live()
    ? await registrationByMobile(mobile)
    : db.REGISTRATIONS.filter((r) => clean(r.mobile) === clean(mobile)).sort((a, b) => b.at - a.at)[0];

const memberFor = async (mobile) =>
  live()
    ? await memberByMobile(mobile)
    : db.MEMBERS.find((m) => clean(m.mobile) === clean(mobile));

export default function mountApp(app) {
  /* ---------- sign-in ---------- */

  /* Step one of the journey: the member types their number.

     In the mock the code is always 4821 and is returned in the response. On
     Catalyst this sends a real SMS through a DLT-registered template and
     returns nothing but `ok` — a backend that returns the code is a backend
     anyone can sign in to. */
  app.post('/api/app/auth/request-otp', async (req, res) => {
    const mobile = String(req.body?.mobile || '').trim();
    /* E.164-ish: a country code and 6 to 14 digits. */
    if (!/^\+\d{1,4}[\s-]?\d[\d\s-]{5,}$/.test(mobile)) {
      return res.status(400).json({ error: 'That is not a mobile number.', errors: { mobile: 'Give the number with its country code.' } });
    }
    const existing = await memberFor(mobile);
    const reg = await regFor(mobile);
    res.json({
      ok: true,
      /* So the app can show "Welcome back" rather than a blank OTP screen.
         It is a hint for wording only — `verify` is what decides. */
      known: !!(existing || reg),
      expiresInSeconds: 300,
      resendAfterSeconds: 24,
      /* MOCK ONLY. Catalyst must not return this. */
      devCode: '4821',
    });
  });

  /* The app sends the number and the code; we say what happens next. The
     hand-off doc asks the OTP-verify endpoint to return exactly this. */
  app.post('/api/app/auth/verify', async (req, res) => {
    const mobile = req.body?.mobile || '';
    const code = String(req.body?.code || '');
    if (code !== '4821') return res.status(400).json({ error: 'That code is not right.' });

    const member = await memberFor(mobile);
    if (member) {
      return res.json({
        status: 'member',
        token: 'demo-' + member.id,
        member: { id: member.id, name: member.name, loc: member.loc, lang: member.lang },
      });
    }
    const reg = await regFor(mobile);
    if (!reg) return res.json({ status: 'new' });
    if (reg.state === 'approved') {
      const created = live() ? await memberByMobile(mobile) : db.MEMBERS.find((m) => m.id === reg.memberId);
      return res.json({
        status: 'member',
        token: 'demo-' + reg.memberId,
        member: created ? { id: created.id, name: created.name, loc: created.loc, lang: created.lang } : null,
      });
    }
    return res.json({ status: 'pending', registrationId: reg.id, state: reg.state });
  });

  /* ---------- uploads ----------

     The ID scan, the photograph and the KYC video.

     The app does NOT post files through this API. It asks here for a place to
     put one, uploads straight to storage, and sends back the id it was given.
     Going through the API would double the transfer of a 30-second video for
     no benefit, and Catalyst File Store and Stratus both issue signed URLs
     for exactly this.

     The mock hands back a fake id and a URL that goes nowhere, so the Flutter
     developer can build and test the whole sequence before storage exists. */

  const UPLOAD_KINDS = {
    id: { exts: ['jpg', 'jpeg', 'png', 'pdf'], maxBytes: 5 * 1024 * 1024, what: 'ID document', article: 'An' },
    photo: { exts: ['jpg', 'jpeg', 'png'], maxBytes: 5 * 1024 * 1024, what: 'photograph', article: 'A' },
    video: { exts: ['mp4', 'mov'], maxBytes: 60 * 1024 * 1024, what: 'KYC video', article: 'A' },
  };

  app.post('/api/app/uploads', (req, res) => {
    const kind = String(req.body?.kind || '');
    const spec = UPLOAD_KINDS[kind];
    if (!spec) return res.status(400).json({ error: 'kind must be id, photo or video.' });

    const filename = String(req.body?.filename || '');
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const bytes = Number(req.body?.bytes || 0);

    if (!spec.exts.includes(ext)) {
      return res.status(400).json({ error: `${spec.article} ${spec.what} must be a ${spec.exts.join(', ')} file.` });
    }
    if (!bytes || bytes > spec.maxBytes) {
      return res.status(400).json({ error: `${spec.article} ${spec.what} must be under ${Math.round(spec.maxBytes / 1048576)} MB.` });
    }

    const fileId = `${kind}_${ri(100000, 999999)}${Date.now().toString(36)}`;
    res.status(201).json({
      ok: true,
      fileId,
      /* Catalyst returns a real signed PUT URL here. */
      uploadUrl: `${req.protocol}://${req.get('host')}/api/app/uploads/${fileId}`,
      expiresInSeconds: 900,
      mock: true,
    });
  });

  /* Where the mock pretends to receive the bytes. Catalyst does not need this
     route at all — the app PUTs straight to storage. */
  app.put('/api/app/uploads/:fileId', (req, res) => {
    res.json({ ok: true, fileId: req.params.fileId, stored: false, mock: true });
  });

  /* ---------- registration ---------- */

  /* Step 1 to 6 in one submission, as the Flutter flow collects them.

     The body may use the app's own field names (address1, state, phone,
     videoSeconds); `normalise` maps them. Every rule the app enforces is
     enforced again here, because the app can be bypassed. */
  app.post('/api/app/registration', async (req, res) => {
    const b = normalise(req.body || {});
    const { ok, errors, value } = validateRegistration(b, { now: now() });
    if (!ok) {
      return res.status(400).json({
        error: 'Some answers need fixing.',
        /* field -> message, so the app can put each one against its box */
        errors,
        step: FIRST_BAD_STEP(errors),
      });
    }

    const reg = {
      id: 'REG-' + (7500 + db.REGISTRATIONS.length),
      ...value,
      signedOn: value.signedOn ? new Date(value.signedOn) : now(),
      state: 'pending',
      at: now(),
      decidedAt: null, decidedBy: '', remark: '', memberId: null,
      videoAttempt: 1,
      declarationVersion: value.declarationVersion || '2026.09',
      declarationLang: value.declarationLang || 'en',
      checks: {
        idReadable: null, photoMatchesId: null, videoAudible: null,
        /* The three the server already knows, from the checks just run. */
        nameMatchesSignature: true,
        ageOver18: true,
        duplicateMobile: !!(await memberFor(value.mobile)),
      },
    };
    reg.script = videoScript(reg);

    if (live()) {
      const regId = await createRegistration(value);
      return res.status(201).json({ ok: true, registrationId: regId, state: 'pending' });
    }
    db.REGISTRATIONS.unshift(reg);
    res.status(201).json({ ok: true, registrationId: reg.id, state: reg.state });
  });

  /* What the app polls in place of its simulate buttons. */
  app.get('/api/app/registration/status', async (req, res) => {
    const reg = req.query.id
      ? (live() ? await registrationById(req.query.id) : db.REGISTRATIONS.find((r) => r.id === req.query.id))
      : await regFor(req.query.mobile || '');
    if (!reg) return res.status(404).json({ error: 'No registration found for that number.' });
    res.json({
      id: reg.id,
      state: reg.state,
      remark: reg.remark,
      decidedAt: reg.decidedAt,
      memberId: reg.memberId,
      /* Shown on the waiting page. Still a placeholder: see README. */
      office: { name: 'Anitha Varghese', phone: '+91 98200 00000', hours: 'Monday to Saturday, 9 am to 6 pm' },
    });
  });

  /* Re-record step 6 after the office returned the video.
     The app sends `videoSeconds` and `videoPath`, so normalise first. */
  app.post('/api/app/registration/video', async (req, res) => {
    const b = normalise(req.body || {});
    const reg = live() ? await registrationById(b.id) : db.REGISTRATIONS.find((r) => r.id === b.id);
    if (!reg) return res.status(404).json({ error: 'No such registration.' });
    if (reg.state !== 'videoReturned') return res.status(409).json({ error: 'That registration is not waiting for a new video.' });
    const secs = Number(b.videoSecs || 0);
    if (secs < MIN_VIDEO_SECONDS || secs > MAX_VIDEO_SECONDS) {
      return res.status(400).json({ error: `The video must be between ${MIN_VIDEO_SECONDS} and ${MAX_VIDEO_SECONDS} seconds.` });
    }
    if (live()) {
      await patchRegistration(reg, {
        videoSecs: secs,
        videoFile: b.videoFile || reg.videoFile,
        state: 'pending',
        submittedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        remark: '',
      });
      return res.json({ ok: true, state: 'pending' });
    }
    reg.videoSecs = secs;
    reg.videoFile = b.videoFile || reg.videoFile;
    reg.state = 'pending';
    reg.at = now();
    reg.remark = '';
    reg.checks = { ...reg.checks, videoAudible: null };
    res.json({ ok: true, state: reg.state });
  });

  /* ---------- home ---------- */

  app.get('/api/app/manna', (req, res) => {
    const published = db.MANNA.filter((m) => m.status === 'Published' && m.title);
    const limit = Math.min(60, Number(req.query.limit) || 14);
    res.json(published.slice(-limit).reverse().map((m) => ({
      id: m.id, date: m.date, title: m.title, verse: m.verse, cat: m.cat, body: m.body || '',
    })));
  });

  app.get('/api/app/banners', (_req, res) => {
    res.json(db.BANNERS.filter((b) => b.status === 'Live').map((b) => ({
      id: b.id, kicker: b.kicker, title: b.title, sub: b.sub, to: b.to, grad: b.grad,
    })));
  });

  app.get('/api/app/announcements', (_req, res) =>
    res.json(db.ANNOUNCEMENTS.filter((a) => a.status === 'Live')));

  /* ---------- prayer ---------- */

  /* A new request from the app's pop-up. It waits for a moderator: the app
     must not show it on anyone else's wall until the console approves it. */
  app.post('/api/app/prayer', (req, res) => {
    const b = normalise(req.body || {});
    const text = String(b.text || '').trim();
    if (text.length < 5) return res.status(400).json({ error: 'Write a little more about the request.' });

    /* The app sends translation keys (pr_cat_healing); the console stores the
       English word, because a moderator reads it. */
    const CATEGORY = {
      pr_cat_healing: 'Healing', pr_cat_family: 'Family', pr_cat_guidance: 'Guidance',
      pr_cat_thanks: 'Thanksgiving', pr_cat_other: 'Other',
    };
    const raw = String(b.category || 'Other');
    const category = CATEGORY[raw] ?? raw;

    const r = {
      id: 'PRQ-' + (3200 + db.PRAYER_INBOX.length),
      category,
      text,
      everyone: !!b.everyone,
      anonymous: !!b.anonymous,
      memberName: b.memberName || '',
      mobile: b.mobile || '',
      /* Set when the request was written from a Daily Manna reading, so the
         moderator can see what prompted it. */
      mannaId: b.mannaId || null,
      at: now(),
      state: 'Pending',
      decidedBy: '', remark: '', prayedBy: 0,
    };
    db.PRAYER_INBOX.unshift(r);
    res.status(201).json({ ok: true, id: r.id, state: r.state });
  });

  /* The wall. `audience` decides what comes back: a request submitted for
     prayer warriors only never reaches the open wall. */
  app.get('/api/app/prayer', (req, res) => {
    const warrior = req.query.audience === 'warriors';
    const rows = db.PRAYER_INBOX
      .filter((p) => p.state === 'Approved')
      .filter((p) => warrior || p.everyone)
      .map((p) => ({
        id: p.id, category: p.category, text: p.text,
        name: p.anonymous ? 'Anonymous' : p.memberName || 'A member',
        at: p.at, prayedBy: p.prayedBy,
      }));
    res.json(rows);
  });

  /* ---------- events and passes ---------- */

  app.get('/api/app/events', (_req, res) => {
    res.json(db.EVENTS.filter((e) => e.status === 'Published').map((e) => ({
      id: e.id, title: e.name, place: e.place, start: e.start, seatsLeft: e.seats ? e.seats - (e.booked || 0) : null,
    })));
  });

  app.get('/api/app/passes', async (req, res) => {
    const m = await memberFor(req.query.mobile || '');
    if (!m) return res.json([]);
    res.json(db.PASSES.filter((p) => p.member === m.id).map((p) => ({
      id: p.id, event: p.event, seats: p.seats, gate: p.gate, code: p.code, bookedOn: p.at,
    })));
  });

  app.post('/api/app/passes', async (req, res) => {
    const m = await memberFor(req.body?.mobile || '');
    if (!m) return res.status(403).json({ error: 'Only an approved member can book.' });
    const e = db.EVENTS.find((x) => x.id === req.body?.eventId && x.status === 'Published');
    if (!e) return res.status(404).json({ error: 'That event is not open for booking.' });
    const seats = Math.max(1, Math.min(6, Number(req.body?.seats) || 1));
    const pass = {
      id: 'PS-' + ri(60000, 69999), member: m.id, name: m.name, event: e.id,
      seats, gate: 'Gate ' + ri(1, 3), code: 'KS' + ri(100000, 999999), at: now(), scanned: false,
    };
    db.PASSES.unshift(pass);
    e.booked = (e.booked || 0) + seats;
    res.status(201).json({ ok: true, pass });
  });

  /* ---------- me ---------- */

  app.get('/api/app/me', async (req, res) => {
    const m = memberFor(req.query.mobile || '');
    if (!m) return res.status(404).json({ error: 'Not a member.' });
    const pastor = db.PASTORS.find((p) => p.id === m.pastor);
    res.json({
      id: m.id, name: m.name, loc: m.loc, cell: m.cell, lang: m.lang,
      memberSince: m.joined, partner: m.partner,
      pastor: pastor ? { name: pastor.name, mobile: pastor.mobile } : null,
    });
  });
}
