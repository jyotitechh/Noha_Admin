/* Sample data generator, copied from the prototype's admin/_src/20-data.js and
   wrapped as an ES module. The only edits are this header, the helper import
   below and the export block at the foot — the generator body is untouched, so
   the console shows exactly the same sample data as the HTML prototype.

   Everything here is prototype sample data: no real member, receipt, profile
   or amount appears in this file. */
import {
  NOW, now, MIN, HR, DAY, hAgo, dAgo, dAhead, at,
  rnd, ri, pick, chance, pickW, shuffle,
  sum, uniq, byId, clone, pct, fd, fds, ft,
} from './helpers.js';
import { AUD, ROLES, ME, PERM_GROUPS, PERM_LBL, ALL_PERMS } from './roles.js';

/* ==========================================================================
   Sample data. Seeded, so every load shows the same records.
   Names, amounts and counts are illustrative. Where a value comes from the
   client's existing code it says so (TDS table, reward rates).
   ========================================================================== */
const rid=n=>{const c='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<n;i++)s+=c[Math.floor(rnd()*c.length)];return s};
const FN_M=['Joseph','Samuel','Daniel','David','John','Thomas','Paul','Stephen','Abraham','Isaac','Jacob','Joel','Philip','Peter','Mathew','Arun','Rajesh','Suresh','Prakash','Vijay','Anand','Kiran','Ravi','Sunil','Jeevan','Benjamin','Prabhu','Sathish','Moses','Elijah','Nikhil','Rohan','Sachin','Amit','Vinod'];
const FN_F=['Mary','Grace','Esther','Ruth','Priscilla','Rebecca','Sarah','Hannah','Deborah','Lydia','Anitha','Sheela','Kavitha','Divya','Jeba','Shalini','Merlin','Jasmine','Angel','Beulah','Christina','Evangeline','Priya','Sharon','Glory','Joyce','Sneha','Pooja','Neha','Asha','Rachel'];
const LN=['Thomas','Joseph','Samuel','Daniel','Raj','Kumar','Varghese','Mathew','George','Jacob','Pillai','Rao','Reddy','Das','Paul','Fernandes','DSouza','Pereira','Jebakumar','Selvaraj','Isaac','John','Prakash','Babu','Nair','Shinde','Gaikwad','Masih','Singh','Chacko','Kamble','Pawar','Moses','Dhanaraj','Rodrigues'];
const nameOf=g=>(g==='M'?pick(FN_M):pick(FN_F))+' '+pick(LN);
const LOCS=['Andheri','Borivali','Thane','Vashi','Pune','Hyderabad','Bengaluru','Chennai','Kochi'];
/* ISO 639-1 codes. The current systems use tm and ka; the rebuild uses ta and kn (brief 9.1). */
const LANGS=[['en','English'],['hi','Hindi'],['mr','Marathi'],['te','Telugu'],['ml','Malayalam'],['ta','Tamil'],['kn','Kannada']];
const LANG_NAME={};LANGS.forEach(l=>LANG_NAME[l[0]]=l[1]);

/* ---------- people and pastoral hierarchy ---------- */
const PASTORS=LOCS.map((l,i)=>({id:'PS-'+(i+1),name:['Ps. Emmanuel Kumar','Ps. Joel Fernandes','Ps. Samuel Dhanaraj','Ps. Ruth Mathew','Ps. Abraham Shinde','Ps. Daniel Reddy','Ps. Stephen Raj','Ps. Jeba Selvaraj','Ps. Thomas Chacko'][i],loc:l,mobile:'+91 98'+ri(100,999)+' '+ri(10000,99999)}));
const LEADERS=[],CELLS=[];
PASTORS.forEach(p=>{for(let k=1;k<=3;k++){const g=chance(.5)?'M':'F',id='LD-'+(LEADERS.length+1);
  LEADERS.push({id,name:nameOf(g),pastor:p.id,loc:p.loc,since:dAgo(ri(120,1800))});
  CELLS.push({id:'CG-'+(CELLS.length+1),name:p.loc+' Cell '+k,leader:id,pastor:p.id,loc:p.loc,day:pick(['Tuesday','Wednesday','Thursday','Friday']),time:pick(['19:00','19:30','20:00']),members:0})}});
const pastorName=id=>(byId(PASTORS,id)||{}).name||'—';
const leaderName=id=>(byId(LEADERS,id)||{}).name||'—';
const cellName=id=>(byId(CELLS,id)||{}).name||'—';

const MEMBERS=[],FAMILIES=[];let _mid=104210;
const STREETS=['Flat 302, Shanti Nagar','B-14, Gokul Dham','House 12, Church Road','A-7, Sai Krupa CHS','2nd Cross, Indira Nagar','C-9, Green Park','Plot 44, Sector 17','D-201, Lake View'];
while(MEMBERS.length<184){
  const size=pickW([[1,30],[2,24],[3,20],[4,18],[5,8]]),last=pick(LN),cell=pick(CELLS),p=byId(PASTORS,cell.pastor);
  const fam={id:'FM-'+(3100+FAMILIES.length),name:last+' family',loc:cell.loc,pastor:p.id,cell:cell.id,members:[],address:pick(STREETS)+', '+cell.loc};
  const hg=chance(.6)?'M':'F',ha=ri(26,68),roles=[['Head',hg,ha]];
  if(size>=2)roles.push(['Spouse',hg==='M'?'F':'M',Math.max(22,ha+ri(-6,3))]);
  for(let k=roles.length;k<size;k++){if(chance(.12)&&!roles.some(r=>r[0].startsWith('Parent'))&&ha<50)roles.push([chance(.6)?'Mother':'Father',chance(.6)?'F':'M',ha+ri(24,30)]);
    else{const cg=chance(.5)?'M':'F';roles.push([cg==='M'?'Son':'Daughter',cg,Math.max(1,ha-ri(22,36))])}}
  roles.forEach(([rel,g,a])=>{const first=g==='M'?pick(FN_M):pick(FN_F),kid=a<13;
    const status=a>58&&chance(.04)?'Deceased':pickW([['Active',93],['Archived',7]]);
    const m={id:'NH-'+(_mid++),first,last,name:first+' '+last,g,age:a,kid,rel,family:fam.id,
      mobile:kid?'':'+91 '+pick(['98','97','99','90','88','70','81'])+ri(100,999)+' '+ri(10000,99999),
      email:kid?'':(first+'.'+last).toLowerCase()+ri(1,99)+'@'+pick(['gmail.com','yahoo.in','outlook.com','rediffmail.com']),
      loc:cell.loc,pastor:p.id,leader:cell.leader,cell:cell.id,status,partner:!kid&&chance(.3),joined:dAgo(ri(3,2600)),
      lang:pickW([['en',40],['hi',18],['mr',16],['te',8],['ml',8],['ta',6],['kn',4]]),photo:kid?'None':pickW([['Approved',70],['Pending',7],['None',23]]),
      alert:!kid&&chance(.05)?pick(['Pastoral care in progress. Contact through the pastor only.','Address under verification.','Asked for no calls before 11 am.']):'',
      crm:pickW([['Synced',96],['Pending',4]]),lastActive:hAgo(ri(1,24*40)),address:fam.address,
      guardian:null,aadhaar:kid?'':pickW([['Verified',62],['Not done',38]])};
    if(m.partner)m.partnerSince=dAgo(ri(20,1500));m.youngPartner=m.partner&&a<25;
    if(status==='Deceased')m.deceasedOn=dAgo(ri(10,300));
    if(status==='Archived')m.archivedOn=dAgo(ri(5,400));
    MEMBERS.push(m);fam.members.push(m.id);cell.members++});
  FAMILIES.push(fam);
}
FAMILIES.forEach(f=>{const head=byId(MEMBERS,f.members[0]);f.members.forEach(id=>{const m=byId(MEMBERS,id);if(m.kid)m.guardian=head.id})});
const memberName=id=>(byId(MEMBERS,id)||{}).name||id;
const ADULTS=MEMBERS.filter(m=>!m.kid&&m.status==='Active');
const ME_STAFF=['Anitha Varghese','Rohan Pawar','Grace Isaac','Sunil Nair','Deborah Masih','Priya Kamble'];

/* duplicate candidates and incorrect mapping reports */
const DUPES=[];for(let i=0;i<7;i++){const a=pick(ADULTS),b=pick(ADULTS);
  DUPES.push({id:'DP-'+(i+1),a:a.id,b:b.id,score:ri(72,98),why:pick(['Same mobile number','Same name and date of birth','Same email address','Name and address match closely']),found:hAgo(ri(2,300)),state:'Open'})}
const MAPREPORTS=[];for(let i=0;i<6;i++){const m=pick(ADULTS),to=pick(PASTORS);
  MAPREPORTS.push({id:'MR-'+(i+1),member:m.id,current:m.pastor,suggest:to.id,by:pick(['Member','Cell leader','Pastor']),note:pick(['Moved to '+to.loc+' in August.','Attends the '+to.loc+' service every week.','Married and now lives near '+to.loc+'.']),at:hAgo(ri(4,400)),state:'Open'})}
const LEADER_HISTORY=[];for(let i=0;i<10;i++){const l=pick(LEADERS);LEADER_HISTORY.push({id:'LH-'+(i+1),leader:l.id,cell:pick(CELLS).name,from:dAgo(ri(400,1600)),to:chance(.5)?dAgo(ri(10,390)):null,change:pick(['Appointed','Moved cell','Stepped down','Reappointed'])})}

/* groups */
const LOC_GROUPS=[{id:'LG-1',name:'Mumbai West',locs:['Andheri','Borivali']},{id:'LG-2',name:'Mumbai East and Navi Mumbai',locs:['Thane','Vashi']},{id:'LG-3',name:'Maharashtra',locs:['Pune']},{id:'LG-4',name:'South',locs:['Hyderabad','Bengaluru','Chennai','Kochi']}];
const MINISTRIES=[['Worship','Ps. Joel Fernandes'],['Youth','Ps. Stephen Raj'],['Women','Ps. Ruth Mathew'],['Children','Esther Daniel'],['Prayer','Ps. Samuel Dhanaraj'],['Hospitality','Paul Rodrigues'],['Media','Rohan Pawar'],['Outreach','Ps. Abraham Shinde']].map((x,i)=>({id:'MN-'+(i+1),name:x[0],head:x[1],members:ri(18,140),active:true}));
const TAGS=[['Volunteer',64],['Choir',22],['Usher',31],['New believer',48],['Counselling',9],['Bus coordinator',6],['Translator',7],['Sunday school teacher',18]].map((x,i)=>({id:'TG-'+(i+1),name:x[0],count:x[1]}));
const LOCATIONS=LOCS.map((l,i)=>({id:'LC-'+(i+1),name:l,address:['Andheri East, Mumbai','Borivali West, Mumbai','Thane West','Sector 17, Vashi','Kalyani Nagar, Pune','Secunderabad, Hyderabad','Indiranagar, Bengaluru','Anna Nagar, Chennai','Kaloor, Kochi'][i],pastor:PASTORS[i].id,services:ri(1,3),members:MEMBERS.filter(m=>m.loc===l).length}));

/* first-time member video check (client request after the brief, scope to be confirmed) */
const VIDEOKYC=[];for(let i=0;i<7;i++){const g=chance(.5)?'M':'F';VIDEOKYC.push({id:'VK-'+(2210+i),name:nameOf(g),mobile:'+91 9'+ri(1000,9999)+' '+ri(10000,99999),loc:pick(LOCS),secs:ri(11,29),consent:true,at:hAgo(ri(1,70)),state:'Pending',attempt:chance(.2)?2:1})}

/* ---------- staff ---------- */
const STAFF=[
 ['Anitha Varghese','super','Office administrator'],['Rohan Pawar','content','Media lead'],['Grace Isaac','finance','Accounts'],['Sunil Nair','finance','Accounts'],
 ['Deborah Masih','jverifier','Jodie desk'],['Priya Kamble','jverifier','Jodie desk'],['Christina Paul','jadmin','Jodie desk lead'],['Paul Rodrigues','events','Events'],
 ['Joyce Pereira','moderator','Community desk'],['Kiran Reddy','comms','Communications'],['Esther Daniel','membership','Membership desk'],['Vinod Gaikwad','membership','Membership desk'],
 ['Ps. Emmanuel Kumar','pastor','Pastor, Andheri'],['Ps. Ruth Mathew','pastor','Pastor, Vashi'],['Neha Shinde','jverifier','Jodie desk (temporary)'],['Amit Kumar','events','Steward lead']
].map((x,i)=>({id:'ST-'+String(i+1).padStart(3,'0'),name:x[0],role:x[1],title:x[2],email:x[0].toLowerCase().replace(/^ps\. /,'').replace(/\s+/g,'.')+'@karunasadan.org',
  status:i===14?'Active':i===11?'Suspended':'Active',from:dAgo(ri(90,1400)),to:i===14?dAhead(23):i===15?dAhead(68):null,lastIn:hAgo(i===11?24*40:ri(1,96)),mfa:i!==9,locs:i>=12&&i<=13?[PASTORS[i===12?0:3].loc]:['All locations'],
  overrides:i===3?[{p:'finance.approve',mode:'deny',why:'Second approver only for batches over ₹5 L'}]:i===6?[{p:'reports.schedule',mode:'grant',why:'Monthly Jodie revenue pack'}]:[]}));
STAFF.push({id:'ST-017',name:'Sharon Babu',role:'jverifier',title:'Jodie desk (temporary)',email:'sharon.babu@karunasadan.org',status:'Expired access',from:dAgo(120),to:dAgo(9),lastIn:dAgo(10),mfa:true,locs:['All locations'],overrides:[]});
const staffBy=n=>STAFF.find(s=>s.name===n);

/* ---------- giving ---------- */
const TOWARDS=['General offering','Tithe','Partnership','Mission support','Building fund','Event'];
const RECEIPTS=[];
for(let i=0;i<260;i++){const m=pick(ADULTS),gw=pickW([['Razorpay',62],['Paytm',22],['Offline',16]]);
  const mode=gw==='Offline'?pickW([['Cash',50],['Cheque',30],['Bank transfer',20]]):pickW([['UPI',58],['Card',20],['Net banking',14],['Wallet',8]]);
  const amt=pickW([[ri(1,10)*100,40],[ri(1,10)*500,30],[ri(1,10)*1000,20],[ri(1,5)*5000,8],[ri(1,4)*25000,2]]);
  RECEIPTS.push({id:'DON/26-27/'+String(18420+i).padStart(6,'0'),member:m.id,name:m.name,amt,gw,mode,towards:pick(TOWARDS),
    status:pickW([['Paid',93],['Cancelled',3],['Hidden',2],['Archived',2]]),at:hAgo(ri(1,24*120)),pan:chance(.72),intl:gw!=='Offline'&&chance(.03),
    ref:gw==='Razorpay'?'pay_'+rid(14):gw==='Paytm'?'T'+ri(100000000,999999999)+ri(100,999):mode==='Cheque'?'CHQ '+ri(100000,999999):'',loc:m.loc,by:gw==='Offline'?pick(['Grace Isaac','Sunil Nair']):'Member app'})}
RECEIPTS.sort((a,b)=>b.at-a.at);
const FAILED=[];['Payment captured, receipt not created','Webhook not received','Amount differs from the order','Authorised, not captured','Duplicate order for the same payment','Payment captured, member not found'].forEach((r,i)=>{for(let k=0;k<(i<2?3:1);k++){const m=pick(ADULTS),gw=chance(.7)?'Razorpay':'Paytm';
  FAILED.push({id:'FD-'+(7710+FAILED.length),ref:gw==='Razorpay'?'pay_'+rid(14):'T'+ri(100000000,999999999),order:gw==='Razorpay'?'order_'+rid(14):'ORD'+ri(10000000,99999999),gw,member:m.id,name:m.name,amt:ri(1,20)*500,at:hAgo(ri(2,24*9)),reason:r,state:'Open'})}});
const SETTLEMENTS=[];for(let i=0;i<9;i++){const gw=i%3===2?'Paytm':'Razorpay',items=ri(40,160),gross=items*ri(900,1600),fees=Math.round(gross*.019),gst=Math.round(fees*.18);
  const un=i===0?3:i===1?2:i===3?1:0;SETTLEMENTS.push({id:gw==='Razorpay'?'setl_'+rid(14):'PTMSET'+ri(1000000,9999999),gw,date:dAgo(i+1),gross,fees,gst,net:gross-fees-gst,items,matched:items-un,unmatched:un,status:un?'Partly matched':'Reconciled'})}
const UNMATCHED=[];SETTLEMENTS.forEach(s=>{for(let k=0;k<s.unmatched;k++){const r=pick(RECEIPTS.filter(x=>x.gw===s.gw&&x.status==='Paid'));
  UNMATCHED.push({id:'UM-'+(UNMATCHED.length+1),setl:s.id,gw:s.gw,pay:s.gw==='Razorpay'?'pay_'+rid(14):'T'+ri(100000000,999999999),amt:k===1?r.amt+100:r.amt,at:s.date,suggest:k===2?null:r.id,state:'Unmatched'})}});
const REFUNDS=[];for(let i=0;i<6;i++){const r=pick(RECEIPTS.filter(x=>x.gw!=='Offline'));REFUNDS.push({id:'RF-'+(5100+i),receipt:r.id,name:r.name,amt:r.amt,reason:pick(['Paid twice','Wrong amount entered','Member asked for a refund within 7 days','Event cancelled']),status:pickW([['Processed',3],['Pending approval',2],['Failed',1]]),by:pick(['Grace Isaac','Sunil Nair']),at:hAgo(ri(5,24*20))})}
const GATEWAYS=[
 {id:'razorpay',name:'Razorpay',status:'Healthy',methods:['UPI','Card','Net banking','Wallet'],intl:true,success:96.8,webhook:{ok:1284,retry:3,fail:0},lastSetl:dAgo(1),mid:'acc_KS•••••7Q'},
 {id:'paytm',name:'Paytm',status:'Healthy',methods:['UPI','Card','Net banking','Wallet'],intl:false,success:94.1,webhook:{ok:402,retry:0,fail:1},lastSetl:dAgo(3),mid:'KARUNA•••••81'}];
const PFORMS=[['Sunday offering','General offering',[200,500,1000]],['Tithe','Tithe',[1000,2500,5000]],['Partnership','Partnership',[1000,3000,5000]],['Mission support','Mission support',[500,1000,2000]],['Building fund','Building fund',[5000,10000,25000]],['Night of Worship pass donation','Event',[100,250,500]]]
 .map((x,i)=>({id:'PF-'+(i+1),name:x[0],towards:x[1],amounts:x[2],custom:true,active:i!==5||true,gws:i===4?['Razorpay']:['Razorpay','Paytm'],uses:ri(20,900)}));
const WEBHOOKS=[];for(let i=0;i<16;i++){const gw=chance(.75)?'Razorpay':'Paytm';WEBHOOKS.push({id:'WH-'+(i+1),at:hAgo(i*2.7+.2),gw,ev:gw==='Razorpay'?pick(['payment.captured','payment.captured','order.paid','refund.processed','settlement.processed','payment.failed']):pick(['TXN_SUCCESS','TXN_SUCCESS','REFUND_SUCCESS','TXN_FAILURE']),ref:gw==='Razorpay'?'pay_'+rid(14):'T'+ri(100000000,999999999),status:i===2||i===9?'Retrying':i===12?'Failed':'Processed',ms:ri(80,640),sig:'Valid'})}

/* accounting (Zoho Books is the ledger of record) */
const ACCOUNTS=[['1001','HDFC Bank current ••4471','Bank','Current assets',2846210],['1002','SBI savings ••0918','Bank','Current assets',912440],['1005','Cash in hand, Andheri','Cash','Current assets',48210],
 ['1010','Razorpay clearing','Clearing','Current assets',184320],['1011','Paytm clearing','Clearing','Current assets',41980],['3001','Donations: general offering','Income','Donations',0],
 ['3002','Donations: tithe','Income','Donations',0],['3003','Donations: partnership','Income','Donations',0],['3010','Jodie subscription income','Income','Subscriptions',0],['4001','Hall rent','Expense','Indirect expenses',0],
 ['4002','Electricity','Expense','Indirect expenses',0],['4003','Transport hire','Expense','Direct expenses',0],['4004','Translator fees','Expense','Direct expenses',0],['4005','Reward payouts','Expense','Indirect expenses',0],
 ['2001','TDS payable','Liability','Duties and taxes',38420],['2002','GST payable','Liability','Duties and taxes',27110]].map(x=>({id:x[0],code:x[0],name:x[1],type:x[2],group:x[3],bal:x[4],sync:'Synced'}));
const FIN_HEADS=[['Ministry operations',['Hall rent','Electricity','Housekeeping','Security'],1800000],['Events',['Hall and sound','Hospitality','Printing'],950000],['Media',['Equipment','Streaming','Licences'],620000],
 ['Transport',['Bus hire','Fuel','Driver allowance'],480000],['Missions',['Outreach','Relief'],1200000],['Staff welfare',['Training','Medical'],300000]].map((x,i)=>({id:'FH-'+(i+1),name:x[0],subs:x[1],budget:x[2],spent:Math.round(x[2]*(.25+rnd()*.5))}));
const JOURNALS=[];for(let i=0;i<10;i++)JOURNALS.push({id:'JV/26-27/'+String(310+i).padStart(4,'0'),date:dAgo(i*2+1),narr:pick(['Being Razorpay settlement credited to HDFC current','Being TDS deducted on professional fees','Being transfer from SBI savings to HDFC current','Being cash deposited from Andheri collection','Being reward payouts for September paid']),dr:pick(['HDFC Bank current ••4471','TDS payable','Reward payouts','Cash in hand, Andheri']),cr:pick(['Razorpay clearing','SBI savings ••0918','HDFC Bank current ••4471']),amt:ri(5,400)*1000,status:i<2?'Draft':'Posted',by:pick(['Grace Isaac','Sunil Nair'])});
const INCOME_VOUCHERS=[];for(let i=0;i<8;i++)INCOME_VOUCHERS.push({id:'IV/26-27/'+String(120+i).padStart(4,'0'),date:dAgo(i*3+1),from:pick(['Sunday collection, Andheri','Sunday collection, Thane','Book stall','Convention registrations']),head:pick(TOWARDS),amt:ri(8,90)*1000,mode:pick(['Cash','Cheque','Bank transfer']),status:i===0?'Draft':'Posted'});
const NARRATIONS=['Being Razorpay settlement credited to bank','Being Paytm settlement credited to bank','Being cash collection deposited','Being TDS deducted on professional fees','Being reward payouts paid to members','Being hall rent paid for the month','Being translator fees paid','Being refund issued to member'].map((t,i)=>({id:'NR-'+(i+1),text:t,uses:ri(4,140)}));

/* TDS sections and rates as held in the existing system (config/globals.php, tdsList) */
const TDS=[['Professional Services',10,'194J'],['Technical Services',2,'194J'],['Commission or Brokerage',5,'194H'],['Interest',10,'194A'],['Contractor - Resident Individual or HUF',1,'194C'],['Contractor - Others',2,'194C'],
 ['Rent of land/building/furniture/fitting',10,'194I'],['Rent of plant and machinery',2,'194I'],['Reimbursement / No TDS',0,null],['Professional Services - Lower Deduction Certificate',0.75,'194J'],['Contract - Company',1.5,'194C'],['Contract - Individual',0.75,'194C'],
 ['Professional Fees - Company (Lower Rate Certificate)',1,'194J'],['Professional Fees - Firm',7.5,'194J'],['Professional Fees - Individual',7.5,'194J'],['Commission - Company',3.75,'194H'],['Rent - Company',7.5,'194I'],['Professional Services - lower deduction certificate',2,'194J']]
 .map((x,i)=>({id:String(i+1),purpose:x[0],rate:x[1],code:x[2]||'—'}));
const VENDORS=[['Sai Sound and Light','Hall and sound','27AAKFS1234L1Z5',1],['Metro Bus Services','Bus hire','27AABCM5521K1ZQ',6],['Shree Printers','Printing','27ABCPS7788H1Z2',2],['Bright Facilities','Housekeeping','27AAGCB4410M1Z9',11],['Anand Kulkarni, CA','Audit fees','',15],
 ['StreamCast Media','Streaming','29AAICS9087R1ZB',2],['Lotus Caterers','Hospitality','27AAAFL6609D1ZX',6],['Kumar Electricals','Maintenance','',5],['Grace Translations','Translation','27AAJFG3301N1Z0',15],['Hill View Hall','Hall rent','27AADFH2290Q1ZC',7],['Vision Interiors','Building works','27AAEFV7712B1Z6',11],['Ravi Taxi Co','Transport','',5]]
 .map((x,i)=>({id:'VN-'+(i+1),name:x[0],cat:x[1],gstin:x[2],pan:'AA'+'BCDEFGHPQ'[i%9]+'PK'+ri(1000,9999)+'L',tds:x[3],due:ri(0,4)*ri(2,40)*1000,active:true}));
const PROJECTS=[['Andheri hall renovation','Building fund',4500000],['Kochi relief 2026','Mission support',800000],['Media studio upgrade','Media',1200000],['Christmas 2026','Events',900000],['Youth camp October','Events',350000],['Bus fleet contract','Transport',600000]]
 .map((x,i)=>({id:'PJ-'+(i+1),name:x[0],head:x[1],budget:x[2],spent:Math.round(x[2]*(.1+rnd()*.7)),status:i===3?'Upcoming':'Active'}));
const EXPENSES=[];for(let i=0;i<20;i++){const v=pick(VENDORS),t=byId(TDS,String(v.tds)),amt=ri(4,180)*1000,st=pickW([['Due',5],['Paid',9],['Overdue',3],['Part paid',2]]);
  EXPENSES.push({id:'EV/26-27/'+String(640+i).padStart(4,'0'),vendor:v.name,vendorId:v.id,head:pick(FIN_HEADS).name,amt,tdsPct:t?t.rate:0,tds:Math.round(amt*(t?t.rate:0)/100),due:dAhead(ri(-12,25)),status:st,att:ri(0,3),posted:st==='Paid'?'Posted':pickW([['Posted',5],['Pending',2]]),project:chance(.4)?pick(PROJECTS).name:'',at:dAgo(ri(1,40))})}
const BANKS=[{name:'HDFC Bank current ••4471',bal:2846210,asOf:hAgo(1)},{name:'SBI savings ••0918',bal:912440,asOf:hAgo(1)}];
const BATCHES=[
 {id:'PB-2026-114',title:'Vendor payments, week 41',source:'Expense vouchers',items:7,amt:486200,status:'Pending approval',by:'Grace Isaac',at:hAgo(5),acct:BANKS[0].name},
 {id:'PB-2026-113',title:'Reward withdrawals, 1 to 7 October',source:'Reward withdrawals',items:6,amt:1846,status:'Pending approval',by:'Sunil Nair',at:hAgo(20),acct:BANKS[0].name},
 {id:'PB-2026-112',title:'Translator fees, September',source:'Translator payments',items:5,amt:64500,status:'Approved',by:'Grace Isaac',at:dAgo(3),acct:BANKS[0].name,decidedBy:'Anitha Varghese'},
 {id:'PB-2026-111',title:'Refunds, week 40',source:'Refunds',items:3,amt:7500,status:'Processed',by:'Sunil Nair',at:dAgo(6),acct:BANKS[0].name,decidedBy:'Anitha Varghese'},
 {id:'PB-2026-110',title:'Vendor payments, week 40',source:'Expense vouchers',items:9,amt:612900,status:'Processed',by:'Grace Isaac',at:dAgo(8),acct:BANKS[0].name,decidedBy:'Anitha Varghese'},
 {id:'PB-2026-109',title:'Bus hire, Youth camp advance',source:'Expense vouchers',items:1,amt:90000,status:'Rejected',by:'Grace Isaac',at:dAgo(10),acct:BANKS[1].name,decidedBy:'Anitha Varghese',remark:'Advance needs the signed contract attached.'}];
const TXNS=[];for(let i=0;i<26;i++){const cr=chance(.55);TXNS.push({id:'TX-'+(90410+i),date:hAgo(i*13+2),desc:cr?pick(['RAZORPAY SETTLEMENT','PAYTM SETTLEMENT','CASH DEP ANDHERI','NEFT FROM MEMBER','UPI/COLLECT']):pick(['NEFT TO SAI SOUND','IMPS METRO BUS','ELECTRICITY BILL','TDS CHALLAN','SALARY ADVANCE REIMB']),acct:pick(BANKS).name,amt:ri(3,300)*1000,dir:cr?'Credit':'Debit',ref:'UTR'+ri(100000000,999999999),status:pickW([['Reconciled',8],['Unreconciled',2]])})}
const DRAFTS=[];for(let i=0;i<8;i++){const cr=chance(.6);DRAFTS.push({id:'TD-'+(310+i),date:hAgo(i*20+5),desc:cr?pick(['NEFT/CR/SAMUEL JOSEPH','UPI/CR/9823XXXX11','CASH DEP VASHI']):pick(['NEFT/DR/LOTUS CATERERS','POS/DR/AMAZON','ATM WDL']),amt:ri(1,90)*1000,dir:cr?'Credit':'Debit',suggest:chance(.6)?(cr?'Receipt '+pick(RECEIPTS).id:'Voucher '+pick(EXPENSES).id):'',state:'Waiting'})}
const BANK_IMPORTS=[{id:'BI-41',file:'HDFC_4471_Sep2026.csv',bank:'HDFC Bank current ••4471',rows:412,matched:398,drafts:14,at:dAgo(8),by:'Grace Isaac'},{id:'BI-40',file:'SBI_0918_Sep2026.xlsx',bank:'SBI savings ••0918',rows:96,matched:96,drafts:0,at:dAgo(8),by:'Grace Isaac'},{id:'BI-39',file:'HDFC_4471_Aug2026.csv',bank:'HDFC Bank current ••4471',rows:388,matched:388,drafts:0,at:dAgo(39),by:'Sunil Nair'}];
const IMPORT_REQS=[{id:'IR-12',what:'HDFC statement 1 to 8 October',from:'Sunil Nair',at:hAgo(6),state:'Pending'},{id:'IR-11',what:'Paytm settlement report, September',from:'Grace Isaac',at:dAgo(4),state:'Completed'}];
const TRANSLATORS=[['Sneha Gaikwad','Marathi'],['Joyce Babu','Hindi'],['Ravi Rao','Telugu'],['Merlin Nair','Malayalam'],['Jeba Selvaraj','Tamil'],['Kiran Kumar','Kannada']]
 .map((x,i)=>({id:'TR-'+(i+1),name:x[0],lang:x[1],rate:ri(3,6)*100,pages:ri(10,60),paid:ri(10,90)*500,due:ri(0,8)*500}));

/* rewards: rates as held in the existing system (config/globals.php) */
const REWARD_RATES={like:0.5,comment:2,post:3,min:50};
const REWARD_TX=[];for(let i=0;i<12;i++){const m=pick(ADULTS),l=ri(40,900),c=ri(5,120),p=ri(0,30),amt=l*REWARD_RATES.like+c*REWARD_RATES.comment+p*REWARD_RATES.post;
  REWARD_TX.push({id:'RW-'+(880+i),member:m.id,name:m.name,likes:l,comments:c,posts:p,amt,status:i<4?'Pending approval':i<6?'Processing':pickW([['Paid',8],['Rejected',1]]),at:hAgo(i*30+3),voucher:i>=4?'EV/26-27/'+String(700+i).padStart(4,'0'):'',batch:i>=4&&i<6?'PB-2026-113':i>=6?'PB-2026-110':''})}

/* ---------- events ---------- */
const HALLS=[{id:'HL-1',name:'Main Sanctuary',loc:'Andheri',secs:[['A',6,16],['B',8,18],['C',8,18],['D',6,16]],free:'Released 30 min before start'},
 {id:'HL-2',name:'Fellowship Hall',loc:'Andheri',secs:[['A',6,12],['B',6,12]],free:'Released 15 min before start'},
 {id:'HL-3',name:'Thane Centre Hall',loc:'Thane',secs:[['A',8,14],['B',8,14]],free:'Released 30 min before start'}];
HALLS.forEach(h=>h.seats=sum(h.secs,s=>s[1]*s[2]));
const EVENTS=[
 ['Sunday First Service','Service','Weekly services',2,'08:00','HL-1',['en','hi'],'Published'],
 ['Sunday Second Service','Service','Weekly services',2,'10:30','HL-1',['en','mr'],'Published'],
 ['Night of Worship','Concert','Special events',8,'19:00','HL-1',['en','hi','mr'],'Published'],
 ['Youth Revival Camp','Camp','Youth',15,'09:00','HL-2',['en'],'Published'],
 ['Women\'s Prayer Morning','Prayer','Women',0,'10:00','HL-2',['en','hi'],'Published'],
 ['Thanksgiving Service','Service','Special events',23,'18:00','HL-3',['en','mr'],'Draft'],
 ['Christmas Celebration','Concert','Special events',77,'18:30','HL-1',['en','hi','mr','te','ml','ta','kn'],'Draft'],
 ['Watch Night Service','Service','Special events',83,'22:00','HL-1',['en','hi','mr'],'Draft'],
 ['Healing Service, Thane','Service','Weekly services',-5,'18:00','HL-3',['en','mr'],'Completed'],
 ['Baptism Sunday','Service','Special events',-12,'10:30','HL-1',['en','hi'],'Completed'],
 ['Leaders\' Retreat','Camp','Leadership',-20,'09:00','HL-2',['en'],'Completed'],
 ['Kids Bible Week','Children','Children',-34,'10:00','HL-2',['en','hi','mr'],'Archived']]
 .map((x,i)=>{const hall=byId(HALLS,x[5]),start=at(dAhead(x[3]),+x[4].split(':')[0],+x[4].split(':')[1]);const cap=hall.seats;
  const issued=x[7]==='Draft'?0:Math.round(cap*(x[3]<0?.86:x[3]<3?.92:.4+rnd()*.3));
  return {id:'EV-'+(5310+i),name:x[0],type:x[1],group:x[2],start,end:new Date(+start+(x[1]==='Camp'?3*DAY:2.5*HR)),hall:x[5],loc:hall.loc,langs:x[6],status:x[7],cap,issued,
    attended:x[3]<0?Math.round(issued*(.78+rnd()*.15)):x[3]===0?Math.round(issued*.31):0,sessions:x[1]==='Camp'?ri(5,9):ri(1,2),family:x[1]!=='Camp',release:30,price:0}});
const eventName=id=>(byId(EVENTS,id)||{}).name||id;
const PASSES=[];for(let i=0;i<46;i++){const m=pick(ADULTS),e=pick(EVENTS.filter(x=>x.status==='Published'||x.status==='Completed')),fam=e.family&&chance(.35);
  const sec=pick(byId(HALLS,e.hall).secs);PASSES.push({id:'PS-'+(66120+i),code:'KSM-'+rid(4).toUpperCase()+'-'+ri(10,99),member:m.id,name:m.name,event:e.id,type:fam?'Family':'Single',count:fam?ri(2,5):1,seat:sec[0]+'-'+ri(1,sec[1])+'-'+ri(1,sec[2]),
    status:e.status==='Completed'?pickW([['Admitted',8],['Expired',2]]):pickW([['Issued',6],['Confirmed',3],['Admitted',e.start<NOW+DAY?3:0],['Released',1]]),at:hAgo(ri(2,24*14))})}
const TODAY_EVENT=EVENTS[4];
const SCANS=[];for(let i=0;i<24;i++){const p=pick(PASSES);
  SCANS.push({id:'SC-'+(1+i),at:new Date(+at(NOW,9,20)+i*2.6*MIN),code:p.code,name:p.name,event:TODAY_EVENT.id,gate:pick(['Gate 1','Gate 2','Side gate']),steward:pick(['Amit Kumar','Paul Rodrigues','Jacob Das']),result:i===7?'Already admitted':i===15?'Invalid':'Admitted'})}
SCANS.reverse();
const ABSENTEES=[];for(let i=0;i<14;i++){const m=pick(ADULTS);ABSENTEES.push({id:'AB-'+(i+1),member:m.id,name:m.name,pastor:m.pastor,cell:m.cell,missed:ri(2,6),last:dAgo(ri(14,60)),comment:i<5?pick(['Called. Unwell, will return next month.','Moved to Pune for work.','Visited by cell leader.','No answer, try again.']):'',state:i<5?'Followed up':'Open'})}
const SERVICES=[];LOCS.forEach((l,i)=>{const n=i<2?3:i<5?2:1;for(let k=0;k<n;k++)SERVICES.push({id:'SV-'+(SERVICES.length+1),name:['First','Second','Evening'][k]+' Service',loc:l,day:'Sunday',time:['08:00','10:30','18:00'][k],lang:k===0?'en':pick(['hi','mr','te','ml','ta','kn'].slice(0,3)),hall:i===0?'Main Sanctuary':i===2?'Thane Centre Hall':l+' hall',avg:ri(80,520),status:'Active'})});
SERVICES.push({id:'SV-99',name:'Wednesday Bible Service',loc:'Andheri',day:'Wednesday',time:'19:30',lang:'en',hall:'Fellowship Hall',avg:ri(60,140),status:'Active'});
const SERVICE_HISTORY=[];for(let i=0;i<12;i++){const s=pick(SERVICES);SERVICE_HISTORY.push({id:'SH-'+(i+1),svc:s.id,name:s.loc+', '+s.name,date:dAgo(Math.floor(i/3)*7+5),preacher:pick(PASTORS).name,att:ri(60,560),offering:ri(10,180)*1000,media:chance(.7)?'Uploaded':'Pending'})}
const CHECKLISTS=[{id:'CL-1',event:'EV-5312',title:'Night of Worship, day before',items:[['Sound check booked','Paul Rodrigues',true],['Ushers rota published','Amit Kumar',true],['Seat labels printed','Paul Rodrigues',false],['Stream key tested','Rohan Pawar',false],['First-aid desk confirmed','Esther Daniel',false]]},
 {id:'CL-2',event:'EV-5313',title:'Youth camp, two weeks out',items:[['Buses confirmed','Paul Rodrigues',true],['Menu with caterer','Esther Daniel',false],['Consent forms collected','Vinod Gaikwad',false],['Camp site walkthrough','Ps. Stephen Raj',true]]},
 {id:'CL-3',event:'EV-5316',title:'Christmas, eleven weeks out',items:[['Hall booking confirmed','Paul Rodrigues',true],['Seven-language song sheets','Rohan Pawar',false],['Choir rehearsals scheduled','Ps. Joel Fernandes',false]]}];
const EV_TASKS=[];['Book hall and sound','Publish pass booking','Print seat labels','Brief stewards','Release unclaimed passes','Share live stream link','Collect offering count'].forEach((t,i)=>EV_TASKS.push({id:'ET-'+(i+1),title:t,event:'EV-5312',template:'Concert, standard',owner:pick(['Paul Rodrigues','Amit Kumar','Rohan Pawar']),due:dAhead(ri(-1,8)),state:i<2?'Done':i===4?'Waiting':'Open'}));
const EV_EXPENSES=[];for(let i=0;i<7;i++){const e=pick(EVENTS.slice(0,8));EV_EXPENSES.push({id:'EE-'+(i+1),event:e.id,item:pick(['Sound hire','Flowers','Printing','Refreshments','Bus hire','Stage lighting']),vendor:pick(VENDORS).name,amt:ri(3,90)*1000,status:pick(['Approved','Pending approval','Paid'])})}
const BUS_ROUTES=[['Route 1, Borivali to Andheri','Joel Das',9,52],['Route 2, Thane to Andheri','Rajesh Kamble',11,52],['Route 3, Vashi to Thane','Moses Pawar',7,40],['Route 4, Virar to Borivali','Sachin Shinde',12,52],['Route 5, Kalyan to Thane','Anand Moses',10,40],['Route 6, Dahisar to Andheri','Prakash Rao',8,32]]
 .map((x,i)=>({id:'BR-'+(i+1),name:x[0],coord:x[1],stops:x[2],cap:x[3],riders:Math.round(x[3]*(.55+rnd()*.4)),event:'Sunday services',vehicle:'MH-0'+ri(1,4)+'-'+['AB','CD','EF','GH'][i%4]+'-'+ri(1000,9999),status:i===4?'Running late':'On time',last:hAgo(ri(1,48)/10)}));
const BUS_ATT=[];BUS_ROUTES.forEach(r=>[0,7,14,21].forEach(w=>BUS_ATT.push({id:r.id+'-'+w,route:r.name,date:dAgo(w+5),riders:Math.round(r.cap*(.5+rnd()*.45)),cap:r.cap})));

/* ---------- community ---------- */
const POST_TEXT=['Grateful for the Sunday message on patience. Sharing the notes I took.','Our cell group served lunch at the Andheri shelter today. Thank you to everyone who came.','Throwback to the baptism service. What a day.','Please join us for the Wednesday Bible service, 7:30 pm at the Fellowship Hall.','A short reel from the youth worship night.','Sharing a verse that kept me going this week: Isaiah 41:10.','The choir practice tonight was beautiful. Come and listen on Sunday.','Can anyone recommend a good Marathi study Bible?','New to Thane and looking for a cell group near Ghodbunder Road.','My daughter passed her board exams. Thank you for praying.'];
const COMMENT_TEXT=['Amen, praying with you.','Beautiful words, thank you for sharing.','Call me on 98200 11234 for details.','Which service was this?','So encouraging.','Please share the full sermon link.','Join our WhatsApp group: chat.whatsapp.com/xxxx'];
const MODQ=[];const MTYPES=[['Post',8],['Reel',4],['Comment',7],['About me',3],['Profile photo',4]];
for(let i=0;i<26;i++){const t=pickW(MTYPES),m=pick(ADULTS);MODQ.push({id:'MQ-'+(9000+i),type:t,member:m.id,name:m.name,text:t==='Comment'?pick(COMMENT_TEXT):t==='About me'?pick(['Worship leader, Thane. Love serving in the kids ministry.','Engineer, singer, follower of Jesus.','Mother of two, member since 2014.']):t==='Profile photo'?'New profile photograph':pick(POST_TEXT),
  cat:t==='Post'||t==='Reel'?pick(['Testimony','Worship','Youth','Cell life','Events']):'',on:t==='Comment'?'Post by '+pick(ADULTS).name:'',at:hAgo(ri(1,60)),auto:'',state:'Pending'})}
MODQ.forEach(q=>{if(/\d{5}|whatsapp|chat\./i.test(q.text))q.auto='Contains a phone number or link'});
const FLAGS=[];for(let i=0;i<10;i++){const m=pick(ADULTS);FLAGS.push({id:'FL-'+(300+i),type:pick(['Post','Comment','Reel','Prayer request']),name:m.name,member:m.id,text:pick(['Selling health supplements, DM me for prices.','Off-topic political post.','Rude reply to another member.','Spam link to a loan app.','Repeated the same post 6 times.','Personal phone number shared publicly.']),reports:ri(1,9),reasons:pick(['Spam','Offensive','Personal information','Misleading','Harassment']),at:hAgo(ri(1,90)),state:'Open'})}
const POLLS=[{id:'PL-1',q:'Which time works best for the new evening service in Pune?',opts:[['5:00 pm',412],['6:00 pm',688],['7:00 pm',301]],status:'Live',ends:dAhead(4),by:'Ps. Abraham Shinde'},
 {id:'PL-2',q:'Would you join a weekday online Bible study?',opts:[['Yes, weekly',1204],['Yes, monthly',533],['Not now',210]],status:'Live',ends:dAhead(9),by:'Ps. Samuel Dhanaraj'},
 {id:'PL-3',q:'Theme for the youth camp',opts:[['Rooted',220],['Unshaken',341],['Called',198]],status:'Ended',ends:dAgo(6),by:'Ps. Stephen Raj'},
 {id:'PL-4',q:'Preferred language for the Christmas programme booklet',opts:[['English',900],['Hindi',610],['Marathi',540]],status:'Scheduled',ends:dAhead(30),by:'Rohan Pawar'}];
const COMPETITIONS=[{id:'CP-1',name:'Psalm 23 recitation, kids',entries:46,status:'Judging',closes:dAgo(2),winners:''},{id:'CP-2',name:'Christmas card design',entries:12,status:'Open',closes:dAhead(40),winners:''},{id:'CP-3',name:'Bible quiz, youth, September',entries:131,status:'Results published',closes:dAgo(21),winners:'Sneha Gaikwad, Rohan Joseph, Asha Pillai'}];
const PRAYERS=[];const PR_TEXT=['Healing for my mother after surgery.','A job interview on Monday.','Peace in our home.','My son\'s exams next week.','Safe travel to Kochi.','Visa approval for my studies.','Recovery from dengue.','Wisdom for a business decision.'];
for(let i=0;i<22;i++){const m=pick(ADULTS);PRAYERS.push({id:'PR-'+(4400+i),member:m.id,name:m.name,text:pick(PR_TEXT),bg:pick(['Dawn','Olive','Lavender','Ocean','None']),praying:ri(3,420),at:hAgo(ri(1,24*12)),vis:pick(['Public','Public','Pastors only']),state:i<5?'Pending':'Published',post:chance(.3)})}
const PRAISE=[];const PS_TEXT=['God healed my father of a long illness. The doctors were amazed.','I got the job after six months of waiting.','Our house loan was approved against every odd.','Delivered safely, a baby girl!','My exam results came, first class.'];
for(let i=0;i<12;i++){const m=pick(ADULTS);PRAISE.push({id:'PZ-'+(1200+i),member:m.id,name:m.name,text:pick(PS_TEXT),photos:ri(0,3),at:hAgo(ri(2,24*20)),state:i<4?'Pending':pickW([['Published',8],['Rejected',1]]),likes:i<4?0:ri(10,600)})}
const OBITS=[];for(let i=0;i<6;i++){const g=chance(.5)?'M':'F',a=ri(62,94);OBITS.push({id:'OB-'+(210+i),name:nameOf(g),age:a,loc:pick(LOCS),by:pick(ADULTS).name,service:i<3?dAhead(ri(1,4)):dAgo(ri(3,30)),att:ri(1,3),at:hAgo(ri(2,24*30)),state:i<2?'Pending':'Published'})}
const FEEDBACK=[];const FB=['The live stream kept buffering during the second service.','Please add Kannada to the daily manna.','Thank you for the new bus route from Kalyan.','The pass booking said seats were full but the hall had space.','Could the app remember my preferred service?','Receipt download link did not open.','The Telugu translation of Sunday notes had a typo.','Great youth camp. Please do it again in May.'];
for(let i=0;i<14;i++){const m=pick(ADULTS);FEEDBACK.push({id:'FB-'+(700+i),kind:i%4===3?'Broadcast reply':'Feedback',member:m.id,name:m.name,text:pick(FB),cat:pick(['App','Services','Events','Finance','Content']),at:hAgo(ri(1,24*14)),state:i<6?'Open':pickW([['Resolved',5],['Closed',2]]),unread:i<4})}

/* ---------- content ---------- */
const MANNA_TITLES=['Strength for today','The Lord is near','Rooted in love','A lamp to my feet','Grace upon grace','Wait on the Lord','Peace that guards','Fear not','He restores my soul','Called by name','A new song','Mercy every morning','The good shepherd','Walk by faith','Light in the darkness','Be still','Living water','The vine and the branches','Ask, seek, knock','Joy in the morning','Steadfast love'];
const MANNA=[];for(let i=-7;i<=13;i++){const d=dAhead(i);const filled=i<=9||i===11;
  MANNA.push({id:'DM-'+fds(d).replace(' ','-'),date:at(d,5,0),title:filled?MANNA_TITLES[i+7]:'',verse:filled?pick(['Psalm 23:3','Isaiah 40:31','Philippians 4:7','Lamentations 3:23','John 15:5','Psalm 46:10','Matthew 7:7','Hebrews 13:8']):'',cat:pick(['Morning','Family','Youth']),
    langs:filled?Object.fromEntries(LANGS.map(l=>[l[0],l[0]==='en'?'ok':i<4?'ok':i<8?(chance(.6)?'ok':'part'):(chance(.3)?'ok':chance(.5)?'part':'none')])):{},status:!filled?'Empty':i<0?'Published':i===0?'Live':i<5?'Scheduled':'Draft',author:pick(['Ps. Samuel Dhanaraj','Ps. Ruth Mathew','Rohan Pawar']),views:i<=0?ri(6000,18000):0,updatedBy:pick(['Rohan Pawar','Ps. Samuel Dhanaraj']),updated:hAgo(ri(2,24*10))})}
MANNA.find(m=>m.status==='Live').verse='Isaiah 41:10';
const langMap=p=>Object.fromEntries(LANGS.map(l=>[l[0],l[0]==='en'?'ok':rnd()<p?'ok':rnd()<.5?'part':'none']));
const CTYPES=[
 {id:'manna',l:'Daily Manna',icon:'book-open',sec:'5.5',note:'Shown in the app as Daily Bread'},{id:'prayers',l:'Daily prayers',icon:'flame',sec:'5.5'},{id:'confessions',l:'Daily confessions',icon:'msg',sec:'5.5',note:'Shown in the app as Words of Faith'},
 {id:'commentary',l:'Bible commentary',icon:'book',sec:'5.5'},{id:'study',l:'Bible study',icon:'list',sec:'5.5'},{id:'school',l:'Bible school',icon:'cap',sec:'5.5'},{id:'quiz',l:'Bible quiz',icon:'trophy',sec:'5.5'},
 {id:'courses',l:'Courses',icon:'cap',sec:'5.5'},{id:'dreams',l:'Dream dictionary',icon:'moon',sec:'5.5',note:'Shown in the app as Dreams and Visions'},{id:'books',l:'Books library',icon:'book',sec:'5.5',note:'Shown in the app as Faith Library'},
 {id:'video',l:'Video',icon:'video',sec:'5.6'},{id:'live',l:'Live video',icon:'live',sec:'5.6'},{id:'podcasts',l:'Podcasts',icon:'mic',sec:'5.6'},{id:'channels',l:'Channels and featured',icon:'tv',sec:'5.6'},{id:'announce',l:'Announcements and banners',icon:'mega',sec:'5.6'}];
const LIBRARY=[];
const LIBSEED={prayers:['Prayer for the family','Prayer for the nation','Morning surrender','Prayer before exams','Prayer for healing','Evening thanksgiving'],
 confessions:['I am more than a conqueror','My needs are supplied','I walk in divine health','The Lord is my shepherd','I have the mind of Christ'],
 commentary:['Genesis 1','Psalm 23','Isaiah 53','Matthew 5','John 3','Romans 8','Ephesians 6','Revelation 21'],
 dreams:['Water','Flying','Snakes','Mountains','Fire','A house','Teeth falling','Running'],
 books:['Walking in Faith','The Praying Family','Grace for Every Day','Kingdom Living','Letters to the Young']};
Object.keys(LIBSEED).forEach(t=>LIBSEED[t].forEach((title,i)=>LIBRARY.push({id:t.slice(0,2).toUpperCase()+'-'+(100+LIBRARY.length),type:t,title,cat:t==='dreams'?pick(['Nature','Animals','Places','Body']):t==='commentary'?(i<2?'Old Testament':pick(['Old Testament','New Testament'])):t==='books'?pick(['Devotional','Family','Teaching']):pick(['Morning','Family','Healing']),
  langs:langMap(.55),status:pickW([['Published',8],['Draft',2]]),views:ri(200,22000),favs:ri(10,900),updated:hAgo(ri(5,24*90)),updatedBy:pick(['Rohan Pawar','Ps. Samuel Dhanaraj','Ps. Ruth Mathew']),chapters:t==='books'?ri(6,18):0})));
const STUDIES=[['Foundations of Faith','study',12,2140],['The Gospel of John','study',21,1310],['Prayer that Moves','study',8,980],['Bible School: Level 1','school',24,620],['Bible School: Level 2','school',24,284],['Weekly Bible Quiz','quiz',10,3120]]
 .map((x,i)=>({id:'BS-'+(i+1),title:x[0],kind:x[1],steps:x[2],members:x[3],done:Math.round(x[3]*(.18+rnd()*.3)),langs:langMap(.5),status:i===4?'Draft':'Published',quiz:x[1]!=='study'}));
const COURSES=[['Discipleship 101','Foundations','Ps. Samuel Dhanaraj',8,32],['Marriage God\'s Way','Family','Ps. Ruth Mathew',6,18],['Worship Leading','Ministry','Ps. Joel Fernandes',10,40],['Financial Stewardship','Life','Anand Kulkarni',5,15],['Raising Children in Faith','Family','Esther Daniel',7,21],['Evangelism Today','Ministry','Ps. Abraham Shinde',9,27],['Prayer School','Foundations','Ps. Samuel Dhanaraj',6,24],['Youth Leadership','Ministry','Ps. Stephen Raj',8,26]]
 .map((x,i)=>({id:'CR-'+(i+1),title:x[0],cat:x[1],instructor:x[2],groups:Math.ceil(x[3]/3),lessons:x[4],enrolled:ri(120,2400),completed:0,langs:langMap(.45),status:i===7?'Draft':'Published',tags:pick(['New','Popular',''])}));
COURSES.forEach(c=>c.completed=Math.round(c.enrolled*(.15+rnd()*.4)));
const PLAYBACK=[];for(let i=0;i<5;i++){const c=pick(COURSES);PLAYBACK.push({id:'PB'+(i+1),course:c.title,lesson:'Lesson '+ri(1,c.lessons),name:pick(ADULTS).name,issue:pick(['Video stops at 3 minutes','No sound on Android','Subtitles out of sync','Will not play on mobile data']),device:pick(['Android 14','iOS 18','Android 13']),at:hAgo(ri(2,24*8)),state:i<3?'Open':'Resolved'})}
const VIDEOS=[];const VT=['Sunday Message: Rooted and Grounded','Night of Worship Highlights','Testimony: Healed and Restored','Youth Night: Unshaken','Kids Church: Noah\'s Ark','Prayer Hour, Wednesday','Baptism Sunday 2026','Worship: Way Maker (Hindi)','Family Seminar Part 1','Family Seminar Part 2','Healing Service, Thane','Christmas 2025 Choir','Marathi Sermon: Faith that Works','Telugu Worship Evening','Missions Report: Kochi Relief','Leaders\' Retreat Recap','Daily Manna Video, 7 Oct','Q&A with Ps. Emmanuel'];
VT.forEach((t,i)=>VIDEOS.push({id:'VD-'+(800+i),title:t,cat:pick(['Sermons','Worship','Testimonies','Kids','Seminars']),src:i%5===4?'Upload':'YouTube',views:ri(800,64000),likes:0,dur:ri(4,72)+':'+String(ri(0,59)).padStart(2,'0'),order:i+1,status:i===16?'Draft':'Published',at:dAgo(ri(1,120)),lang:pick(['en','hi','mr','te'])}));
VIDEOS.forEach(v=>v.likes=Math.round(v.views*(.04+rnd()*.06)));
const LIVES=[{id:'LV-1',title:'Sunday Second Service, live',when:at(dAhead(2),10,30),platform:'YouTube Live',meeting:'',status:'Scheduled',peak:0},{id:'LV-2',title:'Night of Worship, live',when:at(dAhead(8),19,0),platform:'YouTube Live',meeting:'',status:'Scheduled',peak:0},
 {id:'LV-3',title:'Wednesday Bible Service',when:at(dAgo(2),19,30),platform:'Zoho Meeting',meeting:'Webinar',status:'Ended',peak:1840},{id:'LV-4',title:'Sunday First Service, live',when:at(dAgo(5),8,0),platform:'YouTube Live',meeting:'',status:'Ended',peak:6120}];
const PODCASTS=[{id:'PD-1',title:'Daily Manna Audio',eps:214,lang:'en',spotify:true,status:'Published',last:dAgo(0)},{id:'PD-2',title:'Sunday Sermons',eps:96,lang:'en',spotify:true,status:'Published',last:dAgo(5)},{id:'PD-3',title:'Prarthana (Hindi prayers)',eps:48,lang:'hi',spotify:false,status:'Published',last:dAgo(2)},{id:'PD-4',title:'Marathi Bible Readings',eps:12,lang:'mr',spotify:false,status:'Processing',last:dAgo(1)}];
const CHANNELS=[{id:'CH-1',name:'GOD TV India',slot:'Sat 7:00 pm',lang:'en',status:'Active',featured:true},{id:'CH-2',name:'Shalom TV',slot:'Sun 6:30 am',lang:'ml',status:'Active',featured:false},{id:'CH-3',name:'Aradhana TV',slot:'Tue 9:00 pm',lang:'te',status:'Active',featured:false},{id:'CH-4',name:'Angel TV',slot:'Thu 8:00 pm',lang:'ta',status:'Active',featured:true},{id:'CH-5',name:'Rajya TV',slot:'Fri 6:00 am',lang:'hi',status:'Paused',featured:false}];
const BANNERS=[{id:'BN-1',kicker:'This Sunday',title:'Plan your visit to Sunday services',sub:'Book a pass for you and your family',to:'Events',grad:'linear-gradient(135deg,#5F2BA8,#A719C8)',from:dAgo(3),until:dAhead(3),order:1,status:'Live',taps:2140},
 {id:'BN-2',kicker:'17 October',title:'Night of Worship',sub:'Andheri, Main Sanctuary, 7 pm',to:'Night of Worship pass',grad:'linear-gradient(135deg,#7D2FC9,#E0489E)',from:dAgo(2),until:dAhead(8),order:2,status:'Live',taps:1680},
 {id:'BN-3',kicker:'Daily Bread',title:'Strength for today',sub:'Today\'s Daily Manna, in seven languages',to:'Daily Manna',grad:'linear-gradient(135deg,#6A2FB0,#C449E2)',from:dAgo(30),until:dAhead(60),order:3,status:'Live',taps:5230},
 {id:'BN-4',kicker:'Live',title:'Watch the second service live',sub:'Sundays at 10:30 am',to:'Live video',grad:'linear-gradient(135deg,#3F2A8C,#7A4AD0)',from:dAgo(10),until:dAhead(40),order:4,status:'Live',taps:980},
 {id:'BN-5',kicker:'Give',title:'Give towards the Andheri hall renovation',sub:'Receipts under section 80G',to:'Give',grad:'linear-gradient(135deg,#8A1DB0,#D6368C)',from:dAgo(5),until:dAhead(25),order:5,status:'Live',taps:610},
 {id:'BN-6',kicker:'Christmas',title:'Christmas Celebration passes',sub:'Opens 1 December',to:'Events',grad:'linear-gradient(135deg,#5F2BA8,#C45FC4)',from:dAhead(53),until:dAhead(77),order:6,status:'Scheduled',taps:0}];
const ANNOUNCEMENTS=[{id:'AN-1',text:'Sunday services move to the Main Sanctuary from 12 October.',place:'Home, top',until:dAhead(4),status:'Live'},{id:'AN-2',text:'The office is closed on 2 October (Gandhi Jayanti).',place:'Home, top',until:dAgo(7),status:'Ended'},{id:'AN-3',text:'Pass booking for Night of Worship closes on 16 October.',place:'Events',until:dAhead(7),status:'Live'},{id:'AN-4',text:'New: Daily Manna now in Kannada.',place:'The Word',until:dAhead(14),status:'Scheduled'}];

/* ---------- communications ---------- */
const BLISTS=[{id:'BL-1',name:'All active members',size:0,rule:'Status is Active'},{id:'BL-2',name:'Partners',size:0,rule:'Partnership is Yes'},{id:'BL-3',name:'Youth (16 to 25)',size:0,rule:'Age 16 to 25'},{id:'BL-4',name:'Andheri congregation',size:0,rule:'Location is Andheri'},{id:'BL-5',name:'Cell leaders',size:LEADERS.length,rule:'Is a cell leader'}];
BLISTS[0].size=ADULTS.length;BLISTS[1].size=ADULTS.filter(m=>m.partner).length;BLISTS[2].size=ADULTS.filter(m=>m.age<=25&&m.age>=16).length;BLISTS[3].size=ADULTS.filter(m=>m.loc==='Andheri').length;
const BROADCASTS=[];[['Sunday service timings change','Push and SMS','Andheri congregation','Sent'],['Night of Worship: book your pass','Push','All active members','Sent'],['Partner newsletter, October','Email','Partners','Sent'],['Youth camp registrations close Friday','Push','Youth (16 to 25)','Scheduled'],['Prayer chain, Wednesday','SMS','Cell leaders','Sent'],['Christmas choir auditions','Push','All active members','Draft'],['Office closed on 2 October','Push and SMS','All active members','Sent'],['Daily Manna in Kannada','Push','All active members','Scheduled']]
 .forEach((x,i)=>{const list=BLISTS.find(b=>b.name===x[2]),n=list.size;BROADCASTS.push({id:'BC-'+(610+i),title:x[0],channel:x[1],list:x[2],recipients:n,status:x[3],when:x[3]==='Sent'?dAgo(ri(1,20)):x[3]==='Scheduled'?dAhead(ri(1,6)):null,
  delivered:x[3]==='Sent'?Math.round(n*(.93+rnd()*.05)):0,failed:0,opened:0,by:pick(['Kiran Reddy','Rohan Pawar'])})});
BROADCASTS.forEach(b=>{if(b.status==='Sent'){b.failed=b.recipients-b.delivered;b.opened=Math.round(b.delivered*(.3+rnd()*.35))}});
const PUSHES=[];[['Today\'s Daily Bread is here','Strength for today. Tap to read.','Daily Manna'],['Live now: Sunday First Service','Join the stream from Andheri.','Live video'],['Your pass for Night of Worship','Seat B-7-12. Show this at Gate 1.','My pass'],['Prayer request answered','Grace Isaac and 41 others prayed for you.','Prayer'],['New course: Prayer School','Six lessons, start anytime.','Courses'],['Receipt ready','Your 80G receipt for ₹2,500 is ready.','Receipts']]
 .forEach((x,i)=>PUSHES.push({id:'PN-'+(2200+i),title:x[0],body:x[1],deep:x[2],aud:pick(['All active members','Andheri congregation','Event pass holders','Single member']),sent:i<5?hAgo(i*9+1):null,status:i<5?'Sent':'Scheduled',targets:ri(40,180),delivered:0,opened:0,actions:i===2?['View pass','Directions']:i===1?['Watch']:[]}));
PUSHES.forEach(p=>{if(p.status==='Sent'){p.delivered=Math.round(p.targets*.95);p.opened=Math.round(p.delivered*(.2+rnd()*.4))}});
const PTEMPLATES=[{id:'PT-1',name:'Live now',title:'Live now: {service}',body:'Join the stream from {location}.',actions:['Watch']},{id:'PT-2',name:'Pass reminder',title:'Your pass for {event}',body:'Seat {seat}. Show this at the gate.',actions:['View pass','Directions']},{id:'PT-3',name:'Daily Bread',title:'Today\'s Daily Bread is here',body:'{title}. Tap to read.',actions:[]},{id:'PT-4',name:'Receipt ready',title:'Receipt ready',body:'Your 80G receipt for {amount} is ready.',actions:['Open receipt']}];
const EMAILS=[{id:'EM-1',name:'Partner newsletter, October',list:'Partners',status:'Sent',sent:dAgo(3),n:0,delivered:0,bounced:0},{id:'EM-2',name:'Thank you for giving, September',list:'Givers in September',status:'Sent',sent:dAgo(8),n:0,delivered:0,bounced:0},{id:'EM-3',name:'Youth camp details',list:'Youth (16 to 25)',status:'Scheduled',sent:dAhead(2),n:0,delivered:0,bounced:0},{id:'EM-4',name:'Christmas invitation',list:'All active members',status:'Draft',sent:null,n:0,delivered:0,bounced:0}];
EMAILS.forEach(e=>{e.n=ri(40,160);if(e.status==='Sent'){e.delivered=e.n-ri(0,4);e.bounced=e.n-e.delivered}});
const MLISTS=[{id:'ML-1',name:'Partners',n:BLISTS[1].size,src:'Partnership is Yes'},{id:'ML-2',name:'Givers in September',n:ri(60,120),src:'Gave in September 2026'},{id:'ML-3',name:'Youth (16 to 25)',n:BLISTS[2].size,src:'Age 16 to 25'},{id:'ML-4',name:'All active members',n:ADULTS.length,src:'Status is Active, has email'}];
const CALLCAMPS=[{id:'CC-1',name:'Absentee follow-up, September',list:'Missed 3 or more Sundays',callers:['Esther Daniel','Vinod Gaikwad'],total:42,done:31,outcomes:{Reached:22,'Not reached':6,Callback:3},status:'Active'},
 {id:'CC-2',name:'Partner thank-you calls',list:'New partners, Q2',callers:['Kiran Reddy'],total:18,done:18,outcomes:{Reached:15,'Not reached':3,Callback:0},status:'Completed'},
 {id:'CC-3',name:'Christmas volunteers',list:'Volunteers tag',callers:['Esther Daniel','Kiran Reddy','Vinod Gaikwad'],total:64,done:9,outcomes:{Reached:7,'Not reached':2,Callback:0},status:'Active'}];
const CALLLOGS=[];for(let i=0;i<18;i++){const m=pick(ADULTS);CALLLOGS.push({id:'CL'+(i+1),camp:pick(CALLCAMPS).name,name:m.name,member:m.id,caller:pick(['Esther Daniel','Vinod Gaikwad','Kiran Reddy']),at:hAgo(ri(1,24*10)),dur:ri(0,9)+':'+String(ri(0,59)).padStart(2,'0'),outcome:pickW([['Reached',6],['Not reached',2],['Callback',1]]),note:pick(['Will attend Sunday.','Moved to Pune.','Unwell, asked for prayer.','Busy, call back on Saturday.',''])})}
const THREADS=[];const TH=[['Pastor','Ps. Emmanuel Kumar','Can I meet you after the service on Sunday? It is about my son.'],['Office','Membership desk','I moved to Thane. Please change my location.'],['Office','Finance','My 80G receipt shows the wrong PAN.'],['Ministry','Youth ministry','Is the youth camp open to 15-year-olds?'],['Pastor','Ps. Ruth Mathew','Please pray for my husband\'s surgery tomorrow.'],['Office','Events desk','I booked 4 passes but only see 3.'],['Ministry','Worship ministry','How do I join the choir?'],['Office','Membership desk','Please add my daughter to my family.'],['Pastor','Ps. Emmanuel Kumar','Thank you for visiting us last week.'],['Office','Finance','Can I change my monthly partnership amount?']];
TH.forEach((x,i)=>{const m=pick(ADULTS);THREADS.push({id:'TH-'+(3300+i),kind:x[0],to:x[1],member:m.id,name:m.name,last:x[2],at:hAgo(i*3+ri(0,2)+.3),state:i<5?'Open':i<8?'Answered':'Closed',unread:i<4,assigned:x[0]==='Pastor'?x[1]:pick(['Esther Daniel','Grace Isaac','Paul Rodrigues','Joyce Pereira',null]),
  msgs:[{me:false,t:x[2],at:hAgo(i*3+ri(0,2)+.3)}].concat(i>=5?[{me:true,t:'Thank you. We have updated this for you.',at:hAgo(i*3)}]:[])})});
const SMSLOG=[];for(let i=0;i<16;i++){SMSLOG.push({id:'SM-'+(i+1),at:hAgo(i*1.7+.1),to:'+91 9'+ri(1000,9999)+' •••'+ri(10,99),kind:pickW([['OTP',7],['Transactional',3],['Broadcast',2]]),tpl:pick(['Login OTP','Pass confirmation','Receipt link','Broadcast']),sender:'KSMNOA',status:pickW([['Delivered',14],['Failed',1],['Pending',1]]),country:'IN'})}
SMSLOG.push({id:'SM-17',at:hAgo(3.4),to:'+971 5•••••12',kind:'OTP',tpl:'Login OTP',sender:'KARUNA',status:'Delivered',country:'AE'},{id:'SM-18',at:hAgo(5.2),to:'+1 4•••••88',kind:'OTP',tpl:'Login OTP',sender:'Numeric',status:'Delivered',country:'US'});
const SENDERS=[{country:'India',code:'IN',sender:'KSMNOA',route:'Transactional, DLT registered',status:'Active'},{country:'United Arab Emirates',code:'AE',sender:'KARUNA',route:'International',status:'Active'},{country:'United States',code:'US',sender:'Numeric long code',route:'International',status:'Active'},{country:'United Kingdom',code:'GB',sender:'KARUNA',route:'International',status:'Active'}];
const SMSTPL=[{id:'T1',name:'Login OTP',text:'{otp} is your Noah sign-in code. It expires in 5 minutes. Do not share it.',dlt:'1207•••••••4410',status:'Approved'},{id:'T2',name:'Pass confirmation',text:'Your pass for {event} is confirmed. Seat {seat}.',dlt:'1207•••••••4411',status:'Approved'},{id:'T3',name:'Receipt link',text:'Thank you for giving {amount}. Your receipt: {link} (expires in 7 days).',dlt:'1207•••••••4412',status:'Approved'},{id:'T4',name:'Broadcast',text:'{message} - Karuna Sadan',dlt:'1207•••••••4413',status:'Approved'}];

/* ---------- files, store and operations ---------- */
const DRIVE={id:'root',name:'Drive',kids:[{id:'d1',name:'Sermons',kids:[{id:'d11',name:'2026'},{id:'d12',name:'2025'}]},{id:'d2',name:'Events',kids:[{id:'d21',name:'Night of Worship'},{id:'d22',name:'Youth camp'}]},{id:'d3',name:'Finance',kids:[{id:'d31',name:'Bank statements'},{id:'d32',name:'Vendor bills'}]},{id:'d4',name:'Design',kids:[]},{id:'d5',name:'Membership forms',kids:[]}]};
const FILES=[];[['d11','Rooted and Grounded - notes.pdf','PDF',1.2],['d11','Rooted and Grounded - slides.pptx','Slides',8.4],['d11','Sermon audio 5 Oct.mp3','Audio',42.1],['d21','Stage plan v3.pdf','PDF',0.8],['d21','Seat labels.xlsx','Sheet',0.2],['d21','Poster final.png','Image',3.1],['d22','Consent form.pdf','PDF',0.3],['d22','Menu.docx','Doc',0.1],
 ['d31','HDFC_4471_Sep2026.csv','Sheet',0.4],['d32','Sai Sound invoice 1182.pdf','PDF',0.5],['d4','Logo pack.zip','Archive',12.6],['d4','Brand colours.pdf','PDF',0.6],['d5','Member registration form.pdf','PDF',0.2],['d5','Child consent form.pdf','PDF',0.2],['d1','Sermon index 2026.xlsx','Sheet',0.1],['d2','Events calendar 2026.xlsx','Sheet',0.1]]
 .forEach((x,i)=>FILES.push({id:'F-'+(i+1),folder:x[0],name:x[1],kind:x[2],mb:x[3],by:pick(['Rohan Pawar','Paul Rodrigues','Grace Isaac','Anitha Varghese']),at:hAgo(ri(2,24*60)),shared:ri(0,6),emailed:ri(0,40),access:x[0].startsWith('d3')?'Finance only':'Staff'}));
const PRODUCTS=[['Holy Bible, English, large print','Bibles',650,42],['Holy Bible, Marathi','Bibles',480,18],['Daily Manna 2027 diary','Diaries',350,120],['Worship album: Unshaken (CD)','Music',250,6],['Walking in Faith (book)','Books',299,64],['The Praying Family (book)','Books',249,0],['Youth camp T-shirt','Apparel',399,33],['Prayer journal','Stationery',199,88],['Christmas card pack','Stationery',150,240],['Kids Bible storybook','Books',320,27],['Wall verse frame','Gifts',549,12],['Car hanging cross','Gifts',99,150]]
 .map((x,i)=>({id:'PR-'+(100+i),name:x[0],cat:x[1],price:x[2],stock:x[3],sold:ri(4,300),wish:ri(0,80),active:true}));
const ORDERS=[];for(let i=0;i<16;i++){const m=pick(ADULTS),items=ri(1,3),p=pick(PRODUCTS);ORDERS.push({id:'NG-'+(41200+i),member:m.id,name:m.name,items,amt:p.price*items+ri(0,2)*99,addr:m.address,status:i<4?'Awaiting dispatch':i<7?'Shipped':pickW([['Delivered',8],['Cancelled',1]]),at:hAgo(ri(3,24*30)),pay:'Razorpay'})}
const TASKS=[];[['Renew hall insurance','Operations','To do','Anitha Varghese',4,['Admin']],['Upload Sunday sermon audio','Media','In progress','Rohan Pawar',0,['Media','Recurring']],['Reconcile September settlements','Finance','In progress','Grace Isaac',-1,['Finance']],['Print seat labels, Night of Worship','Events','To do','Paul Rodrigues',2,['Events']],
 ['Review Telugu translation of course 3','Content','In review','Ravi Rao',1,['Content']],['Fix bus route 5 timings','Transport','To do','Paul Rodrigues',-2,['Transport']],['Approve October vendor batch','Finance','In review','Anitha Varghese',0,['Finance','Approval']],['Collect consent forms, youth camp','Events','In progress','Vinod Gaikwad',3,['Events']],
 ['Archive 2024 call campaign data','Communications','Done','Kiran Reddy',-6,['Admin']],['Asset audit, Thane centre','Operations','To do','Amit Kumar',9,['Assets']],['Publish Christmas pass booking','Events','To do','Paul Rodrigues',45,['Events']],['Monthly partner report','Finance','Done','Sunil Nair',-3,['Finance','Recurring']],
 ['Reply to playback problem reports','Content','In progress','Rohan Pawar',1,['Content']],['Choir rehearsal schedule','Worship','Done','Ps. Joel Fernandes',-4,['Events']],['Update terms for Jodie','Jodie','In review','Christina Paul',2,['Jodie']],['Kids Bible week photos','Media','Done','Rohan Pawar',-10,['Media']]]
 .forEach((x,i)=>TASKS.push({id:'TK-'+(500+i),title:x[0],proj:x[1],state:x[2],owner:x[3],due:dAhead(x[4]),labels:x[5],check:[ri(0,4),4],comments:ri(0,9),att:ri(0,3),approval:x[5].includes('Approval'),recur:x[5].includes('Recurring')}));
const ASSETS=[];[['Yamaha mixing console','Audio','Media',185000],['Shure wireless mics (set of 8)','Audio','Media',96000],['Sony FX6 camera','Video','Media',540000],['Epson projector EB-L','Video','Media',210000],['Generator 62.5 kVA','Electrical','Operations',890000],['Split AC units (12)','Electrical','Operations',540000],['Tata Starbus 52-seater','Vehicle','Transport',2650000],
 ['Force Traveller 26-seater','Vehicle','Transport',1450000],['Chairs, stackable (600)','Furniture','Operations',420000],['Stage lighting rig','Video','Media',360000],['Dell laptops (6)','IT','Office',390000],['Network firewall','IT','Office',85000],['Water purifier, Andheri','Electrical','Operations',64000],['Piano, Yamaha U1','Music','Worship',310000],['Drum kit','Music','Worship',95000],['CCTV system, 24 cameras','Security','Operations',220000]]
 .forEach((x,i)=>{const amc=dAhead(ri(-20,300));ASSETS.push({id:'AS-'+(300+i),name:x[0],group:x[1],sub:x[2],price:x[3],bought:dAgo(ri(200,2400)),loc:pick(['Andheri','Andheri','Thane','Vashi']),amc:x[1]==='Furniture'?null:amc,ins:chance(.7)?dAhead(ri(-10,330)):null,att:ri(0,4),status:i===4?'In repair':'In use'})});
const WAREHOUSES=[{id:'WH-1',name:'Andheri store room',loc:'Andheri'},{id:'WH-2',name:'Thane centre',loc:'Thane'},{id:'WH-3',name:'Book stall, Andheri',loc:'Andheri'}];
const INV_CATS=['Books','Bibles','Stationery','Event supplies','Cleaning','Kitchen'];
const INV=[['Bibles, English','Bibles',140,40],['Bibles, Marathi','Bibles',22,30],['Communion cups (box of 1000)','Event supplies',8,10],['Offering envelopes (box)','Stationery',35,20],['Printer paper (ream)','Stationery',60,30],['Floor cleaner (5 L)','Cleaning',4,6],['Paper plates (pack)','Kitchen',90,40],['Walking in Faith','Books',64,20],['Daily Manna 2027 diary','Books',120,50],['Name badges (pack)','Event supplies',12,10],['Candles (box)','Event supplies',30,15],['Hand sanitiser (5 L)','Cleaning',2,4],['Tea and sugar (kg)','Kitchen',18,10],['Seat label stickers (roll)','Event supplies',9,6]]
 .map((x,i)=>({id:'IT-'+(10+i),name:x[0],cat:x[1],qty:x[2],reorder:x[3],wh:pick(WAREHOUSES).name,unit:pick(['each','box','pack'])}));
const MOVES=[];for(let i=0;i<16;i++){const it=pick(INV);MOVES.push({id:'MV-'+(i+1),item:it.name,type:pick(['In','Out','Transfer']),qty:ri(1,40),from:pick(WAREHOUSES).name,to:pick(WAREHOUSES).name,by:pick(['Amit Kumar','Paul Rodrigues','Esther Daniel']),at:hAgo(ri(2,24*25)),ref:pick(['Purchase PO-'+ri(100,999),'Event '+pick(EVENTS).name,'Stock count'])})}
const SETTINGS=[['Ministry name','Karuna Sadan Ministries','Ministry'],['Default language','English (en)','Ministry'],['Time zone','Asia/Kolkata (IST)','Ministry'],['Financial year starts','1 April','Finance'],['80G registration number','AAATK••••• (on file)','Finance'],['Donation receipt series','DON/{FY}/{000000}','Finance'],['Subscription invoice series','JDS/{FY}/{000000}','Finance'],
 ['Pass release before start','30 minutes','Events'],['Family pass maximum','6 people','Events'],['Feed posts need approval','Yes','Community'],['Comments need approval','For members under 30 days','Community'],['Reward rate per like','₹0.50','Rewards'],['Reward rate per comment','₹2','Rewards'],['Reward rate per post','₹3','Rewards'],['Minimum reward withdrawal','₹50','Rewards'],
 ['Receipt link validity','7 days','Security'],['Document link validity','15 minutes','Security'],['Staff session timeout','30 minutes','Security'],['OTP expiry','5 minutes','Security']]
 .map((x,i)=>({id:'SG-'+(i+1),key:x[0],value:x[1],group:x[2],by:pick(['Anitha Varghese','Grace Isaac']),at:dAgo(ri(3,200))}));
const DEVICES=[];for(let i=0;i<20;i++){const m=pick(ADULTS),os=pick(['Android 14','Android 13','iOS 18','iOS 17','Android 12']);DEVICES.push({id:'DV-'+(i+1),member:m.id,name:m.name,model:os.startsWith('iOS')?pick(['iPhone 15','iPhone 13','iPhone 16 Pro']):pick(['Samsung A54','Redmi Note 13','Vivo Y56','OnePlus Nord 3','Realme 11']),os,app:pick(['3.0.4','3.0.4','3.0.3','2.9.8']),fcm:chance(.9)?'Valid':'Expired',last:hAgo(ri(1,24*30)),state:'Active'})}
const JOBS=[['Release unclaimed passes','Every 5 minutes','Events'],['Send scheduled broadcasts','Every minute','Communications'],['Import Razorpay settlements','Daily 06:00','Finance'],['Import Paytm settlements','Daily 06:15','Finance'],['Retry failed subscription charges','Daily 09:00','Subscriptions'],['Send renewal notices','Daily 10:00','Subscriptions'],
 ['Sync members to Zoho CRM','Every 15 minutes','Membership'],['Post invoices to Zoho Books','Every 15 minutes','Finance'],['Refresh Zoho Analytics','Daily 05:30','Reporting'],['Process reward withdrawals','Daily 11:00','Community'],['Overdue task reminders','Daily 08:00','Tasks'],['Expire signed links','Hourly','Security'],['Membership expiry calling list','Daily 07:00','Jodie'],['Member statistics snapshot','Daily 00:30','Reporting']]
 .map((x,i)=>({id:'JB-'+(i+1),name:x[0],sched:x[1],area:x[2],last:hAgo(ri(1,30)/10),dur:ri(1,90)+' s',status:i===4?'Failed':'Succeeded',next:new Date(+NOW+ri(1,600)*MIN),enabled:true}));
JOBS[4].err='Razorpay returned 503 for 2 of 9 retries. Will try again at 13:00.';
const REMINDERS=[{id:'RM-1',name:'Birthday wishes',when:'Daily 07:00',to:'Members with a birthday today',ch:'Push',on:true},{id:'RM-2',name:'Anniversary wishes',when:'Daily 07:00',to:'Members with an anniversary today',ch:'Push',on:true},{id:'RM-3',name:'Pass reminder',when:'2 hours before the event',to:'Pass holders',ch:'Push',on:true},{id:'RM-4',name:'Course nudge',when:'7 days inactive',to:'Enrolled members',ch:'Push',on:false},{id:'RM-5',name:'Partner renewal',when:'7 days before due',to:'Partners',ch:'SMS',on:true},{id:'RM-6',name:'Task overdue',when:'Daily 08:00',to:'Task owners',ch:'Email',on:true}];
const REFLISTS=[['Relationship types',['Spouse','Son','Daughter','Mother','Father','Guardian','Sibling']],['Salutations',['Mr','Mrs','Ms','Dr','Ps.','Bro.','Sis.']],['Donation purposes',TOWARDS],['Event types',['Service','Concert','Camp','Prayer','Children','Conference']],['Prayer request backgrounds',['Dawn','Olive','Lavender','Ocean']],['Feedback categories',['App','Services','Events','Finance','Content']],['Asset groups',['Audio','Video','Electrical','Vehicle','Furniture','IT','Music','Security']],['Countries for SMS',['India','United Arab Emirates','United States','United Kingdom']]]
 .map((x,i)=>({id:'RL-'+(i+1),name:x[0],items:x[1]}));

/* ---------- Jodie ---------- */
const DENOMS=['Pentecostal','Baptist','CSI','Catholic','Methodist','Marthoma','Brethren','Independent'];
const EDU=['B.Com','B.Sc Nursing','B.E. Computer Science','MBA','B.A. English','M.Sc','CA','B.Pharm','MBBS','Diploma'];
const JOBS_J=['Software engineer','Nurse','Teacher','Accountant','Sales manager','Pharmacist','Doctor','Designer','Bank officer','Business owner'];
const JPROFILES=[];
for(let i=0;i<96;i++){const g=chance(.5)?'M':'F',first=g==='M'?pick(FN_M):pick(FN_F),last=pick(LN),a=ri(22,36);
  const created=hAgo(ri(6,24*90));
  const st={I:'ok',P:'ok',E:'ok',Q:'ok'};
  const r=rnd();
  if(r<.42){/* in verification: some stages pending */ ['I','P','E','Q'].forEach(k=>{st[k]=pickW([['ok',3],['pend',4],['none',1]])});if(!['I','P','E','Q'].some(k=>st[k]==='pend'))st.P='pend'}
  else if(r<.5){st[pick(['I','P','E','Q'])]='ret'}
  const ver=['I','P','E','Q'].every(k=>st[k]==='ok');
  const p={id:'JD-'+(20840+i),noah:chance(.7)?'NH-'+ri(104210,104390):'',name:first+' '+last,first,g,age:a,loc:pick(LOCS),denom:pick(DENOMS),edu:pick(EDU),job:pick(JOBS_J),height:g==='M'?ri(165,186):ri(150,172),
    mother:pick(['Malayalam','Marathi','Tamil','Telugu','Hindi','Kannada','Konkani']),church:pick(LOCS)+' congregation',pastor:pick(PASTORS).id,
    st,verified:ver,live:ver&&chance(.9),created,sub:ver?pickW([['Active',6],['Grace',1],['Past due',1],['None',3],['Cancelled',1],['Expired',1]]):'None',featured:ver&&chance(.12),photos:ri(2,6),
    lastActive:hAgo(ri(1,24*20)),interestsIn:ri(0,40),interestsOut:ri(0,30),matches:ri(0,8),views:ri(10,900),blocked:0,reports:0,
    stamps:{I:hAgo(ri(1,90)),P:hAgo(ri(1,90)),E:hAgo(ri(1,120)),Q:hAgo(ri(1,70))},assign:{},route:null};
  ['I','P','E','Q'].forEach(k=>{if(st[k]==='pend')p.assign[k]=chance(.55)?pick(['Deborah Masih','Priya Kamble','Neha Shinde']):null});
  if(st.E==='pend'){p.route=chance(.6)?{pastor:p.pastor,sent:hAgo(ri(5,120)),via:pick(['SMS link','Email link']),state:pickW([['Awaiting pastor',4],['Endorsed',2],['Not endorsed',1]])}:null}
  JPROFILES.push(p)}
const jpName=id=>(byId(JPROFILES,id)||{}).name||id;
const STAGES=[['I','Basic information','user'],['P','Photographs','image'],['E','Pastoral endorsement','shield-check'],['Q','Questionnaire answers','list']];
const STAGE_NAME={I:'Basic information',P:'Photographs',E:'Pastoral endorsement',Q:'Questionnaire answers'};
const VERIF_DONE=[];for(let i=0;i<12;i++){const p=pick(JPROFILES),k=pick(['I','P','E','Q']);VERIF_DONE.push({id:'VD-'+(i+1),pid:p.id,name:p.name,stage:k,decision:pickW([['Approved',5],['Returned',1]]),by:pick(['Deborah Masih','Priya Kamble','Christina Paul']),at:hAgo(ri(1,72)),remark:pick(['All fields match the ID document.','Clear face photograph, matches ID.','Endorsed by the pastor by secure link.','Answers consistent with profile.','Photograph is a group photo; asked for a single portrait.'])})}
const QUESTIONS=[['How long have you been a believer?',['Less than 2 years','2 to 5 years','More than 5 years'],true],['Which church do you attend regularly?',[],true],['Are you baptised?',['Yes','No','Planning to'],true],['Do you serve in any ministry?',['Yes','No'],false],['What role does faith play in your family life?',[],true],
 ['Are you open to relocating after marriage?',['Yes','No','Maybe'],false],['Your expectations from a life partner',[],false],['Do you have any medical conditions to disclose?',['No','Yes, will discuss'],true],['Have you been married before?',['Never married','Divorced','Widowed','Annulled'],true],['Family members who know about this profile',['Parents','Siblings','Pastor','None yet'],false]]
 .map((x,i)=>({id:'QN-'+(i+1),q:x[0],opts:x[1],type:x[1].length?'Choice':'Free text',req:x[2],order:i+1,answers:ri(60,96),status:'Active'}));
const COLLEGES=['St. Xavier\'s College, Mumbai','Wilson College, Mumbai','Christ University, Bengaluru','Madras Christian College','Loyola College, Chennai','Osmania University, Hyderabad','Fergusson College, Pune','Sophia College, Mumbai','CMC Vellore','Mar Ivanios College, Thiruvananthapuram','Stella Maris College, Chennai','St. Joseph\'s College, Bengaluru','IIT Bombay','NIT Calicut','Symbiosis, Pune']
 .map((n,i)=>({id:'CO-'+(i+1),name:n,city:n.split(', ').pop(),members:ri(1,40),status:'Active'}));
const JBLOCKS=[];for(let i=0;i<10;i++){const a=pick(JPROFILES),b=pick(JPROFILES);JBLOCKS.push({id:'BK-'+(i+1),by:a.id,byName:a.name,who:b.id,whoName:b.name,reason:pick(['Asked for money','Rude messages','Not interested, kept messaging','Shared phone number in chat','Fake profile suspected']),at:hAgo(ri(2,24*60)),review:i<4?'Open':pick(['No action','Warned','Profile suspended'])})}
const JREPORTS=[];for(let i=0;i<6;i++){const a=pick(JPROFILES),b=pick(JPROFILES);JREPORTS.push({id:'MRP-'+(i+1),from:a.name,about:b.name,text:pick(['Please call me on 98XXX 11234','My number is nine eight two two...','Send money for my visa','Add me on WhatsApp']),auto:i<4?'Contact details pattern':'',at:hAgo(ri(1,24*7)),state:i<3?'Open':'Resolved'})}
const JTHREADS=[];['Payment done but plan not active','How long does verification take?','My pastor has not received the link','Please delete my account','Photo rejected, why?','I want to change my plan to annual'].forEach((t,i)=>{const p=pick(JPROFILES);JTHREADS.push({id:'JT-'+(i+1),pid:p.id,name:p.name,last:t,at:hAgo(i*4+.5),state:i<3?'Open':pick(['Answered','Closed']),pinned:i===0,unread:i<2,assigned:pick(['Christina Paul','Deborah Masih',null]),msgs:[{me:false,t,at:hAgo(i*4+.5)}]})});
const JCALLS=[];for(let i=0;i<4;i++){const a=pick(JPROFILES.filter(p=>p.g==='M'&&p.verified)),b=pick(JPROFILES.filter(p=>p.g==='F'&&p.verified));JCALLS.push({id:'CALL-'+(i+1),a:a.id,b:b.id,kind:i===1?'Video':'Audio',started:new Date(+NOW-ri(1,18)*MIN),quality:i===2?'Degraded':'Healthy',relay:i===2?'TURN relay':'Peer to peer'})}
const JCALLLOG=[];for(let i=0;i<16;i++){const a=pick(JPROFILES),b=pick(JPROFILES);JCALLLOG.push({id:'CLG-'+(i+1),a:a.name,b:b.name,kind:pick(['Audio','Audio','Video']),at:hAgo(ri(1,24*6)),dur:ri(0,42)+':'+String(ri(0,59)).padStart(2,'0'),result:pickW([['Connected',7],['Declined',2],['Missed',2],['Cancelled',1]])})}
const OUTBOUND=[];for(let i=0;i<14;i++){const p=pick(JPROFILES);OUTBOUND.push({id:'OB-'+(i+1),pid:p.id,name:p.name,list:pick(['First call','First call','Membership expiry','Verification help']),agent:pick(['Christina Paul','Deborah Masih']),due:dAhead(ri(-2,3)),last:chance(.5)?hAgo(ri(2,96)):null,outcome:pick(['','Reached','Not reached','Callback','Renewed']),summary:pick(['','Explained verification steps.','Will renew next week.','Wrong number.',''])})}
const STORIES=[];[['Samuel and Grace','2026'],['Joel and Merlin','2026'],['Arun and Priscilla','2025'],['David and Ruth','2025'],['Philip and Hannah','2025'],['Kiran and Sharon','2024'],['Anand and Beulah','2024']].forEach((x,i)=>STORIES.push({id:'SS-'+(i+1),couple:x[0],year:x[1],loc:pick(LOCS),status:i===0?'Draft':'Published',likes:ri(40,900)}));
const JCONTENT=[];[['Testimonial','Found my partner through the verified profiles'],['Testimonial','The pastoral endorsement gave my parents confidence'],['News','Jodie now available in seven languages'],['News','Verification is faster from October'],['Article','Preparing for marriage: five conversations'],['Article','Staying safe when you meet someone new'],['Splash','Christmas splash screen'],['Media','Family meet guide (video)']].forEach((x,i)=>JCONTENT.push({id:'JC-'+(i+1),kind:x[0],title:x[1],views:ri(100,9000),status:i===6?'Scheduled':'Published',at:dAgo(ri(1,90))}));

/* subscriptions: plan structure and prices are to be confirmed by the client (brief section 13, P0 week 3) */
const PLANS=[{id:'PLN-M',cat:'Membership',name:'Monthly',price:300,period:'1 month',gst:18,apple:'org.karunasadan.jodie.monthly',rzp:'plan_KS'+rid(8),active:true,subs:0,ent:['Message matched members','In-app audio and video calls','See who viewed your profile']},
 {id:'PLN-Q',cat:'Membership',name:'Quarterly',price:800,period:'3 months',gst:18,apple:'org.karunasadan.jodie.quarterly',rzp:'plan_KS'+rid(8),active:true,subs:0,ent:['Everything in Monthly']},
 {id:'PLN-A',cat:'Membership',name:'Annual',price:2900,period:'12 months',gst:18,apple:'org.karunasadan.jodie.annual',rzp:'plan_KS'+rid(8),active:true,subs:0,ent:['Everything in Monthly']}];
const ADDONS=[{id:'ADD-F',name:'Featured profile',price:199,period:'30 days',gst:18,apple:'org.karunasadan.jodie.featured30',active:true,subs:0}];
const SUBS=[];JPROFILES.filter(p=>p.sub!=='None').forEach((p,i)=>{const plan=pickW([[PLANS[0],5],[PLANS[1],3],[PLANS[2],2]]),mt=pickW([['UPI AutoPay',6],['Card standing instruction',2],['eMandate',1],['Apple',2]]);
  const startD=dAgo(ri(10,300));const s={id:'SUB-'+(6100+i),pid:p.id,name:p.name,plan:plan.id,amt:plan.price,status:p.sub,mandate:mt,
    mstatus:p.sub==='Cancelled'||p.sub==='Expired'?'Revoked':p.sub==='Past due'?pick(['Registered','Paused']):mt==='Apple'?'Active':'Registered',ref:mt==='Apple'?'1000000'+ri(100000000,999999999):'sub_'+rid(14),started:startD,
    next:p.sub==='Active'?dAhead(ri(1,60)):p.sub==='Grace'?dAgo(ri(1,4)):p.sub==='Past due'?dAgo(ri(5,9)):null,ends:p.sub==='Cancelled'?dAhead(ri(2,20)):p.sub==='Expired'?dAgo(ri(5,60)):null,
    fails:p.sub==='Grace'?ri(1,2):p.sub==='Past due'?3:0,grace:p.sub==='Grace'?dAhead(ri(1,5)):null,notices:p.sub==='Grace'?1:p.sub==='Past due'?3:0,addon:chance(.15)?'ADD-F':''};
  SUBS.push(s);plan.subs+=s.status==='Active'||s.status==='Grace'?1:0;if(s.addon)ADDONS[0].subs++});
const JINVOICES=[];SUBS.forEach(s=>{const n=s.status==='Expired'?2:ri(1,4);for(let k=0;k<n;k++)JINVOICES.push({id:'JDS/26-27/'+String(2100+JINVOICES.length).padStart(6,'0'),sub:s.id,name:s.name,amt:s.amt,gst:Math.round(s.amt-s.amt/1.18),at:new Date(+s.started+k*30*DAY),status:'Issued',books:'Posted'})});
const JSETTLE=[{id:'setl_'+rid(14),src:'Razorpay Subscriptions',date:dAgo(1),items:14,amt:6900,matched:12,unmatched:2},{id:'setl_'+rid(14),src:'Razorpay Subscriptions',date:dAgo(2),items:9,amt:4200,matched:9,unmatched:0},{id:'APPLE-2026-09',src:'Apple App Store',date:dAgo(6),items:21,amt:7254,matched:20,unmatched:1}];
const JUNMATCHED=[{id:'JU-1',setl:JSETTLE[0].id,src:'Razorpay Subscriptions',ref:'pay_'+rid(14),amt:300,why:'Charge succeeded after the subscription was cancelled',suggest:'Credit note'},{id:'JU-2',setl:JSETTLE[0].id,src:'Razorpay Subscriptions',ref:'pay_'+rid(14),amt:800,why:'No invoice found for this charge',suggest:pick(SUBS).id},{id:'JU-3',setl:JSETTLE[2].id,src:'Apple App Store',ref:'1000000'+ri(100000000,999999999),amt:254,why:'Apple proceeds differ from the invoice (commission)',suggest:'Book commission'}];
const CREDIT_NOTES=[{id:'CN/26-27/0012',sub:SUBS[0].id,name:SUBS[0].name,amt:300,reason:'Refund of renewal charged after cancellation',at:dAgo(4),books:'Posted'},{id:'CN/26-27/0011',sub:SUBS[3].id,name:SUBS[3].name,amt:150,reason:'Part-period credit on plan change',at:dAgo(11),books:'Posted'}];

/* Keep most work queues inside their targets, so the late ones stand out. */
PRAYERS.filter(p=>p.state==='Pending').forEach(p=>p.at=hAgo(ri(1,10)));
PRAISE.filter(p=>p.state==='Pending').forEach(p=>p.at=hAgo(ri(2,20)));
OBITS.filter(o=>o.state==='Pending').forEach(o=>o.at=hAgo(ri(1,8)));
MODQ.forEach(q=>q.at=hAgo(ri(1,15)));
FLAGS.forEach(f=>f.at=hAgo(ri(1,30)));
FEEDBACK.filter(f=>f.state==='Open').forEach(f=>f.at=hAgo(ri(2,40)));
FAILED.forEach((f,i)=>f.at=hAgo(i<2?ri(26,60):ri(2,20)));
ORDERS.filter(o=>o.status==='Awaiting dispatch').forEach(o=>o.at=hAgo(ri(3,40)));
ABSENTEES.forEach(a=>a.flagged=dAgo(ri(1,9)));
JPROFILES.forEach(p=>['I','P','E','Q'].forEach(k=>{if(p.st[k]==='pend')p.stamps[k]=hAgo(ri(1,58))}));
VIDEOKYC.forEach(v=>v.at=hAgo(ri(1,30)));

/* ---------- audit seed ---------- */
(function(){const T=[
 ['Approved stage','Jodie verification',()=>pick(JPROFILES).id,{Photographs:'Pending'},{Photographs:'Approved'}],
 ['Returned stage','Jodie verification',()=>pick(JPROFILES).id,{'Basic information':'Pending'},{'Basic information':'Returned'}],
 ['Amended member','Membership',()=>pick(MEMBERS).id,{location:'Andheri',cell:'Andheri Cell 2'},{location:'Thane',cell:'Thane Cell 1'}],
 ['Reassigned pastor','Membership',()=>pick(MEMBERS).id,{pastor:'Ps. Joel Fernandes'},{pastor:'Ps. Emmanuel Kumar'}],
 ['Created receipt','Giving',()=>pick(RECEIPTS).id,null,{amount:'₹5,000',mode:'Cash',towards:'Building fund'}],
 ['Cancelled receipt','Giving',()=>pick(RECEIPTS).id,{status:'Paid'},{status:'Cancelled'}],
 ['Approved payment batch','Finance','PB-2026-112',{status:'Pending approval'},{status:'Approved'}],
 ['Changed setting','Administration','Pass release before start',{value:'15 minutes'},{value:'30 minutes'}],
 ['Changed role permissions','Staff and permissions','Events coordinator',{'events.scan':false},{'events.scan':true}],
 ['Published content','Content','Daily Manna, '+fds(dAgo(1)),{status:'Scheduled'},{status:'Published'}],
 ['Approved post','Community',()=>pick(MODQ).id,{state:'Pending'},{state:'Approved'}],
 ['Extended subscription','Subscriptions',()=>pick(SUBS).id,{ends:fd(dAhead(10))},{ends:fd(dAhead(17))}],
 ['Revealed contact details','Membership',()=>pick(MEMBERS).id,null,{field:'Mobile number'}],
 ['Exported members','Membership','Member register (filtered: Thane)',null,{rows:312,format:'CSV',link:'Signed, expires in 24 h'}],
 ['Signed in','Access','Staff account',null,{method:'Zoho single sign-on'}],
 ['Suspended staff account','Staff and permissions','Vinod Gaikwad',{status:'Active'},{status:'Suspended'}]];
 const actors=['Deborah Masih','Priya Kamble','Grace Isaac','Esther Daniel','Anitha Varghese','Rohan Pawar','Joyce Pereira','Christina Paul','Sunil Nair','Paul Rodrigues'];
 for(let i=0;i<64;i++){const t=pick(T),actor=t[1]==='Jodie verification'?pick(['Deborah Masih','Priya Kamble','Christina Paul']):t[1]==='Giving'||t[1]==='Finance'?pick(['Grace Isaac','Sunil Nair','Anitha Varghese']):pick(actors);
  const st=staffBy(actor);AUD.push({id:'AU-'+(4800-i),at:hAgo(i*2.3+ri(0,2)+.4),actor,role:st?(ROLES.find(r=>r.id===st.role)||{}).name:'',action:t[0],mod:t[1],rec:typeof t[2]==='function'?t[2]():t[2],before:t[3],after:t[4],remark:t[0].startsWith('Returned')?'Photograph does not match the ID document.':t[0].startsWith('Cancelled')?'Duplicate entry.':'',ip:'10.20.'+ri(1,9)+'.'+ri(2,250)})}
})();

/* ---------- authorisation coverage (sample of the endpoint registry) ---------- */
const ENDPOINTS=[];[['GET','/v1/members','members.view'],['POST','/v1/members','members.edit'],['PATCH','/v1/members/{id}','members.edit'],['POST','/v1/members/{id}/archive','members.archive'],['GET','/v1/members/{id}/contact','members.pii'],['POST','/v1/members/export','members.export'],
 ['POST','/v1/pastoral/reassign','pastoral.manage'],['GET','/v1/receipts','giving.view'],['POST','/v1/receipts','giving.receipt'],['POST','/v1/receipts/{id}/cancel','giving.receipt'],['POST','/v1/receipts/{id}/link','giving.view'],['POST','/v1/reconciliation/match','giving.reconcile'],
 ['POST','/v1/refunds','giving.reconcile'],['POST','/v1/payment-batches/{id}/approve','finance.approve'],['POST','/v1/vouchers','finance.post'],['GET','/v1/events','events.view'],['POST','/v1/events','events.manage'],['POST','/v1/passes/scan','events.scan'],
 ['POST','/v1/feed/{id}/approve','community.moderate'],['POST','/v1/rewards/{id}/approve','rewards.approve'],['POST','/v1/content','content.edit'],['POST','/v1/content/{id}/publish','content.publish'],['POST','/v1/broadcasts','comms.send'],['POST','/v1/threads/{id}/reply','comms.inbox'],
 ['GET','/v1/jodie/verification','jodie.verify'],['POST','/v1/jodie/verification/{id}/decide','jodie.verify'],['GET','/v1/jodie/documents/{id}/link','jodie.verify'],['POST','/v1/jodie/profiles/{id}/feature','jodie.manage'],['GET','/v1/jodie/calls/active','jodie.calls'],
 ['POST','/v1/subscriptions/{id}/extend','subs.manage'],['POST','/v1/subscriptions/{id}/cancel','subs.manage'],['PUT','/v1/plans/{id}','subs.plans'],['POST','/v1/staff','staff.manage'],['PUT','/v1/roles/{id}','staff.manage'],['GET','/v1/audit','audit.view'],['POST','/v1/reports/{id}/schedule','reports.schedule'],
 ['GET','/member/v1/threads/{id}','participant'],['POST','/member/v1/threads/{id}/messages','participant'],['GET','/member/v1/jodie/profiles/{id}/contact','entitlement'],['GET','/member/v1/receipts/{id}','owner + signed link']]
 .forEach((x,i)=>ENDPOINTS.push({id:'EP-'+(i+1),method:x[0],path:x[1],perm:x[2],svc:x[1].startsWith('/member')?'Member API':x[1].includes('/jodie')||x[1].includes('subscri')||x[1].includes('plans')?'Jodie and subscriptions':'Admin API',tested:true,last:hAgo(ri(1,30))}));

/* ---------- reports (consolidated, delivered in Zoho Analytics) ---------- */
const REPORTS=[];[
 ['Giving by month','Noah','Giving','giving.view'],['Donations by gateway and mode','Noah','Giving','giving.view'],['80G receipt register','Noah','Giving','giving.view'],['Failed donations','Noah','Giving','giving.reconcile'],['Settlement reconciliation','Noah','Giving','giving.reconcile'],
 ['Expenses due and paid','Noah','Finance','finance.view'],['Indirect expense report','Noah','Finance','finance.view'],['Payment batches','Noah','Finance','finance.view'],['Translator transactions','Noah','Finance','finance.view'],
 ['Partnership report','Noah','Membership','members.view'],['Young partner statistics','Noah','Membership','members.view'],['Member growth by location','Noah','Membership','members.view'],['Incorrect pastoral mapping','Noah','Membership','members.view'],['Leader history','Noah','Membership','members.view'],
 ['Attendance by event','Noah','Events','events.view'],['Attendance by pastor','Noah','Events','events.view'],['Absentees and follow-up','Noah','Events','events.view'],['Seat-wise allocation','Noah','Events','events.view'],['Bus route report','Noah','Events','events.view'],['Annual service report','Noah','Events','events.view'],
 ['Prayer counts by time','Noah','Community','community.moderate'],['Praise summary','Noah','Community','community.moderate'],['Reward transactions','Noah','Community','rewards.approve'],
 ['Bible study member statistics','Noah','Content','content.edit'],['Bible school statistics','Noah','Content','content.edit'],['Quiz scores','Noah','Content','content.edit'],['Course progress','Noah','Content','content.edit'],['Video top ten','Noah','Content','content.edit'],['Live video statistics','Noah','Content','content.edit'],
 ['Broadcast delivery','Noah','Communications','comms.send'],['Push delivery','Noah','Communications','comms.send'],['Email campaign statistics','Noah','Communications','comms.send'],['Call campaign outcomes','Noah','Communications','comms.calls'],
 ['Asset register','Noah','Operations','ops.view'],['Stock movement','Noah','Operations','ops.view'],
 ['Verification and unverification','Jodie','Verification','jodie.verify'],['Verification per day','Jodie','Verification','jodie.verify'],['Verification list','Jodie','Verification','jodie.verify'],['Member statistics','Jodie','Members','jodie.manage'],['Profiles made live','Jodie','Members','jodie.manage'],['Joining by date','Jodie','Members','jodie.manage'],['Duplicates','Jodie','Members','jodie.manage'],['Locations','Jodie','Members','jodie.manage'],['Member information export','Jodie','Members','jodie.manage'],
 ['Subscription per day','Jodie','Revenue','subs.view'],['Revenue','Jodie','Revenue','subs.view'],['Detailed revenue','Jodie','Revenue','subs.view'],['Payment received','Jodie','Revenue','subs.view'],['Membership expiry','Jodie','Revenue','subs.view'],['Category-wise donation','Jodie','Revenue','subs.view'],['Pastor donation','Jodie','Revenue','subs.view']]
 .forEach((x,i)=>REPORTS.push({id:'RP-'+(i+1),name:x[0],app:x[1],area:x[2],perm:x[3],runs:ri(2,180),last:hAgo(ri(2,24*20)),fav:i===0||i===35||i===45}));
const SCHEDULES=[{id:'SCH-1',report:'Giving by month',to:['Anitha Varghese','Grace Isaac','Board of trustees (3)'],freq:'Monthly, 1st at 08:00',fmt:'PDF',next:at(dAhead(23),8,0),on:true},
 {id:'SCH-2',report:'Verification per day',to:['Christina Paul'],freq:'Daily at 09:00',fmt:'Excel',next:at(dAhead(1),9,0),on:true},
 {id:'SCH-3',report:'Revenue',to:['Anitha Varghese','Christina Paul'],freq:'Weekly, Monday 08:00',fmt:'PDF',next:at(dAhead(3),8,0),on:true},
 {id:'SCH-4',report:'Absentees and follow-up',to:['All pastors (9)'],freq:'Weekly, Monday 07:00',fmt:'PDF',next:at(dAhead(3),7,0),on:true},
 {id:'SCH-5',report:'Failed donations',to:['Grace Isaac','Sunil Nair'],freq:'Daily at 07:30',fmt:'Excel',next:at(dAhead(1),7,30),on:true},
 {id:'SCH-6',report:'Broadcast delivery',to:['Kiran Reddy'],freq:'Weekly, Friday 17:00',fmt:'PDF',next:at(dAhead(0),17,0),on:false}];
const EXPORTS=[{id:'EX-1',what:'Member register (Thane)',rows:312,by:'Esther Daniel',at:hAgo(26),exp:hAgo(2),state:'Expired'},{id:'EX-2',what:'80G receipt register, September',rows:1840,by:'Grace Isaac',at:hAgo(5),exp:new Date(+NOW+19*HR),state:'Ready'},{id:'EX-3',what:'Verification list, October',rows:96,by:'Christina Paul',at:hAgo(1),exp:new Date(+NOW+23*HR),state:'Ready'}];


/* ---------- exports ---------- */
export {
  ABSENTEES,
  ACCOUNTS,
  ADDONS,
  ADULTS,
  ANNOUNCEMENTS,
  ASSETS,
  BANKS,
  BANK_IMPORTS,
  BANNERS,
  BATCHES,
  BLISTS,
  BROADCASTS,
  BUS_ATT,
  BUS_ROUTES,
  CALLCAMPS,
  CALLLOGS,
  CHANNELS,
  CHECKLISTS,
  COLLEGES,
  COMMENT_TEXT,
  COMPETITIONS,
  COURSES,
  CREDIT_NOTES,
  CTYPES,
  DENOMS,
  DEVICES,
  DRAFTS,
  DRIVE,
  DUPES,
  EDU,
  EMAILS,
  ENDPOINTS,
  EVENTS,
  EV_EXPENSES,
  EV_TASKS,
  EXPENSES,
  EXPORTS,
  FAILED,
  FEEDBACK,
  FILES,
  FIN_HEADS,
  FLAGS,
  FN_F,
  FN_M,
  GATEWAYS,
  HALLS,
  IMPORT_REQS,
  INCOME_VOUCHERS,
  INV,
  INV_CATS,
  JBLOCKS,
  JCALLLOG,
  JCALLS,
  JCONTENT,
  JINVOICES,
  JOBS,
  JOBS_J,
  JOURNALS,
  JPROFILES,
  JREPORTS,
  JSETTLE,
  JTHREADS,
  JUNMATCHED,
  LANGS,
  LANG_NAME,
  LEADERS,
  LEADER_HISTORY,
  LIBRARY,
  LIBSEED,
  LIVES,
  LN,
  LOCATIONS,
  LOCS,
  LOC_GROUPS,
  MANNA,
  MANNA_TITLES,
  MAPREPORTS,
  MEMBERS,
  ME_STAFF,
  MINISTRIES,
  MLISTS,
  MODQ,
  MOVES,
  NARRATIONS,
  OBITS,
  ORDERS,
  OUTBOUND,
  PASSES,
  PASTORS,
  PFORMS,
  PLANS,
  PLAYBACK,
  PODCASTS,
  POLLS,
  POST_TEXT,
  PRAISE,
  PRAYERS,
  PRODUCTS,
  PROJECTS,
  PTEMPLATES,
  PUSHES,
  QUESTIONS,
  RECEIPTS,
  REFLISTS,
  REFUNDS,
  REMINDERS,
  REPORTS,
  REWARD_RATES,
  REWARD_TX,
  SCANS,
  SCHEDULES,
  SENDERS,
  SERVICES,
  SERVICE_HISTORY,
  SETTINGS,
  SETTLEMENTS,
  SMSLOG,
  SMSTPL,
  STAFF,
  STAGES,
  STAGE_NAME,
  STORIES,
  STREETS,
  STUDIES,
  SUBS,
  TAGS,
  TASKS,
  TDS,
  THREADS,
  TODAY_EVENT,
  TOWARDS,
  TRANSLATORS,
  TXNS,
  UNMATCHED,
  VENDORS,
  VERIF_DONE,
  VIDEOKYC,
  VIDEOS,
  WAREHOUSES,
  WEBHOOKS,
  cellName,
  eventName,
  jpName,
  langMap,
  leaderName,
  memberName,
  nameOf,
  pastorName,
  rid,
  staffBy,
};

/* Every collection in one object, keyed by name, for the API layer. */
export const SEED = {
  ABSENTEES,
  ACCOUNTS,
  ADDONS,
  ADULTS,
  ANNOUNCEMENTS,
  ASSETS,
  BANKS,
  BANK_IMPORTS,
  BANNERS,
  BATCHES,
  BLISTS,
  BROADCASTS,
  BUS_ATT,
  BUS_ROUTES,
  CALLCAMPS,
  CALLLOGS,
  CHANNELS,
  CHECKLISTS,
  COLLEGES,
  COMMENT_TEXT,
  COMPETITIONS,
  COURSES,
  CREDIT_NOTES,
  CTYPES,
  DENOMS,
  DEVICES,
  DRAFTS,
  DRIVE,
  DUPES,
  EDU,
  EMAILS,
  ENDPOINTS,
  EVENTS,
  EV_EXPENSES,
  EV_TASKS,
  EXPENSES,
  EXPORTS,
  FAILED,
  FEEDBACK,
  FILES,
  FIN_HEADS,
  FLAGS,
  FN_F,
  FN_M,
  GATEWAYS,
  HALLS,
  IMPORT_REQS,
  INCOME_VOUCHERS,
  INV,
  INV_CATS,
  JBLOCKS,
  JCALLLOG,
  JCALLS,
  JCONTENT,
  JINVOICES,
  JOBS,
  JOBS_J,
  JOURNALS,
  JPROFILES,
  JREPORTS,
  JSETTLE,
  JTHREADS,
  JUNMATCHED,
  LANGS,
  LANG_NAME,
  LEADERS,
  LEADER_HISTORY,
  LIBRARY,
  LIBSEED,
  LIVES,
  LN,
  LOCATIONS,
  LOCS,
  LOC_GROUPS,
  MANNA,
  MANNA_TITLES,
  MAPREPORTS,
  MEMBERS,
  ME_STAFF,
  MINISTRIES,
  MLISTS,
  MODQ,
  MOVES,
  NARRATIONS,
  OBITS,
  ORDERS,
  OUTBOUND,
  PASSES,
  PASTORS,
  PFORMS,
  PLANS,
  PLAYBACK,
  PODCASTS,
  POLLS,
  POST_TEXT,
  PRAISE,
  PRAYERS,
  PRODUCTS,
  PROJECTS,
  PTEMPLATES,
  PUSHES,
  QUESTIONS,
  RECEIPTS,
  REFLISTS,
  REFUNDS,
  REMINDERS,
  REPORTS,
  REWARD_RATES,
  REWARD_TX,
  SCANS,
  SCHEDULES,
  SENDERS,
  SERVICES,
  SERVICE_HISTORY,
  SETTINGS,
  SETTLEMENTS,
  SMSLOG,
  SMSTPL,
  STAFF,
  STAGES,
  STAGE_NAME,
  STORIES,
  STREETS,
  STUDIES,
  SUBS,
  TAGS,
  TASKS,
  TDS,
  THREADS,
  TODAY_EVENT,
  TOWARDS,
  TRANSLATORS,
  TXNS,
  UNMATCHED,
  VENDORS,
  VERIF_DONE,
  VIDEOKYC,
  VIDEOS,
  WAREHOUSES,
  WEBHOOKS,
};
