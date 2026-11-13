/* Keeping an open console on the newest version.

   Slate serves the page with a one-year cache, so after a deploy a browser can
   go on running the old console for as long as it likes. This asks for the page
   afresh now and then (on start, every ten minutes, and when the tab comes back
   into view). When the newest page loads a different script, the console is out
   of date, and the next move to another screen loads the new one: never in the
   middle of a screen, so nothing being typed is lost.

   Asking with `cache: 'reload'` also puts the new page in the browser's cache,
   and a reload revalidates the page itself, so the reload gets the new one. */

const SCRIPT = /src="([^"]*\/assets\/index-[^"]+\.js)"/;

const running = () =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') || '';

let outOfDate = false;

async function check() {
  if (outOfDate || import.meta.env.DEV || !running()) return;
  try {
    const res = await fetch('/', { cache: 'reload', credentials: 'same-origin' });
    if (!res.ok) return;
    const newest = (await res.text()).match(SCRIPT)?.[1];
    if (newest && newest !== running()) outOfDate = true;
  } catch {
    /* Offline or the site is busy: try again later. */
  }
}

export const isOutOfDate = () => outOfDate;

/** Load the newest console. Once a minute at most, so a broken deploy cannot loop. */
export function loadNewest() {
  try {
    const last = Number(sessionStorage.getItem('console-reloaded-at') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('console-reloaded-at', String(Date.now()));
  } catch { /* storage blocked: reload anyway */ }
  window.location.reload();
}

let started = false;
export function watchForUpdates() {
  if (started) return;
  started = true;
  void check();
  setInterval(check, 10 * 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
  /* A screen's code from the old version may be gone after a deploy: load the new version instead of failing. */
  window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); loadNewest(); });
}
