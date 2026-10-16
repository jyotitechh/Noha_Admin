/* Staff identity, permission catalogue and roles, lifted from the prototype's
   admin/_src/10-core.js. The console and the API share this single list, so a
   permission the UI hides is also a permission the API refuses.

   Zoho single sign-on is deliberately absent: sign-in is the local email +
   one-time-code flow in server/routes/auth.js. When Zoho SSO goes in, only
   that file and src/state/auth.tsx change — these roles stay as they are. */
import { clone } from './helpers.js';

const ME={id:'ST-001',name:'Anitha Varghese',title:'Office administrator',email:'anitha.varghese@karunasadan.org'};

const PERM_GROUPS=[
 ['Membership',[['members.view','View member register'],['members.edit','Create and amend members'],['members.archive','Archive, restore and mark deceased'],['members.export','Import and export members'],['members.pii','Reveal contact details'],['pastoral.manage','Pastoral hierarchy and reassignment'],['approles.manage','Member app roles, feature access and chat rules']]],
 ['Giving and finance',[['giving.view','View receipts and giving'],['giving.receipt','Create, cancel and reissue receipts'],['giving.reconcile','Reconciliation and refunds'],['finance.view','View accounts, expenses and transactions'],['finance.post','Post vouchers and transactions'],['finance.approve','Approve payment batches']]],
 ['Events',[['events.view','View events and passes'],['events.manage','Create events, halls, passes and services'],['events.scan','Scan and confirm admission']]],
 ['Community',[['community.moderate','Moderate feed, prayer, praise and obituaries'],['rewards.approve','Approve reward withdrawals']]],
 ['Content',[['content.edit','Author content'],['content.publish','Publish content']]],
 ['Communications',[['comms.send','Send broadcast, push and email'],['comms.inbox','Answer member threads'],['comms.calls','Run call campaigns']]],
 ['Operations',[['ops.view','View drive, store, tasks, assets and inventory'],['ops.manage','Manage store, assets and inventory'],['ops.settings','Global settings, devices and scheduled jobs']]],
 ['Jodie',[['jodie.verify','Verify Jodie profiles'],['jodie.manage','Manage Jodie profiles and content'],['jodie.calls','Call overwatch and outbound calling'],['subs.view','View subscriptions'],['subs.manage','Extend, cancel and refund subscriptions'],['subs.plans','Configure plans and add-ons']]],
 ['Administration',[['staff.manage','Staff accounts, roles and permissions'],['audit.view','View the audit log'],['reports.view','Run reports'],['reports.schedule','Schedule report distribution']]]
];
const PERM_LBL={};PERM_GROUPS.forEach(g=>g[1].forEach(p=>PERM_LBL[p[0]]=p[1]));
const ALL_PERMS=Object.keys(PERM_LBL);
const ROLES=[
 {id:'super',name:'Super administrator',desc:'Full access to every area.',perms:ALL_PERMS.slice()},
 {id:'membership',name:'Membership officer',desc:'Member register, families, pastoral hierarchy and groups.',perms:['members.view','members.edit','members.archive','members.export','members.pii','pastoral.manage','approles.manage','events.view','comms.inbox','reports.view']},
 {id:'finance',name:'Finance officer',desc:'Receipting, reconciliation, accounts, payment batches and subscription money.',perms:['members.view','giving.view','giving.receipt','giving.reconcile','finance.view','finance.post','finance.approve','rewards.approve','subs.view','subs.manage','reports.view','reports.schedule']},
 {id:'events',name:'Events coordinator',desc:'Events, halls, passes, attendance, services and transport.',perms:['members.view','events.view','events.manage','events.scan','ops.view','reports.view']},
 {id:'moderator',name:'Community moderator',desc:'Feed and comment approval, flagged content, prayer, praise and obituaries.',perms:['members.view','community.moderate','comms.inbox']},
 {id:'content',name:'Content editor',desc:'Devotional, study, courses and media in seven languages.',perms:['content.edit','content.publish','comms.send']},
 {id:'comms',name:'Communications officer',desc:'Broadcast, push, email and call campaigns, member threads.',perms:['members.view','comms.send','comms.inbox','comms.calls','reports.view']},
 {id:'jverifier',name:'Jodie verifier',desc:'Works the four verification queues.',perms:['jodie.verify','subs.view']},
 {id:'jadmin',name:'Jodie administrator',desc:'Jodie profiles, content, calls and subscriptions.',perms:['jodie.verify','jodie.manage','jodie.calls','subs.view','subs.manage','subs.plans','comms.send','reports.view']},
 {id:'pastor',name:'Pastor',desc:'Read-only view of their own congregation; answers member threads.',perms:['members.view','comms.inbox']}
];
const ROLE_BASE=clone(ROLES.map(r=>({id:r.id,perms:r.perms})));

/* The live audit log. Seeded by data.js, appended to by every write. */
export const AUD = [];

export { ME, PERM_GROUPS, PERM_LBL, ALL_PERMS, ROLES, ROLE_BASE };
