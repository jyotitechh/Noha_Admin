// Demo content for the Home tabs (Prayers, Confessions, Bible commentary).
// The server will supply these already translated, like the Daily Manna.

class DailyPrayer {
  const DailyPrayer({
    required this.title,
    required this.ref,
    required this.body,
    required this.daysAgo,
  });

  final String title;
  final String ref;
  final String body;

  /// 0 is today's prayer.
  final int daysAgo;
}

/// Newest first. The first entry is today's prayer.
const kPrayers = [
  DailyPrayer(
    title: 'For the household',
    ref: 'Joshua 24:15',
    body:
        'Father, we set our house under your name. Let every person under '
        'this roof walk in your peace and return to you at the end of the day.',
    daysAgo: 0,
  ),
  DailyPrayer(
    title: 'For the city',
    ref: 'Jeremiah 29:7',
    body:
        'Lord, we seek the good of our city. Bless its streets, its leaders '
        'and its people, and let your peace rest on every home.',
    daysAgo: 1,
  ),
  DailyPrayer(
    title: 'For those who serve',
    ref: 'Colossians 3:23',
    body:
        'God, strengthen everyone who serves in your house. Let their work '
        'be done as for you, and keep their hearts glad.',
    daysAgo: 2,
  ),
  DailyPrayer(
    title: 'For the sick',
    ref: 'James 5:14',
    body:
        'Healer of all, lay your hand on those who are unwell. Bring comfort '
        'to their bodies and rest to their families.',
    daysAgo: 3,
  ),
];

class Confession {
  const Confession({
    required this.title,
    required this.ref,
    required this.body,
    required this.theme,
  });

  final String title;
  final String ref;
  final String body;

  /// One of [kConfessionThemes].
  final String theme;
}

/// Theme id and its translation key.
const kConfessionThemes = [
  ('healing', 'th_healing'),
  ('provision', 'th_provision'),
  ('family', 'th_family'),
  ('peace', 'th_peace'),
  ('protection', 'th_protection'),
];

/// The first entry is the confession of the day.
const kConfessions = [
  Confession(
    title: 'I am kept in perfect peace',
    ref: 'Isaiah 26:3',
    body:
        'My mind is stayed on him, and he keeps me in perfect peace. I will '
        'not be shaken by what I see today.',
    theme: 'peace',
  ),
  Confession(
    title: 'My needs are met',
    ref: 'Philippians 4:19',
    body:
        'My God supplies every need of mine according to his riches in glory.',
    theme: 'provision',
  ),
  Confession(
    title: 'I am healed',
    ref: 'Isaiah 53:5',
    body:
        'By his stripes I am healed. Health and strength are working in my '
        'body today.',
    theme: 'healing',
  ),
  Confession(
    title: 'My family serves the Lord',
    ref: 'Joshua 24:15',
    body:
        'As for me and my house, we will serve the Lord. Peace and faith '
        'fill our home.',
    theme: 'family',
  ),
  Confession(
    title: 'The Lord is my refuge',
    ref: 'Psalm 91:2',
    body:
        'He is my refuge and my fortress, my God, in whom I trust. No '
        'harm will come near my home.',
    theme: 'protection',
  ),
];

class CommentaryEntry {
  const CommentaryEntry({required this.ref, required this.title});

  final String ref;
  final String title;
}

/// The chapter being studied.
const kCommentaryBook = 'Joel';
const kCommentaryChapter = 2;

const kCommentary = [
  CommentaryEntry(ref: 'Joel 2:1–11', title: 'The day of the Lord'),
  CommentaryEntry(ref: 'Joel 2:12–17', title: 'Return to me'),
  CommentaryEntry(ref: 'Joel 2:18–27', title: 'The years restored'),
  CommentaryEntry(ref: 'Joel 2:28–32', title: 'The Spirit poured out'),
];
