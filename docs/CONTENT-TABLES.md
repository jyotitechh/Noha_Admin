# What the console writes to each content table

Generated from `server/content-types.js` by `node server/gen-content-doc.mjs`. Do not edit by hand.

The console can author the Daily Manna, prayers, confessions, the dream dictionary,
Noahgram, Noah Tube, the Bible school and the courses. Each kind is saved to a table
in the Catalyst project, found **by name**. **Every field below is a real column of
that table**: they were matched to the project's own tables, which the Catalyst
developer built from the office's SQL schema (the same one the client's Laravel
backend, `noah-estone-dev`, uses). Nothing needs adding; `npm run catalyst:columns`
checks that, and only ever adds.

Things to know:

- **Languages** are stored as a number, from the Laravel config
  (`config/options.php`): 1 English, 2 Hindi, 3 Marathi, 4 Telugu, 5 Malayalam,
  6 Tamil, 7 Kannada.
- **Toggles** are a boolean in some tables and an int (1 or 0) in others; the console
  writes whichever the column is.
- **`ministryId`** is left empty. Every member row in the project has it empty, so
  this project does not use it. If the Noah API ever filters on it, content written
  here would not appear, and it would need setting.
- **Created and updated times** are written to the table's own columns
  (`created`/`updated` or `createdOn`/`updatedOn`) in UTC, as the Laravel
  backend did. `createdBy` and `writerId` are not set.
- **Pictures** are a link to the picture, in the table's picture column. Uploading a
  file from the console is not available yet.
- The Laravel admin had a few fields these tables do not: a scripture line on the
  Daily Manna, start and end dates on prayers, a writer's name on confessions,
  comment and like limits on Noahgram. They are not in the console, because there is
  nowhere to put them.

---

## Content: What the Noah app reads each day.

### Daily Manna: table `dailyMana`

The devotional the app opens on each day: the message and a prayer or confession.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Title | `title` | varchar | required |
| Published date | `publishDate` | date | required |
| Writer | `writerId` | bigint |  |
| Category | `categoryIds` | text | the id of a row in `dailyMannaCategories` |
| Language | `contentLanguage` | int | stored as its code number |
| Members only | `visibleTo` | boolean |  |
| Show on obituary notices | `showOnObituary` | int | stored as 1 or 0 |
| Message | `content` | text | required |
| Embed 01 | `embed01` | text |  |
| Embed 02 | `embed02` | text |  |
| Embed 03 | `embed03` | text |  |
| Embed 04 | `embed04` | text |  |
| Embed 05 | `embed05` | text |  |
| Embed 06 | `embed06` | text |  |
| Embed 07 | `embed07` | text |  |
| Embed 08 | `embed08` | text |  |
| Embed 09 | `embed09` | text |  |
| Embed 10 | `embed10` | text |  |
| Embed 11 | `embed11` | text |  |
| Embed 12 | `embed12` | text |  |
| Embed 13 | `embed13` | text |  |
| Embed 14 | `embed14` | text |  |
| Embed 15 | `embed15` | text |  |
| Embed 16 | `embed16` | text |  |
| Embed 17 | `embed17` | text |  |
| Embed 18 | `embed18` | text |  |
| Embed 19 | `embed19` | text |  |
| Embed 20 | `embed20` | text |  |
| The closing is a confession | `isConfession` | boolean |  |
| Prayer or confession | `prayer` | text | required |
| Picture | `image` | text |  |
| Published | `published` | boolean |  |

written on create: `created`; on change: `updated`. "live" means `published`.

### Manna categories: table `dailyMannaCategories`

The themes the Daily Manna is grouped under.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Name | `title` | varchar | required |
| Description | `description` | text |  |
| Colour | `color` | varchar |  |
| Picture | `photo` | text |  |
| Language | `contentLanguage` | int | stored as its code number |
| Shown from | `publishStart` | datetime | a date, stored as a datetime |
| Shown until | `publishEnd` | datetime | a date, stored as a datetime |
| Active | `status` | boolean | on by default |

written on create: `createdOn`; on change: `updatedOn`. "live" means `status`.

### Daily Prayers: table `dailyPrayers`

The prayer members are invited to pray with.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Title | `title` | varchar | required |
| Publish on | `publishedDate` | datetime | a date, stored as a datetime |
| Language | `contentLanguage` | int | stored as its code number |
| Members only | `visibleTo` | boolean |  |
| Show on obituary notices | `showOnObituary` | int | stored as 1 or 0 |
| Prayer | `content` | text | required |
| Embed 01 | `embed01` | text |  |
| Embed 02 | `embed02` | text |  |
| Embed 03 | `embed03` | text |  |
| Embed 04 | `embed04` | text |  |
| Embed 05 | `embed05` | text |  |
| Embed 06 | `embed06` | text |  |
| Embed 07 | `embed07` | text |  |
| Embed 08 | `embed08` | text |  |
| Embed 09 | `embed09` | text |  |
| Embed 10 | `embed10` | text |  |
| Embed 11 | `embed11` | text |  |
| Embed 12 | `embed12` | text |  |
| Embed 13 | `embed13` | text |  |
| Embed 14 | `embed14` | text |  |
| Embed 15 | `embed15` | text |  |
| Embed 16 | `embed16` | text |  |
| Embed 17 | `embed17` | text |  |
| Embed 18 | `embed18` | text |  |
| Embed 19 | `embed19` | text |  |
| Embed 20 | `embed20` | text |  |
| Picture | `image` | text |  |
| Published | `published` | boolean |  |

written on create: `created`; on change: `updated`. "live" means `published`.

### Confessions: table `dailyConfessions`

The daily confession of faith.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Title | `title` | varchar | required |
| Published date | `publishDate` | date |  |
| Writer | `writerId` | bigint |  |
| Language | `contentLanguage` | int | stored as its code number |
| Members only | `visibleTo` | boolean |  |
| Confession | `content` | text | required |
| Embed 01 | `embed01` | text |  |
| Embed 02 | `embed02` | text |  |
| Embed 03 | `embed03` | text |  |
| Embed 04 | `embed04` | text |  |
| Embed 05 | `embed05` | text |  |
| Embed 06 | `embed06` | text |  |
| Embed 07 | `embed07` | text |  |
| Embed 08 | `embed08` | text |  |
| Embed 09 | `embed09` | text |  |
| Embed 10 | `embed10` | text |  |
| Embed 11 | `embed11` | text |  |
| Embed 12 | `embed12` | text |  |
| Embed 13 | `embed13` | text |  |
| Embed 14 | `embed14` | text |  |
| Embed 15 | `embed15` | text |  |
| Embed 16 | `embed16` | text |  |
| Embed 17 | `embed17` | text |  |
| Embed 18 | `embed18` | text |  |
| Embed 19 | `embed19` | text |  |
| Embed 20 | `embed20` | text |  |
| Prayer | `prayer` | text |  |
| Picture | `image` | text |  |
| Published | `published` | boolean |  |

written on create: `created`; on change: `updated`. always written: `isConfession = true`. "live" means `published`.

### Dream dictionary: table `dreamDictionary`

What a dream may mean, entry by entry.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Word or symbol | `title` | varchar | required |
| Category | `categoryId` | bigint | the id of a row in `dreamDictionaryCategory` |
| Language | `contentLanguage` | int | stored as its code number |
| Members only | `visibleTo` | boolean |  |
| Feature it | `isFeatured` | boolean |  |
| Publish on | `publishedDate` | datetime | a date, stored as a datetime |
| Meaning | `content` | text | required |
| Embed 01 | `embed01` | text |  |
| Embed 02 | `embed02` | text |  |
| Embed 03 | `embed03` | text |  |
| Embed 04 | `embed04` | text |  |
| Embed 05 | `embed05` | text |  |
| Embed 06 | `embed06` | text |  |
| Embed 07 | `embed07` | text |  |
| Embed 08 | `embed08` | text |  |
| Embed 09 | `embed09` | text |  |
| Embed 10 | `embed10` | text |  |
| Embed 11 | `embed11` | text |  |
| Embed 12 | `embed12` | text |  |
| Embed 13 | `embed13` | text |  |
| Embed 14 | `embed14` | text |  |
| Embed 15 | `embed15` | text |  |
| Embed 16 | `embed16` | text |  |
| Embed 17 | `embed17` | text |  |
| Embed 18 | `embed18` | text |  |
| Embed 19 | `embed19` | text |  |
| Embed 20 | `embed20` | text |  |
| Picture | `image` | text |  |
| Published | `published` | boolean |  |

written on create: `created`; on change: `updated`. "live" means `published`.

### Dictionary categories: table `dreamDictionaryCategory`

How the dream dictionary is grouped.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Name | `name` | varchar | required |
| Description | `description` | text |  |
| Picture | `photo` | text |  |
| Language | `contentLanguage` | int | stored as its code number |
| Hidden (archived) | `isArchived` | boolean |  |

written on create: `createdOn`; on change: `updatedOn`. there is no draft state: an entry is simply there.

### Banners: table `dashboard`

The carousel at the top of the app’s home screen, in the order members swipe through it. A banner disappears after its end date.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Caption | `caption` | varchar | required |
| Landscape picture | `landscapeImage` | text |  |
| Portrait picture | `portraitImage` | text |  |
| Opens | `url` | text |  |
| Shown until | `expiryTime` | datetime | a date, stored as a datetime |
| Order | `orderCol` | int | whole number |
| Language | `contentLanguage` | int | stored as its code number |
| Hide from the public | `hideFromPublic` | boolean |  |
| Hidden (archived) | `isArchived` | boolean |  |

written on create: `created`; on change: `updated`. there is no draft state: an entry is simply there.

### Announcements: table `ads`

Notices shown to members in the app.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Title | `title` | varchar | required |
| Message | `description` | text |  |
| Link | `link` | text |  |
| Picture | `image` | text |  |
| Type | `type` | int | whole number |
| Hidden (archived) | `isArchived` | boolean |  |

written on create: `createdOn`; on change: `updatedOn`. there is no draft state: an entry is simply there.

---

## Media: Noahgram and Noah Tube.

### Noahgram posts: table `noahGram`

Posts on the Noahgram feed. A post is live once it is approved.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Caption | `caption` | text | required |
| Category | `category` | text | the id of a row in `noahGramCategory` |
| Picture | `photo` | text |  |
| Link | `link` | text |  |
| Show on | `scheduleDate` | datetime | a date, stored as a datetime |
| Pinned to the top | `isPinned` | boolean |  |
| Approved | `isApproved` | boolean |  |

written on create: `createdOn`; on change: `updatedOn`. "live" means `isApproved`.

### Noahgram categories: table `noahGramCategory`

The topics a Noahgram post is filed under.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Name | `name` | varchar | required |
| Background colour | `backgroundColor` | varchar | required |
| Background picture | `backgroundImage` | text |  |
| Icon | `icon` | text |  |
| Order | `orderCol` | int | whole number |
| Published | `isPublished` | int | stored as 1 or 0 |

written on create: `createdOn`; on change: `updatedOn`. "live" means `isPublished`.

### Noah Tube videos: table `videos`

The video library. Add a link to the video; uploading a file from here is not available yet.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Title | `title` | varchar | required |
| Description | `description` | text |  |
| Category | `categoryId` | bigint | the id of a row in `videoCategories` |
| Video link | `videoUrl` | text | required |
| Where it is hosted | `videoSourceType` | int | stored as its code number |
| Thumbnail link | `thumb` | text |  |
| Length (seconds) | `videoLength` | double |  |
| Language | `contentLanguage` | int | stored as its code number |
| Order | `orderCol` | int | whole number |
| Featured | `featured` | boolean |  |
| Hidden (archived) | `isArchived` | boolean |  |

written on create: `createdOn`; on change: `updatedOn`. there is no draft state: an entry is simply there.

### Noah Tube categories: table `videoCategories`

The shelves the videos sit on. A category can sit inside another.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Name | `title` | varchar | required |
| Description | `description` | text |  |
| Inside | `parentId` | bigint | the id of a row in `videoCategories` |
| Picture | `photo` | text |  |
| Language | `contentLanguage` | int | stored as its code number |
| Shown from | `publishStart` | datetime | a date, stored as a datetime |
| Shown until | `publishEnd` | datetime | a date, stored as a datetime |
| Active | `status` | boolean | on by default |

written on create: `createdOn`; on change: `updatedOn`. "live" means `status`.

---

## School: The Bible school and its courses.

### Bible schools: table `bibleSchool`

The Bible school levels members can enrol in.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Name | `name` | varchar | required |
| Description | `description` | text |  |
| Picture | `photo` | text |  |
| Language | `contentLanguage` | int | stored as its code number |
| Fee (₹) | `donationAmount` | double |  |
| Most steps a day | `maxStepsPerDay` | int | whole number |
| Publish on | `publishDate` | date |  |
| Published | `status` | int | stored as 1 or 0 |

written on create: `createdOn`; on change: `updatedOn`. "live" means `status`.

### Courses: table `rowilCourseManagement`

Courses, taught in lessons. A course is built from sections, and each section from lessons.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Name | `title` | varchar | required |
| Category | `category` | bigint | the id of a row in `rowilCourseCategoryManagement` |
| Short description | `description` | text |  |
| About the course | `aboutCourse` | text |  |
| Taught by | `author` | varchar |  |
| About the teacher | `aboutAuthor` | text |  |
| Language | `language` | int | stored as its code number |
| Tags | `tags` | varchar |  |
| Fee (₹) | `donationAmount` | double |  |
| Picture | `image` | text |  |
| Featured | `featured` | int | stored as 1 or 0 |
| Publish on | `publishedDate` | datetime | a date, stored as a datetime |
| Published | `published` | int | stored as 1 or 0 |

written on create: `createdOn`; on change: `updatedOn`. "live" means `published`.

### Course categories: table `rowilCourseCategoryManagement`

How the courses are grouped.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Name | `name` | varchar | required |
| Description | `description` | text |  |
| Inside | `parentId` | bigint | the id of a row in `rowilCourseCategoryManagement` |

written on create: `createdOn`; on change: `updatedOn`. there is no draft state: an entry is simply there.

### Course sections: table `rowilCourseLessonGroupManagement`

A course is split into sections, and each section holds its lessons.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Title | `name` | varchar | required |
| Description | `description` | text |  |
| Course | `courseId` | bigint | the id of a row in `rowilCourseManagement`; required |
| Order | `orderCol` | int | whole number |

written on create: `createdOn`; on change: `updatedOn`. there is no draft state: an entry is simply there.

### Lessons: table `rowilCourseLessonManagement`

The lessons a member watches or reads.

| Field | Column | Stored as | Notes |
|---|---|---|---|
| Title | `title` | varchar | required |
| Section | `groupId` | bigint | the id of a row in `rowilCourseLessonGroupManagement`; required |
| Description | `description` | text |  |
| Video or reading link | `link` | text |  |
| Thumbnail link | `thumbnail` | text |  |
| Length (seconds) | `durationTime` | int | whole number |
| Order | `orderCol` | int | whole number |
| Publish on | `publishedDate` | datetime | a date, stored as a datetime |
| Published | `published` | int | stored as 1 or 0 |

written on create: `createdOn`; on change: `updatedOn`. "live" means `published`.
