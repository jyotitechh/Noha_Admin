/* Demo mode, for showing the console to someone without giving them the keys.

   DEMO_MODE=true on the API turns on three things together:
     - the test accounts (+91 90000 00001 .. 10) sign in with a FIXED code, 123456
       (or TEST_LOGIN_OTP if one is set);
     - no office passphrase is asked for;
     - Catalyst is NOT used, even if its credentials are present: the sample data is
       shown, so nothing real can be seen or changed. Changes made in the demo live
       in memory and go when the server restarts.

   The code is published on purpose, here and on the sign-in page, so this is only for
   a demo. For real use leave DEMO_MODE unset: sign-in then needs a real staff account,
   a code sent by email/SMS, and the passphrase. */

export const demoMode = () => String(process.env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';

export const DEMO_CODE = '123456';
export const DEMO_MOBILE = '+91 90000 00001';
