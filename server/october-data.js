/* October 2026 content for the Noah app: a Daily Manna, a prayer and a
   confession for every day (1 to 31), a starter dream dictionary, the home
   banners and the announcements. Loaded by `npm run seed:october`.

   Written in English (language 1). Scripture is referenced and paraphrased,
   not quoted at length. Edit freely: the loader skips what is already there
   by title, so a corrected entry is changed in the console, not re-seeded. */

export const YEAR_MONTH = '2026-10';
export const dayOf = (n) => `${YEAR_MONTH}-${String(n).padStart(2, '0')}`;

export const MANNA_CATEGORIES = [
  { title: 'Faith', description: 'Trusting God when the way is not clear.', color: '#0A6BFF' },
  { title: 'Prayer', description: 'Learning to talk with God.', color: '#7C3AED' },
  { title: 'Family', description: 'Marriage, parenting and the home.', color: '#16A34A' },
  { title: 'Hope', description: 'Holding on when the night is long.', color: '#F59E0B' },
  { title: 'Gratitude', description: 'Thanksgiving that changes the heart.', color: '#EC4899' },
  { title: 'Courage', description: 'Standing firm when it costs something.', color: '#DC2626' },
];

/* day, category, title, message (with its scripture), prayer */
export const MANNA = [
  [1, 'Faith', 'A new month, a new step', 'The steps of a good person are ordered by the Lord (Psalm 37:23). You do not need to see the whole month. You need to take today’s step with the One who already knows where it leads.', 'Lord, order my steps this month. Lead me where You are going. Amen.'],
  [2, 'Prayer', 'Pray without a script', 'Pray continually (1 Thessalonians 5:17). Prayer is not only a morning appointment. It is a running conversation with the One who is always listening, in the bus, the kitchen and the queue.', 'Father, teach me to talk with You through the whole day. Amen.'],
  [3, 'Family', 'The house on the rock', 'Everyone who hears these words and does them is like a wise builder (Matthew 7:24). A family stands in the storm because of what it has done with God’s word, not what it has merely heard.', 'Lord, let our home be built on Your word and not on opinion. Amen.'],
  [4, 'Hope', 'Morning comes', 'Weeping may stay for the night, but joy comes with the morning (Psalm 30:5). The hard season is real, and so is its end. God has not forgotten the hour you are in.', 'God of hope, carry me through the night to Your morning. Amen.'],
  [5, 'Gratitude', 'Start with thanks', 'Give thanks in all circumstances (1 Thessalonians 5:18). Thanks does not deny the pain. It declares that God is still good and still at work inside it.', 'Lord, open my eyes to what I already have in You. Amen.'],
  [6, 'Courage', 'Be strong and steady', 'Be strong and courageous; do not be afraid, for the Lord your God goes with you (Deuteronomy 31:6). Courage is not the absence of fear. It is obedience that does not wait for fear to leave.', 'Lord, go before me into what I am afraid of. Amen.'],
  [7, 'Faith', 'Faith the size of a seed', 'If you have faith as small as a mustard seed, nothing will be impossible for you (Matthew 17:20). The size of your faith matters less than the size of the One you place it in.', 'Lord, I place the little I have in Your great hands. Amen.'],
  [8, 'Prayer', 'He hears the whisper', 'Before they call I will answer (Isaiah 65:24). You do not have to find the right words. The Father is already leaning in to hear you.', 'Father, thank You that my whisper reaches You. Amen.'],
  [9, 'Family', 'Teach them diligently', 'Teach them to your children, talking about them when you sit at home and when you walk along the road (Deuteronomy 6:7). Faith is handed on in ordinary conversation far more than in special occasions.', 'Lord, help me speak of You naturally to those I love. Amen.'],
  [10, 'Hope', 'An anchor for the soul', 'We have this hope as an anchor for the soul, firm and secure (Hebrews 6:19). An anchor does not stop the waves. It keeps the ship from being carried away by them.', 'Jesus, be the anchor of my soul today. Amen.'],
  [11, 'Gratitude', 'Remember His benefits', 'Praise the Lord, my soul, and forget not all His benefits (Psalm 103:2). Gratitude is a decision to remember. Write down three things God has done this week.', 'Lord, I remember Your kindness and I thank You. Amen.'],
  [12, 'Courage', 'Speak up gently', 'Always be prepared to give an answer for the hope that you have, with gentleness and respect (1 Peter 3:15). Courage and kindness are not opposites. Together they are very persuasive.', 'Give me words, Lord, and a gentle spirit to say them. Amen.'],
  [13, 'Faith', 'Not by sight', 'We live by faith, not by sight (2 Corinthians 5:7). Faith takes the next step because the One who called us is faithful, even when the view is unclear.', 'Lord, help me trust You with what I cannot see. Amen.'],
  [14, 'Prayer', 'Pray for the leaders', 'I urge that petitions and prayers be made for everyone, for kings and all those in authority (1 Timothy 2:1-2). A praying church is a quiet blessing to its nation.', 'Father, give wisdom and integrity to those who lead us. Amen.'],
  [15, 'Family', 'Love that bears', 'Love bears all things, believes all things, hopes all things, endures all things (1 Corinthians 13:7). A marriage and a family are held together by this kind of love on the ordinary days.', 'Lord, make our love patient, kind and lasting. Amen.'],
  [16, 'Hope', 'He is making all things new', 'Behold, I am making all things new (Revelation 21:5). What looks finished and broken is not outside His reach. Bring Him the thing you gave up on.', 'Lord Jesus, renew what I thought was lost. Amen.'],
  [17, 'Gratitude', 'A grateful heart is a heavy-laden table', 'Let the peace of Christ rule in your hearts, and be thankful (Colossians 3:15). Peace and thanks grow together. Where one is missing, look for the other.', 'Lord, let Your peace and my thanks live in the same heart. Amen.'],
  [18, 'Courage', 'When the giant is loud', 'David said, the battle is the Lord’s (1 Samuel 17:47). Some things are too big to fight alone. Stop rehearsing the giant’s size and start remembering God’s record.', 'Lord, the battle is Yours. I stand with You. Amen.'],
  [19, 'Faith', 'The God who finishes', 'He who began a good work in you will carry it on to completion (Philippians 1:6). You are not a project God abandoned halfway. He finishes what He starts.', 'Thank You, Lord, that You are not done with me. Amen.'],
  [20, 'Prayer', 'Ask, seek, knock', 'Ask and it will be given to you; seek and you will find; knock and the door will be opened (Matthew 7:7). Three verbs, one invitation: keep going to the Father.', 'Father, I keep coming to You. Open the doors You want opened. Amen.'],
  [21, 'Family', 'Honouring the old', 'Honour your father and mother, which is the first commandment with a promise (Ephesians 6:2-3). A home that respects its elders gives its children something to inherit.', 'Lord, help us honour and care for our parents. Amen.'],
  [22, 'Hope', 'Strength renewed', 'Those who hope in the Lord will renew their strength (Isaiah 40:31). Waiting on God is not wasted time. It is how weary people are made strong again.', 'Lord, renew my strength as I wait on You. Amen.'],
  [23, 'Gratitude', 'Thanks for the small things', 'Whoever can be trusted with very little can also be trusted with much (Luke 16:10). A thankful person notices small mercies, and small mercies add up to a good life.', 'Lord, teach me to value small things faithfully. Amen.'],
  [24, 'Courage', 'Do not be ashamed', 'I am not ashamed of the gospel, because it is the power of God (Romans 1:16). There is nothing to apologise for in Good News. It has changed more lives than any argument.', 'Lord, make me bold to live and speak Your gospel. Amen.'],
  [25, 'Faith', 'Faith that works', 'Faith without works is dead (James 2:26). Believing God and obeying Him are one movement. Today, do the thing you already know He asked.', 'Lord, make my faith visible in what I do. Amen.'],
  [26, 'Prayer', 'The Lord’s Prayer', 'Our Father in heaven, hallowed be Your name (Matthew 6:9). Begin by remembering who you are speaking to. Everything else in prayer finds its place from there.', 'Our Father, hallowed be Your name. Your kingdom come. Amen.'],
  [27, 'Family', 'Be quick to forgive', 'Bear with each other and forgive one another, as the Lord forgave you (Colossians 3:13). Homes heal faster when someone goes first with the words, I am sorry.', 'Lord, help me forgive as You have forgiven me. Amen.'],
  [28, 'Hope', 'Nothing can separate us', 'Neither death nor life, neither the present nor the future, can separate us from the love of God (Romans 8:38-39). Hold on to that list. It leaves nothing out.', 'Thank You, Lord, that Your love does not let go. Amen.'],
  [29, 'Gratitude', 'Enter His gates', 'Enter His gates with thanksgiving and His courts with praise (Psalm 100:4). Thanksgiving is the door into worship. Say thank You first, then see how the rest follows.', 'Lord, I come with thanks. I praise Your name. Amen.'],
  [30, 'Courage', 'The Lord is my light', 'The Lord is my light and my salvation, whom shall I fear? (Psalm 27:1). Fear shrinks in the presence of One who is greater. Name your fear, then name Him.', 'Lord, You are my light. I will not be afraid. Amen.'],
  [31, 'Faith', 'Finish well', 'I have fought the good fight, I have finished the race, I have kept the faith (2 Timothy 4:7). Look back over this month and thank God for each step. Then walk into the next one.', 'Lord, thank You for this month. Lead me into the next. Amen.'],
];

/* One prayer for each day. */
export const PRAYERS = [
  [1, 'Prayer for a new month', 'Father, thank You for bringing me to a new month. Bless my work, protect my family and lead me in every decision. Amen.'],
  [2, 'Prayer for peace of mind', 'Lord, quiet my racing thoughts. Replace worry with Your peace that is beyond understanding. Amen.'],
  [3, 'Prayer for the family', 'Father, cover each person in my home with Your protection. Unite us in love and in faith. Amen.'],
  [4, 'Prayer for the sick', 'Lord, we bring before You everyone who is unwell. Touch them with Your healing hand and comfort their families. Amen.'],
  [5, 'Prayer of thanksgiving', 'Thank You, Lord, for life, for breath and for every provision. Make me a grateful person. Amen.'],
  [6, 'Prayer for courage', 'God, give me courage to do what is right today, even when it is difficult. Amen.'],
  [7, 'Prayer for children', 'Lord, watch over the children in our church and our streets. Keep them safe and draw their hearts to You. Amen.'],
  [8, 'Prayer for work', 'Father, bless the work of my hands. Give me honesty, diligence and favour with those I serve. Amen.'],
  [9, 'Prayer for those who grieve', 'Lord of comfort, be near to all who are mourning. Hold them and heal their hearts. Amen.'],
  [10, 'Prayer for the nation', 'Father, we pray for our nation. Give wisdom to leaders, justice in our courts and peace in our streets. Amen.'],
  [11, 'Prayer for the church', 'Lord, strengthen Your church. Make us one, faithful in worship and generous in love. Amen.'],
  [12, 'Prayer for students', 'God of wisdom, help every student to learn well and to walk with integrity. Amen.'],
  [13, 'Prayer for guidance', 'Lord, show me the way. Close the doors that should be closed and open the ones that are Yours. Amen.'],
  [14, 'Prayer for finances', 'Father, You are my provider. Give me wisdom with money, and meet every real need. Amen.'],
  [15, 'Prayer for marriages', 'Lord, bless every marriage. Where there is hurt, bring healing. Where there is distance, bring closeness. Amen.'],
  [16, 'Prayer for the lonely', 'Father, be close to everyone who feels alone today. Send them a friend and remind them they are loved. Amen.'],
  [17, 'Prayer for forgiveness', 'Lord, forgive me where I have failed. Cleanse my heart, and help me forgive others. Amen.'],
  [18, 'Prayer for protection', 'Father, keep us safe from harm on the road, at home and at work. Be our shield. Amen.'],
  [19, 'Prayer for missionaries', 'Lord, strengthen all who carry the gospel to far places. Protect them and supply every need. Amen.'],
  [20, 'Prayer for the unemployed', 'Father, open doors of work for those who are searching. Give them hope while they wait. Amen.'],
  [21, 'Prayer for elders', 'Lord, bless our parents and grandparents. Give them health, dignity and the company of those who love them. Amen.'],
  [22, 'Prayer for healing of the heart', 'Jesus, heal the memories that still hurt. Make me whole in You. Amen.'],
  [23, 'Prayer for pastors', 'Father, give our pastors wisdom, rest and a fresh word from You. Guard their families. Amen.'],
  [24, 'Prayer for the persecuted', 'Lord, be with believers who suffer for their faith. Give them courage and bring them justice. Amen.'],
  [25, 'Prayer for unity', 'God, bring unity where there is division, in our homes, our churches and our communities. Amen.'],
  [26, 'Prayer for rest', 'Father, give me true rest tonight. Let me sleep in Your peace and wake with strength. Amen.'],
  [27, 'Prayer for the lost', 'Lord, draw those who do not yet know You. Use me to show them Your love. Amen.'],
  [28, 'Prayer for patience', 'Lord, make me patient with people and with the process. Teach me to wait on You. Amen.'],
  [29, 'Prayer for generosity', 'Father, give me a generous heart. Show me whom I can bless today. Amen.'],
  [30, 'Prayer for purity', 'Lord, keep my eyes, my words and my thoughts pure. Help me to honour You in secret. Amen.'],
  [31, 'Prayer of dedication', 'Father, I give You this month that is ending and the one that is coming. Be Lord of it all. Amen.'],
];

/* One confession of faith for each day: the statement, then a short prayer. */
export const CONFESSIONS = [
  [1, 'This month is blessed', 'God has made this month a month of favour for me. I walk into it with confidence.', 'Thank You, Lord, for Your favour. Amen.'],
  [2, 'I am not anxious', 'I cast every worry on the Lord because He cares for me. His peace guards my heart and mind.', 'Lord, I give You my cares. Amen.'],
  [3, 'My home is covered', 'The Lord watches over my household. Peace and provision follow my family.', 'Thank You for covering my home. Amen.'],
  [4, 'I am healed', 'By the stripes of Jesus I am healed. Health and strength flow in my body.', 'Thank You, Jesus, for healing. Amen.'],
  [5, 'I am thankful', 'I give thanks in every circumstance. My heart overflows with gratitude to God.', 'Lord, I thank You for all Your goodness. Amen.'],
  [6, 'I am strong in the Lord', 'The Lord is my strength. I can do all things through Christ who strengthens me.', 'Thank You for Your strength. Amen.'],
  [7, 'God is my provider', 'My God supplies all my needs according to His riches in glory. I lack nothing.', 'Thank You, Father, for Your provision. Amen.'],
  [8, 'I hear God’s voice', 'I am one of His sheep and I know His voice. I will not follow another.', 'Speak, Lord, I am listening. Amen.'],
  [9, 'I am forgiven', 'In Christ I have forgiveness for every sin. I am free from guilt and shame.', 'Thank You for Your forgiveness. Amen.'],
  [10, 'I am a child of God', 'I am loved and adopted as God’s own child. I belong to Him.', 'Abba Father, thank You for loving me. Amen.'],
  [11, 'The Lord is my shepherd', 'I shall not want. He leads me beside still waters and restores my soul.', 'Lead me, Good Shepherd. Amen.'],
  [12, 'I have wisdom', 'God gives wisdom generously to all who ask. I make good decisions today.', 'Thank You for Your wisdom. Amen.'],
  [13, 'I walk by faith', 'I walk by faith and not by sight. I trust God for what I cannot yet see.', 'Lord, increase my faith. Amen.'],
  [14, 'My words give life', 'I speak words that build up and bring life. I refuse words of fear and doubt.', 'Lord, guard my mouth. Amen.'],
  [15, 'My marriage is strong', 'God is at the centre of my marriage. Our love grows deeper every day.', 'Bless our marriage, Lord. Amen.'],
  [16, 'I am never alone', 'God is with me always, to the very end of the age. I will not fear.', 'Thank You for being near. Amen.'],
  [17, 'I forgive freely', 'I choose to forgive, as God forgave me. I let go of bitterness.', 'Help me forgive, Lord. Amen.'],
  [18, 'I am protected', 'No weapon formed against me will prosper. God is my refuge and my fortress.', 'Thank You for Your protection. Amen.'],
  [19, 'God finishes what He begins', 'He who began a good work in me will complete it. I trust His timing.', 'Thank You for Your faithfulness. Amen.'],
  [20, 'My prayers are heard', 'The Lord hears me when I call. I pray with confidence and expectation.', 'Thank You for hearing me. Amen.'],
  [21, 'My children are blessed', 'My children are taught by the Lord, and great is their peace.', 'Bless my children, Lord. Amen.'],
  [22, 'I have hope', 'My hope is in the Lord. He renews my strength and lifts me up.', 'Thank You for hope. Amen.'],
  [23, 'I am generous', 'I give freely and cheerfully. God blesses me so that I can bless others.', 'Make me a blessing, Lord. Amen.'],
  [24, 'I am bold', 'I am not ashamed of the gospel. The Spirit gives me power and a sound mind.', 'Make me bold, Lord. Amen.'],
  [25, 'I am doing the word', 'I am a doer of the word and not a hearer only. I act on what God says.', 'Help me obey, Lord. Amen.'],
  [26, 'I rest in Him', 'I find rest for my soul in Jesus. I do not need to strive to earn His love.', 'Thank You for Your rest. Amen.'],
  [27, 'I am a witness', 'I carry the light of Christ wherever I go. People see Jesus in me.', 'Use me, Lord. Amen.'],
  [28, 'I am patient', 'The fruit of the Spirit is growing in me: love, joy, peace and patience.', 'Grow Your fruit in me. Amen.'],
  [29, 'God’s love is enough', 'Nothing can separate me from the love of God in Christ Jesus.', 'Thank You for Your unfailing love. Amen.'],
  [30, 'I am pure', 'I have a clean heart and a right spirit. I walk in holiness and freedom.', 'Create in me a clean heart, O God. Amen.'],
  [31, 'I finish well', 'I finish this month strong. God is leading me into the next with joy.', 'Thank You, Lord, for the road so far. Amen.'],
];

export const DICTIONARY_CATEGORIES = [
  { name: 'Animals', description: 'Creatures that appear in dreams.' },
  { name: 'Water and weather', description: 'Rivers, rain, the sea and storms.' },
  { name: 'People and body', description: 'Family, strangers and parts of the body.' },
  { name: 'Places and journeys', description: 'Houses, roads, travel and buildings.' },
  { name: 'Objects', description: 'Everyday things that show up in dreams.' },
];

/* Entries are interpretations to be weighed in prayer, not rules.
   day (publish on), category, word, meaning, featured */
export const DICTIONARY = [
  [1, 'Animals', 'Snake', 'Often a warning, or an enemy to be resisted. Pray for discernment and test what you sense against the Bible.', true],
  [2, 'Animals', 'Lion', 'Can stand for strength and authority, or for an adversary. Notice how you felt in the dream: secure or afraid.', false],
  [3, 'Animals', 'Dove', 'A common picture of peace and the Holy Spirit. It often brings reassurance.', false],
  [4, 'Animals', 'Dog', 'May speak of loyalty and friendship, or of someone watching over you. Context decides.', false],
  [5, 'Animals', 'Birds', 'Frequently freedom, messages or provision. Consider what the bird was doing.', false],
  [6, 'Water and weather', 'Flood', 'Can speak of being overwhelmed, or of a coming cleansing. Read it alongside what you are going through.', true],
  [7, 'Water and weather', 'Clear river', 'Often refreshing, peace and the move of the Spirit. A good sign when the water is clear.', false],
  [8, 'Water and weather', 'Storm', 'A season of difficulty or testing. Look for where Jesus was in the storm.', false],
  [9, 'Water and weather', 'Rain', 'Frequently blessing, renewal or a season of growth.', false],
  [10, 'People and body', 'Falling', 'Often a sense of losing control. Bring the situation to God and ask what He is asking you to release.', true],
  [11, 'People and body', 'Teeth', 'May relate to worry, change or a loss. Reflect on what feels uncertain right now.', false],
  [12, 'People and body', 'Baby', 'Often a new beginning, a new work or a new season starting.', false],
  [13, 'People and body', 'Deceased relative', 'Often a longing, or unresolved feeling. It is a good moment to pray and to remember.', false],
  [14, 'People and body', 'Being chased', 'Typically something you are avoiding or a fear that follows you. Name it and bring it to God.', false],
  [15, 'Places and journeys', 'House', 'Usually your life, your family or your own heart. Notice the state of each room.', true],
  [16, 'Places and journeys', 'Road', 'A direction or a season of life. A clear road may mean guidance, a blocked road may mean waiting.', false],
  [17, 'Places and journeys', 'Mountain', 'A challenge to overcome, or a place of meeting with God.', false],
  [18, 'Places and journeys', 'Airplane', 'Often a sense of a calling being lifted into a new level or a new place.', false],
  [19, 'Places and journeys', 'School', 'A season of learning, or an area where you feel tested.', false],
  [20, 'Objects', 'Keys', 'Often access, authority or an opening door. Pray for what is being offered to you.', false],
  [21, 'Objects', 'Fire', 'May be purifying and the Spirit, or destruction. Look at whether the fire consumed or refined.', false],
  [22, 'Objects', 'Money', 'Frequently provision, value or what you treasure. Reflect on your sense of security.', false],
  [23, 'Objects', 'Light', 'Typically truth, clarity and God’s presence.', false],
  [24, 'Objects', 'Mirror', 'A call to honest self-reflection and to see yourself as God sees you.', false],
  [25, 'Objects', 'Bridge', 'A way across a gap: a season of change or a restored relationship.', false],
];

/* Banners for the home carousel. No pictures: add them in the console, since
   the project has no files to point at yet. */
export const BANNERS = [
  { caption: 'Welcome to October: a month of thanksgiving', until: '2026-10-31', order: 1 },
  { caption: 'Join us for the Sunday service', until: '2026-10-31', order: 2 },
  { caption: 'Read today’s Daily Manna', until: '2026-10-31', order: 3 },
  { caption: 'Request prayer, we will stand with you', until: '2026-10-31', order: 4 },
];

export const ANNOUNCEMENTS = [
  { title: 'October fasting and prayer', description: 'We are joining in a month of prayer and fasting together. Pick one day a week and pray with the church.' },
  { title: 'Daily Manna is now daily', description: 'A new devotional, prayer and confession are published every day. Open the app each morning.' },
  { title: 'Update your profile', description: 'Please confirm your phone number and address in the app, so we can reach you with important news.' },
  { title: 'Volunteers needed', description: 'We are looking for volunteers for the Sunday welcome team. Speak to your pastor or message the office.' },
];
