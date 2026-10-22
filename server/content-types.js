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
const image = (key = 'image', label = 'Picture', hint = 'A link to the picture. Uploading from here is not available yet.') =>
  ({ key, label, kind: 'url', hint });
const published = (key = 'published', label = 'Published', store) =>
  ({ key, label, kind: 'toggle', ...(store ? { store } : {}), hint: 'Members see it in the app once this is on.' });
const when = (key, label, extra = {}) => ({ key, label, kind: 'date', store: 'datetime', ...extra });
const STAMPS = { created: 'created', updated: 'updated' };
const STAMPS_ON = { created: 'createdOn', updated: 'updatedOn' };

/*  kind:   text | textarea | date | select | toggle | number | url | color | ref
    ref:    another type's id; the form offers that type's entries
    publish the column that means "live" (a toggle). Without it there is no
            publish step, and the entry is simply there. */

export const TYPES = [
  /* ================= content ================= */
  {
    id: 'manna', section: 'content', label: 'Daily Manna', singular: 'devotional', table: 'dailyMana',
    title: 'title', dateKey: 'publishDate', publish: 'published', stamps: STAMPS,
    intro: 'The devotional the app opens on each day: the message and a prayer.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'publishDate', label: 'Show on', kind: 'date', required: true, hint: 'The day it appears in the app.' },
      { key: 'categoryIds', label: 'Category', kind: 'ref', ref: 'mannaCategories', catalyst: 'text' },
      { key: 'content', label: 'Message', kind: 'textarea', required: true, rows: 9 },
      { key: 'prayer', label: 'Prayer', kind: 'textarea', required: true, rows: 4 },
      lang(),
      image(),
      { key: 'showOnObituary', label: 'Show on obituary notices', kind: 'toggle', store: 'int' },
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
    id: 'prayers', section: 'content', label: 'Daily Prayers', singular: 'prayer', table: 'dailyPrayers',
    title: 'title', dateKey: 'publishedDate', publish: 'published', stamps: STAMPS,
    intro: 'The prayer members are invited to pray with.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'content', label: 'Prayer', kind: 'textarea', required: true, rows: 9 },
      lang(),
      when('publishedDate', 'Publish on'),
      image(),
      { key: 'showOnObituary', label: 'Show on obituary notices', kind: 'toggle', store: 'int' },
      published(),
    ],
  },
  {
    id: 'confessions', section: 'content', label: 'Confessions', singular: 'confession', table: 'dailyConfessions',
    title: 'title', dateKey: 'publishDate', publish: 'published', stamps: STAMPS, constants: { isConfession: true },
    intro: 'The daily confession of faith.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'content', label: 'Confession', kind: 'textarea', required: true, rows: 9 },
      { key: 'prayer', label: 'Prayer', kind: 'textarea', rows: 4 },
      lang(),
      { key: 'publishDate', label: 'Show on', kind: 'date' },
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
      { key: 'content', label: 'Meaning', kind: 'textarea', required: true, rows: 9 },
      { key: 'categoryId', label: 'Category', kind: 'ref', ref: 'dictionaryCategories' },
      lang(),
      { key: 'isFeatured', label: 'Feature it', kind: 'toggle', hint: 'Shown at the top of the dictionary.' },
      when('publishedDate', 'Publish on'),
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
];

export const typeById = (id) => TYPES.find((t) => t.id === id);

/* Catalyst refuses some column names outright, so the project's tables have them
   with `Col` added (`dateCol`, `orderCol`, `priorityCol`...). The definitions above
   already use the project's spelling; this is kept for anything that still names a
   field the Laravel way. The complete list is the Catalyst developer's
   schema/column-renames.json. */
const RESERVED = ['date', 'order', 'time', 'key', 'rows', 'in', 'out', 'priority', 'timestamp'];

/** The Catalyst column a field is stored in. */
export const columnFor = (key) => (RESERVED.includes(key) ? key + 'Col' : key);
