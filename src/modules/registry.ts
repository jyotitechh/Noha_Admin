/* Every area of the console, in navigation order.

   One list drives the sidebar, the breadcrumb, the routes, the page headers
   and the command palette, so an area cannot appear in one and be missing
   from another.

   `perm` hides an area from a role that cannot use it. The server checks the
   same permission, so hiding is presentation and refusing is enforcement.

   `status` says how far the React port has got:
     'built'   the tab is implemented against the API
     'planned' the tab is routed and describes itself, but is not built yet
   Areas marked 'planned' show what they will hold and which prototype screen
   they come from, so nothing in the navigation is a dead end. */

export type ModuleGroup = 'work' | 'noah' | 'jodie' | 'admin';
export type TabStatus = 'built' | 'planned';

export interface TabDef {
  id: string;
  label: string;
  perm?: string | string[];
  status: TabStatus;
  /** One line under the tab heading. */
  desc?: string;
  /** Which prototype screen this comes from, for the planned ones. */
  from?: string;
}

export interface ModuleDef {
  id: string;
  title: string;
  /** Shorter label for the sidebar, when the title is long. */
  nav?: string;
  group: ModuleGroup;
  icon: string;
  perm?: string | string[];
  /** Section of the engineering brief this area answers to. */
  sec?: string;
  desc?: string;
  /** Queue ids whose counts show as the sidebar badge. */
  badges?: string[];
  hot?: boolean;
  tabs: TabDef[];
}

export const GROUPS: [ModuleGroup, string][] = [
  ['work', 'Workspace'],
  ['noah', 'Noah'],
  ['jodie', 'Jodie'],
  ['admin', 'Administration'],
];

export const MODULES: ModuleDef[] = [
  /* ================= workspace ================= */
  {
    id: 'dashboard', title: 'Dashboard', group: 'work', icon: 'dash', sec: '7',
    desc: 'Where the ministry stands this morning, and what is waiting for you.',
    tabs: [{ id: 'main', label: 'Overview', status: 'built' }],
  },
  {
    id: 'queues', title: 'Work queues', group: 'work', icon: 'inbox', sec: '7', hot: true,
    desc: 'Everything waiting for a decision, across every area, oldest first.',
    tabs: [{ id: 'main', label: 'All queues', status: 'built' }],
  },

  /* ================= noah ================= */
  {
    id: 'members', title: 'Membership', group: 'noah', icon: 'users', sec: '5.1', perm: 'members.view',
    desc: 'The member register and the registrations coming in from the app. Open anyone to see all of them: their video, family, groups, pastor and partnership.',
    badges: ['registrations', 'dupes'],
    tabs: [
      { id: 'registrations', label: 'App registrations', perm: 'members.edit', status: 'built',
        desc: 'New members who finished the six-step registration in the Noah app. Nothing opens for them until you approve it here.' },
      { id: 'approved', label: 'Approved and history', perm: 'members.edit', status: 'built',
        desc: 'Everyone the office has decided on. Open a person to see everything about them, with their photograph, ID and video.' },
      { id: 'register', label: 'Member register', status: 'built',
        desc: 'Everyone on the roll. Open a person for their full record: registration and video, pastor, partnership, family and groups.' },
      { id: 'quality', label: 'Duplicates and data', perm: 'members.edit', status: 'planned', from: 'Membership → Duplicates and data',
        desc: 'Possible duplicate members, merge decisions and data quality.' },
    ],
  },
  {
    id: 'approles', title: 'App roles and access', nav: 'App roles', group: 'noah', icon: 'mobile', sec: '5.1, 5.7',
    perm: ['approles.manage', 'members.view'],
    desc: 'What a member may see and do in the Noah app.',
    tabs: [
      { id: 'roles', label: 'Roles', status: 'planned', from: 'App roles → Roles', desc: 'Member-side roles such as prayer warrior, cell leader and usher.' },
      { id: 'access', label: 'Feature access', status: 'planned', from: 'App roles → Feature access', desc: 'Which of the app’s 35 features each role reaches.' },
      { id: 'chat', label: 'Chat rules', status: 'planned', from: 'App roles → Chat rules', desc: 'Who may message whom, and what is kept.' },
      { id: 'people', label: 'People and roles', status: 'built',
        desc: 'Who holds which role in the Noah app. Everyone approved starts as an ordinary member; pastor, cell leader and the rest are given here.' },
    ],
  },
  {
    id: 'finance', title: 'Giving and finance', group: 'noah', icon: 'rupee', sec: '5.2',
    perm: ['giving.view', 'finance.view'],
    desc: 'Receipts, gateways, reconciliation and the ledger of record.',
    badges: ['failed', 'unmatched', 'batches', 'drafts'],
    tabs: [
      { id: 'receipts', label: 'Receipts', perm: 'giving.view', status: 'built',
        desc: 'Every gift received, with its 80G receipt, mode and gateway.' },
      { id: 'recon', label: 'Reconciliation', perm: 'giving.reconcile', status: 'planned', from: 'Giving and finance → Reconciliation',
        desc: 'Failed donations, settlement matching and refunds.' },
      { id: 'gateways', label: 'Gateways', perm: 'giving.view', status: 'planned', from: 'Giving and finance → Gateways', desc: 'Razorpay and Paytm, their forms and webhooks.' },
      { id: 'accounting', label: 'Accounting', perm: 'finance.view', status: 'planned', from: 'Giving and finance → Accounting', desc: 'Chart of accounts, journals and vouchers, posted to Zoho Books.' },
      { id: 'expenses', label: 'Expenses', perm: 'finance.view', status: 'planned', from: 'Giving and finance → Expenses', desc: 'Vendor bills, TDS and project heads.' },
      { id: 'batches', label: 'Payment batches', perm: 'finance.approve', status: 'planned', from: 'Giving and finance → Payment batches', desc: 'Batches waiting on a second approver.' },
      { id: 'transactions', label: 'Transactions', perm: 'finance.view', status: 'planned', from: 'Giving and finance → Transactions', desc: 'Bank lines, imports and the drafts waiting to be matched.' },
      { id: 'tax', label: 'Tax and vendors', perm: 'finance.view', status: 'planned', from: 'Giving and finance → Tax and vendors', desc: 'TDS rates, sections and the vendor register.' },
    ],
  },
  {
    id: 'events', title: 'Events', group: 'noah', icon: 'cal', sec: '5.3', perm: 'events.view',
    desc: 'Services, events, halls and the passes members book in the app.',
    badges: ['absent'],
    tabs: [
      { id: 'events', label: 'Events', status: 'built', desc: 'What is open for booking in the app, and what has been.' },
      { id: 'passes', label: 'Passes', status: 'built', desc: 'Every pass issued, its seats, gate and booking code.' },
      { id: 'halls', label: 'Halls and seating', perm: 'events.manage', status: 'planned', from: 'Events → Halls and seating', desc: 'Halls, sections and the seat map members choose from.' },
      { id: 'attendance', label: 'Attendance', status: 'planned', from: 'Events → Attendance', desc: 'Who came, and the absentees to follow up.' },
      { id: 'services', label: 'Services', status: 'planned', from: 'Events → Services', desc: 'The weekly pattern of services by location and language.' },
      { id: 'operations', label: 'Event operations', perm: 'events.manage', status: 'planned', from: 'Events → Event operations', desc: 'Checklists, tasks and event expenses.' },
      { id: 'transport', label: 'Transport', status: 'planned', from: 'Events → Transport', desc: 'Bus routes, coordinators and ridership.' },
    ],
  },
  {
    id: 'community', title: 'Community', group: 'noah', icon: 'chats', sec: '5.4',
    perm: ['community.moderate', 'rewards.approve'],
    desc: 'Everything members post, and everything that needs a moderator before it appears.',
    badges: ['prayer-inbox', 'mod', 'flags', 'praise', 'obits', 'feedback', 'rewards'],
    tabs: [
      { id: 'prayer-inbox', label: 'App prayer requests', perm: 'community.moderate', status: 'built',
        desc: 'Requests raised from the prayer pop-up in the app. Each one is held until you approve it, and the audience the member chose is honoured.' },
      { id: 'queue', label: 'Approval queue', perm: 'community.moderate', status: 'built',
        desc: 'Noahgram posts, reels, comments, profile photos and about-me text waiting for approval.' },
      { id: 'flagged', label: 'Flagged', perm: 'community.moderate', status: 'built',
        desc: 'What other members have reported.' },
      { id: 'praise', label: 'Praise', perm: 'community.moderate', status: 'built', desc: 'Praise reports and testimonies.' },
      { id: 'prayer', label: 'Prayer wall', perm: 'community.moderate', status: 'planned', from: 'Community → Prayer', desc: 'The wall itself, and prayer counts.' },
      { id: 'obituaries', label: 'Obituaries', perm: 'community.moderate', status: 'planned', from: 'Community → Obituaries', desc: 'Notices and service details.' },
      { id: 'inbox', label: 'Feedback and inbox', perm: 'community.moderate', status: 'planned', from: 'Community → Feedback and inbox', desc: 'What members have told the office.' },
      { id: 'polls', label: 'Polls and competitions', perm: 'community.moderate', status: 'planned', from: 'Community → Polls and competitions', desc: 'Votes, entries and results.' },
      { id: 'rewards', label: 'Rewards', perm: 'rewards.approve', status: 'planned', from: 'Community → Rewards', desc: 'What members earned from likes, comments and posts, and the withdrawals to pay.' },
    ],
  },
  {
    id: 'content', title: 'Content', group: 'noah', icon: 'book', sec: '5.5, 5.6', perm: 'content.edit',
    desc: 'What the Noah app reads each day: the Daily Manna, prayers, confessions and the dream dictionary.',
    badges: [],
    tabs: [
      { id: 'manna', label: 'Daily Manna', status: 'built',
        desc: 'The devotional the app opens on: a scripture, the message and a prayer, for each day.' },
      { id: 'prayers', label: 'Daily Prayers', status: 'built', desc: 'The prayer members are invited to pray with.' },
      { id: 'confessions', label: 'Confessions', status: 'built', desc: 'The daily confession of faith.' },
      { id: 'dictionary', label: 'Dream dictionary', status: 'built', desc: 'What a dream may mean, entry by entry.' },
      { id: 'announce', label: 'Banners and announcements', status: 'built',
        desc: 'The carousel on the app’s home screen, and the notices above it.' },
    ],
  },
  {
    id: 'media', title: 'Media', group: 'noah', icon: 'image', sec: '5.6', perm: 'content.edit',
    desc: 'Noahgram and Noah Tube: what is posted, what is approved, and the video library.',
    tabs: [
      { id: 'noahgram', label: 'Noahgram', status: 'built', desc: 'The feed: posts to approve, and the categories they sit in.' },
      { id: 'noahtube', label: 'Noah Tube', status: 'built', desc: 'The video library, and the shelves it is arranged on.' },
    ],
  },
  {
    id: 'school', title: 'School', group: 'noah', icon: 'cap', sec: '5.5', perm: 'content.edit',
    desc: 'The Bible school, and the courses members can take.',
    badges: ['playback'],
    tabs: [
      { id: 'bibleschool', label: 'Bible school', status: 'built', desc: 'The school levels members can enrol in.' },
      { id: 'courses', label: 'Courses', status: 'built', desc: 'Courses, their sections and lessons, and how they are grouped.' },
    ],
  },
  {
    id: 'comms', title: 'Communications', group: 'noah', icon: 'mega', sec: '5.7',
    perm: ['comms.send', 'comms.inbox', 'comms.calls'],
    badges: ['threads'],
    desc: 'Broadcast, push, email, calls and the threads members open with the office.',
    tabs: [
      { id: 'threads', label: 'Member threads', perm: 'comms.inbox', status: 'built', desc: 'What members have written to their pastor, cell leader or the office.' },
      { id: 'broadcast', label: 'Broadcast', perm: 'comms.send', status: 'planned', from: 'Communications → Broadcast', desc: 'One message to a list, over push, SMS or email.' },
      { id: 'push', label: 'Push notifications', perm: 'comms.send', status: 'planned', from: 'Communications → Push', desc: 'Templates and what has been sent.' },
      { id: 'email', label: 'Email campaigns', perm: 'comms.send', status: 'planned', from: 'Communications → Email', desc: 'Campaigns, lists and delivery.' },
      { id: 'calls', label: 'Call campaigns', perm: 'comms.calls', status: 'planned', from: 'Communications → Calls', desc: 'Calling lists, callers and outcomes.' },
      { id: 'sms', label: 'SMS and OTP', perm: 'comms.send', status: 'planned', from: 'Communications → SMS and OTP', desc: 'Sender ids, DLT templates and the delivery log.' },
    ],
  },
  {
    id: 'ops', title: 'Files, store and operations', nav: 'Files and operations', group: 'noah', icon: 'folder', sec: '5.8', perm: 'ops.view',
    badges: ['orders', 'tasks', 'jobs'],
    desc: 'The shared drive, the store, tasks, assets, stock and the settings behind them.',
    tabs: [
      { id: 'store', label: 'Store', status: 'built', desc: 'Products the app sells, and the orders to dispatch.' },
      { id: 'drive', label: 'Drive', status: 'planned', from: 'Operations → Drive', desc: 'Shared folders and files, and the signed links members download.' },
      { id: 'tasks', label: 'Tasks and projects', status: 'planned', from: 'Operations → Tasks', desc: 'The office board, by owner and due date.' },
      { id: 'assets', label: 'Assets', status: 'planned', from: 'Operations → Assets', desc: 'Equipment, vehicles and what they are worth.' },
      { id: 'inventory', label: 'Inventory', status: 'planned', from: 'Operations → Inventory', desc: 'Stock by warehouse, and its movement.' },
      { id: 'admin', label: 'Administration', perm: 'ops.settings', status: 'planned', from: 'Operations → Administration', desc: 'Global settings, member devices, scheduled jobs and reminders.' },
    ],
  },

  /* ================= jodie ================= */
  {
    id: 'jverify', title: 'Jodie verification', nav: 'Verification', group: 'jodie', icon: 'shield-check', sec: '6, 7',
    perm: 'jodie.verify', hot: true,
    badges: ['jv-I', 'jv-P', 'jv-E', 'jv-Q'],
    desc: 'The four checks a profile passes before it goes live: basic information, photographs, pastoral endorsement and questionnaire answers.',
    tabs: [
      { id: 'queue', label: 'To verify', status: 'built', desc: 'Profiles waiting on one of the four stages.' },
      { id: 'done', label: 'Recently decided', status: 'built', desc: 'What has been approved or returned, and by whom.' },
    ],
  },
  {
    id: 'jodie', title: 'Jodie administration', nav: 'Jodie admin', group: 'jodie', icon: 'heart', sec: '6, 7',
    perm: ['jodie.manage', 'jodie.calls'],
    badges: ['jsupport', 'jsafety'],
    desc: 'Profiles, safety, support and the content behind the matchmaking space.',
    tabs: [
      { id: 'profiles', label: 'Profiles', perm: 'jodie.manage', status: 'built', desc: 'Everyone on Jodie, verified or not.' },
      { id: 'blocked', label: 'Blocks and reports', perm: 'jodie.manage', status: 'built', desc: 'Who blocked whom, and the messages members reported.' },
      { id: 'support', label: 'Support conversations', perm: 'jodie.manage', status: 'planned', from: 'Jodie admin → Support', desc: 'Threads members opened with the Jodie desk.' },
      { id: 'featured', label: 'Featured', perm: 'jodie.manage', status: 'planned', from: 'Jodie admin → Featured', desc: 'Profiles promoted in the deck.' },
      { id: 'questionnaire', label: 'Questionnaire', perm: 'jodie.manage', status: 'planned', from: 'Jodie admin → Questionnaire', desc: 'The questions a profile answers, and which are required.' },
      { id: 'calls', label: 'Call overwatch', perm: 'jodie.calls', status: 'planned', from: 'Jodie admin → Calls', desc: 'Calls in progress, their quality and the log.' },
      { id: 'outbound', label: 'Outbound calling', perm: 'jodie.calls', status: 'planned', from: 'Jodie admin → Outbound', desc: 'Lists the desk works through, and outcomes.' },
      { id: 'content', label: 'Content', perm: 'jodie.manage', status: 'planned', from: 'Jodie admin → Content', desc: 'Testimonials, articles, news and success stories.' },
      { id: 'masters', label: 'Masters and terms', perm: 'jodie.manage', status: 'planned', from: 'Jodie admin → Masters', desc: 'Denominations, colleges, occupations and the terms members accept.' },
    ],
  },
  {
    id: 'subs', title: 'Subscriptions', group: 'jodie', icon: 'repeat', sec: '3.1, 6, 7', perm: 'subs.view',
    badges: ['dunning'],
    desc: 'Jodie membership, premium plans, credit packs and the money behind them.',
    tabs: [
      { id: 'subscriptions', label: 'Subscriptions', status: 'built', desc: 'Who is subscribed, on what, and until when.' },
      { id: 'plans', label: 'Plans and add-ons', perm: 'subs.plans', status: 'built', desc: 'Membership, the three premium plans and the featured-profile add-on.' },
      { id: 'dunning', label: 'Dunning queue', perm: 'subs.manage', status: 'built', desc: 'Subscriptions in grace or past due, and what to do about them.' },
      { id: 'mandates', label: 'Mandates', perm: 'subs.manage', status: 'planned', from: 'Subscriptions → Mandates', desc: 'UPI AutoPay, card standing instructions and eMandates.' },
      { id: 'settlement', label: 'Settlement matching', perm: 'subs.manage', status: 'planned', from: 'Subscriptions → Settlement', desc: 'Razorpay and Apple settlements, and what did not match.' },
      { id: 'refunds', label: 'Refunds and credit notes', perm: 'subs.manage', status: 'planned', from: 'Subscriptions → Refunds', desc: 'Credit notes raised against subscriptions.' },
    ],
  },

  /* ================= administration ================= */
  {
    id: 'staff', title: 'Staff and permissions', nav: 'Staff and permissions', group: 'admin', icon: 'key', sec: '7', perm: 'staff.manage',
    desc: 'Who works in this console, and exactly what each role may do.',
    tabs: [
      { id: 'accounts', label: 'Staff accounts', status: 'built', desc: 'The people with a sign-in, their role and when they last signed in.' },
      { id: 'roles', label: 'Roles and permissions', status: 'built', desc: 'The permission grid. Changing a tick here changes what the server allows.' },
      { id: 'effective', label: 'Effective permissions', status: 'planned', from: 'Staff → Effective permissions', desc: 'What one person actually holds, after role and overrides.' },
      { id: 'coverage', label: 'Authorisation coverage', status: 'built', desc: 'Every endpoint and the permission guarding it.' },
    ],
  },
  {
    id: 'audit', title: 'Audit log', group: 'admin', icon: 'history', sec: '7', perm: 'audit.view',
    desc: 'Every change made in this console: who, what, when, and from where.',
    tabs: [{ id: 'log', label: 'Audit log', status: 'built' }],
  },
  {
    id: 'reports', title: 'Reporting', group: 'admin', icon: 'chart', sec: '7', perm: 'reports.view',
    desc: 'The report library, and what is scheduled to go out.',
    tabs: [
      { id: 'library', label: 'Report library', status: 'built', desc: 'Every report, by application and area.' },
      { id: 'scheduled', label: 'Scheduled distribution', perm: 'reports.schedule', status: 'planned', from: 'Reporting → Scheduled', desc: 'What goes to whom, how often, and in what format.' },
      { id: 'exports', label: 'Exports', status: 'planned', from: 'Reporting → Exports', desc: 'Files staff have generated, and when their links expire.' },
    ],
  },
];

export const moduleById = (id: string) => MODULES.find((m) => m.id === id);

export const groupLabel = (g: ModuleGroup) => GROUPS.find((x) => x[0] === g)?.[1] ?? '';

/** Count of what the React port covers, for the badge in the sidebar foot. */
export const buildProgress = () => {
  const tabs = MODULES.flatMap((m) => m.tabs);
  return { built: tabs.filter((t) => t.status === 'built').length, total: tabs.length };
};
