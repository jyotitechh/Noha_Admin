# Daily Manna in Kannada: setting up the Zoho translation

When the office saves a Daily Manna entry, the console translates its title, message and prayer into Kannada with Zoho's
Deluge translate task (`zoho.ai.translate`, https://www.zoho.com/deluge/help/ai-tasks/translate.html) and saves the
result as its own Daily Manna entry for the same day: language **Kannada (`contentLanguage` 7)**, `translatingParentId`
pointing at the English entry. The app already shows a member the entry in their language and falls back to English.

Deluge runs only inside a Zoho product, so the console calls a small Deluge function published as a REST API. One-time
setup, about 10 minutes, in **Zoho CRM**:

## 1. Make the function

Zoho CRM > **Setup** > **Developer Hub** > **Functions** > **+ New Function**.

* Function name: `translate_text` · Display name: `Translate text` · Category: **Standalone**
* **Edit arguments**: add three, all of type **String**: `text`, `target`, `source`
* Paste this as the body and **Save**:

```
if(isNull(source) || source == "")
{
	source = "en";
}
response = zoho.ai.translate(text, target, source);
return response.get("translation").get(0).get("translate");
```

* Check it with **Save & Execute**: text `Peace, be still.`, target `kn`, source `en`. The output should be Kannada script.
  (Zoho's own pages disagree on whether Kannada is supported; this one test settles it.)

## 2. Publish it as a REST API

On the function: **...** > **REST API** > turn on **API Key** > copy the URL. It looks like
`https://www.zohoapis.in/crm/v7/functions/translate_text/actions/execute?auth_type=apikey&zapikey=...`

The URL holds a key: keep it out of chats and the repository.

## 3. Give it to the console

In `.env.local` (never committed):

```
ZOHO_TRANSLATE_URL=<the URL from step 2>
CONTENT_TRANSLATE_TO=kn
```

Then deploy the API as usual (`npm run deploy:api -- --email-codes`); the deploy carries both settings.
`CONTENT_TRANSLATE_TO` takes more languages later, comma-separated: `kn,hi,mr` (Hindi 2, Marathi 3, Telugu `te` 4,
Malayalam `ml` 5, Tamil `ta` 6).

## How it behaves

* **Save** (new entry): the Kannada entry is made, as a draft or live like the English one. The message says so.
* **Edit the English**: only the texts that changed are translated again, so a correction the office made to the Kannada
  entry by hand survives. Publishing or taking down the English does the same to the Kannada.
* **Translate again** (in the entry's editor): translates every text afresh, replacing corrections made by hand.
* **Delete the English**: its Kannada entry is deleted with it.
* A translation that fails never stops the English entry being saved; the message says what went wrong.
* Each paragraph is translated as a whole; bold and italic inside a paragraph are not carried into the Kannada.
* Each paragraph is one call to the function, and each call counts against Zoho CRM's function / external-call limits
  for your plan.
