# For the Noah app and the Noah API: showing content in the member's language

From the console team, 23 November 2026.

The office writes content once, in English. The console translates it with **Zoho Translate** into the languages the
office switches on (Content > Languages) and stores every translation in the **same Catalyst table** as the original.
The app does not translate anything. It asks for the member's language and shows what comes back.

Translated today:

| Content | Table | Texts that are translated |
|---|---|---|
| Daily Manna | `dailyMana` | `title`, `content`, `prayer` |
| Daily Prayers | `dailyPrayers` | `title`, `content` |
| Confessions | `dailyConfessions` | `title`, `content` |
| Dream dictionary | `dreamDictionary` | `title`, `content` |
| Bible commentary | `bibleCommentary` | `title`, `content` |

## 1. Languages

`contentLanguage` is a number. The two-letter code is what a phone reports and what Zoho uses.

| Number | Code | Language |
|---|---|---|
| 1 | `en` | English |
| 2 | `hi` | Hindi |
| 3 | `mr` | Marathi |
| 4 | `te` | Telugu |
| 5 | `ml` | Malayalam |
| 6 | `ta` | Tamil |
| 7 | `kn` | Kannada |

More may be added later with the next number (8, 9…). The console team will tell you the number and code. An unknown
number must simply show the original.

## 2. How a translation is stored

A translation is its own row in the same table:

| Column | On the original | On a translation |
|---|---|---|
| `translatingParentId` | empty | the original's `ROWID` |
| `contentLanguage` | usually 1 | the language's number, e.g. 7 |
| translated texts (table above) | the original text | the translated text |
| everything else (date, category, picture, partners only, published, embeds, writer) | as set | copied from the original, kept in step |
| `likes`, `comments`, counters | the real counts | 0. **Do not use them.** |

There is at most one translation per original per language. Treat an empty `translatingParentId` as "this is an
original". Keep ids as Strings.

## 3. The rule for the Noah API

**List and count the originals only. Swap in the translated texts per item.**

For a member asking in language `L`:

1. Select the rows exactly as today (published, dates, partners only, not archived), but only the originals: those with
   an empty `translatingParentId`.
2. For each original, look for a row with `translatingParentId = original.ROWID` and `contentLanguage = L`.
3. If there is one, return the original's item with **that row's texts** (`title`, `content`, `prayer`).
4. If there is none, return the original's texts, and mark `fallback: true` with a reason (section 4).
5. Always return the **original's `id`**. Likes, comments, shares, bookmarks, deep links and push targets all use the
   original's id, so a member's like counts whichever language they read in.
6. An original that is itself written in `L` (`contentLanguage = L`) is shown as it is.

> **Do not** filter the list by `contentLanguage = L` and fall back to English only when the list is empty. If you do, a
> Kannada reader loses every entry that is not translated yet. The fallback must be decided **per item**.

The published state, publish date and partners only flag are kept the same on the translation as on the original, but
always decide visibility from the **original**.

In ZCQL the lookup is one query per screen. With the originals' ids in hand:

```sql
SELECT ROWID, translatingParentId, title, content, prayer FROM dailyMana
WHERE translatingParentId IN ('<id1>', '<id2>', ...) AND contentLanguage = 7
```

ZCQL returns at most 300 rows a query and takes at most five `WHERE` conditions, so page the `IN` list.

## 4. What to return (suggested)

Add these to each item:

```json
{ "id": "27145000000123456", "title": "ದೇವರ ಶಾಂತಿ", "content": "<p>…</p>", "prayer": "<p>…</p>",
  "language": 7, "requestedLanguage": 7, "fallback": false }
```

When the item is not in the member's language:

```json
{ "id": "27145000000123457", "title": "The peace of God", "content": "<p>…</p>",
  "language": 1, "requestedLanguage": 7, "fallback": true, "reason": "not_translated_yet" }
```

| `reason` | Meaning |
|---|---|
| `not_offered` | The office translates nothing into this language. |
| `not_translated_yet` | The language is on, but this item has no translation yet (or the translation failed). |

**Never show the member an error for a missing translation.** Show the original. A small "Shown in English" line is
optional.

Which languages are on: Catalyst table `globalSettings`, row `keyCol = 'console.translateTo'`, value such as `kn,hi`
(codes). An endpoint for the app could be:

```
GET /content/languages   ->  { "source": { "code": "en", "number": 1, "name": "English" },
                               "languages": [ { "code": "kn", "number": 7, "name": "Kannada", "native": "ಕನ್ನಡ" } ] }
```

## 5. The app

- **Which language.** Default to the phone's language and keep only the two-letter code: in Flutter,
  `PlatformDispatcher.instance.locale.languageCode` gives `ta` for `ta-IN`. Offer a language picker in settings,
  remember the choice, and send it instead of the phone's language from then on.
- **Sending it.** Send `lang` on every content call, as the number (`lang=7`) or the code (`lang=kn`); the API should
  accept both. Send it when the device registers too, so a push can later go out in the member's language.
- **Showing it.** Show `title`, `content` and `prayer` as today. They are HTML from the editor (FOR-FLUTTER-CONTENT.md),
  and a translation keeps the same tags. If `fallback` is true, still show the text: it is the original.
- **Fonts.** The texts arrive in Devanagari, Telugu, Malayalam, Tamil and Kannada scripts. Check each renders on a plain
  Android phone (Noto Sans covers them all).
- **Right to left.** None of today's languages needs it. If Urdu or Arabic is added later, show those right to left.

## 6. How to check it

1. In the console, open **Content > Languages**, switch on **Kannada** and press **Translate everything**.
2. In **Content > Daily Manna**, add an entry for today in English, published. After saving, the message says the
   Kannada translation was added. The list shows it with the label **Translated**.
3. Set a test phone to Kannada, or pick Kannada in the app's settings, and open the Daily Manna. Today's message must show
   in Kannada.
4. Switch the phone to Tamil while Tamil is off. The same entry must show in English, with `fallback: true`.
5. Like the entry in Kannada, then switch to English. The like must still be there, because it is on the original's id.
6. In the console, correct a word in the Kannada entry and save. After a refresh the app shows the correction.
7. Take the English entry down. The Kannada one must disappear from the app too.
