# Translating the app's content with Zoho Translate

The office writes content once, in English. The console translates it with **Zoho Translate** (Zia, the Deluge task
`zoho.ai.translate`) into every language switched on in **Content > Languages**. It stores each translation in the
app's own Catalyst table, so the Noah app shows every member the content in the language they use.

| What | Translated |
|---|---|
| Daily Manna | title, message, prayer or confession |
| Daily Prayers | title, prayer |
| Confessions | title, confession |
| Dream dictionary | word or symbol, meaning |
| Bible commentary | title, commentary |

How the app reads them is in [FOR-FLUTTER-TRANSLATIONS.md](FOR-FLUTTER-TRANSLATIONS.md).

## Why a Deluge function

- Catalyst has no translation of its own. Its Zia services cover OCR, image moderation, text analytics and so on, but not
  translation.
- Zoho Translate has no public REST address. It exists only as the Deluge task `zoho.ai.translate`.

So a small Deluge function does the translating, and the console (on Catalyst AppSail) calls it over the web. Any Zoho app
that runs Deluge functions callable over the web can host it: Zoho CRM is the simplest. The function only translates; it
stores nothing.

```
Office saves in the console ──▶ console API (Catalyst AppSail) ──▶ the app's table (the original)
                                     │
                                     └─ for each language switched on ──▶ Deluge function ──▶ Zoho Translate
                                                                                │
                           the same table: one row per language ◀──────────────┘
Noah app ──▶ Noah API (Catalyst functions) ──▶ the row in the member's language, or the original
```

## 1. Make the function (Zoho CRM, about 10 minutes)

1. In Zoho CRM go to **Setup > Developer Hub > Functions > + New Function**.
2. Fill in the function:
   - Function name: `translate_text`
   - Display name: `Translate text`
   - Category: **Standalone**
3. Under **Edit arguments**, add three arguments, all of type **String**: `text`, `target` and `source`.
4. Paste this as the body and **Save**:

```deluge
// Zoho Translate (Zia) for the Karuna Sadan console.
//   in : text, target (two-letter code, e.g. kn, hi, ta), source (two-letter code; blank = en)
//   out: { "translated": "..." }   or, on a problem, { "error": "..." }
srcLang = "en";
if(source != null && source.trim() != "")
{
	srcLang = source.trim();
}
if(text == null || text.trim() == "" || target == null || target.trim() == "")
{
	return {"error":"text and target are required"};
}
response = zoho.ai.translate(text, target.trim(), srcLang);
translated = response.get("translation").get(0).get("translate");
if(translated == null || translated == "")
{
	return {"error":"Zoho Translate returned nothing","detail":response.toString()};
}
return {"translated":translated};
```

5. Check it with **Save & Execute** using text `Peace, be still.`, target `kn` and source `en`. The answer should hold
   Kannada script.
6. Repeat the check for each language you plan to switch on: `hi`, `mr`, `te`, `ml`, `ta`. Zoho's own pages differ on
   which languages it covers, and this test settles it.

## 2. Publish it as a REST API

1. On the function, open **...** > **REST API**.
2. Turn on **API Key**.
3. Copy the URL. It looks like
   `https://www.zohoapis.in/crm/v7/functions/translate_text/actions/execute?auth_type=apikey&zapikey=...`

The URL holds a key. Keep it out of chats and out of the repository.

## 3. Give it to the console

Add the URL to `.env.local`, which is never committed:

```
ZOHO_TRANSLATE_URL=<the URL from step 2>
```

Then deploy the API as usual:

```
npm run deploy:api -- --email-codes
```

The deploy carries the setting to AppSail. Until the URL is set, content saves exactly as before and
**Content > Languages** says translation is not connected.

If you host the function somewhere other than Zoho CRM:

| Setting | When |
|---|---|
| `ZOHO_TRANSLATE_FORMAT=json` | The function takes the JSON `{text, target, source}` as its body, as Zoho Creator, Zoho Flow or another gateway do. The default, `crm`, sends it the way Zoho CRM wants: one form field named `arguments`. |
| `ZOHO_TRANSLATE_HEADERS={"Authorization":"..."}` | The function wants a token in a header instead of a key in the URL. This is a secret: put it in `.env.local` only. |

## 4. Choose the languages

In **Content > Languages**:

1. Switch on each language you want: Hindi, Marathi, Telugu, Malayalam, Tamil or Kannada.
2. Press **Translate everything** to translate what was written before. It runs in the background, and the screen shows
   how far it has got.

From then on, every save translates into every language that is on.

Until someone first saves a choice there, the console translates into the languages in `CONTENT_TRANSLATE_TO`
(default `kn`). The choice is kept in Catalyst, in the app's `globalSettings` table, as the row with keyCol
`console.translateTo` and value `kn,hi`. It therefore survives deploys.

## How it behaves

- **Saving a new entry** makes one translation per language. Each is a draft or live, like the original.
- **Editing the original** translates again only the texts that changed. A correction the office made to a translation by
  hand therefore survives an edit to another text.
- **Publishing or taking down the original** does the same to its translations.
- **Translate again**, in an entry's editor, translates every text afresh. It replaces corrections made by hand.
- **Deleting the original** deletes its translations too.
- **Correcting a translation:** open it in the list (it carries the **Translated** label), edit it and save. Editing a
  translation never sends it back to Zoho.
- **A failure never stops the original being saved.** The message says what went wrong, and the app shows that member the
  original.
- **Switching a language off** stops new translations into it. The ones already made stay until their original is deleted.
- **Formatting:** each paragraph, heading or list item is translated as a whole, so a sentence is never cut in two. Bold
  and italic inside a paragraph are not carried over.
- **Long text:** a paragraph of more than 3,000 characters goes to Zoho in pieces, cut at the ends of sentences. Zoho does
  not publish its own limit.
- **Speed:** three languages are translated at once.
- **Cost:** every call counts against the hosting Zoho app's function and external-call limits. A paragraph is one call per
  language.

## Quality

Machine translation can sound awkward, especially in Indian languages, and Zoho itself says results may not be accurate.

Scripture quoted in a message will not come out in the approved published wording of each language. Have a native speaker
read each language before it goes live, and correct the translation in the console where needed.

## Adding a language later

1. In `server/translate.js`, add one line to `TRANSLATION_LANGUAGES` with:
   - the next number (8, 9 and so on);
   - the language's two-letter code from
     [Zoho's list](https://www.zoho.com/deluge/help/ai-tasks/translate.html);
   - its name.
2. Give the app the same number (see FOR-FLUTTER-TRANSLATIONS.md).
3. Deploy, then switch the language on in **Content > Languages**.

Urdu or Arabic would also need the app to show them right to left.
