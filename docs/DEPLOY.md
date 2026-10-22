# Deploying

Two pieces, two hosts:

| | Where | What it is |
|---|---|---|
| Console (React) | **Catalyst Slate**: `https://karuna-admin-eayoyuuw.onslate.in` | static files from `dist/` |
| API (Express) | Render (or Railway / Fly) | `server/`, holds the secrets |

They are split because Slate serves static files and does not run an Express server.
A console built without the API's address posts sign-in to the Slate site itself and gets
**405**: the page was deployed, its server never was.

(The console used to be on Vercel. It no longer is; see "Leaving Vercel" below.)

---

## Why the API cannot simply be made public

Until email or SMS is set up on the server (see `docs/CONSOLE-ACCESS.md`),
`POST /auth/request-code` returns the one-time code **in the response**, and
`GET /auth/accounts` lists the test accounts. (With neither a channel nor a
passphrase, a deployed server refuses instead.) On `localhost` that is a convenience.
On a public URL it means anyone who finds the address can ask for the super
administrator's code, be given it, and sign in, and behind that sit members' names,
mobile numbers, dates of birth, addresses, ID numbers, photographs, ID proofs and KYC
videos.

So a deployed API **must** have `ADMIN_PASSPHRASE` set. With it:

- `/auth/accounts` returns 403: the staff list is not published
- `/auth/request-code` needs the passphrase, and refuses without it
- eight wrong guesses locks that caller out for ten minutes
- the sign-in screen asks for it, because `/api/meta` says it is required

Unset (every local run, every test) nothing changes.

This is a stopgap that makes deploying safe, not an auth system. It goes when
a real mailer or Zoho SSO lands.

A good passphrase, copied straight to the clipboard so it is never typed or shown:

```
node -e "const w=['amber','harbor','lantern','orchid','quiet','river','cedar','falcon','meadow','copper','velvet','summit','willow','ember','granite','saffron'];const r=()=>w[require('crypto').randomInt(w.length)];console.log([r(),r(),r(),r(),require('crypto').randomInt(1000,9999)].join('-'))" | tr -d '\r\n' | clip
```

Paste it into Render's `ADMIN_PASSPHRASE`, and share it with the office privately.

---

## 1. The API, on Render

The repository has a `render.yaml`, so: **New → Blueprint**, point it at this
repo, and Render reads the plan. It will ask you for each secret.

Set these yourself in Render's dashboard; the values never go in git:

| Variable | What it is |
|---|---|
| `CATALYST_CLIENT_ID` | from `.env.local` |
| `CATALYST_CLIENT_SECRET` | from `.env.local` |
| `CATALYST_REFRESH_TOKEN` | from `.env.local` |
| `NOAH_ADMIN_API_KEY` | from `ADMIN_API_KEY.txt`, when the Catalyst developer sends it. Leave blank until then; approvals still work and warn that the member was not emailed |
| `ADMIN_PASSPHRASE` | **you choose this** (see above). Until email or SMS is set up, nothing else guards the sign-in code |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | the mailbox that emails sign-in codes. Optional; see `docs/CONSOLE-ACCESS.md` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | the account that texts sign-in codes. Optional; Indian numbers need DLT registration first |

The rest (`CATALYST_PROJECT_ID`, `ORG_ID`, `ENV`, `SCHEMA`, `NOAH_API_BASE`,
`ALLOWED_ORIGINS`, `NODE_ENV`) are already in `render.yaml`: they are ids and URLs,
not secrets. `PORT` is set by Render; `server/index.js` already reads it.

When it is up, check it:

```
curl https://ksm-admin-api.onrender.com/api/health
```

Expect `"dataSource":"catalyst"`.

## 2. The console, on Catalyst Slate

Slate hosts the **pages** only. The console finds the API from `VITE_API_BASE`, which
the build bakes in. `.env.production` carries
`VITE_API_BASE=https://ksm-admin-api.onrender.com`, which `npm run build` reads, so the
site builds correctly with no dashboard setting. If the API ever moves, change that
line and redeploy.

**Deploy (and redeploy):** commit, then

```
npm run deploy:slate
```

This sends the last **commit** (not unsaved edits) to the Slate app `karuna-admin` in
the Catalyst project `ksm`, using the Catalyst CLI signed in to the account that owns
it (`catalyst whoami`). Slate builds it (`npm run build`, output `/dist`) and prints the
site's address. It needs no Catalyst files in this repository.

The console fetches its data through the API, so the site on Slate needs nothing
from the Catalyst project except to be hosted.

## 3. Let the console call the API

`ALLOWED_ORIGINS` on the API lists who may call it from a browser. `render.yaml` sets it
to the Slate address. Add a custom domain to the same comma-separated list when you
have one, or a whole domain with `ALLOWED_ORIGIN_SUFFIXES=.karunasadan.org`.

Catalyst hosting addresses (`*.onslate.in`, `*.catalystslate.in`,
`*.catalystserverless.in`) and `localhost:*` are allowed automatically. Anything else
gets no `Access-Control-Allow-Origin` header and is blocked by the browser, which
shows as a failed request in the console, not as an error from the API.

Deep links (`/members/approved`) work: Slate serves the app for any path.

Signing in on the deployed site needs the **office passphrase** and a real staff number.
Until someone has a console role, only a member flagged `users.is_super_admin` in
Catalyst can sign in. To try it before that, add `ENABLE_TEST_LOGIN=true` and
`TEST_LOGIN_OTP=<a code you choose>` in Render's Environment tab, and remove them
again before real use.

---

## Showing it to a client (demo mode)

Add one variable to the API (Render → Environment): **`DEMO_MODE` = `true`**, and save.

- The sign-in page says what to use: mobile **+91 90000 00001**, code **123456**. Any of
  the ten test numbers (`…00001` to `…00010`, one per role) works with the same code.
- No office passphrase is asked for.
- Only the **sample data** is shown. Catalyst is not used even if its settings are in
  Render, so nothing real can be seen or changed. Changes made during the demo are kept
  in memory and are gone when the server restarts.

The code is public on purpose (it is on the sign-in page and in this repository), so
turn the demo off by **deleting `DEMO_MODE`** as soon as the client has seen it. With it
gone the sign-in is locked again: real staff, a code sent by email or SMS, and the
passphrase. `npm run test:demo` checks both states.

---

## Leaving Vercel

Nothing in the code uses Vercel any more (its addresses are no longer allowed by the
API). The old site `noha-admin.vercel.app` may still exist and may redeploy on every
push. To stop it, in the Vercel dashboard open the project, then **Settings → Git →
Disconnect**, or **Settings → General → Delete Project**.

---

## What to expect on a free tier

**It sleeps.** Render's free plan stops the service after about fifteen minutes
of no traffic, and the next request waits roughly fifty seconds while it starts
again. Fine for the office; poor for a client demo: open the console a minute
before you present, or use a paid instance for the demo.

**Sessions do not survive a restart.** With `NODE_ENV=production` the session
file is deliberately not written, so sessions live in memory only. A redeploy
or a sleep signs everyone out; they sign in again. (Locally they do persist:
that is what `.sessions.json` is for.)

---

## Checklist

- [ ] API deployed, `/api/health` says `dataSource: catalyst`
- [ ] `ADMIN_PASSPHRASE` set: **do not skip this one**
- [ ] `ALLOWED_ORIGINS` is the Slate address
- [ ] Console deployed with `npm run deploy:slate`
- [ ] Signed in on the deployed console with the passphrase
- [ ] A member's photo and video open
- [ ] Vercel disconnected or deleted
- [ ] `.env.local` and `.sessions.json` still untracked: `git status`
