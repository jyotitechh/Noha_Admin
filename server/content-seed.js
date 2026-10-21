/* The sample content: what each screen shows when there is no Catalyst
   connection at all. A few realistic entries per kind, so every screen can be
   tried. Never used against Catalyst. */

const day = (offset) => {
  const d = new Date(Date.UTC(2026, 9, 9));
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const SEED = {
  mannaCategories: [
    { title: 'Faith', description: 'Trusting God when the way is not clear.', color: '#0A6BFF' },
    { title: 'Prayer', description: 'Learning to talk with God.', color: '#7C3AED' },
    { title: 'Family', description: 'Marriage, parenting and the home.', color: '#16A34A' },
  ],
  manna: [
    {
      title: 'Walking by faith', categoryId: 'mannaCategories-1', publishDate: day(0), text: 'For we walk by faith, not by sight. (2 Corinthians 5:7)',
      content: 'Faith does not wait until every question is answered. It takes the next step because the One who called us is faithful.',
      prayer: 'Lord, help me to trust You with what I cannot see. Amen.', language: 'en', published: true,
    },
    {
      title: 'A quiet place', categoryId: 'mannaCategories-2', publishDate: day(1), text: 'But when you pray, go into your room and shut the door. (Matthew 6:6)',
      content: 'The best conversations happen where nothing competes for attention. Find that place today.',
      prayer: 'Father, teach me to be still before You. Amen.', language: 'en', published: false,
    },
    {
      title: 'Building the home', categoryId: 'mannaCategories-3', publishDate: day(-3), text: 'Unless the Lord builds the house, the builders labour in vain. (Psalm 127:1)',
      content: 'A home is not built from effort alone. Invite God into the plans, the budget and the arguments.',
      prayer: 'Lord, be the head of our home. Amen.', language: 'en', published: true,
    },
  ],
  prayers: [
    { title: 'Prayer for the morning', content: 'Father, thank You for this new day. Order my steps, guard my words and use me today. Amen.', language: 'en', startDate: day(-7), published: true },
    { title: 'Prayer for the sick', content: 'Lord, we bring before You everyone who is unwell. Touch them with Your healing hand. Amen.', language: 'en', startDate: day(2), published: false },
  ],
  confessions: [
    { title: 'I am who God says I am', content: 'I am loved, chosen and forgiven. I walk in the strength that Christ supplies.', writerName: 'Pastor Emmanuel', language: 'en', publishDate: day(0), published: true },
    { title: 'My family is blessed', content: 'My household serves the Lord. Peace and provision follow us every day.', writerName: 'Pastor Ruth', language: 'en', publishDate: day(3), published: false },
  ],
  dictionaryCategories: [
    { name: 'Animals', description: 'Creatures that appear in dreams.' },
    { name: 'Water', description: 'Rivers, rain, the sea and what they carry.' },
  ],
  dictionary: [
    { title: 'Falling', categoryId: 'dictionaryCategories-1', content: 'Often a sense of losing control. Bring the situation to God and ask what You are being asked to release.', language: 'en', isFeatured: true, published: true },
    { title: 'Flood', categoryId: 'dictionaryCategories-2', content: 'Can speak of being overwhelmed, or of a coming cleansing. Read it alongside what you are going through.', language: 'en', isFeatured: false, published: true },
    { title: 'Snake', content: 'A warning, or an enemy to be resisted. Pray for discernment.', language: 'en', isFeatured: false, published: false },
  ],

  noahgramCategories: [
    { name: 'Testimonies', backgroundColor: '#0A6BFF', isPublished: true },
    { name: 'Worship', backgroundColor: '#7C3AED', isPublished: true },
  ],
  noahgramPosts: [
    { caption: 'Sunday service, Andheri. What a morning of worship.', categoryId: 'noahgramCategories-2', date: day(-1), enableTags: true, isApprove: true },
    { caption: 'Praise report: God provided for our building fund.', date: day(0), enableTags: true, isApprove: false },
  ],
  tubeCategories: [
    { title: 'Sermons', description: 'Sunday messages.' },
    { title: 'Worship', description: 'Songs and live worship.' },
  ],
  tubeVideos: [
    { title: 'Standing on the promises', categoryId: 'tubeCategories-1', description: 'A message on holding to what God has said.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', videoLength: 2400, featured: true, published: true },
    { title: 'Evening worship', description: 'A full hour of worship.', videoUrl: 'https://vimeo.com/76979871', videoLength: 3600, featured: false, published: false },
  ],

  bibleSchools: [
    { name: 'Bible School, Level 1', description: 'Foundations of the faith, in twelve weeks.', startDate: day(14), endDate: day(98), donationAmount: 0, order: 1, published: true },
    { name: 'Bible School, Level 2', description: 'Going deeper: Old Testament survey.', startDate: day(120), endDate: day(204), donationAmount: 500, order: 2, published: false },
  ],
  courseCategories: [
    { name: 'Foundations', description: 'Where every believer begins.' },
    { name: 'Leadership', description: 'For cell leaders and ministry heads.' },
  ],
  courses: [
    { name: 'Knowing God', category: 'courseCategories-1', description: 'Who God is, and what that changes.', aboutCourse: 'Eight lessons on the character of God.', author: 'Pastor Emmanuel', language: 'en', tags: 'faith, foundations', featured: true, publishedDate: day(-10), published: true },
    { name: 'Leading a cell', description: 'Practical help for new cell leaders.', author: 'Pastor Ruth', language: 'en', tags: 'leadership', featured: false, publishedDate: day(5), published: false },
  ],
  courseSections: [
    { title: 'Week 1: The nature of God', courseId: 'courses-1', order: 1 },
    { title: 'Week 2: God as Father', courseId: 'courses-1', order: 2 },
  ],
  courseLessons: [
    { title: 'God is Spirit', groupId: 'courseSections-1', description: 'What it means that God is a spirit.', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', durationTime: '14:20', publishedDate: day(-10), published: true },
    { title: 'God is holy', groupId: 'courseSections-1', description: 'The holiness of God, and our response.', durationTime: '11:05', published: false },
  ],
};

export const sampleRows = (typeId) => (SEED[typeId] ?? []).map((r) => ({ ...r }));
