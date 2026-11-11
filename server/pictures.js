/* Pictures the office uploads from their own computer.

   The content forms take a picture as a web link, because that is all the Noah app reads: a link
   in a text column. Uploading puts the file in a Catalyst Stratus bucket and hands back that
   bucket's public link, which goes into the same field. Pasting a link still works.

   Needs, on the API:
     STRATUS_BUCKET   the name of a bucket made PUBLIC in Catalyst (Cloud Scale > Stratus)
     STRATUS_DC       the data centre ending of its address, "in" by default (zohostratus.in)
   and the console's Catalyst key must hold the Stratus.fileop.CREATE permission (it is in the
   list `npm run catalyst:scopes` prints; make a key with it, then `npm run catalyst:connect`).

   The link is https://<bucket>-development.zohostratus.in/<key> while the project is in
   Development, and https://<bucket>.zohostratus.in/<key> once it is in Production. Move to
   Production and pictures uploaded before it keep their Development links, so they are worth
   uploading again then.

   What is accepted: JPEG, PNG, WebP or GIF up to 5 MB, judged by the file's own first bytes and
   not by its name or what the browser says it is. Each upload gets a fresh random name, so one
   person's picture can never overwrite another's. */

import { randomUUID } from 'node:crypto';
import { accessToken, ENVIRONMENT } from './catalyst.js';

export const MAX_BYTES = 5 * 1024 * 1024;

const bucket = () => String(process.env.STRATUS_BUCKET ?? '').trim().toLowerCase();
const dc = () => String(process.env.STRATUS_DC ?? 'in').trim().toLowerCase();

/** Is there a bucket to put pictures in? */
export const stratusConfigured = () => !!bucket();

/** The address of the bucket. STRATUS_BASE_URL replaces it, for the offline stand-in. */
const base = () => {
  const override = String(process.env.STRATUS_BASE_URL ?? '').trim();
  if (override) return override.replace(/\/+$/, '');
  return `https://${bucket()}${ENVIRONMENT === 'Production' ? '' : '-development'}.zohostratus.${dc()}`;
};

export class PictureError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'PictureError';
    this.status = status;
    this.extra = extra;
  }
}

/** What the file really is, from its first bytes. Null when it is not a picture we accept. */
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Store one picture. Returns { url, bytes, type }. Throws PictureError with the reason. */
export async function storePicture(buf) {
  if (!stratusConfigured()) {
    throw new PictureError(409,
      'Uploading a picture from the computer is not available right now. Paste a picture link instead.',
      { notSetUp: true });
  }
  if (!buf?.length) throw new PictureError(400, 'No picture came through. Choose the file again.');
  if (buf.length > MAX_BYTES) throw new PictureError(413, `That picture is ${(buf.length / 1048576).toFixed(1)} MB. The most allowed is 5 MB.`);
  const kind = sniff(buf);
  if (!kind) throw new PictureError(400, 'That file is not a picture the app can show. Use a JPEG, PNG, WebP or GIF.');

  const key = `pictures/${new Date().getUTCFullYear()}/${randomUUID()}.${kind.ext}`;
  const url = `${base()}/${key}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: 'Zoho-oauthtoken ' + await accessToken(),
        'Content-Type': kind.mime,
        'Cache-Control': 'public, max-age=31536000',
      },
      body: buf,
    });
  } catch (err) {
    throw new PictureError(502, `Could not reach Catalyst Stratus: ${err.message}`);
  }

  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    if (res.status === 401 || res.status === 403) {
      throw new PictureError(502, 'Catalyst refused the upload. The console key needs the Stratus.fileop.CREATE permission, and the bucket must exist and be public.', { scope: true });
    }
    if (res.status === 404) throw new PictureError(502, `Stratus has no bucket called "${bucket()}". Check STRATUS_BUCKET.`);
    throw new PictureError(502, `Stratus answered ${res.status}. ${text}`.trim());
  }
  return { url, bytes: buf.length, type: kind.mime };
}
