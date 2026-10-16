/// Daily Manna readings. Demo content: the server will supply these later,
/// already translated (scripture comes from a licensed Bible per language).
class Manna {
  const Manna({
    required this.id,
    required this.titleKey,
    required this.ref,
    required this.minutes,
    required this.daysAgo,
    required this.verse,
    required this.reflection,
    required this.prayer,
  });

  final String id;

  /// Translation key of the title (see `l10n/app_strings.dart`).
  final String titleKey;
  final String ref;
  final int minutes;
  final int daysAgo;
  final String verse;
  final String reflection;
  final String prayer;
}

/// Newest first. The first entry is "today's Manna".
const kMannas = [
  Manna(
    id: 'm1',
    titleKey: 'reading_title',
    ref: 'Joel 2:25',
    minutes: 4,
    daysAgo: 0,
    verse: 'And I will restore to you the years that the locust hath eaten.',
    reflection:
        'Seasons of loss are not the end of the story. God does not only '
        'comfort us for what was taken, He promises to give it back. Think '
        'of one thing you feel you lost, and place it in His hands today.',
    prayer:
        'Lord, You are the God who restores. I give You the years I think '
        'are wasted. Redeem them and make them fruitful. Amen.',
  ),
  Manna(
    id: 'm2',
    titleKey: 'manna_2',
    ref: 'Philippians 4:7',
    minutes: 3,
    daysAgo: 1,
    verse:
        'And the peace of God, which passeth all understanding, shall keep '
        'your hearts and minds through Christ Jesus.',
    reflection:
        'Peace is not the absence of problems, it is the presence of God in '
        'the middle of them. When worry rises, turn it into a prayer and let '
        'His peace stand guard over your thoughts.',
    prayer:
        'Father, I bring my worries to You. Replace them with Your peace '
        'that I cannot explain. Amen.',
  ),
  Manna(
    id: 'm3',
    titleKey: 'manna_3',
    ref: 'Isaiah 40:31',
    minutes: 4,
    daysAgo: 2,
    verse:
        'But they that wait upon the LORD shall renew their strength; they '
        'shall mount up with wings as eagles; they shall run, and not be '
        'weary; and they shall walk, and not faint.',
    reflection:
        'Waiting on God is not wasting time, it is where strength is '
        'renewed. Slow down today. Let Him carry what you cannot.',
    prayer:
        'Lord, I am tired. Renew my strength as I wait on You, and teach me '
        'to rest in Your timing. Amen.',
  ),
  Manna(
    id: 'm4',
    titleKey: 'manna_4',
    ref: '2 Corinthians 5:7',
    minutes: 3,
    daysAgo: 3,
    verse: 'For we walk by faith, not by sight.',
    reflection:
        'Faith takes the next step before the whole road is visible. You do '
        'not need every answer, only trust in the One who does.',
    prayer:
        'God, help me to trust You when I cannot see the way. Lead me one '
        'step at a time. Amen.',
  ),
];
