/* What a member may do in the Noah app.

   Everyone starts as an ordinary member when the office approves them. The
   office can then give them more: prayer warrior, cell leader, pass scanner,
   pastor, and so on. The app reads these and opens the matching features.

   These are MEMBER roles, in the app. They are not the ten STAFF roles in
   server/seed/roles.js, which govern this console. A pastor in the app and a
   pastor with a console sign-in are different things, and one does not grant
   the other.

   ── Where they live ──────────────────────────────────────────────────────
   noah-backend's `MemberRoles` table has one boolean column per role, plus
   `memberType` (varchar) and two foreign keys for who someone's leader and
   pastor are.

   THE ONE ASSUMPTION: there is no `isPastor` column. Their schema expresses
   pastor through `memberType`, so that is what this uses — `memberType`
   'pastor'. If the Catalyst developer meant something else by that column,
   this is the line to change, and it is the only one.
   ──────────────────────────────────────────────────────────────────────── */

/** The roles the office can give, in the order they are shown. */
export const MEMBER_ROLES = [
  {
    id: 'member',
    label: 'Church member',
    column: 'isChurchMember',
    desc: 'The ordinary member. Everyone gets this on approval.',
    always: true,
    opens: ['Home', 'Daily Manna', 'Events and passes', 'Noahgram', 'Prayer requests', 'Giving'],
  },
  {
    id: 'pastor',
    label: 'Pastor',
    memberType: 'pastor',
    desc: 'Leads a congregation. Sees their members and answers their messages.',
    opens: ['Their congregation’s member list', 'Member threads', 'Pastoral endorsement for Jodie'],
    care: 'A pastor can read things about other members. Give it deliberately.',
  },
  {
    id: 'leader',
    label: 'Cell leader',
    column: 'isLeader',
    desc: 'Leads a cell group.',
    opens: ['Their cell’s member list', 'Cell attendance'],
  },
  {
    id: 'prayerWarrior',
    label: 'Prayer warrior',
    column: 'isPrayerWarrior',
    desc: 'Receives prayer requests marked for prayer warriors only.',
    opens: ['The prayer warriors’ wall'],
    care: 'This is how private prayer requests are seen. Only people the office trusts.',
  },
  {
    id: 'passScan',
    label: 'Pass scanner',
    column: 'isPassScan',
    desc: 'Scans passes at the gate on event days.',
    opens: ['Pass scanning'],
  },
  {
    id: 'busCoordinator',
    label: 'Bus coordinator',
    column: 'isBusCoordinator',
    desc: 'Runs a bus route and marks who travelled.',
    opens: ['Their route’s rider list'],
  },
  {
    id: 'translator',
    label: 'Translator',
    column: 'isTranslator',
    desc: 'Translates content into other languages.',
    opens: ['Translation work'],
  },
  {
    id: 'matrimony',
    label: 'Jodie (matrimony)',
    column: 'isAvailableForMatrimony',
    desc: 'May create a Jodie profile and be shown to others.',
    opens: ['Jodie'],
    care: 'Their profile still goes through the four verification stages.',
  },
  {
    id: 'partner',
    label: 'Covenant partner',
    column: 'isPartner',
    desc: 'Gives regularly under the partnership programme.',
    opens: ['Partnership standing'],
  },
  {
    id: 'vip',
    label: 'VIP member',
    column: 'isVIPMember',
    desc: 'Marked for special attention by the office.',
    opens: [],
  },
  {
    id: 'baptised',
    label: 'Baptised',
    column: 'isBaptised',
    desc: 'A record, not an access right.',
    opens: [],
  },
  {
    id: 'rewards',
    label: 'Earns rewards',
    column: 'allowRewards',
    desc: 'Earns from likes, comments and posts in Noahgram.',
    opens: ['Rewards and withdrawals'],
  },
];

/* Restrictions sit beside the roles: things the office takes away rather
   than gives. Shown separately so they are never mistaken for a promotion. */
export const MEMBER_RESTRICTIONS = [
  {
    id: 'blockedFromComment',
    label: 'Blocked from commenting',
    column: 'isBlockedFromComment',
    desc: 'Can read Noahgram but not comment.',
  },
  {
    id: 'alertList',
    label: 'On the alert list',
    column: 'isAlertList',
    commentColumn: 'alertListComment',
    desc: 'Flagged for the office’s attention. The reason is kept with it.',
  },
];

export const roleById = (id) => MEMBER_ROLES.find((r) => r.id === id);
export const restrictionById = (id) => MEMBER_RESTRICTIONS.find((r) => r.id === id);

const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';

/**
 * Turn a MemberRoles row into the list of role ids the member holds.
 *
 * `approved` matters when there is no row yet. Members approved before roles
 * existed have none, and showing them as holding nothing would be wrong —
 * being approved IS being a church member. Someone not yet approved holds
 * nothing, because the app will not open for them at all.
 */
export function rolesFromRow(row, { approved = false } = {}) {
  if (!row) return approved ? ['member'] : [];
  const held = MEMBER_ROLES.filter((r) =>
    r.memberType
      ? String(row.memberType || '').toLowerCase() === r.memberType
      : truthy(row[r.column]),
  ).map((r) => r.id);
  /* An approved member is a church member whether or not the flag was set. */
  return held.includes('member') ? held : ['member', ...held];
}

export function restrictionsFromRow(row) {
  if (!row) return [];
  return MEMBER_RESTRICTIONS.filter((r) => truthy(row[r.column])).map((r) => r.id);
}

/**
 * Build the column changes for granting or removing one role.
 * Returns the patch, or null when the id is not a role.
 */
export function patchForRole(roleId, on) {
  const role = roleById(roleId);
  if (!role) return null;
  if (role.always && !on) return null; /* church member cannot be removed */
  if (role.memberType) {
    /* memberType holds one value, so removing pastor returns them to member. */
    return { memberType: on ? role.memberType : 'member' };
  }
  return { [role.column]: !!on };
}

export function patchForRestriction(id, on, comment) {
  const r = restrictionById(id);
  if (!r) return null;
  const patch = { [r.column]: !!on };
  if (r.commentColumn) patch[r.commentColumn] = on ? (comment || '') : '';
  return patch;
}

/** What the app is told, so it can open the right features. */
export function appRoleSummary(row, { approved = true } = {}) {
  const roles = rolesFromRow(row, { approved });
  const opens = new Set();
  for (const id of roles) roleById(id)?.opens.forEach((f) => opens.add(f));
  return {
    roles,
    restrictions: restrictionsFromRow(row),
    isPastor: roles.includes('pastor'),
    isLeader: roles.includes('leader'),
    isPrayerWarrior: roles.includes('prayerWarrior'),
    canScanPasses: roles.includes('passScan'),
    features: [...opens],
  };
}
