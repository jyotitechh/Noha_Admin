# Daily content in the Noah app: what to build

For the Flutter developer. The admin console now lets staff author five kinds
of content, stored in the Catalyst project. This document says what is stored,
how the app should decide what to show, and which endpoints it needs.

| Content | Catalyst table | Where it appears in the app |
|---|---|---|
| Daily Manna | `dailyMana` (+ `dailyMannaCategories`) | Home, Daily Manna (`data/manna_data.dart`) |
| Daily Prayers | `dailyPrayers` | Home tab: Prayers (`data/word_data.dart`) |
| Confessions | `dailyConfessions` | Home tab: Confessions (`data/word_data.dart`) |
| Dream dictionary | `dreamDictionary` (+ `dreamDictionaryCategory`) | Dream dictionary |
| Banners | `dashboard` | Home carousel (`widgets/event_carousel.dart`) |
| Announcements | `ads` | Notices on Home |

---

## 1. Read this first: the app has no live content API yet

- Today these screens run on **hard-coded demo data** (`kMannas`, `kPrayers`,
  and so on).
- The Noah API (`noah-backend/functions/noah_api`) has **no content routes**.
  It has auth, registration, profile, chat, notifications and files, nothing
  for Manna, prayers, confessions, the dictionary, banners or announcements.
- The admin console's own `/api/app/manna`, `/banners` and `/announcements`
  are a **prototype on sample data**. Do not build against them.

So there are two jobs, and they can run in parallel:

1. **Backend (Catalyst developer):** add the read-only routes in section 4 to
   `noah_api`, in the same style as the existing ones (`requireAuth`,
   `X-Noah-Token`, JSON).
2. **App (you):** build the screens and models against the response shapes in
   section 4. Use `liveApi` / `kApiBase` as now and keep the demo data as the
   fallback until the routes exist.

The app must **never read Catalyst tables directly**. The tables need server
credentials, which cannot go in an app.

---

## 2. Rules every list follows

**Which rows to show.** A row is shown when all of these hold, evaluated on the
server in **IST** (UTC+05:30):

| Content | Show when |
|---|---|
| Manna | `published` is true **and** `publishDate` is today or earlier |
| Prayers | `published` is true **and** `publishedDate` is today or earlier |
| Confessions | `published` is true **and** `isConfession` is true **and** `publishDate` is today or earlier |
| Dictionary | `published` is true **and** `publishedDate` is today or earlier |
| Banners | `isArchived` is not true **and** (`expiryTime` is empty **or** today is on or before it) |
| Announcements | `isArchived` is not true |

A future `publishDate` means "scheduled": it must not be returned yet.

**Language.** `contentLanguage` is a number, not a code:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| English | Hindi | Marathi | Telugu | Malayalam | Tamil | Kannada |

Return the member's language and **fall back to English (1)** when there is no
entry for that day in theirs. All October 2026 content is English for now.

**Values to expect from Catalyst:**

- `ROWID` is the row id. It is a 17-digit number: **keep it as a `String`**.
  JavaScript and some JSON parsers lose precision on numbers that big.
- Booleans are `true`/`false` in some columns and `1`/`0` in others (for
  example `showOnObituary`). Treat `true`, `1` and `"1"` as true.
- A `date` column is `YYYY-MM-DD`. A `datetime` column is UTC
  `YYYY-MM-DD HH:mm:ss`. The dates the console writes into `datetime` columns
  (`publishedDate`, `expiryTime`) are always midnight, so treat them as a
  **calendar date and ignore the time**.
- Empty fields come back as `null` or `""`. Handle both.

**Formatted text is HTML.** The message, prayer, confession and dream meaning
are written in a rich-text editor (bold, italic, underline, strikethrough,
subscript, superscript, headings, lists, quotes and links). They are stored,
and must be returned, as **HTML**, limited to these tags:

`p br strong b em i u s strike sub sup h1 h2 h3 h4 ul ol li blockquote hr a`

- Links are `http`, `https`, `mailto` or `tel` only. The server removes
  everything else (scripts, styles, images, iframes), so the app does not need
  to sanitise, but it **must not run JavaScript** in the view that shows it.
- Render it with an HTML-to-widgets package such as `flutter_widget_from_html`
  or `flutter_html`, not a plain `Text`.
- **Older entries are plain text** with no tags (for example the entries
  seeded before the editor existed). Handle both: if the string has no `<`,
  show it as ordinary text and keep the line breaks.

**Embeds.** Each of these tables has `embed01` to `embed20`: extra media (a
link or embed code) the office attaches to an entry. The console stores whatever
is typed. Ask the team how the app should place them (see section 7).

**Cost.** Catalyst's free tier allows only **10,000 Data Store reads a month
for the whole account**, shared with the console. So:

- The app fetches once a day (or on pull-to-refresh) and **caches the result
  on the device**. Never poll.
- The server should cache each list for a few minutes.
- Return a page (for example 30 days of Manna), never a whole table.

---

## 3. What each table holds

Prayers, confessions and the dream dictionary also have `visibleTo` and
`embed01` to `embed20` (same meaning as for Manna). Confessions also have
`writerId`. In all four tables the text columns `content` and `prayer` hold
HTML (section 2).

### 3.1 Daily Manna: `dailyMana`

| Column | Type | Meaning |
|---|---|---|
| `ROWID` | bigint | id |
| `title` | text | title of the devotional |
| `publishDate` | date | the day it appears |
| `content` | text | the message, **as HTML**. The scripture reference is written inside this text, like "(Psalm 37:23)" |
| `prayer` | text | the closing prayer **or confession**, as HTML. `isConfession` says which |
| `isConfession` | boolean | false means the closing is a prayer, true means a confession. Use it for the heading above `prayer` |
| `writerId` | bigint | the `ROWID` of the member credited as the writer, in `members`. Empty when none |
| `visibleTo` | boolean | true means members only, false means everyone |
| `numberOfWords` | int | word count of `content`, filled in by the console. Use it for the reading time |
| `embed01` to `embed20` | text | extra media attached to the entry, see section 2 |
| `categoryIds` | text | the `ROWID` of a row in `dailyMannaCategories` (empty when none) |
| `contentLanguage` | int | 1 to 7, see section 2 |
| `image` | text | picture link (usually empty) |
| `showOnObituary` | int | 1 when it may be shown on obituary notices |
| `published` | boolean | live when true |

`dailyMannaCategories`: `ROWID`, `title`, `description`, `color` (hex like
`#0A6BFF`), `photo`, `contentLanguage`, `publishStart`, `publishEnd`,
`status` (active when true). Seeded: Faith, Prayer, Family, Hope, Gratitude,
Courage.

### 3.2 Daily Prayers: `dailyPrayers`

`ROWID`, `title`, `content` (the prayer), `contentLanguage`, `publishedDate`,
`image`, `showOnObituary`, `published`.

### 3.3 Confessions: `dailyConfessions`

`ROWID`, `title`, `content` (the confession), `prayer` (optional short
prayer), `contentLanguage`, `publishDate`, `image`, `published`,
`isConfession` (always true for rows the console writes).

### 3.4 Dream dictionary: `dreamDictionary`

`ROWID`, `title` (the word or symbol), `content` (the meaning),
`categoryId` (a `ROWID` in `dreamDictionaryCategory`), `contentLanguage`,
`isFeatured`, `publishedDate`, `image`, `published`.

`dreamDictionaryCategory`: `ROWID`, `name`, `description`, `photo`,
`contentLanguage`, `isArchived` (hide the category when true). Seeded:
Animals, Water and weather, People and body, Places and journeys, Objects.

The meanings are general interpretations, not doctrine. Show a short line in
the screen such as "Interpretations are for reflection and prayer."

### 3.5 Banners: `dashboard`

| Column | Type | Meaning |
|---|---|---|
| `ROWID` | bigint | id |
| `caption` | text | the banner's text |
| `landscapeImage` | text | link to the wide picture |
| `portraitImage` | text | link to the tall picture |
| `url` | text | where a tap should go |
| `expiryTime` | datetime | last day it shows (empty means no end) |
| `orderCol` | int | position in the carousel, **lowest first** |
| `contentLanguage` | int | 1 to 7 |
| `hideFromPublic` | boolean | when true, show only to signed-in members |
| `isArchived` | boolean | when true, do not show |

### 3.6 Announcements: `ads`

`ROWID`, `title`, `description` (the message), `link`, `image`, `type`,
`isArchived`, `createdOn`. Newest first.

`type` is a whole number whose meaning is not documented. **Ignore it** until
the Catalyst developer says what it means.

---

## 4. Endpoints the backend should add

All are `GET`, JSON, and use the same `X-Noah-Token` header as the rest of the
API. `lang` is the number from section 2 and defaults to the member's language.
The server applies the visibility rules in section 2, so the app never filters
by date or publish state itself.

### Daily Manna

```
GET /content/manna?lang=1&limit=30          the latest first, today's at the top
GET /content/manna/today?lang=1             today's, or the most recent if none today
GET /content/manna/categories?lang=1
```

```json
{
  "items": [
    {
      "id": "73626000000143001",
      "date": "2026-10-28",
      "title": "Finish well",
      "message": "I have fought the good fight ... (2 Timothy 4:7). Look back over this month ...",
      "prayer": "<p>Lord, thank You for this month. Lead me into the next. Amen.</p>",
      "closingType": "prayer",
      "writer": { "id": "73626000000097820", "name": "Michael Fernandes" },
      "membersOnly": false,
      "wordCount": 38,
      "embeds": ["https://youtu.be/abc", null, null],
      "category": { "id": "73626000000137005", "title": "Faith", "color": "#0A6BFF" },
      "language": 1,
      "image": null
    }
  ]
}
```

### Prayers and confessions

**Each of these two lists is made from two sources.** A Daily Manna ends in
either a prayer or a confession, chosen by its `isConfession` switch. The
Prayers tab shows:

1. the rows of `dailyPrayers`, and
2. the Daily Manna rows where `isConfession` is **false** (the Manna's `prayer`
   text is the prayer, the Manna's `title` and `publishDate` are its title and
   date).

The Confessions tab is the same with `dailyConfessions` and Manna rows where
`isConfession` is **true**. The console already shows it this way, with the
Manna-sourced rows marked "From Daily Manna". The server should merge the two
sources and apply the visibility rules to both, newest first. Each item says
where it came from in `source`, so the app can open the full Manna when a
member taps one that came from it:

```json
{ "id": "73626000000131036", "source": "manna", "date": "2026-10-30",
  "title": "The Lord is my light", "body": "<p>Lord, You are my light ...</p>" }
```

```
GET /content/prayers?lang=1&limit=30
GET /content/confessions?lang=1&limit=30
```

```json
{
  "items": [
    { "id": "73626000000143101", "date": "2026-10-28", "title": "Prayer for peace of mind",
      "body": "Lord, quiet my racing thoughts ...", "prayer": null, "language": 1, "image": null }
  ]
}
```

For a confession, `body` is the confession and `prayer` is the short prayer
(it may be `null`). For a prayer, `prayer` is always `null`.

### Dream dictionary

```
GET /content/dictionary?lang=1&category=<id>&q=<text>&limit=50
GET /content/dictionary/categories?lang=1
```

```json
{
  "items": [
    { "id": "73626000000143201", "title": "Snake", "meaning": "Often a warning ...",
      "categoryId": "73626000000137010", "featured": true, "language": 1, "image": null }
  ]
}
```

Featured entries come first, then alphabetical. `q` matches the title and the
meaning.

### Home: banners and announcements

```
GET /home/banners?lang=1
GET /home/announcements?lang=1
```

```json
{ "items": [
  { "id": "73626000000143301", "caption": "Welcome to October: a month of thanksgiving",
    "landscapeImage": null, "portraitImage": null, "url": null, "order": 1 }
] }
```

```json
{ "items": [
  { "id": "73626000000143401", "title": "October fasting and prayer",
    "message": "We are joining in a month of prayer and fasting together ...",
    "link": null, "image": null }
] }
```

Banners are sorted by `order`, lowest first. Announcements are newest first.

---

## 5. What to change in the app

**Models.** Replace the const demo data with models filled from the JSON
above. Keep `id` as a `String`.

```dart
class Manna {
  const Manna({required this.id, required this.date, required this.title,
    required this.message, required this.prayer, this.category});
  final String id;
  final DateTime date;
  final String title;
  final String message;   // includes the scripture reference
  final String prayer;
  final MannaCategory? category;

  /// Reading time, worked out here: the table does not store it.
  int get minutes => (message.split(RegExp(r'\s+')).length / 200).ceil().clamp(1, 20);

  factory Manna.fromJson(Map<String, dynamic> j) => Manna(
        id: j['id'] as String,
        date: DateTime.parse(j['date'] as String),
        title: j['title'] as String,
        message: j['message'] as String,
        prayer: (j['prayer'] as String?) ?? '',
        category: j['category'] == null ? null : MannaCategory.fromJson(j['category']),
      );
}
```

**The existing demo models do not match the table.** Decide these with the
design owner:

| App has | Table has | What to do |
|---|---|---|
| `Manna.verse` and `Manna.ref` as separate fields | none: the reference is **inside** `content` | Show `message` as one block. To show a verse card, the backend would need two new columns, `verse` and `reference` (the console can add the fields once the columns exist) |
| `Manna.minutes` | none | Work it out from the word count, as above |
| `Manna.daysAgo` | `publishDate` | Work it out from the date |
| `DailyPrayer.ref` | none | Drop it, or leave it blank |
| `titleKey` (a translation key) | `title` (already text in the content's language) | Show `title` directly. Content is translated by staff at publish time, not by the app |
| Banner `label`, `body`, `cta`, `icon`, colours | `caption`, two pictures, `url` | Draw a banner from the picture if there is one. If `landscapeImage` and `portraitImage` are empty (they are, for now), draw a plain gradient card with the `caption` |

**Behaviour.**

- "Today's Manna" is the first item of `/content/manna/today`.
- Pick `portraitImage` on phones and `landscapeImage` on wide screens, and fall
  back to the other when one is missing.
- A banner with a `url` opens it when tapped. A banner without one is not
  tappable.
- Cache every list on the device, refresh at most once a day or on
  pull-to-refresh, and show the cached copy when offline.
- Never show an empty screen with an error for a day that simply has no
  entry. Show the most recent one.

---

## 6. What is in Catalyst today (test data)

The October 2026 content is already loaded in the **Development** project:

| Table | Rows | Dates |
|---|---|---|
| `dailyMana` | 31, plus one old row titled "testing" (22 Oct) | one per day, 1 to 31 Oct 2026 |
| `dailyPrayers` | 31 | one per day, 1 to 31 Oct 2026 |
| `dailyConfessions` | 31 | one per day, 1 to 31 Oct 2026 |
| `dreamDictionary` | 25 | spread through October |
| `dailyMannaCategories` | 6 | |
| `dreamDictionaryCategory` | 5 | |
| `dashboard` (banners) | 4, no pictures yet | end 31 Oct 2026 |
| `ads` (announcements) | 4 | |

Everything is English (`contentLanguage` 1) and published. Every entry
published for a date after today is correctly hidden by the rules in section 2,
so it is a good test of the date filter.

The text is placeholder content written for testing. Staff will replace or
edit it in the admin console under **Content**.

---

## 7. Questions to settle with the team

1. **Who adds the routes in section 4?** They belong in `noah_api`. They return
   the text as HTML, `writer` as an id and a name (joined from `members`), and
   `embeds` as the non-empty `embedNN` values in order.
1. **How are embeds placed?** The console stores whatever is typed in
   `embed01` to `embed20`. The old app's rule for where each one appears in the
   text is not documented. Confirm it with whoever built the old app.
1. **`visibleTo`.** The console treats it as "true means members only, false
   means everyone". Confirm that matches the old app.
2. **Separate verse and reference?** Needed only if the design shows the
   scripture as its own card.
3. **Banner pictures.** The console takes a picture link and cannot upload a
   file yet. Where should the pictures live?
4. **`ads.type`.** What do its values mean?
5. **`hideFromPublic`.** Confirm it means "only signed-in members see it".
6. **Languages.** Who translates the content into the other six languages?

---

## Bible study (plans, steps, quiz)

Written by the console in Catalyst. No Noah API route reads them yet; the Catalyst developer adds them.

| Table | One row is | Columns the console writes |
|---|---|---|
| `bibleStudy` | a study plan | `name`, `description`, `type` (1 free for all, 2 only partners, 3 only with a donation), `donationAmount` (INR) and `donationAmountUSD` (only when `type` = 3, else empty), `maxStepsPerDay` (true = only one step a day), `photo`, `contentLanguage`, `status` (true = live), `createdOn`, `updatedOn` |
| `bibleStudyConnect` | a step of a plan | `bibleStudyId` (the plan's ROWID), `name`, `orderCol`, `description`, `verses`, `youtubeId`, `youtubeThumbnail`, `photo`, `contentLanguage`, `isArchived` (false), `created`, `updated` |
| `bibleStudyStepQuiz` | a quiz question of a step | `bibleStudyPlanId`, `bibleStudyStepId` (ROWIDs), `question`, `option1`..`option4`, `option1isAnswer`..`option4isAnswer` (true = valid answer, one or more), `isArchived` (false), `created`, `updated` |

- Plans, steps and questions are joined on **ROWID**, not on the legacy `id` column.
- `verses` is one text value: entries joined by `;`, each `bookIndex,Book,startChapter,startVerse,endChapter,endVerse` (book index 0 = Genesis, 65 = Revelation). Example: `2,Leviticus,1,2,2,3` is Leviticus 1:2 to 2:3.
- `youtubeId` is the 11-character video id; the console fills `youtubeThumbnail` with `https://img.youtube.com/vi/<id>/hqdefault.jpg` when it is left empty.
- Show a plan only when `status` is true; order steps by `orderCol`.
- Open questions: confirm the `type` numbers, and whether `maxStepsPerDay` true means "only 1".
