# Deploying

Two pieces, two hosts:

| | Where | What it is |
|---|---|---|
| Console (React) | Vercel — `noha-admin.vercel.app` | static files from `dist/` |
| API (Express) | Render (or Railway / Fly) | `server/`, holds the secrets |

They are split because Vercel serves static files and does not run your Express
server. That is the whole reason `/api/*` returned *"The page could not be
found"*: the page was deployed, its server never was.

---

## Why the API cannot simply be made public

Sign-in here is a prototype. There is no mailer, so `POST /auth/request-code`
returns the one-time code **in the response**, and `GET /auth/accounts` lists
every member of staff. On `localhost` that is a convenience. On a public URL it
means anyone who finds the address can ask for the super administrator's code,
be given it, and sign in — and behind that sit 49 members' names, mobile
numbers, dates of birth, addresses, Aadhaar and PAN numbers, photographs, ID
proofs and KYC videos.

So a deployed API **must** have `ADMIN_PASSPHRASE` set. With it:

- `/auth/accounts` returns 403 — the staff list is not published
- `/auth/request-code` needs the passphrase, and refuses without it
- eight wrong guesses locks that caller out for ten minutes
- the sign-in screen asks for it, because `/api/meta` says it is required

Unset — every local run, every test — nothing changes.

This is a stopgap that makes deploying safe, not an auth system. It goes when
a real mailer or Zoho SSO lands.

---

## 1. The API, on Render

The repository has a `render.yaml`, so: **New → Blueprint**, point it at this
repo, and Render reads the plan. It will ask you for each secret.

Set these yourself in Render's dashboard — the values never go in git:

| Variable | What it is |
|---|---|
| `CATALYST_CLIENT_ID` | from `.env.local` |
| `CATALYST_CLIENT_SECRET` | from `.env.local` |
| `CATALYST_REFRESH_TOKEN` | from `.env.local` — the new one, once you have added the File Store scopes |
| `NOAH_ADMIN_API_KEY` | from `ADMIN_API_KEY.txt`, when the Catalyst developer sends it. Leave blank until then; approvals still work and warn that the member was not emailed |
| `ADMIN_PASSPHRASE` | **you choose this.** A long phrase, shared with the office. Nothing else guards the sign-in code |

The rest (`CATALYST_PROJECT_ID`, `ORG_ID`, `SCHEMA`, `FILE_FOLDER_ID`,
`NOAH_API_BASE`, `ALLOWED_ORIGINS`, `NODE_ENV`) are already in `render.yaml` —
they are ids and URLs, not secrets.

`PORT` is set by Render; `server/index.js` already reads it.

When it is up, check it:

```
curl https://<your-api>.onrender.com/api/health
```

Expect `"dataSource":"catalyst"` and `"reachable":true`.

## 2. Point the console at it

In Vercel → Settings → Environment Variables:

```
VITE_API_BASE = https://<your-api>.onrender.com
```

Then **redeploy** — Vite bakes this in at build time, so changing it without
rebuilding does nothing.

`VITE_` variables end up in the browser bundle, so this must be a URL and never
a secret. Every real secret stays on the API host.

## 3. Let the console call the API

`ALLOWED_ORIGINS` on the API lists who may call it from a browser. It is
already set to `https://noha-admin.vercel.app`. Add a custom domain to the same
comma-separated list when you have one.

`localhost:*` and `*.vercel.app` preview builds are allowed automatically —
your own branch deploys keep working without edits. Anything else gets no
`Access-Control-Allow-Origin` header and is blocked by the browser.

---

## What to expect on a free tier

**It sleeps.** Render's free plan stops the service after about fifteen minutes
of no traffic, and the next request waits roughly fifty seconds while it starts
again. Fine for the office; poor for a client demo — open the console a minute
before you present, or use a paid instance for the demo.

**Sessions do not survive a restart.** With `NODE_ENV=production` the session
file is deliberately not written, so sessions live in memory only. A redeploy
or a sleep signs everyone out; they sign in again. (Locally they do persist —
that is what `.sessions.json` is for.)

---

## Checklist

- [ ] Catalyst token regenerated with the File Store scopes — `npm run catalyst:scopes`
- [ ] API deployed, `/api/health` says `reachable: true`
- [ ] `ADMIN_PASSPHRASE` set — **do not skip this one**
- [ ] `ALLOWED_ORIGINS` includes the Vercel domain
- [ ] `VITE_API_BASE` set in Vercel, and redeployed
- [ ] Signed in on the deployed console with the passphrase
- [ ] A member's photo and video open
- [ ] `.env.local` and `.sessions.json` still untracked — `git status`
