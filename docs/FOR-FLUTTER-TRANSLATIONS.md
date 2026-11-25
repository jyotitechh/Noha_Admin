# Content in the member's language: what the Noah app and the Noah API need to do

From the console team, 25 November 2026. For the developer of the Noah app (Flutter) and of the Noah API (`noah_api` on
Catalyst).

## In short

- The office writes content **once, in English**, in the admin console.
- When they press **Save** or **Publish**, the console translates it with **Zoho Translate** into **Hindi, Marathi,
  Telugu, Malayalam, Tamil and Kannada**, the languages the app offers. It takes a minute or two, in the background.
- Each translation is stored as **its own row in the same Catalyst table** as the English original.
- **The app translates nothing.** It sends the member's language; the API answers each item in that language, or in
  English when there is no translation.
- Older content has been translated too. The few entries not yet in every language are filled in by the console by
  itself; until then the API shows them in English (section 4, step 4).

> **Do this first.** The tables now hold, for each entry, the English original **and up to six translated copies**. An
> API that lists every row will show each Daily Manna, prayer and confession **up to seven times**. Section 3, step 1
> (list the originals only) fixes that, even before the rest is built.

## 1. What is translated

| Content | Table | Texts that are translated |
|---|---|---|
| Daily Manna | `dailyMana` | `title`, `content`, `prayer` |
| Daily Prayers | `dailyPrayers` | `title`, `content` |
| Confessions | `dailyConfessions` | `title`, `content` |
| Dream dictionary | `dreamDictionary` | `title`, `content` |
| Bible commentary | `bibleCommentary` | `title`, `content` |

Not translated (shown as they are): banners, announcements, Noahgram, Noah Tube, Bible school and courses.

## 2. Languages

`contentLanguage` is a number. The two-letter code is what a phone reports.

| Number | Code | Language | Written as |
|---|---|---|---|
| 1 | `en` | English | English |
| 2 | `hi` | Hindi | हिन्दी |
| 3 | `mr` | Marathi | मराठी |
| 4 | `te` | Telugu | తెలుగు |
| 5 | `ml` | Malayalam | മലയാളം |
| 6 | `ta` | Tamil | தமிழ் |
| 7 | `kn` | Kannada | ಕನ್ನಡ |

All six are always translated into; the office does not switch languages on or off. A language may be added later with
the next number (8, 9…); the console team will tell you. **An unknown number must simply show the English.**

## 3. How a translation is stored

A translation is its own row in the same table:

| Column | On the original | On a translation |
|---|---|---|
| `translatingParentId` | empty | the original's `ROWID` |
| `contentLanguage` | 1 (English) | the language's number, e.g. 7 |
| translated texts (section 1) | the English text | the translated text |
| everything else (date, category, picture, partners only, published, embeds, writer) | as set | copied from the original, kept in step |
| `likes`, `comments`, counters | the real counts | 0. **Do not use them.** |

- At most **one** translation per original per language.
- An empty `translatingParentId` means "this is an original". Keep ids as Strings.
- When the office edits, publishes, takes down or deletes the original, the console does the same to its translations.
- The office may correct a translation by hand in the console; that row is then simply the better text.

## 4. The Noah API

**List and count the originals only. Swap in the translated texts item by item.**

For a member asking in language `L`:

1. Select the rows exactly as today (published, dates, partners only, not archived), **but only the originals**: an
   empty `translatingParentId`.
2. For each original, look for the row with `translatingParentId = original.ROWID` and `contentLanguage = L`.
3. If there is one, return the original's item with **that row's texts** (`title`, `content`, `prayer`).
4. If there is none (just saved and still being translated, or Zoho failed), return the English texts with
   `fallback: true`.
5. Always return the **original's `id`**. Likes, comments, shares, bookmarks, deep links and push targets all use the
   original's id, so a like counts whichever language the member read in.
6. If `L` is English (1), or missing, or unknown: return the originals as today.

> **Do not** filter the list by `contentLanguage = L`. A member would then lose every entry not translated yet. The
> fallback is decided **per item**.

Decide visibility (published, date, partners only) from the **original**, not the translation.

In ZCQL, one extra query per screen, with the originals' ids in hand:

```sql
SELECT ROWID, translatingParentId, title, content, prayer FROM dailyMana
WHERE translatingParentId IN ('<id1>', '<id2>', ...) AND contentLanguage = 7
```

ZCQL returns at most 300 rows a query and takes at most five `WHERE` conditions, so page the `IN` list.

### What to return

Add `language`, `requestedLanguage` and `fallback` to each item:

```json
{ "id": "27145000000123456", "title": "ದೇವರ ಶಾಂತಿ", "content": "<p>…</p>", "prayer": "<p>…</p>",
  "language": 7, "requestedLanguage": 7, "fallback": false }
```

```json
{ "id": "27145000000123457", "title": "The peace of God", "content": "<p>…</p>", "prayer": "<p>…</p>",
  "language": 1, "requestedLanguage": 7, "fallback": true }
```

**Never answer with an error for a missing translation.** Show the English.

Optional, for the app's language picker:

```
GET /content/languages  ->  { "source": { "code": "en", "number": 1, "name": "English" },
                              "languages": [ { "code": "hi", "number": 2, "name": "Hindi", "native": "हिन्दी" }, ... ] }
```

(The list is fixed: the table in section 2.)

## 5. The Flutter app

- **Which language.** Use the language the member chose in the app. Until they choose, use the phone's language, two
  letters only: `PlatformDispatcher.instance.locale.languageCode` gives `ta` for `ta-IN`. A phone language not in
  section 2 means English.
- **Sending it.** Send it on every content call: `?lang=7` or `?lang=kn` (the API should accept both). Also send it when
  the device registers, so a notification can later go out in the member's language.
- **Changing it.** When the member changes the language in settings, reload the content screens that are open (or clear
  their cache), so the new language shows at once.
- **Showing it.** Show `title`, `content` and `prayer` as today. They are HTML from the console's editor, and a
  translation keeps the same tags. When `fallback` is true, still show the text (it is the English); a small
  "Shown in English" line is optional.
- **Fonts.** Devanagari, Telugu, Malayalam, Tamil and Kannada scripts. Check each on a plain Android phone; Noto Sans
  covers them all.
- **Caching.** Cache per language (the key includes `lang`), or a member who switches language sees the old one.
- **Right to left.** None of these languages needs it.

## 6. How to check it

1. Console: **Content > Daily Manna**, add an entry for today in English and **Save and publish**. The console says it is
   being translated; a minute or two later the list shows six more rows labelled **Translated**.
2. App, phone or app language **English**: today's entry shows **once**, in English.
3. Switch the app to **Kannada**: the same entry shows in Kannada, still once. Repeat for Hindi, Marathi, Telugu,
   Malayalam and Tamil.
4. Straight after saving a new entry (before the translations are made), the app in Tamil shows it in English with
   `fallback: true`, then in Tamil a minute or two later.
5. Like the entry in Kannada, switch to English: the like is still there (it is on the original's id).
6. Console: correct a word in the Kannada row and save. After a refresh the app in Kannada shows the correction.
7. Console: take the English entry down. It disappears from the app in every language.
8. Phone language that is not in the list (e.g. French): the app shows English.
