/* An in-memory Catalyst, for testing without spending its Data Store allowance.

   Swaps the `io` object in noah-schema.js for arrays of rows, so the schema
   logic — and, with dev-offline.mjs, the whole server — runs with no network.
   The rows copy the shapes seen in the live project, including the awkward
   ones; see seed() below. */

import './fake-env.mjs';
import * as S from './noah-schema.js';

/* The console-staff table exists in the fake, so the grant flow can be tested. */
process.env.CATALYST_TABLE_CONSOLE_STAFF = '27145000000299001';

export { S };
export const T = S.NOAH_TABLES;

/* ---------- a fake Catalyst ---------- */

let nextId = 27145000000200000n;
const newId = () => String(nextId++);
const tables = {};
const writes = [];

function reset(seed) {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const [name, rows] of Object.entries(seed)) tables[T[name]] = rows.map((r) => ({ ...r }));
  for (const id of Object.values(T)) tables[id] ||= [];
  writes.length = 0;
  S.clearCache();
}

S.io.getRows = async (id) => (tables[id] || []).map((r) => ({ ...r }));
S.io.getRow = async (id, rowId) => {
  const r = (tables[id] || []).find((x) => x.ROWID === String(rowId));
  return r ? { ...r } : null;
};
S.io.insert = async (id, row) => {
  const made = { ROWID: newId(), CREATEDTIME: '2026-10-19 18:00:00:000', ...row };
  tables[id].push(made);
  writes.push({ op: 'insert', table: id, row });
  /* The real API sends the ROWID of an insert as a bare number. A test that
     handed back the string would hide the exact bug the read-back avoids. */
  return [{ ROWID: Number(made.ROWID) }];
};
S.io.update = async (id, row) => {
  const r = (tables[id] || []).find((x) => x.ROWID === String(row.ROWID));
  if (!r) throw new Error(`no row ${row.ROWID} in ${id}`);
  Object.assign(r, row);
  writes.push({ op: 'update', table: id, row });
  return row;
};

export { tables, writes, reset };

/* ---------- fixtures ---------- */

export const U = { otp: '27145000000117981', draft: '27145000000126927', office: '27145000000141595', pastor: '27145000000138578', bare: '27145000000141592', boss: '27145000000151001' };
export const M = { approved: '27145000000145218', draft: '27145000000143401', office: '27145000000126932', pastor: '27145000000140310', blank: '27145000000146028', boss: '27145000000151002' };

export const seed = () => ({
  users: [
    { ROWID: U.otp, number: '9000000779', countryCode: '+91', archived: false, is_member: true },
    { ROWID: U.draft, number: '9000000777', countryCode: '+91', archived: false, is_member: true },
    { ROWID: U.office, number: '9000000778', countryCode: '+91', archived: false, is_member: true },
    { ROWID: U.pastor, number: '9000000100', countryCode: '+91', archived: false, is_member: true },
    { ROWID: U.bare, number: '9000000101', countryCode: '+91', archived: false, is_admin: true },
    /* The office's own super administrator: flagged in its system, not by the console. */
    { ROWID: U.boss, number: '9000000555', countryCode: '+91', archived: false, is_super_admin: true, is_member: true, CREATEDTIME: '2025-06-01 09:00:00:000' },
  ],
  members: [
    /* Approved through the app: registration approved, office verified. */
    {
      ROWID: M.approved, id: M.approved, userId: U.otp, countryCode: '+91', mobileNumber1: '9000000779',
      status: true, isUnVerified: false, verifiedOn: '2026-10-19 12:35:01', archived: false,
      salutation: 'Mr', firstName: 'Anand', middleName: '', lastName: 'Rao', gender: 1,
      dateOfBirth: '1990-05-14', emailId1: 'anand@example.com', maritalStatus: 'married',
      referBy: 'Fr. Thomas|+91|9000011111', address: '12 Mill Road', area: 'Kurla', city: 'Mumbai',
      state: 'Maharashtra', country: 'India', pincode: '400070', panNo: 'ABCDE1234F', photo: '27145000000130921',
      dateOfJoining: '2026-10-19 12:35:01', CREATEDTIME: '2026-10-19 18:00:00:000',
    },
    /* Asked for an OTP and nothing else. status is STILL true. */
    {
      ROWID: M.draft, id: M.draft, userId: U.draft, countryCode: '+91', mobileNumber1: '9000000777',
      status: true, isUnVerified: true, archived: false, firstName: 'Meera', lastName: 'Nair', gender: 2,
      CREATEDTIME: '2026-10-19 17:00:00:000',
    },
    /* Verified in the office's own system; never used the app, so no registration. */
    {
      ROWID: M.office, id: M.office, userId: U.office, countryCode: '+91', mobileNumber1: '9000000778',
      status: true, isUnVerified: false, archived: false, firstName: 'Old', lastName: 'Member', gender: 1,
      CREATEDTIME: '2025-01-01 10:00:00:000',
    },
    { ROWID: M.pastor, id: M.pastor, userId: U.pastor, countryCode: '+91', mobileNumber1: '9000000100', status: true, isUnVerified: true, archived: false, memberType: 'pastor', firstName: 'Fr', lastName: 'Thomas', gender: 1, CREATEDTIME: '2026-10-01 10:00:00:000' },
    { ROWID: M.boss, id: M.boss, userId: U.boss, countryCode: '+91', mobileNumber1: '9000000555', status: true, isUnVerified: false, archived: false, firstName: 'Anitha', lastName: 'Varghese', gender: 2, emailId1: 'anitha@example.com', CREATEDTIME: '2025-06-01 09:00:00:000' },
    { ROWID: M.blank, id: M.blank, userId: U.bare, countryCode: '+91', mobileNumber1: '9000000101', status: true, isUnVerified: true, archived: false, CREATEDTIME: '2026-10-19 16:00:00:000' },
  ],
  membersExtra: [
    { ROWID: '27145000000150001', id: M.approved, isPartner: true, connectedPastor: M.pastor },
    { ROWID: '27145000000150002', id: M.draft },
    { ROWID: '27145000000150003', id: M.pastor },
    /* M.office and M.blank deliberately have no extra row. */
  ],
  files: [
    { ROWID: '27145000000126953', uid: M.approved, path: '27145000000128680', fileType: 3, extension: 'mp4', size: 3012, archived: false, CREATEDTIME: '2026-10-19 18:02:00:000', remoteSource: '{"name":"declaration.mp4","mimeType":"video/mp4","purpose":"video"}' },
    { ROWID: '27145000000130921', uid: M.approved, path: '27145000000146032', fileType: 1, extension: 'jpg', size: 2004, archived: false, CREATEDTIME: '2026-10-19 18:01:00:000', remoteSource: '{"name":"photo.jpg","mimeType":"image/jpeg","purpose":"photo"}' },
    { ROWID: '27145000000142407', uid: M.approved, path: '27145000000133990', fileType: 2, extension: 'png', size: 1008, archived: false, CREATEDTIME: '2026-10-19 18:01:30:000', remoteSource: '{"name":"pan.png","mimeType":"image/png","purpose":"idProof"}' },
  ],
  appRegistrations: [
    {
      ROWID: '27145000000136691', memberRowId: M.approved, status: 'approved',
      submittedAt: '2026-10-19 12:34:09', reviewedAt: '2026-10-19 12:35:01', reviewNote: 'Approved by Anitha Varghese',
      idProofType: 'pan', idProofFileId: '27145000000142407', videoFileId: '27145000000126953',
      videoSeconds: 20, declarationAccepted: true, declarationAcceptedAt: '2026-10-19 12:30:00',
      declarationLanguage: 'en', signatureText: 'Anand Rao', nationality: 'India',
      CREATEDTIME: '2026-10-19 18:04:09:000',
    },
    { ROWID: '27145000000128676', memberRowId: M.draft, status: 'draft', CREATEDTIME: '2026-10-19 17:00:01:000' },
    { ROWID: '27145000000138579', memberRowId: M.pastor, status: 'draft', CREATEDTIME: '2026-10-01 10:00:01:000' },
    /* approved, but never submitted: test data in the live project. */
    { ROWID: '27145000000141593', memberRowId: M.blank, status: 'approved', CREATEDTIME: '2026-10-19 16:00:01:000' },
  ],
});
