# Notifications: what the mobile app needs to do

For the developer building the Noah mobile app (Flutter). It says what the office's admin console already
sends to members, what it does **not** send yet, and what the app has to implement to receive and show all of it.

Where something has to be agreed with the Noah API developer (Shashank) because it is not in this repo, it is marked
**CONFIRM**.

---

## 1. The picture

```
Admin console  --(decision or update)-->  Noah API (Catalyst)  --(Firebase Cloud Messaging)-->  Member's phone
      |                                         |
      |  writes rows                            |  writes a row in `notifications`
      v                                         v
   Catalyst Data Store  <----------- the app reads its own notifications and data
```

- The console never talks to Firebase. It asks the **Noah API** to decide something (approve a registration, accept a
  profile change, accept a family request); the Noah API updates the record and **pushes to the member's phones**. If no
  phone can be reached it **emails** the member instead.
- Everything else the console changes (events, content, moderation) is written straight to Catalyst tables. **Nothing is
  pushed for those today.** Section 4 lists them and proposes what to send.
- A push only says "something changed". The app must always fetch the real data after it, and must still work when a push
  never arrives (polling or refresh on open).

---

## 2. What the console already triggers today

All of these go through the Noah API with the office's admin key, so the member is told in the same call.

| Office action in the console | Noah API call | What the member should get | What the app should do on tap |
|---|---|---|---|
| Approve a registration | `POST /admin/registrations/:id/approve` | "You are approved" | leave the waiting screen, open Home |
| Reject a registration (with a reason) | `POST /admin/registrations/:id/reject` | "Your registration was not approved" | show the reason (`remark`) on the status screen |
| Send the KYC video back (with what to fix) | `POST /admin/registrations/:id/return-video` | "Please record your video again" | open step 6 with the reason |
| "Tell the member" on an already decided registration | `POST /admin/registrations/:id/notify` | same as the decision | same as the decision |
| Approve / reject a profile change request | `POST /admin/profile-requests/:id/decide` | "Your change was accepted / declined" | refresh the profile; show the note on a decline |
| Approve / reject a family request | `POST /admin/family-requests/:id/decide` | both people are told | refresh Me > Family |

The Noah API answers the console with `notified: { pushed: <phones reached>, emailed: <bool> }`, or
`{ alreadySent: true }` if the member was already told (a member is told once per decision).

**Do not put private text in the push body.** A rejection reason is for the member's eyes inside the app. The push says only
that there is news.

**Polling stays as a fallback.** The registration status screen should keep polling
`GET /app/registration/status` every 20 to 30 seconds while it is open. A push is what members expect; polling covers a
phone with no notification permission.

---

## 3. Device registration (so a push has somewhere to go)

Catalyst table `deviceTokens`:

| Column | Meaning |
|---|---|
| `memberId` | the member's `members` ROWID |
| `deviceToken` | the **FCM registration token** |
| `udid` | a stable id for this install |
| `isAndroid` | `true` for Android, `false` for iOS |
| `archived` | set when the device signs out or the token is replaced |

What the app must do:

1. Ask for notification permission at a sensible moment (after sign-in, not on the first launch screen). Android 13 and
   above needs the `POST_NOTIFICATIONS` runtime permission. iOS needs the permission prompt and APNs set up in Firebase.
2. After the member signs in, get the FCM token and **register it with the Noah API** (**CONFIRM** the endpoint and body: it is
   whatever the Noah API already provides for writing `deviceTokens`).
3. Register again whenever the token changes (`FirebaseMessaging.instance.onTokenRefresh`).
4. On sign-out, tell the API to archive this device's token, so a shared phone does not keep getting another person's news.
5. One member can have several devices: each is its own row.

---

## 4. What the console changes but does not notify yet

These are written to Catalyst by the console, with no push. They are listed so the app and the Noah API can decide which ones
members should hear about. The "when" column is the moment the console writes the data.

| Area | When | Suggested notification | Who gets it |
|---|---|---|---|
| **Events** | a new event whose publish time has arrived | "New event: {name}, {date}" | members the event is for (see below) |
| Events | an event's date, time or place is changed | "{name} has changed: {new time or place}" | members who hold a pass, or all it is for |
| Events | an event is **archived** | nothing, or "{name} was cancelled" if the office says so | the app just stops showing it |
| Community | a post, reel, profile photo, praise report or prayer request is approved or rejected | "Your post is live" / "Your post was not approved" | the author |
| Content | Daily Manna, banners and announcements published | optional daily "Today's Manna" | everyone who opted in |
| Roles | the office makes someone a pastor or cell leader | "You are now a cell leader" | that member |
| Jodie | a verification stage is approved or sent back | "Your photographs were approved" / "Please update ..." | that member |
| Subscriptions | grace period or payment failed | "Your payment did not go through" | that member |
| Threads | a pastor or the office replies | "New message from {name}" | the member |

All of these need work in the Noah API (a place that sends the push) **and** the app (to show and route it).
**CONFIRM with Shashank** which of them are in scope for the first release.

### Events: what the app must follow

The console's event screens are new, and the app must read events the same way (see `docs/EVENTS.md` for every column).
The rules that matter for notifications and for what a member may see:

- **Never show or notify an archived event.** Skip rows where `isArchived` is true.
- **Publish time:** show an event only once `publishDateTime` has passed. A "new event" push should go out at that time.
- **Visibility:** respect `isInvisible`, `hideFromPublic` and `hideFromLeaders`.
- **Audience** is in `filters` (JSON): `{"forPastor":bool,"forLeader":bool,"forVip":bool,"forPrayerWarrior":bool,"memberGroups":["<groups ROWID>"]}`.
  If any of the four flags is true, the event is for those roles only; `memberGroups` limits it to those groups. All false and
  no groups means everyone.
- **Place:** `locationName`, `locationAddress`, `locationLat`, `locationLon`. Use the latitude and longitude to open the phone's map.
- **Time:** `startTimeUtc` / `endTimeUtc` are in UTC; show them in the member's own timezone, or in the event's `timezone`.
- **Blocked events:** `blockIfPassBookedFor` is a JSON list of event ROWIDs. A member who holds a pass for one of them cannot book
  this one.

---

## 5. The in-app notification list

Catalyst table `notifications` (the shape is a Laravel-style notification table):

| Column | Meaning |
|---|---|
| `id` | the notification's own id (text) |
| `type` | what kind it is (see the table in section 6) |
| `notifiable_type` / `notifiable_id` | whom it is for (the member's ROWID). **CONFIRM** the exact `notifiable_type` value |
| `data` | JSON text with the details (title, body, ids to open) |
| `read_at` | empty until the member opens it |
| `created_at` | when it was made |

The app should have a **Notifications** screen that lists the member's rows newest first, marks one read when opened (sets
`read_at`), and shows an unread count on the bell. **CONFIRM** the Noah API endpoints for listing and marking read, because the
app should not read this table directly.

A push and a row in this list are the same notification: tapping the push and opening the list entry go to the same place.

---

## 6. The push message

Use one shape for every notification, so the app has one handler.

**FCM message** (sent by the Noah API):

```json
{
  "notification": { "title": "You are approved", "body": "Welcome to Karuna Sadan. Tap to open the app." },
  "data": {
    "type": "registration_approved",
    "id": "<ROWID of the thing it is about>",
    "route": "/home"
  },
  "android": { "priority": "high", "notification": { "channel_id": "noah_default" } }
}
```

| `type` | `id` is | App opens |
|---|---|---|
| `registration_approved` | the registration | Home |
| `registration_rejected` | the registration | the status screen, showing the reason |
| `registration_video_returned` | the registration | registration step 6 |
| `profile_change_decided` | the change request | Me > My information |
| `family_request_decided` | the family request | Me > Family |
| `event_published` | the event | the event page |
| `event_changed` | the event | the event page |
| `post_decided` | the post | the post, or Me > My posts |
| `thread_message` | the thread | the conversation |
| `role_granted` | the member | Home (reload the member's roles) |

(The first six are sent today or can be soon. The rest are the proposal in section 4; the names are suggestions to agree.)

Rules:
- Keep `data` values as strings (FCM requires it).
- Put the minimum in the message. The app fetches details with its own signed-in request after the tap.
- Unknown `type`: open Home and refresh. Never crash on a type the app does not know yet.
- Do not send private text, a mobile number or a reason in the title or body.

---

## 7. Flutter checklist

Packages: `firebase_core`, `firebase_messaging`, `flutter_local_notifications`.

```dart
// main.dart
@pragma('vm:entry-point')
Future<void> _background(RemoteMessage m) async {
  await Firebase.initializeApp();
  // Nothing to draw: the system shows the notification. Only record or refresh here.
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_background);
  runApp(const App());
}
```

```dart
class Notifications {
  final _fm = FirebaseMessaging.instance;

  Future<void> start(GlobalKey<NavigatorState> nav) async {
    await _fm.requestPermission();                       // iOS prompt and Android 13+
    await _registerToken();                              // after sign-in
    _fm.onTokenRefresh.listen(_sendToken);

    // 1. App in the foreground: FCM shows nothing, so show it yourself and bump the badge.
    FirebaseMessaging.onMessage.listen((m) => _showLocal(m));

    // 2. App in the background, the user taps the notification.
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(nav, m.data));

    // 3. App was closed, the notification started it.
    final first = await _fm.getInitialMessage();
    if (first != null) _open(nav, first.data);
  }

  Future<void> _registerToken() async {
    final token = await _fm.getToken();
    if (token != null) await _sendToken(token);
  }

  Future<void> _sendToken(String token) =>
      api.registerDevice(token: token, isAndroid: Platform.isAndroid); // CONFIRM the endpoint

  void _open(GlobalKey<NavigatorState> nav, Map<String, dynamic> data) {
    switch (data['type']) {
      case 'registration_approved': nav.currentState?.pushNamedAndRemoveUntil('/home', (_) => false); break;
      case 'registration_rejected':
      case 'registration_video_returned': nav.currentState?.pushNamed('/registration/status'); break;
      case 'event_published':
      case 'event_changed': nav.currentState?.pushNamed('/event', arguments: data['id']); break;
      default: nav.currentState?.pushNamed('/notifications'); // unknown type: list, never crash
    }
    // Then reload whatever it is about from the API; a tap is only a hint.
  }
}
```

Also:
- Android: create the `noah_default` notification channel; add the Firebase `google-services.json`. iOS: upload the APNs key
  to Firebase, enable Push Notifications and Background Modes in Xcode.
- Keep an unread badge from the notification list (section 5), and refresh it on every push.
- On sign-out: archive this device's token and clear local notifications.
- If a registration status screen is open when a push arrives, refresh it at once instead of waiting for the next poll.

---

## 8. Office-written messages (not built in the console yet)

The old admin app could send a message to a group of members at a chosen time. The Catalyst tables for it exist and are empty:

- `interactiveNotifications`: `title`, `message`, `photoUrl`, `mode`, `groupId`, `scheduleTime`, `recipientCount`, `androidCount`,
  `androidClicked`, `iosCount`, `iosClicked`, `send`.
- `interactiveTemplate`: saved templates (`type`, `category`, `theme`).

The console does not have a screen for this yet (Communications > Push is on the list of screens still to come). If it is
built, the app needs nothing new: it receives these as the same push shape with `type: "broadcast"` and shows `photoUrl` as the
large image. The click counts are a reason to report back (**CONFIRM** whether the app should call an endpoint when a
broadcast is opened).

---

## 9. How to test

1. Install a debug build on a real phone (iOS push does not work on the simulator), sign in as a test member, and check a row
   appears in `deviceTokens` for that member.
2. In the console (Membership > App registrations), register a new test member in the app, then **Approve** them. The office sees
   "Push notification sent to N phones". The phone should show the push, and tapping it should leave the waiting screen.
3. Return the video, then reject another test registration: the push should open the status screen with the reason.
4. Turn off the phone's notification permission and approve again: the console should say the member was emailed instead, and the
   status screen should still update by polling.
5. In Me > My information ask for a name change, then approve and decline from the console (Membership > Changes asked for).
6. Add a family relative from Me > Family and approve it (Membership > Family requests): both people should be told.
7. Archive an event in the console (Events > Events > Archive): it must disappear from the app on the next refresh.
8. Sign out and back in as someone else on the same phone: the first member must stop receiving pushes.

---

## 10. Questions to settle

1. Which notification types in section 4 are in the first release?
2. The Noah API endpoints for registering and archiving a device token, listing notifications and marking one read.
3. The value of `notifiable_type`, and whether `data` already has a fixed shape.
4. Who sends "new event" at publish time: a scheduled Catalyst job in the Noah API, or the console when the event is saved?
5. Should members be able to turn categories off (events, community, messages) in settings? If yes, where is the choice stored?
6. Quiet hours and language: are push texts translated into the member's language?
