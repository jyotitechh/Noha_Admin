/* Sign in.

   NO ZOHO SINGLE SIGN-ON. This is a mobile-number-or-email + six-digit-code
   flow that stands in for it. Staff are members: they sign in with the number
   or the email address they registered with in the Noah app. A number is
   texted its code; an address is emailed it. The prototype's screen had a
   "Continue with Zoho" button; the layout is otherwise the same, so putting
   Zoho back is a matter of adding the button and pointing it at the callback.

   When the server has no SMS or email set up, the code is shown on screen
   instead, marked below. The box listing the test accounts goes with it: a real
   console would never publish its own staff list before sign-in. */

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, type CodeSent, type Identity } from '@/state/auth';
import { Icon, Note } from '@/components/ui';
import logo from '@/assets/logo.png';

interface Account { mobile: string; name: string; title: string; role: string; roleName: string }
type Mode = 'mobile' | 'email';

export default function SignIn() {
  const { requestCode, verify } = useAuth();
  const [step, setStep] = useState<'start' | 'otp'>('start');
  const [mode, setMode] = useState<Mode>('mobile');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  /* Who the code was asked for, kept so "verify" and "send again" use exactly
     what was sent, even if the boxes are edited after. */
  const [who, setWho] = useState<Identity | null>(null);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  /* Set on a deployed API, where the one-time code can come back in the response
     and this is the only thing guarding it. Unset locally. */
  const [passphrase, setPassphrase] = useState('');
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  /* A 403 here is the deployed API declining to publish the staff list. That
     is the intended answer, not a failure, so it is simply left empty. */
  useEffect(() => { api.get<Account[]>('/auth/accounts').then(setAccounts).catch(() => {}); }, []);
  useEffect(() => {
    api.get<{ passphraseRequired?: boolean }>('/meta')
      .then((m) => setNeedsPassphrase(!!m.passphraseRequired))
      .catch(() => {});
  }, []);
  useEffect(() => { if (step === 'otp') boxes.current[0]?.focus(); }, [step]);

  /* Counts down to when "send again" works, so the button says why it is idle. */
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const typed = mode === 'mobile' ? mobile.trim() : email.trim();

  async function send(to: Identity) {
    setBusy(true);
    setError('');
    try {
      const r = await requestCode(to, passphrase);
      setWho(to);
      setSent(r);
      setWait(r.resendAfterSeconds ?? 0);
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(code: string) {
    if (!who) return;
    setBusy(true);
    setError('');
    try {
      await verify(who, code);
      /* The provider sets the user; the router takes it from here. */
    } catch (e) {
      setError((e as Error).message);
      setDigits(['', '', '', '', '', '']);
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  /* Typing moves along; backspace moves back; a pasted code fills every box. */
  function onDigit(i: number, raw: string) {
    const only = raw.replace(/\D/g, '');
    if (!only) { setDigits((d) => d.map((x, k) => (k === i ? '' : x))); return; }

    const next = [...digits];
    for (let k = 0; k < only.length && i + k < 6; k++) next[i + k] = only[k];
    setDigits(next);

    const landed = Math.min(5, i + only.length);
    boxes.current[landed]?.focus();
    if (next.every(Boolean)) submit(next.join(''));
  }

  const pick = (m: Mode) => { setMode(m); setError(''); };
  const asked = who?.email ?? who?.mobile ?? '';
  const how = sent?.via === 'sms' ? 'texted' : sent?.via === 'email' ? 'emailed' : '';

  return (
    <div className="signin">
      <div className="si-art">
        <img src={logo} alt="" />
        <h1>Karuna Sadan</h1>
        <p>
          The admin console behind the Noah and Jodie apps. Approve the members
          registering from the app, answer what the congregation sends in, and
          keep the register, the giving and the content in order.
        </p>
      </div>

      <div className="si-form">
        {step === 'start' ? (
          <div className="si-card">
            <h2>Sign in</h2>
            <p className="muted mt0">
              Use the mobile number or the email address you registered with in the
              Noah app. If a super administrator has given you access, we will send
              a six-digit code: texted to a number, emailed to an address.
            </p>

            <div className="tabs mt16" role="tablist" aria-label="Sign in with">
              {(['mobile', 'email'] as const).map((m) => (
                <a
                  key={m}
                  href="#"
                  role="tab"
                  aria-selected={mode === m}
                  className={mode === m ? 'on' : ''}
                  onClick={(e) => { e.preventDefault(); pick(m); }}
                >
                  <Icon name={m === 'mobile' ? 'phone' : 'mail'} />
                  {m === 'mobile' ? 'Mobile number' : 'Email'}
                </a>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (typed) send(mode === 'mobile' ? { mobile: typed } : { email: typed });
              }}
            >
              {mode === 'mobile' ? (
                <label className="fld">
                  <span className="lbl">Mobile number</span>
                  <input
                    id="si-mobile"
                    className={'inp' + (error ? ' err' : '')}
                    type="tel"
                    inputMode="tel"
                    autoComplete="username"
                    autoFocus
                    value={mobile}
                    placeholder="+91 98765 43210"
                    onChange={(e) => { setMobile(e.target.value); setError(''); }}
                  />
                </label>
              ) : (
                <label className="fld">
                  <span className="lbl">Email address</span>
                  <input
                    id="si-email"
                    className={'inp' + (error ? ' err' : '')}
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoFocus
                    value={email}
                    placeholder="you@example.com"
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  />
                </label>
              )}
              {/* Only on a deployed API, and only matters while a code can come
                  back in the response: it is what stops a stranger asking for it. */}
              {needsPassphrase && (
                <label className="fld mt12">
                  <span className="lbl">Office passphrase</span>
                  <input
                    className={'inp' + (error ? ' err' : '')}
                    type="password"
                    autoComplete="current-password"
                    value={passphrase}
                    placeholder="Shared with the office"
                    onChange={(e) => { setPassphrase(e.target.value); setError(''); }}
                  />
                  <span className="small muted mt4">
                    This console is reachable from the internet, so sign-in needs the
                    shared passphrase as well as your {mode === 'mobile' ? 'number' : 'address'}.
                  </span>
                </label>
              )}
              {error && <div className="small mt8" role="alert" style={{ color: 'var(--bad)', fontWeight: 600 }}>{error}</div>}
              <button
                className="btn pri mt16"
                style={{ width: '100%' }}
                disabled={busy || !typed || (needsPassphrase && !passphrase)}
              >
                {busy ? 'Sending…' : 'Send the code'}
              </button>
            </form>

            {/* Test accounts only: one fixed number per role, so each can be tried
                without a real person. Never real staff: a sign-in page that
                listed them would be a directory for anyone probing it. */}
            {accounts.length > 0 && (
              <div className="mt20">
                <div className="sect-title">Test accounts — pick a role to try</div>
                <div className="card" style={{ maxHeight: 210, overflow: 'auto' }}>
                  <ul className="list">
                    {accounts.slice(0, 8).map((a) => (
                      <li key={a.mobile} className="click" onClick={() => send({ mobile: a.mobile })}>
                        <span className="grow">
                          <span className="t1">{a.name}</span>
                          <span className="t2 mono">{a.mobile}</span>
                        </span>
                        <Icon name="chev-r" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <p className="xs muted mt16" style={{ lineHeight: 1.6 }}>
              Zoho single sign-on is not wired up in this build. When it is, it
              replaces this form and nothing else changes.
            </p>
          </div>
        ) : (
          <div className="si-card">
            <h2>Enter the code</h2>
            <p className="muted mt0">
              {how
                ? <>We {how} a six-digit code to <b>{sent?.sentTo}</b>.</>
                : <>A six-digit code for <b>{sent?.name || asked}</b>.</>}{' '}
              It lasts five minutes and works once.
            </p>

            <div className="otp mt16" role="group" aria-label="One-time code">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { boxes.current[i] = el; }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label={`Digit ${i + 1}`}
                  value={d}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                    if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
                    if (e.key === 'ArrowRight' && i < 5) boxes.current[i + 1]?.focus();
                  }}
                />
              ))}
            </div>

            {error && <div className="small mt8" role="alert" style={{ color: 'var(--bad)', fontWeight: 600 }}>{error}</div>}

            {/* Only when nothing was really sent: the server has no SMS or email
                set up yet. Absent for test accounts in production, where the
                person testing already knows the code. */}
            {sent?.devCode ? (
              <div className="mt16">
                <Note tone="warn" icon="key">
                  This server cannot {who?.email ? 'email' : 'text'} codes yet, so it is shown here.
                  Your code is{' '}
                  <b className="mono" style={{ fontSize: 15, letterSpacing: '.08em' }}>{sent.devCode}</b>.
                </Note>
              </div>
            ) : how ? (
              <p className="xs muted mt16">
                {sent?.via === 'sms'
                  ? 'Texts usually arrive within a minute.'
                  : 'Nothing there? Check the spam folder.'}
              </p>
            ) : (
              <p className="xs muted mt16">Enter the test code you were given.</p>
            )}

            <button
              className="btn pri mt16"
              style={{ width: '100%' }}
              disabled={busy || digits.some((d) => !d)}
              onClick={() => submit(digits.join(''))}
            >
              {busy ? 'Checking…' : 'Verify and sign in'}
            </button>

            {how && (
              <button
                className="btn mt8"
                style={{ width: '100%' }}
                disabled={busy || wait > 0}
                onClick={() => who && send(who)}
              >
                {wait > 0 ? `Send it again in ${wait}s` : 'Send it again'}
              </button>
            )}

            <button className="btn ghost mt8" style={{ width: '100%' }} onClick={() => { setStep('start'); setError(''); }}>
              Use {who?.email ? 'a different address' : 'a different number'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
