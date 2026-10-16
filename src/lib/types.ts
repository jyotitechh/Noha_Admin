/* Shapes the console reads from the API.

   These describe the sample data in server/seed/. They are deliberately
   partial: a screen declares the fields it uses rather than every field the
   generator happens to produce. */

export interface Registration {
  id: string;
  salutation: string;
  firstName: string; middleName: string; lastName: string; fullName: string;
  mobile: string; email: string; gender: string; dob: Date;
  marital: string; reference: string;
  /* `region` is the state or province. `state` below is the workflow state. */
  line1: string; line2: string; city: string; region: string; country: string; pin: string;
  idType: string; idNumber: string; idFile: string; idSizeKb: number;
  photoFile: string; photoSizeKb: number;
  agreed: boolean;
  declarationVersion: string; declarationLang: string; signature: string; signedOn: Date;
  videoSecs: number; videoFile: string; videoAttempt: number; script: string;
  state: 'pending' | 'approved' | 'videoReturned';
  at: Date; decidedAt: Date | null; decidedBy: string; remark: string; memberId: string | null;
  checks: {
    idReadable: boolean | null; photoMatchesId: boolean | null; videoAudible: boolean | null;
    nameMatchesSignature: boolean; ageOver18: boolean; duplicateMobile: boolean;
  };
}

export interface PrayerRequest {
  id: string; category: string; text: string;
  everyone: boolean; anonymous: boolean;
  memberName: string; mobile: string;
  /* Set when the request was written from a Daily Manna reading. */
  mannaId: string | null;
  at: Date; state: 'Pending' | 'Approved' | 'Declined';
  decidedBy: string; remark: string; prayedBy: number;
}

export interface Member {
  id: string; name: string; first: string; last: string; g: 'M' | 'F'; age: number;
  mobile: string; email: string; loc: string; cell: string | null; pastor: string | null;
  status: string; partner: boolean; joined: Date; lang: string; kid: boolean;
  address: string; photo: string; crm: string; lastActive: Date | null;
  fromRegistration?: string;
}

export interface Receipt {
  id: string; name: string; member: string; amt: number; at: Date;
  mode: string; gw: string; towards: string; status: string; ref: string; pan?: string;
}

export interface EventRow {
  id: string; name: string; place: string; start: Date; status: string;
  seats?: number; booked?: number; family?: boolean; type?: string;
}

export interface Pass {
  id: string; member: string; name: string; event: string;
  seats: number | string[]; gate: string; code: string; at: Date; scanned?: boolean;
}

export interface Manna {
  id: string; date: Date; title: string; verse: string; cat: string;
  status: string; body?: string; langs?: string[];
}

export interface ModItem {
  id: string; kind: string; name: string; member: string; text: string;
  at: Date; state: string; remark?: string;
}

export interface JProfile {
  id: string; name: string; age: number; g: 'M' | 'F'; loc: string;
  edu: string; job: string; denom: string; verified: boolean; sub: string;
  st: Record<'I' | 'P' | 'E' | 'Q', 'pend' | 'ok' | 'ret'>;
  stamps: Record<'I' | 'P' | 'E' | 'Q', Date>;
}

export interface Staff {
  id: string; name: string; email: string; title: string; role: string;
  status: string; from: Date; lastIn: Date | null; mfa: boolean;
  locs: string[]; overrides: { p: string; mode: string; why: string }[];
}

export interface AuditEntry {
  id: string; at: Date; actor: string; role: string; action: string; mod: string;
  rec: string; before: unknown; after: unknown; remark: string; ip: string; live?: boolean;
}

export interface Subscription {
  id: string; pid: string; name: string; plan: string; amt: number;
  status: string; started: Date; next: Date | null; ends?: Date; method: string;
}
