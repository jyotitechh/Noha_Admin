/* Getting a one-time code to a person: by email, or to their mobile number by WhatsApp or SMS.

   Which one is up to them: they type an email address and the code is emailed,
   they type a mobile number and it goes to that number on WhatsApp (or by SMS where
   WhatsApp is not set up). A channel that has not been set
   up here is simply "not configured", and sign-in says so; it never pretends
   to have sent something.

   EMAIL goes out one of two ways:
     Catalyst Mail (Cloud Scale > Mail), through the same Catalyst sign-in the console already has:
       MAIL_CATALYST_FROM, a sender address verified in Catalyst on a domain verified with SPF and DKIM
       (not a Gmail or Yahoo address). The Catalyst token also needs the scope ZohoCatalyst.email.CREATE.
     SMTP, so Zoho Mail, ZeptoMail (Zoho CPaaS), Gmail, SendGrid, Brevo and so on work too:
       SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
       The Noah API's names are taken too, so the same settings can be copied across unchanged:
       MAIL_SMTP_HOST, MAIL_SMTP_PORT, MAIL_SMTP_USER, MAIL_SMTP_PASS, MAIL_FROM.
   MAIL_PROVIDER = catalyst or smtp says which goes first. Left out, SMTP goes first when it is set up, else Catalyst.
   If the first fails and the other is set up, the other is tried, so one provider being down does not lock anyone out.
   WHATSAPP is Zoho CPaaS, the same agent and approved template as the Noah app's codes:
     ZOHO_CPAAS_AUTH (the whole API key, "Zoho-enczapikey ..."), ZOHO_CPAAS_WHATSAPP_FROM (the business
     number, e.g. 918291565758), ZOHO_CPAAS_WHATSAPP_TEMPLATE_KEY or ZOHO_CPAAS_WHATSAPP_TEMPLATE_ALIAS,
     ZOHO_CPAAS_WHATSAPP_OTP_VARIABLE (the template's variable, default "code"),
     ZOHO_CPAAS_BASE (default https://cpaas.zoho.in, the India data centre). WHATSAPP_PROVIDER=off turns it off.
   SMS is Twilio today:
     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and one of
     TWILIO_FROM (a number) or TWILIO_MESSAGING_SERVICE_SID
   Another SMS provider is one more entry in `smsProviders` below.

   All of it is read from the environment on the server. None of it is ever in
   the React app, and none of it is logged. */

import nodemailer from 'nodemailer';
import * as catalyst from './catalyst.js';

const env = (k) => String(process.env[k] ?? '').trim();
/** The console's own name for a setting, or the Noah API's name for the same thing. */
const either = (...keys) => keys.map(env).find(Boolean) || '';
const smtp = {
  host: () => either('SMTP_HOST', 'MAIL_SMTP_HOST'),
  port: () => either('SMTP_PORT', 'MAIL_SMTP_PORT'),
  user: () => either('SMTP_USER', 'MAIL_SMTP_USER'),
  pass: () => either('SMTP_PASS', 'MAIL_SMTP_PASS'),
  from: () => either('SMTP_FROM', 'MAIL_FROM'),
};

/* ---------- what is set up ---------- */

const mailers = {
  smtp: { ready: () => !!(smtp.host() && smtp.user() && smtp.pass() && smtp.from()), send: sendSmtp },
  catalyst: { ready: () => !!(env('MAIL_CATALYST_FROM') && catalyst.configured()), send: sendCatalystMail },
};

/** The email providers that are set up, the one to try first coming first. */
const mailOrder = () => {
  const first = ['smtp', 'catalyst'].includes(env('MAIL_PROVIDER').toLowerCase())
    ? env('MAIL_PROVIDER').toLowerCase()
    : (mailers.smtp.ready() ? 'smtp' : 'catalyst');
  return [first, first === 'smtp' ? 'catalyst' : 'smtp'].filter((name) => mailers[name].ready());
};

const emailReady = () => mailOrder().length > 0;

/** Which provider a code would be emailed by first ('smtp' or 'catalyst'), or null; for the health check. */
export const emailProvider = () => mailOrder()[0] ?? null;

const smsProviders = {
  twilio: {
    ready: () => !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN')
      && (env('TWILIO_FROM') || env('TWILIO_MESSAGING_SERVICE_SID'))),
    send: sendTwilio,
  },
};
const smsProvider = () => smsProviders[env('SMS_PROVIDER').toLowerCase() || 'twilio'];
const smsReady = () => !!smsProvider()?.ready();

const whatsappProviders = {
  zoho_cpaas: {
    ready: () => !!(env('ZOHO_CPAAS_AUTH') && env('ZOHO_CPAAS_WHATSAPP_FROM')
      && (env('ZOHO_CPAAS_WHATSAPP_TEMPLATE_KEY') || env('ZOHO_CPAAS_WHATSAPP_TEMPLATE_ALIAS'))),
    send: sendCpaasWhatsapp,
  },
};
const whatsappProvider = () => (env('WHATSAPP_PROVIDER').toLowerCase() === 'off'
  ? null
  : whatsappProviders[env('WHATSAPP_PROVIDER').toLowerCase() || 'zoho_cpaas']);
const whatsappReady = () => !!whatsappProvider()?.ready();

/** For the sign-in screen and the health check: which ways of getting a code work. */
export const channels = () => ({ email: emailReady(), sms: smsReady(), whatsapp: whatsappReady() });

/** How a code for a mobile number goes: WhatsApp first (SMS to Indian numbers needs DLT), else SMS, else null. */
export const mobileChannel = () => (whatsappReady() ? 'whatsapp' : smsReady() ? 'sms' : null);

/* ---------- the transports ----------

   An object, so a test can swap in a recorder and no real message is ever sent.
   (The same trick the Catalyst client uses to run against a fake.) */

export const transport = {
  email: sendEmail,
  sms: (to, text) => smsProvider().send(to, text),
  whatsapp: (to, code) => whatsappProvider().send(to, code),
};

/** Email by the first provider that is set up; if it fails, by the next. The last failure is the one thrown. */
async function sendEmail(mail) {
  const order = mailOrder();
  let last = new Error('Email is not set up on this server.');
  for (const [i, name] of order.entries()) {
    try {
      await mailers[name].send(mail);
      return;
    } catch (err) {
      last = err;
      if (i < order.length - 1) console.error(`[deliver] email by ${name} failed (${err.message}); trying ${order[i + 1]}`);
    }
  }
  throw last;
}

async function sendCatalystMail({ to, subject, html }) {
  await catalyst.sendMail({ from: env('MAIL_CATALYST_FROM'), to, subject, html });
}

async function sendSmtp({ to, subject, text, html }) {
  const port = Number(smtp.port()) || 587;
  const mailer = nodemailer.createTransport({
    host: smtp.host(),
    port,
    /* 465 is TLS from the first byte; 587 starts plain and upgrades. */
    secure: env('SMTP_SECURE') ? env('SMTP_SECURE') === 'true' : port === 465,
    auth: { user: smtp.user(), pass: smtp.pass() },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await mailer.sendMail({ from: smtp.from(), to, subject, text, html });
}

async function sendTwilio(to, text) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const body = new URLSearchParams({ To: to, Body: text });
  if (env('TWILIO_MESSAGING_SERVICE_SID')) body.set('MessagingServiceSid', env('TWILIO_MESSAGING_SERVICE_SID'));
  else body.set('From', env('TWILIO_FROM'));

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`Twilio refused the message (${res.status}${j.code ? ` / ${j.code}` : ''}): ${j.message || 'no reason given'}`);
  }
}

/* Zoho CPaaS: POST /v1.1/whatsapp with an approved template (the Authentication template "noah_otp",
   whose one variable is the code). Docs: https://www.zoho.com/cpaas/help/api/send-a-whatsapp-message.html
   The code goes only in merge_info: never in client_reference, which shows in the CPaaS message logs. */
async function sendCpaasWhatsapp(to, code) {
  const base = (env('ZOHO_CPAAS_BASE') || 'https://cpaas.zoho.in').replace(/\/+$/, '');
  const key = env('ZOHO_CPAAS_AUTH');
  const plus = (n) => '+' + String(n).replace(/\D/g, '');
  const body = {
    /* CPaaS wants both numbers with their '+': without it the sender is "not associated". */
    from: plus(env('ZOHO_CPAAS_WHATSAPP_FROM')),
    to: plus(to),
    merge_info: { [env('ZOHO_CPAAS_WHATSAPP_OTP_VARIABLE') || 'code']: String(code) },
    client_reference: 'console-sign-in',
  };
  if (env('ZOHO_CPAAS_WHATSAPP_TEMPLATE_KEY')) body.template_key = env('ZOHO_CPAAS_WHATSAPP_TEMPLATE_KEY');
  else body.template_alias = env('ZOHO_CPAAS_WHATSAPP_TEMPLATE_ALIAS');

  const res = await fetch(`${base}/v1.1/whatsapp`, {
    method: 'POST',
    headers: {
      /* Kept as the whole key, as CPaaS shows it; the bare key works too. */
      Authorization: /^zoho-enczapikey\s/i.test(key) ? key : `Zoho-enczapikey ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.status && j.status !== 'success')) {
    const e = j.error || {};
    const detail = (e.details || []).map((d) => [d.code, d.message, d.target].filter(Boolean).join(' ')).join('; ');
    throw new Error(`Zoho CPaaS refused the WhatsApp message (${res.status}${e.code ? ` / ${e.code}` : ''}): ${[e.message, detail].filter(Boolean).join(' - ') || 'no reason given'}`);
  }
}

/* ---------- the message ---------- */

/** '+919876543210' -> '+91••••••3210'. Shown back to the person, so they know
    where to look without the screen repeating the whole number. */
export function maskMobile(e164) {
  const s = String(e164 || '');
  return s.length <= 6 ? s : s.slice(0, 3) + '•'.repeat(Math.max(2, s.length - 7)) + s.slice(-4);
}

/** 'anitha@karunasadan.org' -> 'a•••@karunasadan.org'. */
export function maskEmail(addr) {
  const [user = '', host = ''] = String(addr || '').split('@');
  return (user.slice(0, 1) + '•••') + (host ? '@' + host : '');
}

/** The number in the form SMS providers want: '+' and digits, with the country code. */
export const e164 = (mobileKeyValue) => '+' + String(mobileKeyValue || '').replace(/\D/g, '');

const minutes = (ms) => Math.round(ms / 60000);

/**
 * Send `code` to the person. `via` is 'email' or 'sms'; `to` is the address
 * or the e164 number. Throws, with a message fit to show, if it cannot.
 */
export async function sendCode({ via, to, code, ttlMs }) {
  const mins = minutes(ttlMs);
  try {
    if (via === 'email') {
      if (!emailReady()) throw new Error('Email is not set up on this server.');
      await transport.email({
        to,
        subject: `${code} is your Karuna Sadan console code`,
        text: `Your Karuna Sadan console sign-in code is ${code}.\n\nIt works once and lasts ${mins} minutes. `
          + `If you did not ask for it, ignore this message: nobody can sign in without it.`,
        html: `<p>Your Karuna Sadan console sign-in code is</p>`
          + `<p style="font-size:26px;letter-spacing:6px;font-weight:700;font-family:monospace">${code}</p>`
          + `<p>It works once and lasts ${mins} minutes. If you did not ask for it, ignore this message: `
          + `nobody can sign in without it.</p>`,
      });
      return;
    }
    if (via === 'whatsapp') {
      if (!whatsappReady()) throw new Error('WhatsApp is not set up on this server.');
      await transport.whatsapp(to, code);
      return;
    }
    if (via === 'sms') {
      if (!smsReady()) throw new Error('SMS is not set up on this server.');
      await transport.sms(to, `${code} is your Karuna Sadan console code. It works once and lasts ${mins} minutes.`);
      return;
    }
    throw new Error(`Unknown way to send a code: ${via}`);
  } catch (err) {
    /* The provider's own words are for the server log; they can name accounts
       and numbers. The person gets a plain sentence. */
    console.error(`[deliver] ${via} to ${via === 'email' ? maskEmail(to) : maskMobile(to)} failed: ${err.message}`);
    throw Object.assign(
      new Error(via === 'email'
        ? 'The code could not be emailed just now. Try again in a minute, or sign in with your mobile number.'
        : via === 'whatsapp'
          ? 'The code could not be sent on WhatsApp. Check that this number uses WhatsApp, or sign in with your email.'
          : 'The code could not be texted just now. Try again in a minute, or sign in with your email.'),
      { code: 'delivery_failed' },
    );
  }
}
