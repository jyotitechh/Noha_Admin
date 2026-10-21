/* Getting a one-time code to a person: by email, or by SMS.

   Which one is up to them: they type an email address and the code is emailed,
   they type a mobile number and it is texted. A channel that has not been set
   up here is simply "not configured", and sign-in says so; it never pretends
   to have sent something.

   EMAIL is SMTP, so it works with Zoho Mail, Gmail, SendGrid, Brevo and so on:
     SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
   SMS is Twilio today:
     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and one of
     TWILIO_FROM (a number) or TWILIO_MESSAGING_SERVICE_SID
   Another SMS provider is one more entry in `smsProviders` below.

   All of it is read from the environment on the server. None of it is ever in
   the React app, and none of it is logged. */

import nodemailer from 'nodemailer';

const env = (k) => String(process.env[k] ?? '').trim();

/* ---------- what is set up ---------- */

const emailReady = () => !!(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS') && env('SMTP_FROM'));

const smsProviders = {
  twilio: {
    ready: () => !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN')
      && (env('TWILIO_FROM') || env('TWILIO_MESSAGING_SERVICE_SID'))),
    send: sendTwilio,
  },
};
const smsProvider = () => smsProviders[env('SMS_PROVIDER').toLowerCase() || 'twilio'];
const smsReady = () => !!smsProvider()?.ready();

/** For the sign-in screen and the health check: which ways of getting a code work. */
export const channels = () => ({ email: emailReady(), sms: smsReady() });

/* ---------- the transports ----------

   An object, so a test can swap in a recorder and no real message is ever sent.
   (The same trick the Catalyst client uses to run against a fake.) */

export const transport = {
  email: sendSmtp,
  sms: (to, text) => smsProvider().send(to, text),
};

async function sendSmtp({ to, subject, text, html }) {
  const port = Number(env('SMTP_PORT')) || 587;
  const mailer = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    /* 465 is TLS from the first byte; 587 starts plain and upgrades. */
    secure: env('SMTP_SECURE') ? env('SMTP_SECURE') === 'true' : port === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await mailer.sendMail({ from: env('SMTP_FROM'), to, subject, text, html });
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
        : 'The code could not be texted just now. Try again in a minute, or sign in with your email.'),
      { code: 'delivery_failed' },
    );
  }
}
