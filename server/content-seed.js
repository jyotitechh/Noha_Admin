/* The sample content: what each screen shows when there is no Catalyst
   connection at all. A few realistic entries per kind, so every screen can be
   tried. Never used against Catalyst.

   Field names are the real Catalyst columns (see content-types.js): a language is
   its code number, a course is `title`, a picture is `image`. */

const day = (offset) => {
  const d = new Date(Date.UTC(2026, 9, 9));
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const SEED = {
  mannaCategories: [
    { title: 'Faith', description: 'Trusting God when the way is not clear.', color: '#0A6BFF', contentLanguage: '1', status: true },
    { title: 'Prayer', description: 'Learning to talk with God.', color: '#7C3AED', contentLanguage: '1', status: true },
    { title: 'Family', description: 'Marriage, parenting and the home.', color: '#16A34A', contentLanguage: '1', status: true },
  ],
  manna: [
    {
      title: 'Walking by faith', categoryIds: 'mannaCategories-1', publishDate: day(0),
      content: 'For we walk by faith, not by sight (2 Corinthians 5:7). Faith does not wait until every question is answered. It takes the next step because the One who called us is faithful.',
      prayer: 'Lord, help me to trust You with what I cannot see. Amen.', contentLanguage: '1', published: true,
    },
    {
      title: 'A quiet place', categoryIds: 'mannaCategories-2', publishDate: day(1),
      content: 'But when you pray, go into your room and shut the door (Matthew 6:6). The best conversations happen where nothing competes for attention. Find that place today.',
      prayer: 'Father, teach me to be still before You. Amen.', contentLanguage: '1', published: false,
    },
    {
      title: 'Building the home', categoryIds: 'mannaCategories-3', publishDate: day(-3),
      content: 'Unless the Lord builds the house, the builders labour in vain (Psalm 127:1). A home is not built from effort alone. Invite God into the plans, the budget and the arguments.',
      prayer: 'Lord, be the head of our home. Amen.', contentLanguage: '1', published: true,
    },
  ],
  prayers: [
    { title: 'Prayer for the morning', content: 'Father, thank You for this new day. Order my steps, guard my words and use me today. Amen.', contentLanguage: '1', publishedDate: day(-7), published: true },
    { title: 'Prayer for the sick', content: 'Lord, we bring before You everyone who is unwell. Touch them with Your healing hand. Amen.', contentLanguage: '1', publishedDate: day(2), published: false },
  ],
  confessions: [
    { title: 'I am who God says I am', content: 'I am loved, chosen and forgiven. I walk in the strength that Christ supplies.', prayer: 'Thank You, Lord, for who I am in You. Amen.', contentLanguage: '1', publishDate: day(0), published: true },
    { title: 'My family is blessed', content: 'My household serves the Lord. Peace and provision follow us every day.', contentLanguage: '1', publishDate: day(3), published: false },
  ],
  dictionaryCategories: [
    { name: 'Animals', description: 'Creatures that appear in dreams.', contentLanguage: '1' },
    { name: 'Water', description: 'Rivers, rain, the sea and what they carry.', contentLanguage: '1' },
  ],
  dictionary: [
    { title: 'Falling', categoryId: 'dictionaryCategories-1', content: 'Often a sense of losing control. Bring the situation to God and ask what You are being asked to release.', contentLanguage: '1', isFeatured: true, published: true },
    { title: 'Flood', categoryId: 'dictionaryCategories-2', content: 'Can speak of being overwhelmed, or of a coming cleansing. Read it alongside what you are going through.', contentLanguage: '1', isFeatured: false, published: true },
    { title: 'Snake', content: 'A warning, or an enemy to be resisted. Pray for discernment.', contentLanguage: '1', isFeatured: false, published: false },
  ],

  noahgramCategories: [
    { name: 'Testimonies', backgroundColor: '#0A6BFF', isPublished: true, orderCol: 1 },
    { name: 'Worship', backgroundColor: '#7C3AED', isPublished: true, orderCol: 2 },
  ],
  noahgramPosts: [
    { caption: 'Sunday service, Andheri. What a morning of worship.', category: 'noahgramCategories-2', scheduleDate: day(-1), isPinned: true, isApproved: true },
    { caption: 'Praise report: God provided for our building fund.', scheduleDate: day(0), isPinned: false, isApproved: false },
  ],
  tubeCategories: [
    { title: 'Sermons', description: 'Sunday messages.', contentLanguage: '1', status: true },
    { title: 'Worship', description: 'Songs and live worship.', contentLanguage: '1', status: true },
  ],
  tubeVideos: [
    { title: 'Standing on the promises', categoryId: 'tubeCategories-1', description: 'A message on holding to what God has said.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', videoSourceType: '1', videoLength: 2400, contentLanguage: '1', featured: true },
    { title: 'Evening worship', description: 'A full hour of worship.', videoUrl: 'https://vimeo.com/76979871', videoSourceType: '2', videoLength: 3600, contentLanguage: '1', featured: false },
  ],

  bibleSchools: [
    { name: 'Bible School, Level 1', description: 'Foundations of the faith, in twelve weeks.', contentLanguage: '1', donationAmount: 0, maxStepsPerDay: 1, publishDate: day(14), status: true },
    { name: 'Bible School, Level 2', description: 'Going deeper: Old Testament survey.', contentLanguage: '1', donationAmount: 500, maxStepsPerDay: 1, publishDate: day(120), status: false },
  ],
  courseCategories: [
    { name: 'Foundations', description: 'Where every believer begins.' },
    { name: 'Leadership', description: 'For cell leaders and ministry heads.' },
  ],
  courses: [
    { title: 'Knowing God', category: 'courseCategories-1', description: 'Who God is, and what that changes.', aboutCourse: 'Eight lessons on the character of God.', author: 'Pastor Emmanuel', language: '1', tags: 'faith, foundations', featured: true, publishedDate: day(-10), published: true },
    { title: 'Leading a cell', description: 'Practical help for new cell leaders.', author: 'Pastor Ruth', language: '1', tags: 'leadership', featured: false, publishedDate: day(5), published: false },
  ],
  courseSections: [
    { name: 'Week 1: The nature of God', courseId: 'courses-1', orderCol: 1 },
    { name: 'Week 2: God as Father', courseId: 'courses-1', orderCol: 2 },
  ],
  courseLessons: [
    { title: 'God is Spirit', groupId: 'courseSections-1', description: 'What it means that God is a spirit.', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', durationTime: 860, publishedDate: day(-10), published: true },
    { title: 'God is holy', groupId: 'courseSections-1', description: 'The holiness of God, and our response.', durationTime: 665, published: false },
  ],
};

export const sampleRows = (typeId) => (SEED[typeId] ?? []).map((r) => ({ ...r }));
