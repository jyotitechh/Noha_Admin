/* Everything the office can author, defined once.

   The server validates and stores from these, and the console draws its forms
   and tables from them (GET /api/content/types), so a field cannot exist in one
   and be missing from the other. Adding the next kind of content is a block
   here and nothing else.

   The fields come from the client's own Laravel backend (noah-estone-dev): the
   validation rules in each admin controller say what the office enters for a
   daily manna, a prayer, a confession, a dictionary entry, a Noahgram post, a
   course. Column names are the ones that backend uses, because the Noah app
   reads them by those names.

   A few are marked `added: true`. The Laravel backend stored pictures as
   uploaded files; the console cannot upload to Catalyst File Store (its token
   has no file-write scope), so a picture here is a link, in a column that does
   not exist in the original. docs/CONTENT-TABLES.md lists them for the Catalyst
   developer, with every other column. */

/** The seven languages content is written in. */
export const LANGUAGES = [
  { v: 'en', l: 'English' }, { v: 'hi', l: 'Hindi' }, { v: 'mr', l: 'Marathi' },
  { v: 'ml', l: 'Malayalam' }, { v: 'ta', l: 'Tamil' }, { v: 'te', l: 'Telugu' }, { v: 'kn', l: 'Kannada' },
];

export const SECTIONS = {
  content: { label: 'Content', desc: 'What the Noah app reads each day.' },
  media: { label: 'Media', desc: 'Noahgram and Noah Tube.' },
  school: { label: 'School', desc: 'The Bible school and its courses.' },
};

const lang = (key = 'language', label = 'Language') =>
  ({ key, label, kind: 'select', options: LANGUAGES, hint: 'The language this is written in.' });
const image = (key = 'imageUrl', label = 'Picture', hint = 'A link to the picture. Uploading from here is not available yet.') =>
  ({ key, label, kind: 'url', hint, added: key === 'imageUrl' });
const published = (label = 'Published') =>
  ({ key: 'published', label, kind: 'toggle', hint: 'Members see it in the app once this is on.' });

/*  kind:   text | textarea | date | select | toggle | number | url | color | ref
    ref:    another type's id; the form offers that type's entries
    publish the column that means "live" (a toggle). Without it there is no
            publish step, and the entry is simply there. */

export const TYPES = [
  /* ================= content ================= */
  {
    id: 'manna', section: 'content', label: 'Daily Manna', singular: 'devotional', table: 'dailyMana',
    title: 'title', dateKey: 'publishDate', publish: 'published',
    intro: 'The devotional the app opens on each day: a scripture, the message, and a prayer.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'publishDate', label: 'Show on', kind: 'date', required: true, hint: 'The day it appears in the app.' },
      { key: 'categoryId', label: 'Category', kind: 'ref', ref: 'mannaCategories' },
      { key: 'text', label: 'Scripture', kind: 'textarea', required: true, rows: 3, hint: 'The verse or passage, with its reference.' },
      { key: 'content', label: 'Message', kind: 'textarea', required: true, rows: 9 },
      { key: 'prayer', label: 'Prayer', kind: 'textarea', required: true, rows: 4 },
      lang(),
      image(),
      { key: 'showOnObituary', label: 'Show on obituary notices', kind: 'toggle' },
      published(),
    ],
  },
  {
    id: 'mannaCategories', section: 'content', label: 'Manna categories', singular: 'category', table: 'dailyMannaCategories',
    title: 'title', dateKey: null, publish: null,
    intro: 'The themes the Daily Manna is grouped under.',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'color', label: 'Colour', kind: 'color' },
      image('photo', 'Picture'),
      { key: 'publishStart', label: 'Shown from', kind: 'date' },
      { key: 'publishEnd', label: 'Shown until', kind: 'date' },
      { key: 'isArchived', label: 'Hidden (archived)', kind: 'toggle' },
    ],
  },
  {
    id: 'prayers', section: 'content', label: 'Daily Prayers', singular: 'prayer', table: 'dailyPrayers',
    title: 'title', dateKey: 'startDate', publish: 'published',
    intro: 'The prayer members are invited to pray with.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'content', label: 'Prayer', kind: 'textarea', required: true, rows: 9 },
      lang(),
      { key: 'startDate', label: 'Show from', kind: 'date' },
      { key: 'endDate', label: 'Show until', kind: 'date' },
      image(),
      { key: 'showOnObituary', label: 'Show on obituary notices', kind: 'toggle' },
      published(),
    ],
  },
  {
    id: 'confessions', section: 'content', label: 'Confessions', singular: 'confession', table: 'dailyConfessions',
    title: 'title', dateKey: 'publishDate', publish: 'published',
    intro: 'The daily confession of faith.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'content', label: 'Confession', kind: 'textarea', required: true, rows: 9 },
      { key: 'writerName', label: 'Written by', kind: 'text' },
      lang(),
      { key: 'publishDate', label: 'Show on', kind: 'date' },
      image(),
      published(),
    ],
  },
  {
    id: 'dictionary', section: 'content', label: 'Dream dictionary', singular: 'entry', table: 'dreamDictionary',
    title: 'title', dateKey: 'startDate', publish: 'published',
    intro: 'What a dream may mean, entry by entry.',
    fields: [
      { key: 'title', label: 'Word or symbol', kind: 'text', required: true },
      { key: 'content', label: 'Meaning', kind: 'textarea', required: true, rows: 9 },
      { key: 'categoryId', label: 'Category', kind: 'ref', ref: 'dictionaryCategories' },
      lang('contentLanguage'),
      { key: 'isFeatured', label: 'Feature it', kind: 'toggle', hint: 'Shown at the top of the dictionary.' },
      { key: 'startDate', label: 'Show from', kind: 'date' },
      { key: 'endDate', label: 'Show until', kind: 'date' },
      image(),
      published(),
    ],
  },
  {
    id: 'dictionaryCategories', section: 'content', label: 'Dictionary categories', singular: 'category', table: 'dreamDictionaryCategory',
    title: 'name', dateKey: null, publish: null,
    intro: 'How the dream dictionary is grouped.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      image('photo', 'Picture'),
      { key: 'isArchived', label: 'Hidden (archived)', kind: 'toggle' },
    ],
  },

  /* ================= media ================= */
  {
    id: 'noahgramPosts', section: 'media', label: 'Noahgram posts', singular: 'post', table: 'noahGram',
    title: 'caption', dateKey: 'date', publish: 'isApprove',
    intro: 'Posts on the Noahgram feed. A post is live once it is approved.',
    fields: [
      { key: 'caption', label: 'Caption', kind: 'textarea', required: true, rows: 5 },
      { key: 'categoryId', label: 'Category', kind: 'ref', ref: 'noahgramCategories' },
      image('imageUrl', 'Picture or video link'),
      { key: 'date', label: 'Post date', kind: 'date', required: true },
      { key: 'commentLimit', label: 'Most comments allowed', kind: 'number', hint: 'Leave empty for no limit.' },
      { key: 'likeLimit', label: 'Most likes allowed', kind: 'number', hint: 'Leave empty for no limit.' },
      { key: 'enableTags', label: 'Allow tagging', kind: 'toggle' },
      { key: 'isApprove', label: 'Approved', kind: 'toggle', hint: 'Members see it on the feed once it is approved.' },
    ],
  },
  {
    id: 'noahgramCategories', section: 'media', label: 'Noahgram categories', singular: 'category', table: 'noahGramCategory',
    title: 'name', dateKey: null, publish: 'isPublished',
    intro: 'The topics a Noahgram post is filed under.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'backgroundColor', label: 'Background colour', kind: 'color', required: true },
      { key: 'isPublished', label: 'Published', kind: 'toggle' },
    ],
  },
  {
    id: 'tubeVideos', section: 'media', label: 'Noah Tube videos', singular: 'video', table: 'videos',
    title: 'title', dateKey: null, publish: 'published',
    intro: 'The video library. Add a link to the video; uploading a file from here is not available yet.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 4 },
      { key: 'categoryId', label: 'Category', kind: 'ref', ref: 'tubeCategories' },
      { key: 'videoUrl', label: 'Video link', kind: 'url', required: true, hint: 'YouTube, Vimeo or a direct file link.' },
      image('thumb', 'Thumbnail link'),
      { key: 'videoLength', label: 'Length (seconds)', kind: 'number' },
      { key: 'featured', label: 'Featured', kind: 'toggle', hint: 'Shown at the top of Noah Tube.' },
      published(),
    ],
  },
  {
    id: 'tubeCategories', section: 'media', label: 'Noah Tube categories', singular: 'category', table: 'videoCategories',
    title: 'title', dateKey: null, publish: null,
    intro: 'The shelves the videos sit on. A category can sit inside another.',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'parentId', label: 'Inside', kind: 'ref', ref: 'tubeCategories', hint: 'Leave empty for a top-level shelf.' },
      { key: 'publishStart', label: 'Shown from', kind: 'date' },
      { key: 'publishEnd', label: 'Shown until', kind: 'date' },
    ],
  },

  /* ================= school ================= */
  {
    id: 'bibleSchools', section: 'school', label: 'Bible schools', singular: 'school', table: 'bibleSchool',
    title: 'name', dateKey: 'startDate', publish: 'published',
    intro: 'The Bible school levels members can enrol in.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 5 },
      { key: 'startDate', label: 'Starts', kind: 'date' },
      { key: 'endDate', label: 'Ends', kind: 'date' },
      { key: 'donationAmount', label: 'Fee (₹)', kind: 'number', hint: 'Leave empty if it is free.' },
      { key: 'order', label: 'Order', kind: 'number', hint: 'Where it sits in the list; lowest first.' },
      { key: 'youtubeId', label: 'Introduction video (YouTube id)', kind: 'text' },
      published(),
    ],
  },
  {
    id: 'courses', section: 'school', label: 'Courses', singular: 'course', table: 'rowilCourseManagement',
    title: 'name', dateKey: 'publishedDate', publish: 'published',
    intro: 'Courses, taught in lessons. A course is built from sections, and each section from lessons.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'category', label: 'Category', kind: 'ref', ref: 'courseCategories' },
      { key: 'description', label: 'Short description', kind: 'textarea', rows: 3 },
      { key: 'aboutCourse', label: 'About the course', kind: 'textarea', rows: 6 },
      { key: 'author', label: 'Taught by', kind: 'text' },
      { key: 'aboutAuthor', label: 'About the teacher', kind: 'textarea', rows: 4 },
      lang(),
      { key: 'tags', label: 'Tags', kind: 'text', hint: 'Separated by commas.' },
      { key: 'donationAmount', label: 'Fee (₹)', kind: 'number', hint: 'Leave empty if it is free.' },
      image(),
      { key: 'featured', label: 'Featured', kind: 'toggle' },
      { key: 'publishedDate', label: 'Publish on', kind: 'date' },
      published(),
    ],
  },
  {
    id: 'courseCategories', section: 'school', label: 'Course categories', singular: 'category', table: 'rowilCourseCategoryManagement',
    title: 'name', dateKey: null, publish: null,
    intro: 'How the courses are grouped.',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'parentId', label: 'Inside', kind: 'ref', ref: 'courseCategories', hint: 'Leave empty for a top-level category.' },
    ],
  },
  {
    id: 'courseSections', section: 'school', label: 'Course sections', singular: 'section', table: 'rowilCourseLessonGroupManagement',
    title: 'title', dateKey: null, publish: null,
    intro: 'A course is split into sections, and each section holds its lessons.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'courseId', label: 'Course', kind: 'ref', ref: 'courses', required: true },
      { key: 'order', label: 'Order', kind: 'number', hint: 'Where it sits in the course; lowest first.' },
    ],
  },
  {
    id: 'courseLessons', section: 'school', label: 'Lessons', singular: 'lesson', table: 'rowilCourseLessonManagement',
    title: 'title', dateKey: 'publishedDate', publish: 'published',
    intro: 'The lessons a member watches or reads.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'groupId', label: 'Section', kind: 'ref', ref: 'courseSections', required: true },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 4 },
      { key: 'link', label: 'Video or reading link', kind: 'url' },
      image('thumbnail', 'Thumbnail link'),
      { key: 'durationTime', label: 'Length', kind: 'text', hint: 'For example 12:30.' },
      { key: 'publishedDate', label: 'Publish on', kind: 'date' },
      published(),
    ],
  },
];

export const typeById = (id) => TYPES.find((t) => t.id === id);
