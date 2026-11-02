/* Everything the office can author, defined once.

   The server validates and stores from these, and the console draws its forms
   and tables from them (GET /api/content/types), so a field cannot exist in one
   and be missing from the other. Adding the next kind of content is a block
   here and nothing else.

   EVERY FIELD IS A REAL COLUMN of the Catalyst table named in `table`. They were
   matched to the project's own tables (the Catalyst developer built them from the
   office's SQL schema, which is the same as the client's Laravel backend,
   noah-estone-dev, that the Noah app was written against). A column that the
   table does not have is not a field here. Where Catalyst stores a value another
   way than the form shows it, the field says how:

     store: 'int'       a toggle is 1 or 0, a select or number is a whole number
                        (the language is the code 1 to 7, not 'en')
     store: 'datetime'  a date is stored as 'YYYY-MM-DD 00:00:00'

   `catalyst` is the column's type when it is not what the field's kind would
   suggest (a category id kept in a text column).

   `stamps` names the columns that record when a row was made and last changed,
   which the Laravel backend filled in and the app may sort by. `constants` are
   written on every new row.

   A few things the Laravel admin had, and the project's tables do not: a
   scripture line on the Daily Manna, start and end dates on prayers, a writer's
   name on confessions, comment and like limits on Noahgram. They are not here,
   because there is nowhere to put them. `ministryId` is left empty: every member
   row in the project has it empty, so this project does not use it. */

/** The seven languages content is written in. The stored value is the number. */
export const LANGUAGES = [
  { v: '1', l: 'English' }, { v: '2', l: 'Hindi' }, { v: '3', l: 'Marathi' },
  { v: '4', l: 'Telugu' }, { v: '5', l: 'Malayalam' }, { v: '6', l: 'Tamil' }, { v: '7', l: 'Kannada' },
];

export const SECTIONS = {
  content: { label: 'Content', desc: 'What the Noah app reads each day.' },
  media: { label: 'Media', desc: 'Noahgram and Noah Tube.' },
  school: { label: 'School', desc: 'The Bible school and its courses.' },
};

const lang = (key = 'contentLanguage', label = 'Language') =>
  ({ key, label, kind: 'select', options: LANGUAGES, store: 'int', hint: 'The language this is written in.' });
/* A picture: drop one from the computer, or paste a link. Stored as a web link either way (kind url);
   `picture` is what makes the form draw the drop box (server/pictures.js stores the upload). */
const image = (key = 'image', label = 'Picture', hint = 'Drop a picture here from your computer, or paste a link to one.') =>
  ({ key, label, kind: 'url', picture: true, hint });
const published = (key = 'published', label = 'Published', store) =>
  ({ key, label, kind: 'toggle', ...(store ? { store } : {}), hint: 'Members see it in the app once this is on.' });
const when = (key, label, extra = {}) => ({ key, label, kind: 'date', store: 'datetime', ...extra });
const rich = (key, label, extra = {}) => ({ key, label, kind: 'richtext', ...extra });
const writer = { key: 'writerId', label: 'Writer', kind: 'member', hint: 'The member credited as the author.' };
const membersOnly = { key: 'visibleTo', label: 'Members only', kind: 'toggle', hint: 'Off means everyone can see it.' };
/* embed01 to embed20: extra media (links or embed code) the app shows with the text. */
const embeds = () => Array.from({ length: 20 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { key: 'embed' + n, label: 'Embed ' + n, kind: 'textarea', rows: 2, group: 'Embeds' };
});
const STAMPS = { created: 'created', updated: 'updated' };
const STAMPS_ON = { created: 'createdOn', updated: 'updatedOn' };

/*  kind:   text | textarea | date | select | toggle | number | url | color | ref
    ref:    another type's id; the form offers that type's entries
    publish the column that means "live" (a toggle). Without it there is no
            publish step, and the entry is simply there. */

/** The 66 books, in order. A verse is stored as "index,Book,startChapter,startVerse,endChapter,endVerse". */
export const BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

/** How many chapters each of those books has, in the same order (1,189 in all). The books and their chapters never
    change, so this is fixed data and needs no third-party Bible service: Exodus offers 40, Psalms 150, Jude 1. */
export const CHAPTERS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24,
  22, 25, 29, 36, 10, 13, 10, 42, 150, 31,
  12, 8, 66, 52, 5, 48, 12, 14, 3, 9,
  1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6,
  4, 4, 5, 3, 6, 4, 3, 1,
  13, 5, 5, 3, 5, 1, 1, 1, 22,
];

/** A book's number as it is stored (Genesis is 1, Revelation is 66): what bibleCommentary.bibleBookId holds. */
export const bookOptions = () => BOOKS.map((b, i) => ({ v: String(i + 1), l: b }));

export const TYPES = [
  /* ================= content ================= */
  {
    id: 'manna', section: 'content', label: 'Daily Manna', singular: 'devotional', table: 'dailyMana',
    title: 'title', dateKey: 'publishDate', publish: 'published', stamps: STAMPS, wordCount: 'numberOfWords',
    intro: 'The devotional the app opens on each day: the message and a prayer or confession.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'publishDate', label: 'Published date', kind: 'date', required: true, hint: 'The day it appears in the app.' },
      writer,
      { key: 'categoryIds', label: 'Category', kind: 'ref', ref: 'mannaCategories', catalyst: 'text' },
      lang(),
      membersOnly,
      { key: 'showOnObituary', label: 'Show on obituary notices', kind: 'toggle', store: 'int' },
      rich('content', 'Message', { required: true }),
      ...embeds(),
      { key: 'isConfession', label: 'The closing is a confession', kind: 'toggle', hint: 'Off means it is a prayer.' },
      rich('prayer', 'Prayer or confession', { required: true }),
      image(),
      published(),
    ],
  },
  {
    id: 'mannaCategories', section: 'content', label: 'Manna categories', singular: 'category', table: 'dailyMannaCategories',
    title: 'title', dateKey: null, publish: 'status', stamps: STAMPS_ON,
    intro: 'The themes the Daily Manna is grouped under.',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'color', label: 'Colour', kind: 'color' },
      image('photo', 'Picture'),
      lang(),
      when('publishStart', 'Shown from'),
      when('publishEnd', 'Shown until'),
      { ...published('status', 'Active'), default: true },
    ],
  },
  {
    id: 'prayers', section: 'content', label: 'Daily Prayers', singular: 'prayer', table: 'dailyPrayers', fromManna: { confession: false },
    title: 'title', dateKey: 'publishedDate', publish: 'published', stamps: STAMPS,
    intro: 'The prayer members are invited to pray with.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      when('publishedDate', 'Publish on'),
      lang(),
      membersOnly,
      rich('content', 'Prayer', { required: true }),
      ...embeds(),
      image(),
      published(),
    ],
  },
  {
    id: 'confessions', section: 'content', label: 'Confessions', singular: 'confession', table: 'dailyConfessions', fromManna: { confession: true },
    title: 'title', dateKey: 'publishDate', publish: 'published', stamps: STAMPS, constants: { isConfession: true },
    intro: 'The daily confession of faith.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'publishDate', label: 'Published date', kind: 'date' },
      writer,
      lang(),
      membersOnly,
      rich('content', 'Confession', { required: true }),
      ...embeds(),
      image(),
      published(),
    ],
  },
  {
    id: 'dictionary', section: 'content', label: 'Dream dictionary', singular: 'entry', table: 'dreamDictionary',
    title: 'title', dateKey: 'publishedDate', publish: 'published', stamps: STAMPS,
    intro: 'What a dream may mean, entry by entry.',
    fields: [
      { key: 'title', label: 'Word or symbol', kind: 'text', required: true },
      { key: 'categoryId', label: 'Category', kind: 'ref', ref: 'dictionaryCategories' },
      lang(),
      membersOnly,
      { key: 'isFeatured', label: 'Feature it', kind: 'toggle', hint: 'Shown at the top of the dictionary.' },
      when('publishedDate', 'Publish on'),
      rich('content', 'Meaning', { required: true }),
      ...embeds(),
      image(),
      published(),
    ],
  },
  {
    id: 'dictionaryCategories', section: 'content', label: 'Dictionary categories', singular: 'category', table: 'dreamDictionaryCategory',
    title: 'name', dateKey: null, publish: null, stamps: STAMPS_ON,
    intro: 'How the dream dictionary is grouped.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      image('photo', 'Picture'),
      lang(),
      { key: 'isArchived', label: 'Hidden (archived)', kind: 'toggle' },
    ],
  },
  {
    id: 'banners', section: 'content', label: 'Banners', singular: 'banner', table: 'dashboard',
    title: 'caption', dateKey: 'expiryTime', publish: null, stamps: STAMPS,
    intro: 'The carousel at the top of the app’s home screen, in the order members swipe through it. A banner disappears after its end date.',
    fields: [
      { key: 'caption', label: 'Caption', kind: 'text', required: true },
      image('landscapeImage', 'Landscape picture', 'The wide picture, for tablets and wide screens. Drop one here or paste a link.'),
      image('portraitImage', 'Portrait picture', 'The tall picture, for phones. Drop one here or paste a link.'),
      { key: 'url', label: 'Opens', kind: 'url', hint: 'The web address a tap on the banner opens.' },
      when('expiryTime', 'Shown until', { hint: 'The last day it shows. Leave empty to show it until it is taken down.' }),
      { key: 'orderCol', label: 'Order', kind: 'number', store: 'int', hint: 'Where it sits in the carousel; lowest first.' },
      lang(),
      { key: 'hideFromPublic', label: 'Hide from the public', kind: 'toggle', hint: 'Only signed-in members see it.' },
      { key: 'isArchived', label: 'Hidden (archived)', kind: 'toggle', hint: 'Takes it out of the app without deleting it.' },
    ],
  },
  {
    id: 'announcements', section: 'content', label: 'Announcements', singular: 'announcement', table: 'ads',
    title: 'title', dateKey: null, publish: null, stamps: STAMPS_ON,
    intro: 'Notices shown to members in the app.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'description', label: 'Message', kind: 'textarea', rows: 5 },
      { key: 'link', label: 'Link', kind: 'url', hint: 'A web address the notice points to.' },
      image(),
      { key: 'type', label: 'Type', kind: 'number', store: 'int', hint: 'The notice kind the app understands. Leave empty if unsure.' },
      { key: 'isArchived', label: 'Hidden (archived)', kind: 'toggle', hint: 'Takes it out of the app without deleting it.' },
    ],
  },

  /* ================= media ================= */
  {
    id: 'noahgramPosts', section: 'media', label: 'Noahgram posts', singular: 'post', table: 'noahGram',
    title: 'caption', dateKey: 'scheduleDate', publish: 'isApproved', stamps: STAMPS_ON,
    intro: 'Posts on the Noahgram feed. A post is live once it is approved.',
    fields: [
      { key: 'caption', label: 'Caption', kind: 'textarea', required: true, rows: 5 },
      { key: 'category', label: 'Category', kind: 'ref', ref: 'noahgramCategories', catalyst: 'text' },
      image('photo', 'Picture'),
      { key: 'link', label: 'Link', kind: 'url', hint: 'A web address the post points to.' },
      when('scheduleDate', 'Show on', { hint: 'Leave empty to show it as soon as it is approved.' }),
      { key: 'isPinned', label: 'Pinned to the top', kind: 'toggle' },
      { key: 'isApproved', label: 'Approved', kind: 'toggle', hint: 'Members see it on the feed once it is approved.' },
    ],
  },
  {
    id: 'noahgramCategories', section: 'media', label: 'Noahgram categories', singular: 'category', table: 'noahGramCategory',
    title: 'name', dateKey: null, publish: 'isPublished', stamps: STAMPS_ON,
    intro: 'The topics a Noahgram post is filed under.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'backgroundColor', label: 'Background colour', kind: 'color', required: true },
      image('backgroundImage', 'Background picture'),
      image('icon', 'Icon'),
      { key: 'orderCol', label: 'Order', kind: 'number', store: 'int', hint: 'Where it sits in the list; lowest first.' },
      published('isPublished', 'Published', 'int'),
    ],
  },
  {
    id: 'tubeVideos', section: 'media', label: 'Noah Tube videos', singular: 'video', table: 'videos',
    title: 'title', dateKey: null, publish: null, stamps: STAMPS_ON,
    intro: 'The video library. Add a link to the video; uploading a file from here is not available yet.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 4 },
      { key: 'categoryId', label: 'Category', kind: 'ref', ref: 'tubeCategories' },
      { key: 'videoUrl', label: 'Video link', kind: 'url', required: true, hint: 'YouTube, Vimeo or a direct file link.' },
      {
        key: 'videoSourceType', label: 'Where it is hosted', kind: 'select', store: 'int',
        options: [{ v: '1', l: 'YouTube' }, { v: '2', l: 'Vimeo' }, { v: '3', l: 'Wistia' }],
      },
      image('thumb', 'Thumbnail link'),
      { key: 'videoLength', label: 'Length (seconds)', kind: 'number' },
      lang(),
      { key: 'orderCol', label: 'Order', kind: 'number', store: 'int', hint: 'Where it sits in its category; lowest first.' },
      { key: 'featured', label: 'Featured', kind: 'toggle', hint: 'Shown at the top of Noah Tube.' },
      { key: 'isArchived', label: 'Hidden (archived)', kind: 'toggle' },
    ],
  },
  {
    id: 'tubeCategories', section: 'media', label: 'Noah Tube categories', singular: 'category', table: 'videoCategories',
    title: 'title', dateKey: null, publish: 'status', stamps: STAMPS_ON,
    intro: 'The shelves the videos sit on. A category can sit inside another.',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'parentId', label: 'Inside', kind: 'ref', ref: 'tubeCategories', hint: 'Leave empty for a top-level shelf.' },
      image('photo', 'Picture'),
      lang(),
      when('publishStart', 'Shown from'),
      when('publishEnd', 'Shown until'),
      { ...published('status', 'Active'), default: true },
    ],
  },

  /* ================= school ================= */
  {
    id: 'bibleSchools', section: 'school', label: 'Bible schools', singular: 'school', table: 'bibleSchool',
    title: 'name', dateKey: 'publishDate', publish: 'status', stamps: STAMPS_ON,
    intro: 'The Bible school levels members can enrol in.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 5 },
      image('photo', 'Picture'),
      lang(),
      { key: 'donationAmount', label: 'Fee (₹)', kind: 'number', hint: 'Leave empty if it is free.' },
      { key: 'maxStepsPerDay', label: 'Most steps a day', kind: 'number', store: 'int' },
      { key: 'publishDate', label: 'Publish on', kind: 'date' },
      published('status', 'Published', 'int'),
    ],
  },
  {
    id: 'courses', section: 'school', label: 'Courses', singular: 'course', table: 'rowilCourseManagement',
    title: 'title', dateKey: 'publishedDate', publish: 'published', stamps: STAMPS_ON,
    intro: 'Courses, taught in lessons. A course is built from sections, and each section from lessons.',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', required: true },
      { key: 'category', label: 'Category', kind: 'ref', ref: 'courseCategories' },
      { key: 'description', label: 'Short description', kind: 'textarea', rows: 3 },
      { key: 'aboutCourse', label: 'About the course', kind: 'textarea', rows: 6 },
      { key: 'author', label: 'Taught by', kind: 'text' },
      { key: 'aboutAuthor', label: 'About the teacher', kind: 'textarea', rows: 4 },
      lang('language'),
      { key: 'tags', label: 'Tags', kind: 'text', hint: 'Separated by commas.' },
      { key: 'donationAmount', label: 'Fee (₹)', kind: 'number', hint: 'Leave empty if it is free.' },
      image(),
      { key: 'featured', label: 'Featured', kind: 'toggle', store: 'int' },
      when('publishedDate', 'Publish on'),
      published('published', 'Published', 'int'),
    ],
  },
  {
    id: 'courseCategories', section: 'school', label: 'Course categories', singular: 'category', table: 'rowilCourseCategoryManagement',
    title: 'name', dateKey: null, publish: null, stamps: STAMPS_ON,
    intro: 'How the courses are grouped.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'parentId', label: 'Inside', kind: 'ref', ref: 'courseCategories', hint: 'Leave empty for a top-level category.' },
    ],
  },
  {
    id: 'courseSections', section: 'school', label: 'Course sections', singular: 'section', table: 'rowilCourseLessonGroupManagement',
    title: 'name', dateKey: null, publish: null, stamps: STAMPS_ON,
    intro: 'A course is split into sections, and each section holds its lessons.',
    fields: [
      { key: 'name', label: 'Title', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'courseId', label: 'Course', kind: 'ref', ref: 'courses', required: true },
      { key: 'orderCol', label: 'Order', kind: 'number', store: 'int', hint: 'Where it sits in the course; lowest first.' },
    ],
  },
  {
    id: 'courseLessons', section: 'school', label: 'Lessons', singular: 'lesson', table: 'rowilCourseLessonManagement',
    title: 'title', dateKey: 'publishedDate', publish: 'published', stamps: STAMPS_ON,
    intro: 'The lessons a member watches or reads.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'groupId', label: 'Section', kind: 'ref', ref: 'courseSections', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 4 },
      { key: 'link', label: 'Video or reading link', kind: 'url' },
      image('thumbnail', 'Thumbnail link'),
      { key: 'durationTime', label: 'Length (seconds)', kind: 'number', store: 'int' },
      { key: 'orderCol', label: 'Order', kind: 'number', store: 'int', hint: 'Where it sits in its section; lowest first.' },
      when('publishedDate', 'Publish on'),
      published('published', 'Published', 'int'),
    ],
  },

  /* ================= Bible commentary ================= */
  {
    id: 'bibleCommentary', section: 'content', label: 'Bible commentary', singular: 'commentary', table: 'bibleCommentary',
    title: 'title', dateKey: null, publish: 'isPublished', stamps: STAMPS_ON, constants: { isArchived: false },
    /* The table keeps a first and a last chapter; a commentary here is one chapter, so the last is the first. */
    derive: { endChapter: 'startChapter' },
    columns: ['bibleBookId', 'startChapter'], sort: ['bibleBookId', 'startChapter'],
    intro: 'A commentary on one chapter of the Bible. Pick the book, then the chapter: only the chapters that book has are offered.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'bibleBookId', label: 'Book', kind: 'select', options: bookOptions(), store: 'int', required: true, hint: 'The 66 books of the Bible. They are fixed.' },
      { key: 'startChapter', label: 'Chapter', kind: 'chapter', bookKey: 'bibleBookId', store: 'int', required: true, hint: 'Only the chapters of the book above are offered.' },
      rich('content', 'Commentary', { required: true }),
      { key: 'memberId', label: 'Writer', kind: 'member', hint: 'The member credited as the author.' },
      lang(),
      { key: 'onlyForPartners', label: 'Only for partners', kind: 'toggle', hint: 'On means only covenant partners see it.' },
      { key: 'youtubeId', label: 'Video (YouTube)', kind: 'text', hint: 'The YouTube video id or link, if there is a video.' },
      image('photo', 'Picture'),
      ...embeds(),
      published('isPublished'),
    ],
  },
];

/* BOOKS and CHAPTERS are defined above TYPES, which uses them. */

export const typeById = (id) => TYPES.find((t) => t.id === id);

/* Which of these the Noah app can read today. Saving here stores the item in Catalyst; the app only
   shows it once the Noah API has a route that reads that table.

   Checked 2 Nov 2026 against the Noah API (GET /content/...): manna, its categories, prayers and
   confessions answer (they ask for a member sign-in); the dictionary, banners and announcements
   answer "no such endpoint". Bible study is not authored here: it runs in Zoho TrainerCentral (docs/CLIENT-DEMO-FEATURES.md).
   Media and school are left out: not checked. Change an entry here when a route appears, and the
   console stops (or starts) warning the office. */
export const APP_READS = {
  manna: true, mannaCategories: true, prayers: true, confessions: true,
  bibleCommentary: false,
  dictionary: false, dictionaryCategories: false, banners: false, announcements: false,
};

/* Catalyst refuses some column names outright, so the project's tables have them
   with `Col` added (`dateCol`, `orderCol`, `priorityCol`...). The definitions above
   already use the project's spelling; this is kept for anything that still names a
   field the Laravel way. The complete list is the Catalyst developer's
   schema/column-renames.json. */
const RESERVED = ['date', 'order', 'time', 'key', 'rows', 'in', 'out', 'priority', 'timestamp'];

/** The Catalyst column a field is stored in. */
export const columnFor = (key) => (RESERVED.includes(key) ? key + 'Col' : key);
