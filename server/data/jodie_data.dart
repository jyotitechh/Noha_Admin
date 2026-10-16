import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'noahgram_data.dart';

/// Demo data + state for Jodie (matchmaking). The screens only talk to
/// [jodie]; swap the seeds and the methods for API calls later.

enum Gender { man, woman }

class JodieProfile {
  JodieProfile({
    required this.id,
    required this.name,
    required this.age,
    required this.gender,
    required this.city,
    required this.congregation,
    required this.profession,
    required this.education,
    required this.bio,
    required this.languages,
    required this.interests,
    required this.photoSeed,
    this.verified = true,
  });

  final String id;
  final String name;
  final int age;
  final Gender gender;
  final String city;
  final String congregation;
  final String profession;
  final String education;
  final String bio;
  final Set<String> languages; // English names, see AppLang.english
  final Set<String> interests; // keys: worship, music, ...
  final int photoSeed;
  final bool verified;

  String get firstName => name.split(' ').first;

  String get initials => name
      .split(' ')
      .where((p) => p.isNotEmpty)
      .take(2)
      .map((p) => p[0].toUpperCase())
      .join();

  /// Three stand-in "photos" derived from the seed.
  List<Look> get photos => [
    for (var i = 0; i < 3; i++) kLooks[(photoSeed + i * 2) % kLooks.length],
  ];

  List<Color> get colors => photos.first.colors;
}

class MyJodie {
  Gender gender = Gender.man;
  int age = 29;
  String city = 'Dadar';
  String congregation = 'Karuna Sadan';
  String profession = 'Software engineer';
  String education = 'B.E. Computer Science';
  String bio = 'Worship team member. Loves music, long walks and good food.';
  Set<String> languages = {'English', 'Marathi', 'Hindi'};
  Set<String> interests = {'worship', 'music', 'volunteering'};
}

class ChatMessage {
  ChatMessage(this.text, {required this.mine, DateTime? at})
    : at = at ?? DateTime.now();

  final String text;
  final bool mine;
  final DateTime at;
}

class JodieMatch {
  JodieMatch(this.profile, this.at, [List<ChatMessage>? messages])
    : messages = messages ?? [];

  final JodieProfile profile;
  final DateTime at;
  final List<ChatMessage> messages;
  bool unread = false;

  ChatMessage? get last => messages.isEmpty ? null : messages.last;
}

class Plan {
  const Plan(
    this.id,
    this.months,
    this.rupees,
    this.bonusCredits,
    this.labelKey,
  );

  final String id;
  final int months;
  final int rupees;
  final int bonusCredits;
  final String labelKey;

  int get perMonth => (rupees / months).round();
}

const kPlans = [
  Plan('1m', 1, 199, 10, 'jd_plan_1m'),
  Plan('3m', 3, 499, 40, 'jd_plan_3m'),
  Plan('6m', 6, 799, 100, 'jd_plan_6m'),
];

class CreditPack {
  const CreditPack(this.credits, this.rupees);

  final int credits;
  final int rupees;
}

const kCreditPacks = [
  CreditPack(50, 49),
  CreditPack(150, 129),
  CreditPack(500, 349),
];

const kDailyRewards = [5, 5, 10, 10, 15, 15, 30];

/// What each action costs, in credits.
/// One-time Jodie membership fee, in rupees.
const kJodieMembershipRupees = 300;

const kSuperLikeCost = 5;
const kBoostCost = 20;
const kRevealCost = 10;

const kTaskRewards = {'profile': 20, 'invite': 30, 'verify': 25};

typedef Reason = (String key, String arg);

class JodieState extends ChangeNotifier {
  JodieState() {
    _seed();
  }

  final me = MyJodie();
  final profiles = <JodieProfile>[];
  final liked = <String>{};
  final superLiked = <String>{};
  final passed = <String>{};
  final revealed = <String>{};
  final likedMe = <String>{'w1', 'w3', 'w5', 'm2', 'm4', 'm6'};
  final matches = <JodieMatch>[];
  final doneTasks = <String>{};

  /// Paid the one-time membership. Until then Jodie shows the intro page.
  bool isMember = false;

  int credits = 30;
  int streak = 3;
  DateTime? lastClaim = DateTime.now().subtract(const Duration(days: 1));
  DateTime? premiumUntil;
  DateTime? boostUntil;
  RangeValues ageFilter = const RangeValues(21, 45);

  // ── Seed ───────────────────────────────────────────────────────────────
  void _seed() {
    JodieProfile p(
      String id,
      String name,
      int age,
      Gender g,
      String city,
      String church,
      String job,
      String edu,
      String bio,
      List<String> langs,
      List<String> ints,
      int seed,
    ) => JodieProfile(
      id: id,
      name: name,
      age: age,
      gender: g,
      city: city,
      congregation: church,
      profession: job,
      education: edu,
      bio: bio,
      languages: langs.toSet(),
      interests: ints.toSet(),
      photoSeed: seed,
    );

    const w = Gender.woman;
    const m = Gender.man;
    profiles.addAll([
      p(
        'w1',
        'Anita Joseph',
        27,
        w,
        'Dadar',
        'Karuna Sadan',
        'Nurse',
        'B.Sc. Nursing',
        'Sunday school teacher who loves hymns and chai.',
        ['English', 'Marathi', 'Hindi'],
        ['worship', 'music', 'volunteering'],
        0,
      ),
      p(
        'w2',
        'Meera Thomas',
        25,
        w,
        'Thane',
        'Karuna Sadan',
        'Software engineer',
        'B.Tech',
        'Coder by day, baker by weekend.',
        ['English', 'Malayalam'],
        ['reading', 'travel', 'cooking'],
        1,
      ),
      p(
        'w3',
        "Sneha D'Souza",
        28,
        w,
        'Goregaon',
        'Grace Fellowship',
        'School teacher',
        'B.Ed.',
        'Believes kindness is a love language.',
        ['English', 'Marathi'],
        ['family', 'worship', 'movies'],
        2,
      ),
      p(
        'w4',
        'Priya Paul',
        26,
        w,
        'Dadar',
        'Karuna Sadan',
        'Graphic designer',
        'B.Des.',
        'Sketchbook in my bag, faith in my heart.',
        ['English', 'Hindi', 'Marathi'],
        ['photography', 'travel', 'music'],
        3,
      ),
      p(
        'w5',
        'Esther Kumar',
        30,
        w,
        'Navi Mumbai',
        'Karuna Sadan',
        'Chartered accountant',
        'CA',
        'Numbers, coffee and Sunday worship.',
        ['English', 'Hindi', 'Telugu'],
        ['reading', 'fitness', 'worship'],
        4,
      ),
      p(
        'w6',
        'Rachel George',
        24,
        w,
        'Pune',
        'Hope Church',
        'Doctor',
        'MBBS',
        'Medical intern, choir member.',
        ['English', 'Malayalam', 'Kannada'],
        ['music', 'volunteering', 'cooking'],
        5,
      ),
      p(
        'm1',
        'Samuel Pereira',
        29,
        m,
        'Dadar',
        'Karuna Sadan',
        'Architect',
        'B.Arch.',
        'Builds spaces, hopes to build a home.',
        ['English', 'Marathi', 'Hindi'],
        ['travel', 'photography', 'worship'],
        0,
      ),
      p(
        'm2',
        'Joel Mathew',
        31,
        m,
        'Thane',
        'Karuna Sadan',
        'Bank manager',
        'MBA',
        'Steady, family-minded, always up for a road trip.',
        ['English', 'Malayalam', 'Hindi'],
        ['family', 'travel', 'music'],
        1,
      ),
      p(
        'm3',
        'Aaron Fernandes',
        27,
        m,
        'Goregaon',
        'Grace Fellowship',
        'Physiotherapist',
        'BPT',
        'Gym in the morning, youth group at night.',
        ['English', 'Marathi'],
        ['fitness', 'worship', 'volunteering'],
        2,
      ),
      p(
        'm4',
        'Nathan Roy',
        28,
        m,
        'Dadar',
        'Karuna Sadan',
        'Data analyst',
        'M.Sc. Statistics',
        'Guitarist on the worship team.',
        ['English', 'Hindi', 'Marathi'],
        ['music', 'reading', 'worship'],
        3,
      ),
      p(
        'm5',
        'Caleb Dsouza',
        32,
        m,
        'Navi Mumbai',
        'Karuna Sadan',
        'Civil engineer',
        'B.E. Civil',
        'Quiet, loyal, loves cooking for friends.',
        ['English', 'Kannada', 'Hindi'],
        ['cooking', 'family', 'movies'],
        4,
      ),
      p(
        'm6',
        'Isaac Thomas',
        26,
        m,
        'Pune',
        'Hope Church',
        'Pastor in training',
        'B.Th.',
        'Called to serve, hoping to find a partner in ministry.',
        ['English', 'Malayalam', 'Telugu'],
        ['volunteering', 'reading', 'worship'],
        5,
      ),
    ]);

    // Two existing conversations so Matches isn't empty on first open.
    final now = DateTime.now();
    matches.add(
      JodieMatch(
        profiles.firstWhere((x) => x.id == 'w2'),
        now.subtract(const Duration(days: 1)),
        [
          ChatMessage(
            'Hi Daniel! Saw you play at the Night of Worship.',
            mine: false,
            at: now.subtract(const Duration(hours: 5)),
          ),
          ChatMessage(
            'Thank you! Were you there?',
            mine: true,
            at: now.subtract(const Duration(hours: 4)),
          ),
          ChatMessage(
            'Yes, front left. Loved the last song.',
            mine: false,
            at: now.subtract(const Duration(hours: 3)),
          ),
        ],
      )..unread = true,
    );
    matches.add(
      JodieMatch(
        profiles.firstWhere((x) => x.id == 'w4'),
        now.subtract(const Duration(hours: 3)),
      ),
    );
    liked.addAll(['w2', 'w4']);
  }

  // ── Derived ────────────────────────────────────────────────────────────
  Gender get seeking => me.gender == Gender.man ? Gender.woman : Gender.man;

  bool get isPremium =>
      premiumUntil != null && premiumUntil!.isAfter(DateTime.now());

  bool get isBoosted =>
      boostUntil != null && boostUntil!.isAfter(DateTime.now());

  bool _seen(JodieProfile p) =>
      liked.contains(p.id) ||
      passed.contains(p.id) ||
      matches.any((m) => m.profile == p);

  /// Opposite-gender profiles, inside the age filter, best match first.
  List<JodieProfile> get deck {
    final list = profiles
        .where(
          (p) =>
              p.gender == seeking &&
              !_seen(p) &&
              p.age >= ageFilter.start &&
              p.age <= ageFilter.end,
        )
        .toList();
    list.sort((a, b) => compat(b).score.compareTo(compat(a).score));
    return list;
  }

  /// People who liked you and are still waiting for an answer.
  List<JodieProfile> get likesYou => profiles
      .where((p) => likedMe.contains(p.id) && p.gender == seeking && !_seen(p))
      .toList();

  bool canSeeLike(JodieProfile p) => isPremium || revealed.contains(p.id);

  bool get claimedToday {
    final last = lastClaim;
    if (last == null) return false;
    final now = DateTime.now();
    return last.year == now.year &&
        last.month == now.month &&
        last.day == now.day;
  }

  /// Index (0-6) of today's reward in the weekly cycle.
  int get rewardIndex => claimedToday ? (streak - 1) % 7 : streak % 7;

  int get todaysReward => kDailyRewards[rewardIndex];

  /// How well [p] fits the member, from the data given at registration.
  ({int score, List<Reason> reasons}) compat(JodieProfile p) {
    var score = 45;
    final reasons = <Reason>[];
    if (p.congregation == me.congregation) {
      score += 15;
      reasons.add(('jd_why_church', ''));
    }
    if (p.city == me.city) {
      score += 10;
      reasons.add(('jd_why_city', p.city));
    }
    final langs = p.languages.intersection(me.languages);
    if (langs.isNotEmpty) {
      score += math.min(langs.length, 2) * 8;
      reasons.add(('jd_why_lang', langs.first));
    }
    final ints = p.interests.intersection(me.interests);
    if (ints.isNotEmpty) {
      score += math.min(ints.length, 3) * 5;
      reasons.add(('jd_why_interest', ints.first));
    }
    final gap = (p.age - me.age).abs();
    if (gap <= 4) {
      score += 10;
      reasons.add(('jd_why_age', ''));
    } else if (gap <= 7) {
      score += 5;
    }
    return (score: score.clamp(50, 99), reasons: reasons);
  }

  // ── Swiping ────────────────────────────────────────────────────────────
  void pass(JodieProfile p) {
    passed.add(p.id);
    notifyListeners();
  }

  /// Returns true when it turns into a match.
  bool like(JodieProfile p, {bool superLike = false}) {
    liked.add(p.id);
    if (superLike) superLiked.add(p.id);
    final matched = likedMe.contains(p.id);
    if (matched) matches.insert(0, JodieMatch(p, DateTime.now()));
    notifyListeners();
    return matched;
  }

  // ── Credits ────────────────────────────────────────────────────────────
  bool canAfford(int cost) => credits >= cost;

  bool spend(int cost) {
    if (credits < cost) return false;
    credits -= cost;
    notifyListeners();
    return true;
  }

  void addCredits(int n) {
    credits += n;
    notifyListeners();
  }

  /// Returns the credits granted, or 0 if already claimed today.
  int claimDaily() {
    if (claimedToday) return 0;
    final now = DateTime.now();
    final yesterday = now.subtract(const Duration(days: 1));
    final last = lastClaim;
    final continued =
        last != null &&
        last.year == yesterday.year &&
        last.month == yesterday.month &&
        last.day == yesterday.day;
    streak = continued ? streak + 1 : 1;
    lastClaim = now;
    final reward = kDailyRewards[(streak - 1) % 7];
    credits += reward;
    notifyListeners();
    return reward;
  }

  void completeTask(String id) {
    if (doneTasks.add(id)) {
      credits += kTaskRewards[id] ?? 0;
      notifyListeners();
    }
  }

  bool boost() {
    if (!spend(kBoostCost)) return false;
    boostUntil = DateTime.now().add(const Duration(minutes: 30));
    notifyListeners();
    return true;
  }

  bool reveal(JodieProfile p) {
    if (canSeeLike(p)) return true;
    if (!spend(kRevealCost)) return false;
    revealed.add(p.id);
    notifyListeners();
    return true;
  }

  void join() {
    isMember = true;
    notifyListeners();
  }

  // ── Premium + chat ─────────────────────────────────────────────────────
  void subscribe(Plan plan) {
    final base = isPremium ? premiumUntil! : DateTime.now();
    premiumUntil = base.add(Duration(days: 30 * plan.months));
    credits += plan.bonusCredits;
    notifyListeners();
  }

  void markRead(JodieMatch m) {
    if (m.unread) {
      m.unread = false;
      notifyListeners();
    }
  }

  void sendMessage(JodieMatch m, String text) {
    if (!isPremium || text.trim().isEmpty) return;
    m.messages.add(ChatMessage(text.trim(), mine: true));
    notifyListeners();
    // Demo auto-reply, replaced by real-time chat from the backend later.
    Future.delayed(const Duration(seconds: 2), () {
      const replies = [
        'That is lovely to hear!',
        'Tell me more about yourself.',
        'Which service do you usually attend?',
        'Would you like to meet after Sunday service?',
      ];
      m.messages.add(
        ChatMessage(replies[m.messages.length % replies.length], mine: false),
      );
      notifyListeners();
    });
  }

  // ── Profile / filters ──────────────────────────────────────────────────
  void updateMe(void Function(MyJodie me) change) {
    change(me);
    notifyListeners();
  }

  void setAgeFilter(RangeValues v) {
    ageFilter = v;
    notifyListeners();
  }
}

final jodie = JodieState();
