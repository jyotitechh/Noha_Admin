/* Family relations: what the office can assign, and how each side of a relation is named.

   HOW IT WORKS (the way the client asked for it)
     1. Person A is already a member and wants Person B (also a member) added as a relative.
     2. A asks the office, from the app (Me > Family, which lands in Membership > Family requests), or tells them directly.
     3. The office opens A's page, Family > Add a relative, picks B and says what B is to A (Father, Uncle, Spouse...).
     4. One row is saved. A sees B as that relation, and B sees A as the REVERSE relation, with nothing more to do.
        Say B is A's Father: A sees "Father", and B sees "Son" if A is a man or "Daughter" if A is a woman.

   WHY ONE ROW IS ENOUGH
     A row in Catalyst's `membersRelations` carries both directions:
       relationshipA2B  = what B is to A        relationshipB2A  = what A is to B
     The person page reads every row that names the member on either side, and shows the other person with the code that
     faces the member. So the only thing that has to be right when saving is the second code, which is what this file works out.

   THE CODES
     1-11 are the Noah app's own (ADMIN_INTEGRATION.md): Spouse, Son, Daughter, Father, Mother, Brother, Sister, Other, Parent,
     Child, Sibling. The app already understands them.
     12-15 (Uncle, Aunt, Nephew, Niece) are added by the console because the client asked for uncle and aunt. The app's list
     stops at 11, so confirm with the app developer that it can show them before using them on real members. To switch them off:
     FAMILY_EXTRA_RELATIONS=off.

   HUSBAND AND WIFE
     There is one stored code, Spouse (1), the same in both directions. The page shows it as Husband or Wife from the OTHER
     person's gender (a man is the Husband), and as Spouse when that is not set. The office picks "Spouse" once.

   WHAT NEEDS A GENDER
     Son, Daughter, Father, Mother, Brother, Sister, Uncle, Aunt, Nephew and Niece are gendered. The reverse depends on the
     gender of the person the relation is being added to, so if that is not set the office is asked to set it first. */

const EXTRA_ON = () => String(process.env.FAMILY_EXTRA_RELATIONS ?? 'on').toLowerCase() !== 'off';

/** Every code and its plain name. */
export const RELATION = {
  1: 'Spouse', 2: 'Son', 3: 'Daughter', 4: 'Father', 5: 'Mother', 6: 'Brother', 7: 'Sister', 8: 'Other',
  9: 'Parent', 10: 'Child', 11: 'Sibling',
  12: 'Uncle', 13: 'Aunt', 14: 'Nephew', 15: 'Niece',
};

/** The codes the console added beyond the Noah app's own list. */
export const EXTRA_CODES = [12, 13, 14, 15];

/** Is this code one the office may assign right now? */
export const isOffered = (code) => Object.hasOwn(RELATION, code) && (!EXTRA_CODES.includes(Number(code)) || EXTRA_ON());

/* The order the office sees them in: the close family first. */
const ORDER = [4, 5, 2, 3, 1, 6, 7, 12, 13, 14, 15, 9, 10, 11, 8];

/** The relations the office can pick, for the form: { code, label, extra }. */
export const relationOptions = () => ORDER
  .filter(isOffered)
  .map((code) => ({ code, label: code === 1 ? 'Spouse (husband or wife)' : RELATION[code], extra: EXTRA_CODES.includes(code) }));

/**
 * What to call a relation on a page. `otherGender` is the gender of the person it describes (1 male, 2 female): that
 * is what turns Spouse into Husband or Wife.
 */
export function relationLabel(code, otherGender) {
  const c = Number(code);
  if (c === 1) return Number(otherGender) === 1 ? 'Husband' : Number(otherGender) === 2 ? 'Wife' : 'Spouse';
  return RELATION[c] || (c ? `Relation ${c}` : '');
}

/** What a child is called on a parent's page: by the child's gender, else just Child. */
export const kidLabel = (kid) => (Number(kid?.gender) === 1 ? 'Son' : Number(kid?.gender) === 2 ? 'Daughter' : 'Child');

/**
 * The other side of a relation. `code` is what B is to A; the answer is what A is to B, and it depends on A's gender where
 * the relation is gendered. null means "A's gender is needed and is not set"; undefined means the code is not one we know.
 */
export function reverseRelation(code, firstGender) {
  /* The same word both ways. */
  if (code === 1 || code === 8 || code === 11) return code;
  /* Parent and Child are each other's reverse. */
  if (code === 9) return 10;
  if (code === 10) return 9;

  const male = Number(firstGender) === 1;
  const female = Number(firstGender) === 2;
  const pick = (m, f) => (male ? m : female ? f : null);

  if (code === 2 || code === 3) return pick(4, 5);    /* B is A's son or daughter, so A is B's father or mother */
  if (code === 4 || code === 5) return pick(2, 3);    /* B is A's father or mother, so A is B's son or daughter */
  if (code === 6 || code === 7) return pick(6, 7);    /* siblings: a man is a Brother, a woman a Sister */
  if (code === 12 || code === 13) return pick(14, 15); /* B is A's uncle or aunt, so A is B's nephew or niece */
  if (code === 14 || code === 15) return pick(12, 13); /* B is A's nephew or niece, so A is B's uncle or aunt */
  return undefined;
}
