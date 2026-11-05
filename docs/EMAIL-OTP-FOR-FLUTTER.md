# Email one-time-code sign-in: for the Flutter app and the Noah API

The client wants members to sign in with **either a mobile number or an email address**, each confirmed by a
one-time code. The admin console already does this for staff, and it is live. This note says what was built there,
what the Noah API (`noah_api`, Catalyst) has to add, and what the Flutter app has to do.

Who does what:

| Part | Owner | Work |
|---|---|---|
| Send and check the code by email | Noah API | two endpoints get an `email` option, plus a mail sender |
| Sign-in screen with a Mobile / Email choice, code box, resend timer | Flutter | UI and two calls |
| Mail account and sender set-up | whoever runs Catalyst and the domain | see section 4 |

The console's code is the working reference: `server/auth.js` (the code rules) and `server/deliver.js` (sending).

---

## 1. The flow

```
App                              Noah API                          Member's inbox
 |  POST /app/auth/request-otp    |                                       |
 |  { "email": "a@b.com" }  ----> | find member by email                  |
 |                                | make 6-digit code, keep 5 min (Cache) |
 |                                | send the email --------------------->|  "482913 is your Karuna Sadan code"
 | <---- { ok, expiresInSeconds,  |                                       |
 |         resendAfterSeconds }   |                                       |
 |  POST /app/auth/verify         |                                       |
 |  { "email", "code" }     ----> | compare, delete the code (one use)    |
 | <---- member | new | pending   | issue a token only if approved        |
```

Entering the code proves the person owns that inbox. That is the whole check. The code must never come back in
any response.

---

## 2. What the Noah API must add

Keep the two endpoints that already exist (`docs/API-CONTRACT.md` section 4, `docs/REGISTRATION-FLOW.md`). Each takes
**either** `mobile` **or** `email`, never both.

### `POST /app/auth/request-otp`

```json
{ "email": "anitha@example.com" }
```

`200`: `{ "ok": true, "expiresInSeconds": 300, "resendAfterSeconds": 30, "sentTo": "a•••@example.com" }`

| Status | When | Body `error` |
|---|---|---|
| 400 | not a valid email, or both / neither of mobile and email sent | "Enter a valid email address." |
| 429 | asked again within 30 s, or too many in an hour | "A code was just sent. You can ask for another in 12 seconds." |
| 502 | the mail provider refused | "The code could not be emailed just now. Try again in a minute, or sign in with your mobile number." |

An address nobody has registered gets the **same 200** as a real one and no email is sent, so the endpoint cannot be
used to find out who is a member.

### `POST /app/auth/verify`

```json
{ "email": "anitha@example.com", "code": "482913" }
```

Same three answers as for a mobile number: `member` (with `token`), `new`, `pending`. A member who is not approved
gets **no usable token**, whatever channel they used.

| Status | When | `error` |
|---|---|---|
| 400 | wrong code | "That code is not right." |
| 400 | expired | "That code has expired. Ask for a new one." |
| 400 | more than 5 tries | "Too many attempts. Ask for a new code." |
| 400 | no code was asked for | "Ask for a new code." |

### Rules (copy these; they are what the console enforces)

| Rule | Value |
|---|---|
| Code | 6 digits, random (use a secure generator, not `Math.random`) |
| Lifetime | 5 minutes |
| Use | once; delete on success |
| Wrong tries | 5, then the code is dead |
| Resend wait | 30 seconds |
| Per address | 5 codes per hour |
| Everyone together | 200 codes per hour (protects the mail quota) |
| Storage | Catalyst **Cache**, keyed by the lower-cased address. Not a table, not memory: a function restarts and runs as several instances. |
| Email | trim and lower-case before looking up, storing or comparing |
| Logging | never write the code to a log |

### One person, one account

Mobile and email must lead to the **same member**. Look the address up on the member's email column (and the mobile on
the mobile column). If two members share one email, refuse it for sign-in and ask them to use their mobile number.
Decide with the client what happens to a member who has no email yet (they sign in by mobile, and can add an email in
the profile).

---

## 3. What the Flutter app must do

1. **Choice.** On the sign-in screen, two options: *Mobile number* and *Email*. Remember the last one.
2. **Email box.** `TextInputType.emailAddress`, `autocorrect: false`. Trim it and check it looks like an address
   before calling.
3. **Send.** Call `request-otp`. While waiting, disable the button.
4. **Code screen.** Show "We sent a code to a•••@example.com" using `sentTo` from the reply (do not rebuild the mask
   yourself). Six boxes or one field with `keyboardType: number`, `maxLength: 6`, and
   `autofillHints: [AutofillHints.oneTimeCode]`.
5. **Resend.** A countdown from `resendAfterSeconds`, then a *Resend code* button. On a 429, show the server's
   message and its wait.
6. **Change address.** A link back to step 2.
7. **Verify.** On a `member` answer, store the token in secure storage (`flutter_secure_storage`), never in
   shared preferences. On `new` or `pending`, go to the registration screens as the mobile journey does.
8. **Errors.** Show the server's `error` text as it is. It is written to be shown.
9. Never store or log the code.

```dart
Future<OtpSent> requestEmailCode(String email) async {
  final res = await http.post(
    Uri.parse('$baseUrl/app/auth/request-otp'),
    headers: {'content-type': 'application/json'},
    body: jsonEncode({'email': email.trim().toLowerCase()}),
  );
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  if (res.statusCode != 200) throw OtpError(body['error'] as String? ?? 'Could not send the code.', res.statusCode);
  return OtpSent(sentTo: body['sentTo'] as String?, resendAfter: body['resendAfterSeconds'] as int? ?? 30);
}

Future<Map<String, dynamic>> verifyEmailCode(String email, String code) async {
  final res = await http.post(
    Uri.parse('$baseUrl/app/auth/verify'),
    headers: {'content-type': 'application/json'},
    body: jsonEncode({'email': email.trim().toLowerCase(), 'code': code.trim()}),
  );
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  if (res.statusCode != 200) throw OtpError(body['error'] as String? ?? 'That code is not right.', res.statusCode);
  return body; // status: member | new | pending
}
```

---

## 4. Sending the email

Two ways work. The console supports both and tries the second if the first fails.

**A. Zoho Mail SMTP (working today for the console).** `karunasadan.com` already uses Zoho Mail and its SPF record
already allows `zoho.in`, so no DNS change is needed.

| Setting | Value |
|---|---|
| Host / port | `smtp.zoho.in` / `465` (SSL) |
| User | the sender mailbox, for example `mehak@karunasadan.com` |
| Password | an **app password** made in Zoho (Accounts > Security > App Passwords), never the mailbox password |
| From | `Karuna Sadan <the same address>` |

From a Catalyst function use `nodemailer`. Put the values in the function's environment settings, not in code or git.
A shared mailbox is a stop-gap: ask the client for a `no-reply@karunasadan.com` mailbox.

**B. Catalyst Mail (Cloud Scale > Mail).**

1. Add and verify the sender address, and add and authenticate the domain (Catalyst gives an SPF and a DKIM record
   for the DNS). The SPF record must **include** `include:transmail.net.in`; edit the existing SPF record, do not add
   a second one. Until the domain is authenticated, Catalyst refuses with "You need to verify the email domain".
2. The function's token needs the scope `ZohoCatalyst.email.CREATE`.
3. Send: `POST /baas/v1/project/{projectId}/email/send` with `from_email`, `to_email` (a list), `subject`,
   `content`, `html_mode`. Inside a Catalyst function the SDK's `email().sendMail(...)` does the same.
4. Documented limits: 10 recipients per send, 15 MB of attachments. No daily or monthly quota is published; ask
   Catalyst support for the allowance and the price before relying on it.

Message text used in the console (change the name for the app):

> Subject: `482913 is your Karuna Sadan code`
> Your Karuna Sadan sign-in code is 482913. It works once and lasts 5 minutes. If you did not ask for it, ignore this
> message: nobody can sign in without it.

---

## 5. Test it

- A real member's address: the code arrives, signs in, and cannot be used a second time.
- A wrong code five times: the code dies and a new one is needed.
- Asking again inside 30 seconds: refused with the wait shown.
- The sixth request in an hour for one address: refused.
- An address nobody registered: the same reply as a real one, and no email arrives.
- A code that is 6 minutes old: "has expired".
- An approved member and a `pending` member by email: only the approved one gets a token.
- Check the spam folder on Gmail and Outlook. Mail from a domain without SPF and DKIM often lands there.
- Make sure the response of `request-otp` and every log line contains no code.

---

## 6. To settle with the client

1. Is email an **addition** to mobile sign-in (members can use either), or does it replace it for some people?
2. Which address is the sender, and who owns its mailbox and the domain's DNS?
3. Do all members have an email on file? What do those without one do?
4. Is a 6-digit code that lasts 5 minutes acceptable?
5. What is the Catalyst Mail allowance and price, and how many sign-ins a month are expected?
