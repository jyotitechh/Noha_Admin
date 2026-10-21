/* Sign in.

   NO ZOHO SINGLE SIGN-ON. This is a mobile number + six-digit code flow that
   stands in for it. Staff are members: they sign in with the number they
   registered with in the Noah app. The prototype's screen had a "Continue with Zoho" button;
   the layout is otherwise the same, so putting Zoho back is a matter of
   adding the button and pointing it at the callback.

   Because this is a prototype with no mailer, the code is shown on screen.
   The box listing the staff accounts goes with it: a real console would never
   publish its own staff list before sign-in. Both are marked below. */

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { Icon, Note } from '@/components/ui';
import logo from '@/assets/logo.png';

interface Account { mobile: string; name: string; title: string; role: string; roleName: string }

export default function SignIn() {
  const { requestCode, verify } = useAuth();
  const [step, setStep] = useState<'start' | 'otp'>('start');
  const [mobile, setMobile] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [devCode, setDevCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  /* Set on a deployed API, where the one-time code comes back in the response
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

  async function send(toMobile: string) {
    setBusy(true);
    setError('');
    try {
      const r = await requestCode(toMobile, passphrase);
      setMobile(toMobile);
      setName(r.name);
      setDevCode(r.devCode ?? '');
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(code: string) {
    setBusy(true);
    setError('');
    try {
      await verify(mobile, code);
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
              Enter the mobile number you registered with in the Noah app. If a
              super administrator has given you access, we will send a six-digit code.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); if (mobile.trim()) send(mobile.trim()); }}
              style={{ marginTop: 16 }}
            >
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
              {/* Only on a deployed API. There is no mailer yet, so the code
                  comes back in the response — this is what stops a stranger
                  asking for it. */}
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
                    shared passphrase as well as your number.
                  </span>
                </label>
              )}
              {error && <div className="small mt8" style={{ color: 'var(--bad)', fontWeight: 600 }}>{error}</div>}
              <button
                className="btn pri mt16"
                style={{ width: '100%' }}
                disabled={busy || !mobile.trim() || (needsPassphrase && !passphrase)}
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
                      <li key={a.mobile} className="click" onClick={() => send(a.mobile)}>
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
              A six-digit code for <b>{name || mobile}</b>. It lasts five minutes and works once.
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

            {error && <div className="small mt8" style={{ color: 'var(--bad)', fontWeight: 600 }}>{error}</div>}

            {/* Prototype only: there is no SMS gateway yet, so the code is shown
                here. It is absent for test accounts in production, where the
                person testing already knows it. */}
            {devCode ? (
              <div className="mt16">
                <Note tone="warn" icon="key">
                  Nothing is texted in this build. Your code is{' '}
                  <b className="mono" style={{ fontSize: 15, letterSpacing: '.08em' }}>{devCode}</b>.
                </Note>
              </div>
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

            <button className="btn ghost mt8" style={{ width: '100%' }} onClick={() => { setStep('start'); setError(''); }}>
              Use a different number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
