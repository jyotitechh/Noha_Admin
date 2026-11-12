# Noahgram: posts the office creates in the Admin Console

For the Flutter developer (and whoever looks after the Noah API). The Admin Console lets the church office write a Noahgram
post that is not from a member: a notice, a picture, an event poster. This note says exactly what the console writes, so the
app shows it in the feed like any other post.

Member posts and reels (uploaded from the app) are a different path, already described in `FOR-CONSOLE-NOAHGRAM.md`. They wait for
approval in the console under **Media > Noahgram**. This note is only about **Media > Office posts and categories**.

## 1. What the office does

1. Opens **Media > Office posts and categories** and adds a post: a caption, an optional picture, an optional category, an
   optional link, an optional "Show on" date, "Pinned to the top", and the **Approved** switch.
2. The picture is either dropped from their computer (the console uploads it and stores its public link) or a pasted link.
3. The post is on the feed once **Approved** is on. Switching it off, or archiving it, takes it off the feed.

## 2. What the console writes (table `noahGram`, one new row)

| Column | Value the console writes | What the app should do |
|---|---|---|
| `caption` | the text (required) | show as the post text |
| `photo` | a plain `https://` link to the picture, or empty | show the picture from that link. **Not** `file:<id>`: do not look it up in `files`. |
| `link` | a web address, or empty | show as a tappable link under the caption (optional) |
| `category` | the id of a row in `noahGramCategory`, or empty | optional: filter or label by category |
| `scheduleDate` | a date and time, or empty | do not show before this time. Empty means show at once. |
| `isPinned` | true or false | pinned posts come first on the feed |
| `isApproved` | true or false | show only when **true** |
| `isArchived` | **not written** by the console, so it is empty (`null`) on a new post | treat empty as false; show only when it is not true |
| `createdOn` / `updatedOn` | when the console made or changed it | |

What the console does **not** write, so the app must tolerate it:

- `memberId` is **empty**. There is no author member. Show the church (name and logo from the app's own config), not "A member".
- `likes`, `comments` and `counter` (views) are **not set**, so they may be `null`. Treat `null` as 0. Members can like and comment on an
  office post exactly as on any other (`likes` and `comments` tables with `component = 2`, `componentId` = the post id).
- `cloudflareLink`, `videoImage` and `addToReels` are **not used**. The console cannot create a reel or a video post yet.
- No `files` row is created for the picture. It lives in the church's Catalyst Stratus bucket and the column holds its public link.

## 3. What the feed must do (for the Noah API and the app)

The feed query already exists for member posts. For office posts to appear it must treat them like this:

```
show a row when:   isApproved = true
              AND  isArchived is not true   (empty counts as false)
              AND  (scheduleDate is empty OR scheduleDate <= now)
order:             isPinned first, then newest first
picture:           if photo starts with "file:" -> the member-upload path (files row)
                   if photo starts with "https://" -> use the link as it is
author:            if memberId is empty -> the church, not a member
```

Points to confirm with the API developer, because the console cannot check them from its side:

1. **`scheduleDate`**: does the API honour it? The office is told "leave it empty to show it as soon as it is approved".
2. **Order**: is `isPinned` honoured, and which date orders the feed (`createdOn` is what the console writes; `CREATEDTIME` is Catalyst's own, in IST)?
3. **Empty `isArchived`**: a query written as `isArchived = false` drops these posts, because an empty value is not false. It must accept empty.
4. **Empty `memberId`**: does the feed endpoint return the post, or does a join on `members` drop it? It must return it.
5. **Plain links**: `FOR-CONSOLE-NOAHGRAM.md` says posts the office wrote with a plain `https://` link are shown. Please check that includes `photo`.
6. **`null` counts**: the feed must not fail when `likes`, `comments` or `counter` is `null`.

## 4. Flutter checklist

- The post model must allow: no author (`memberId` empty), `null` counts, `photo` as a web link, no video.
- Load the picture with a normal network image (cache it). The link is public and needs no token.
- Show the church name and logo as the author when there is no member.
- A pinned post is shown first. Show a small pin mark if you like.
- If `link` is present, make it tappable (open in the browser).
- Pull to refresh must pick up a post the office added a minute ago. The console does **not** send a push for an office post.
- Sharing: the share page (`<API base>/share/post/<id>`) should work for an office post too. It says "A post by ..."; for an office post
  it should say the church name, not a member.

## 5. Picture details

- Accepted by the console: JPEG, PNG, WebP or GIF, up to 5 MB.
- The link looks like `https://<bucket>-development.zohostratus.in/pictures/<year>/<random>.jpg` while the project is in Development,
  and `https://<bucket>.zohostratus.in/...` in Production. Pictures uploaded in Development keep their Development link after the move
  to Production, so treat the link as an opaque address and never rebuild it.
- The office may also paste a link to a picture hosted elsewhere. It must be `https://`.

## 6. How to test it end to end

1. In the console: **Media > Office posts and categories > Add**, caption "Test notice", drop a picture, switch **Approved** on, save.
2. In the app, refresh the Noahgram feed. The post should appear with the picture and the church as author.
3. In the console, switch **Approved** off. After a refresh it should be gone from the feed.
4. Add one with a **Show on** date in the future and Approved on. It must not appear until that time.
5. Like and comment on it from the app. Counts must start from zero without an error.

## 7. Where the console code is

`server/content-types.js` (the `noahgramPosts` definition: the fields above), `server/pictures.js` (picture upload and link),
`docs/CONTENT-TABLES.md` (the generated list of columns). Member posts and reels: `FOR-CONSOLE-NOAHGRAM.md`.
