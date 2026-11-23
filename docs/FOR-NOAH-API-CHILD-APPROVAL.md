# Every new child is approved by the office

For the developer of the Noah API (`noah_api` on Catalyst) and of the Noah app. This changes step 1 of `FOR-CONSOLE-CHILDREN.md`.
Everything after it (Make member at 15, the consent, the notices) stays as it is.

## What the office wants

Today a parent adds a child under **Me > Family > +** and the child is in the family at once. The family request is stored as
**Approved** straight away, so the office never sees it. The office wants to approve **every** new child first:

```
Parent adds a child (photo, name, date of birth, gender, Aadhaar if they have it)
   -> the child waits: "Waiting for the office"            NEW: a Pending family request, kind "child"
Office approves in the console (Membership > Family requests)
   -> the child is added to both parents' family            the kids row and links are made only now
   -> both parents are told                                 NEW notification: child_added_approved
Office rejects (with a reason)
   -> both parents see the reason and can add the child again   NEW notification: child_added_rejected
The child turns 15 (only an approved child)
   -> both parents get child_age_notice: "Please make X a member"    unchanged
```

**The console is ready for this.** It already lists, counts and announces Pending requests of kind `"child"`, shows the photo and the
Aadhaar, and calls the existing decide endpoint. Nothing on the console needs to wait for you except the steps below.

## 1. Adding a child (`POST` the app uses for Me > Family > +)

Instead of inserting the `kids` row and the `kidsConnect` links:

* Save a **family request** (`websiteContactUsEmailResponse`) with:
  * `fam_kind = "child"`, `fam_state = "Pending"`, `fam_isKid = true`;
  * `fam_requesterId`, `fam_relation` (son/daughter), `fam_firstName`, `fam_middleName`, `fam_lastName`, `fam_gender`, `fam_dateOfBirth`;
  * `fam_aadhaarNo`, `fam_aadhaarFileId` when the parent gave them;
  * **`fam_photoFileId`**: the photo (required, as now). This is a **new text column** on `websiteContactUsEmailResponse`
    (create it without a description).
* Do **not** create the `kids` row or the links yet, and do not send `family_linked` yet.
* Answer the app with the request (id, state `Pending`), so it can show the child as waiting.

## 2. The family list the app reads (`GET /family`)

Show a waiting child in the parent's (and the spouse's) list, so the parent knows it was received:

* `memberState: "awaitingOffice"` (or a `pending: true` flag): the app shows **"Waiting for the office"** and hides **Make member**.
* A rejected child: `memberState: "addRejected"` with the office's `remark`; the app shows the reason, and a button to add the child again
  (or to remove the row).

## 3. The office's list (`GET /admin/family-requests`)

For kind `"child"` add, besides the fields already there:

* `photoFileId` (the photo), `middleName`, `aadhaarNo`, `aadhaarFileId`.

The console opens the pictures with the existing `GET /admin/files/:fileId`.

## 4. The decision (`POST /admin/family-requests/:id/decide`, unchanged URL and body)

* **Approved**, kind `"child"`:
  1. create the `kids` row with the name, date of birth, gender, `photoFileId`, `aadhaarNo`, `aadhaarFileId`;
  2. link it in `kidsConnect` to the parent who asked **and the spouse** (as adding does today);
  3. notify **both parents**: `child_added_approved` ("X has been added to your family");
  4. **if the child is already 15 or more**, send `child_age_notice` to both parents straight away (do not wait for the sweep);
  5. answer `{ "id", "state": "Approved", "kind": "child", "kidId": "<the new kids row>" }`.
* **Rejected**: notify both parents `child_added_rejected` with the remark; nothing is created.
* Errors as today: `409 not_pending` when it was decided already.

## 5. The notice at 15 (no change)

`child_age_notice` is sent only for rows in `kids`. Since a child is in `kids` only after the office approves, **only approved children
are counted**. The console already asks `POST /admin/children/age-notices` every 6 hours, so a family that never opens the app is still told.

## 6. Children added before this change

Leave them as they are: they are already in their families and are treated as approved. Only children added after the change wait for the office.

## 7. New notification types (table `notifications`)

| type | to | when |
|---|---|---|
| `child_added_approved` | both parents | the office approved a new child |
| `child_added_rejected` | both parents | the office rejected it (with the remark) |

## 8. Check it (10 minutes, on the test server)

1. Parent: Me > Family > **+**, add a child of 8 with a photo. The child shows **Waiting for the office**; **Make member** is not offered.
2. Console: within a minute the bell and **Membership > Family requests** show it as **New child**, with the photo. **Approve.**
3. Both parents get `child_added_approved`; the child is in both families; the console's **Children** tab lists the child.
4. Add a child of 16 and approve: both parents get `child_age_notice` at once.
5. Add another child and **Reject** with a reason: both parents see it and can add the child again.
