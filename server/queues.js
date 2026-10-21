/* The consolidated work queues, ported from the prototype's
   admin/_src/30-work.js, plus two that the prototype did not have:
   member registrations and mobile prayer requests.

   Counts are computed live from the store, so approving something in one
   screen drops the badge everywhere. `sla` is the hours after which an item
   is late; the console colours the age by it. */

import { db } from './db.js';
import { live, listRegistrations } from './store.js';

const minDate = (a) => (a.length ? new Date(Math.min(...a.map((d) => +d))) : null);
const open = (coll, fn) => (db[coll] || []).filter(fn);
const q = (coll, fn, field = 'at') => ({
  count: () => open(coll, fn).length,
  oldest: () => minDate(open(coll, fn).map((x) => x[field]).filter(Boolean)),
});

const STAGE_LABEL = {
  I: 'basic information',
  P: 'photographs',
  E: 'pastoral endorsement',
  Q: 'questionnaire answers',
};

/* When Catalyst is connected, only the queues backed by a real table count.
   The rest would be counting sample data, which is worse than showing
   nothing: a badge saying 26 posts await moderation, when no such table
   exists, sends someone looking for work that is not there. */
const CATALYST_BACKED = new Set(['registrations']);

export function queues() {
  const jodieStages = Object.entries(STAGE_LABEL).map(([k, label]) => ({
    id: 'jv-' + k,
    l: 'Jodie: ' + label,
    area: 'Jodie verification',
    icon: { I: 'user', P: 'image', E: 'shield-check', Q: 'list' }[k],
    to: '/jverify/' + k,
    perm: 'jodie.verify',
    owner: 'Jodie verifier',
    sla: 48,
    ...(() => {
      const pend = () => db.JPROFILES.filter((p) => p.st[k] === 'pend');
      return { count: () => pend().length, oldest: () => minDate(pend().map((p) => p.stamps[k])) };
    })(),
  }));

  const all = [
    /* --- new: fed by the Noah mobile app --- */
    {
      id: 'registrations', l: 'Member registrations to approve', area: 'Membership', icon: 'user-plus',
      to: '/members/registrations', perm: 'members.edit', owner: 'Membership officer', sla: 24, hot: true,
      ...q('REGISTRATIONS', (r) => r.state === 'pending'),
    },
    {
      id: 'prayer-inbox', l: 'App prayer requests to approve', area: 'Community', icon: 'flame',
      to: '/community/prayer-inbox', perm: 'community.moderate', owner: 'Community moderator', sla: 12,
      ...q('PRAYER_INBOX', (p) => p.state === 'Pending'),
    },
    /* --- ported from the prototype --- */
    ...jodieStages,
    { id: 'mod', l: 'Feed, comment and photo approval', area: 'Community', icon: 'chats', to: '/community/queue', perm: 'community.moderate', owner: 'Community moderator', sla: 12, ...q('MODQ', (x) => x.state === 'Pending') },
    { id: 'flags', l: 'Flagged content', area: 'Community', icon: 'flag', to: '/community/flagged', perm: 'community.moderate', owner: 'Community moderator', sla: 24, ...q('FLAGS', (x) => x.state === 'Open') },
    { id: 'prayer', l: 'Prayer wall requests to approve', area: 'Community', icon: 'flame', to: '/community/prayer', perm: 'community.moderate', owner: 'Community moderator', sla: 12, ...q('PRAYERS', (x) => x.state === 'Pending') },
    { id: 'praise', l: 'Praise reports to approve', area: 'Community', icon: 'sparkles', to: '/community/praise', perm: 'community.moderate', owner: 'Community moderator', sla: 24, ...q('PRAISE', (x) => x.state === 'Pending') },
    { id: 'obits', l: 'Obituaries to approve', area: 'Community', icon: 'cross', to: '/community/obituaries', perm: 'community.moderate', owner: 'Community moderator', sla: 12, ...q('OBITS', (x) => x.state === 'Pending') },
    { id: 'feedback', l: 'Feedback waiting for a reply', area: 'Community', icon: 'inbox', to: '/community/inbox', perm: 'community.moderate', owner: 'Community moderator', sla: 48, ...q('FEEDBACK', (x) => x.state === 'Open') },
    { id: 'rewards', l: 'Reward withdrawals to approve', area: 'Community', icon: 'award', to: '/community/rewards', perm: 'rewards.approve', owner: 'Finance officer', sla: 72, ...q('REWARD_TX', (x) => x.status === 'Pending approval') },
    { id: 'failed', l: 'Failed donations', area: 'Giving', icon: 'alert', to: '/finance/recon', perm: 'giving.reconcile', owner: 'Finance officer', sla: 24, ...q('FAILED', (x) => x.state === 'Open') },
    { id: 'unmatched', l: 'Unmatched settlement items', area: 'Giving', icon: 'link', to: '/finance/recon', perm: 'giving.reconcile', owner: 'Finance officer', sla: 48, ...q('UNMATCHED', (x) => x.state === 'Unmatched') },
    { id: 'batches', l: 'Payment batches to approve', area: 'Finance', icon: 'bank', to: '/finance/batches', perm: 'finance.approve', owner: 'Finance officer', sla: 24, ...q('BATCHES', (x) => x.status === 'Pending approval') },
    { id: 'drafts', l: 'Bank transaction drafts', area: 'Finance', icon: 'list', to: '/finance/transactions', perm: 'finance.post', owner: 'Finance officer', sla: 72, ...q('DRAFTS', (x) => x.state === 'Waiting', 'date') },
    { id: 'dunning', l: 'Dunning queue', area: 'Subscriptions', icon: 'repeat', to: '/subs/dunning', perm: 'subs.manage', owner: 'Jodie administrator', sla: 24, ...q('SUBS', (x) => x.status === 'Grace' || x.status === 'Past due', 'next') },
    { id: 'threads', l: 'Member threads waiting', area: 'Communications', icon: 'msg', to: '/comms/threads', perm: 'comms.inbox', owner: 'Communications officer, pastors', sla: 24, ...q('THREADS', (x) => x.state === 'Open') },
    { id: 'jsupport', l: 'Jodie support conversations', area: 'Jodie', icon: 'headset', to: '/jodie/support', perm: 'jodie.manage', owner: 'Jodie administrator', sla: 24, ...q('JTHREADS', (x) => x.state === 'Open') },
    {
      id: 'jsafety', l: 'Jodie blocks and message reports', area: 'Jodie', icon: 'ban', to: '/jodie/blocked', perm: 'jodie.manage', owner: 'Jodie administrator', sla: 24,
      count: () => db.JBLOCKS.filter((b) => b.review === 'Open').length + db.JREPORTS.filter((r) => r.state === 'Open').length,
      oldest: () => minDate(db.JBLOCKS.filter((b) => b.review === 'Open').map((b) => b.at).concat(db.JREPORTS.filter((r) => r.state === 'Open').map((r) => r.at))),
    },
    { id: 'dupes', l: 'Possible duplicate members', area: 'Membership', icon: 'merge', to: '/members/quality', perm: 'members.edit', owner: 'Membership officer', sla: 168, ...q('DUPES', (x) => x.state === 'Open', 'found') },
    { id: 'absent', l: 'Absentees to follow up', area: 'Events', icon: 'user-x', to: '/events/attendance', perm: 'events.view', owner: 'Events coordinator, pastors', sla: 168, ...q('ABSENTEES', (x) => x.state === 'Open', 'last') },
    { id: 'playback', l: 'Playback problem reports', area: 'Content', icon: 'play', to: '/school/courses', perm: 'content.edit', owner: 'Content editor', sla: 72, ...q('PLAYBACK', (x) => x.state === 'Open') },
    { id: 'orders', l: 'Store orders to dispatch', area: 'Operations', icon: 'truck', to: '/ops/store', perm: 'ops.manage', owner: 'Operations', sla: 48, ...q('ORDERS', (x) => x.status === 'Awaiting dispatch') },
    { id: 'tasks', l: 'Overdue tasks', area: 'Operations', icon: 'columns', to: '/ops/tasks', perm: 'ops.view', owner: 'Task owners', sla: 0, ...q('TASKS', (x) => x.state !== 'Done' && x.due < new Date(), 'due') },
    { id: 'jobs', l: 'Failed scheduled jobs', area: 'Operations', icon: 'server', to: '/ops/admin', perm: 'ops.settings', owner: 'Super administrator', sla: 4, ...q('JOBS', (x) => x.status === 'Failed', 'last') },
  ];
  return live() ? all.filter((x) => CATALYST_BACKED.has(x.id)) : all;
}

/** The queues a role may see, flattened for JSON.

   The counts come from the in-memory seed by default. When Catalyst is
   connected the registrations queue is counted from the real table instead,
   so the badge and the dashboard cannot disagree. */
export async function queuesFor(roleId, canFn) {
  const rows = queues().filter((x) => canFn(roleId, x.perm));

  let real = null;
  if (live()) {
    try {
      const regs = await listRegistrations({});
      const waiting = regs.filter((r) => r.state === 'pending');
      real = {
        count: waiting.length,
        oldest: waiting.map((r) => r.at).filter(Boolean).sort((a, b) => +a - +b)[0] ?? null,
      };
    } catch { /* fall back to the seed count rather than failing the page */ }
  }

  return rows.map(({ count, oldest, ...rest }) =>
    real && rest.id === 'registrations'
      ? { ...rest, ...real }
      : { ...rest, count: count(), oldest: oldest() });
}
