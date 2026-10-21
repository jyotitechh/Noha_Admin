# What the Catalyst content tables need

The console can author the Daily Manna, daily prayers, confessions, the dream
dictionary, Noahgram, Noah Tube, the Bible school and the courses. It saves each
to a Catalyst table. **Most of those tables are empty shells**: they exist, with
Catalyst's four system columns (`ROWID`, `CREATORID`, `CREATEDTIME`,
`MODIFIEDTIME`) and nothing else, so a save is refused until the columns are
added. Noah Tube's two tables do not exist at all.

This is the list for the Catalyst developer. It is generated from the console's
own definitions (`server/content-types.js`), so it is exactly what the console
sends. Column names are the ones the client's Laravel backend uses
(`noah-estone-dev`), because the Noah app reads them by those names.

## Before you start

- **Catalyst allows 191 tables a project, and this project has 191.** The two
  Noah Tube tables below need creating, which means removing or repurposing a
  table that nothing uses (an empty shell for something not yet built).
- **Every column is optional in Catalyst**, so "required" below is enforced by
  the console, not by the table.
- **Text length.** `varchar` is 255 characters; `text` is up to 10,000. The
  console refuses anything longer before it is sent.
- **Dates** are `YYYY-MM-DD`; `boolean` columns take true / false.
- **`ref` columns** hold the `ROWID` of a row in another table, as a bigint.
  ROWIDs are larger than JavaScript's safe integer, so the console sends and
  reads them as strings.
- **Which columns are *new*.** The Laravel backend stored a picture as an uploaded
  file. The console cannot upload to Catalyst File Store (its token has no
  file-write scope), so it stores a **link** instead, in an `imageUrl` column
  that the original does not have. They are marked below. If the Noah app should
  show these pictures, it needs to read that column.

## How it is wired

The console finds each table **by name**, from the project's table list, so
renaming or rebuilding one is fine as long as the name is the one below. When a
save is refused the console shows Catalyst's message and, for the editor, points
here.

`npm run check:schema` checks the member tables. It does not yet check these;
after adding the columns, open each screen in the console and save a test entry.


---

## Content: What the Noah app reads each day.

### Daily Manna: table `dailyMana`

Exists. **Checked: an empty shell**, with only the four system columns.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `publishDate` | date | required |
| `categoryId` | bigint | the `ROWID` of a row in `dailyMannaCategories` |
| `text` | text | required |
| `content` | text | required |
| `prayer` | text | required |
| `language` | varchar(255) | one of en, hi, mr, ml, ta, te, kn |
| `imageUrl` | text | **new**: not in the Laravel backend |
| `showOnObituary` | boolean |  |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

### Manna categories: table `dailyMannaCategories`

Exists. Not checked; expected to be an empty shell too.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `description` | text |  |
| `color` | varchar(255) |  |
| `photo` | text |  |
| `publishStart` | date |  |
| `publishEnd` | date |  |
| `isArchived` | boolean |  |

### Daily Prayers: table `dailyPrayers`

Exists. **Checked: an empty shell**, with only the four system columns.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `content` | text | required |
| `language` | varchar(255) | one of en, hi, mr, ml, ta, te, kn |
| `startDate` | date |  |
| `endDate` | date |  |
| `imageUrl` | text | **new**: not in the Laravel backend |
| `showOnObituary` | boolean |  |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

### Confessions: table `dailyConfessions`

Exists. **Checked: an empty shell**, with only the four system columns.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `content` | text | required |
| `writerName` | varchar(255) |  |
| `language` | varchar(255) | one of en, hi, mr, ml, ta, te, kn |
| `publishDate` | date |  |
| `imageUrl` | text | **new**: not in the Laravel backend |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

### Dream dictionary: table `dreamDictionary`

Exists. **Checked: an empty shell**, with only the four system columns.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `content` | text | required |
| `categoryId` | bigint | the `ROWID` of a row in `dreamDictionaryCategory` |
| `contentLanguage` | varchar(255) | one of en, hi, mr, ml, ta, te, kn |
| `isFeatured` | boolean |  |
| `startDate` | date |  |
| `endDate` | date |  |
| `imageUrl` | text | **new**: not in the Laravel backend |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

### Dictionary categories: table `dreamDictionaryCategory`

Exists. Not checked; expected to be an empty shell too.

| Column | Type | Notes |
|---|---|---|
| `name` | varchar(255) | required |
| `description` | text |  |
| `photo` | text |  |
| `isArchived` | boolean |  |

---

## Media: Noahgram and Noah Tube.

### Noahgram posts: table `noahGram`

Exists. **Checked: an empty shell**, with only the four system columns.

| Column | Type | Notes |
|---|---|---|
| `caption` | text | required |
| `categoryId` | bigint | the `ROWID` of a row in `noahGramCategory` |
| `imageUrl` | text | **new**: not in the Laravel backend |
| `date` | date | required |
| `commentLimit` | double |  |
| `likeLimit` | double |  |
| `enableTags` | boolean |  |
| `isApprove` | boolean | the "live" switch: members see the entry only while this is true |

### Noahgram categories: table `noahGramCategory`

Exists. Not checked; expected to be an empty shell too.

| Column | Type | Notes |
|---|---|---|
| `name` | varchar(255) | required |
| `backgroundColor` | varchar(255) | required |
| `isPublished` | boolean | the "live" switch: members see the entry only while this is true |

### Noah Tube videos: table `videos`

**The table does not exist** in the project. It has to be created.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `description` | text |  |
| `categoryId` | bigint | the `ROWID` of a row in `videoCategories` |
| `videoUrl` | text | required |
| `thumb` | text |  |
| `videoLength` | double |  |
| `featured` | boolean |  |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

### Noah Tube categories: table `videoCategories`

**The table does not exist** in the project. It has to be created.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `description` | text |  |
| `parentId` | bigint | the `ROWID` of a row in `videoCategories` |
| `publishStart` | date |  |
| `publishEnd` | date |  |

---

## School: The Bible school and its courses.

### Bible schools: table `bibleSchool`

Exists. **Checked: an empty shell**, with only the four system columns.

| Column | Type | Notes |
|---|---|---|
| `name` | varchar(255) | required |
| `description` | text |  |
| `startDate` | date |  |
| `endDate` | date |  |
| `donationAmount` | double |  |
| `order` | double |  |
| `youtubeId` | varchar(255) |  |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

### Courses: table `rowilCourseManagement`

Exists. **Checked: an empty shell**, with only the four system columns.

| Column | Type | Notes |
|---|---|---|
| `name` | varchar(255) | required |
| `category` | bigint | the `ROWID` of a row in `rowilCourseCategoryManagement` |
| `description` | text |  |
| `aboutCourse` | text |  |
| `author` | varchar(255) |  |
| `aboutAuthor` | text |  |
| `language` | varchar(255) | one of en, hi, mr, ml, ta, te, kn |
| `tags` | varchar(255) |  |
| `donationAmount` | double |  |
| `imageUrl` | text | **new**: not in the Laravel backend |
| `featured` | boolean |  |
| `publishedDate` | date |  |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

### Course categories: table `rowilCourseCategoryManagement`

Exists. Not checked; expected to be an empty shell too.

| Column | Type | Notes |
|---|---|---|
| `name` | varchar(255) | required |
| `description` | text |  |
| `parentId` | bigint | the `ROWID` of a row in `rowilCourseCategoryManagement` |

### Course sections: table `rowilCourseLessonGroupManagement`

Exists. Not checked; expected to be an empty shell too.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `courseId` | bigint | required; the `ROWID` of a row in `rowilCourseManagement` |
| `order` | double |  |

### Lessons: table `rowilCourseLessonManagement`

Exists. Not checked; expected to be an empty shell too.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar(255) | required |
| `groupId` | bigint | required; the `ROWID` of a row in `rowilCourseLessonGroupManagement` |
| `description` | text |  |
| `link` | text |  |
| `thumbnail` | text |  |
| `durationTime` | varchar(255) |  |
| `publishedDate` | date |  |
| `published` | boolean | the "live" switch: members see the entry only while this is true |

---

## Not covered yet

These exist in the Laravel backend and have Catalyst tables, but the console has
no screen for them yet: Noahgram polls and competitions, saved posts, Bible
school step content and quizzes, course lesson quizzes and tags, live videos,
Bible commentary and books. They need their columns too, and a screen each; say
which matter first.

## If it would help

The console could add these columns itself through the Catalyst connection it
already has, in the Development environment. That has not been done, because
these are the Catalyst developer's tables and the app's reads depend on exactly
what is in them. Say the word and it can be done from this list.
