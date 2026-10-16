import 'package:flutter/material.dart';

/// Demo data + state for Noahgram. Replace the seeds with API calls later;
/// the screens only talk to [noahgram].

class Person {
  Person({
    required this.id,
    required this.name,
    required this.handle,
    required this.bio,
    required this.followers,
    this.following = 0,
    this.verified = false,
    this.isChurch = false,
    this.colors = const [Color(0xFF6A2DA8), Color(0xFFC060C2)],
  });

  final String id;
  String name;
  final String handle;
  String bio;
  final int followers;
  final int following;
  final bool verified;
  final bool isChurch;
  final List<Color> colors;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }
}

/// A coloured "photo" used in place of real images for the demo.
class Look {
  const Look(this.colors, this.icon, [this.text]);

  final List<Color> colors;
  final IconData icon;
  final String? text;
}

const kLooks = [
  Look([Color(0xFF6A2DA8), Color(0xFFC060C2)], Icons.church_outlined),
  Look([Color(0xFF3F3C9E), Color(0xFF7C6BD6)], Icons.music_note),
  Look([Color(0xFFA0267F), Color(0xFFE07AB0)], Icons.favorite_border),
  Look([Color(0xFFC2620A), Color(0xFFF0A84C)], Icons.wb_sunny_outlined),
  Look([Color(0xFF1F7A6B), Color(0xFF58C0A5)], Icons.menu_book_outlined),
  Look([
    Color(0xFF8E1FB0),
    Color(0xFFD45BD1),
  ], Icons.volunteer_activism_outlined),
];

class Comment {
  Comment(this.author, this.text);

  final Person author;
  final String text;
}

class Post {
  Post({
    required this.id,
    required this.author,
    required this.look,
    required this.caption,
    required this.likes,
    required this.hours,
    this.isReel = false,
    List<Comment>? comments,
  }) : comments = comments ?? [];

  final String id;
  final Person author;
  final Look look;
  final String caption;
  int likes;
  final int hours;
  final bool isReel;
  final List<Comment> comments;
  bool liked = false;
  bool saved = false;
}

class NoahgramState extends ChangeNotifier {
  NoahgramState() {
    _seed();
  }

  final me = Person(
    id: 'me',
    name: 'Daniel Fernandes',
    handle: 'daniel.fernandes',
    bio: 'Member of Karuna Sadan since 2019\nWorship team · Dadar, Mumbai',
    followers: 248,
  );
  late final Person church;
  late final Person samuel;
  late final Person priya;
  late final Person rahul;
  late final Person youth;
  late final Person choir;

  final posts = <Post>[];
  final reels = <Post>[];
  final following = <String>{};
  final seenStories = <String>{};
  int _nextId = 100;

  List<Person> get others => [church, samuel, youth, choir, priya, rahul];

  void _seed() {
    church = Person(
      id: 'church',
      name: 'Karuna Sadan',
      handle: 'karunasadan',
      bio: 'Karuna Sadan Ministries\nSundays 8:00 am & 10:30 am · Dadar',
      followers: 12400,
      following: 12,
      verified: true,
      isChurch: true,
    );
    samuel = Person(
      id: 'samuel',
      name: 'Pastor Samuel Thomas',
      handle: 'pastor.samuel',
      bio: 'Senior pastor, Karuna Sadan\nTeaching the Word, one day at a time',
      followers: 5300,
      following: 84,
      verified: true,
      colors: const [Color(0xFF3F3C9E), Color(0xFF7C6BD6)],
    );
    priya = Person(
      id: 'priya',
      name: 'Priya Menon',
      handle: 'priya.menon',
      bio: 'Hospitality team · Coffee, community, Christ',
      followers: 1204,
      following: 310,
      colors: const [Color(0xFFA0267F), Color(0xFFE07AB0)],
    );
    rahul = Person(
      id: 'rahul',
      name: "Rahul D'Souza",
      handle: 'rahul.dsouza',
      bio: 'Sunrise prayer walks · Goregaon',
      followers: 876,
      following: 150,
      colors: const [Color(0xFFC2620A), Color(0xFFF0A84C)],
    );
    youth = Person(
      id: 'youth',
      name: 'Noah Youth',
      handle: 'noah.youth',
      bio: 'The youth ministry of Karuna Sadan\nAges 15 to 30',
      followers: 3100,
      following: 40,
      colors: const [Color(0xFF1F7A6B), Color(0xFF58C0A5)],
    );
    choir = Person(
      id: 'choir',
      name: 'Grace Choir',
      handle: 'grace.choir',
      bio: 'Leading worship every Sunday',
      followers: 2200,
      following: 18,
      colors: const [Color(0xFF8E1FB0), Color(0xFFD45BD1)],
    );

    following.addAll(['church', 'samuel', 'youth']);

    Post p(
      String id,
      Person a,
      Look l,
      String cap,
      int likes,
      int hours, {
      bool reel = false,
      List<Comment>? c,
    }) => Post(
      id: id,
      author: a,
      look: l,
      caption: cap,
      likes: likes,
      hours: hours,
      isReel: reel,
      comments: c,
    );

    posts.addAll([
      p(
        'p1',
        church,
        const Look(
          [Color(0xFF6A2DA8), Color(0xFFC060C2)],
          Icons.church_outlined,
          'Night of Worship\nFriday · 7 pm · Hall A',
        ),
        'Join us this Friday for a night of worship. Free entry, book your pass in the Events tab.',
        342,
        2,
        c: [
          Comment(priya, 'Booked my seats already!'),
          Comment(rahul, 'See you there'),
        ],
      ),
      p(
        'p2',
        samuel,
        const Look(
          [Color(0xFF3F3C9E), Color(0xFF7C6BD6)],
          Icons.menu_book_outlined,
          'He restores what the years took\nJoel 2:25',
        ),
        "Today's reading is a reminder: nothing given to God is ever wasted.",
        518,
        5,
        c: [Comment(choir, 'Amen. Needed this today.')],
      ),
      p(
        'p3',
        choir,
        kLooks[1],
        'Rehearsal for Sunday. New song, same joy!',
        204,
        9,
        c: [Comment(youth, 'Cannot wait to hear it')],
      ),
      p(
        'p4',
        priya,
        kLooks[2],
        'Community lunch after service. Thank you to everyone who served!',
        97,
        20,
        c: [Comment(samuel, 'Well done, team.')],
      ),
      p(
        'p5',
        youth,
        const Look(
          [Color(0xFF1F7A6B), Color(0xFF58C0A5)],
          Icons.groups_outlined,
          'Youth Camp 2026\nRegistrations open',
        ),
        'Three days of worship, teaching and fellowship. Limited places, so register early.',
        411,
        27,
      ),
      p('p6', rahul, kLooks[3], 'Sunrise prayer walk this morning.', 63, 30),
      p(
        'p7',
        me,
        kLooks[0],
        'Blessed Sunday with family.',
        58,
        50,
        c: [Comment(priya, 'Lovely!')],
      ),
      p(
        'p8',
        me,
        kLooks[4],
        'Morning devotion. Joel 2:25 has been on my heart all week.',
        41,
        76,
      ),
      p('p9', me, kLooks[5], 'Serving at the food drive.', 72, 120),
    ]);

    reels.addAll([
      p(
        'r1',
        choir,
        kLooks[1],
        'Worship moment from last Sunday',
        1280,
        6,
        reel: true,
        c: [Comment(rahul, 'Goosebumps')],
      ),
      p(
        'r2',
        samuel,
        kLooks[4],
        'One minute devotion: faith over fear',
        3420,
        12,
        reel: true,
        c: [Comment(priya, 'Powerful')],
      ),
      p('r3', youth, kLooks[3], 'Youth Camp teaser', 2210, 26, reel: true),
      p(
        'r4',
        church,
        kLooks[0],
        'Sunday service highlights',
        4890,
        30,
        reel: true,
      ),
      p(
        'r5',
        priya,
        kLooks[2],
        'Kitchen seva behind the scenes',
        764,
        48,
        reel: true,
      ),
      p('r6', me, kLooks[5], 'Food drive, in 30 seconds', 120, 96, reel: true),
    ]);
  }

  // ── Derived ────────────────────────────────────────────────────────────
  List<Post> get all => [...posts, ...reels];

  List<Post> postsBy(Person who) =>
      posts.where((p) => p.author == who).toList();

  List<Post> reelsBy(Person who) =>
      reels.where((p) => p.author == who).toList();

  List<Post> get saved => all.where((p) => p.saved).toList();

  bool isFollowing(Person who) => following.contains(who.id);

  int followersOf(Person who) =>
      who.followers + (following.contains(who.id) ? 1 : 0);

  int followingOf(Person who) => who == me ? following.length : who.following;

  // ── Actions ────────────────────────────────────────────────────────────
  void toggleLike(Post post) {
    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    notifyListeners();
  }

  void toggleSave(Post post) {
    post.saved = !post.saved;
    notifyListeners();
  }

  void addComment(Post post, String text) {
    post.comments.add(Comment(me, text));
    notifyListeners();
  }

  void toggleFollow(Person who) {
    if (!following.remove(who.id)) following.add(who.id);
    notifyListeners();
  }

  void markStorySeen(Person who) {
    if (seenStories.add(who.id)) notifyListeners();
  }

  void addPost(Look look, String caption) {
    posts.insert(
      0,
      Post(
        id: 'n${_nextId++}',
        author: me,
        look: look,
        caption: caption.trim(),
        likes: 0,
        hours: 0,
      ),
    );
    notifyListeners();
  }

  void updateProfile({required String name, required String bio}) {
    if (name.trim().isNotEmpty) me.name = name.trim();
    me.bio = bio.trim();
    notifyListeners();
  }

  /// Two short story frames per person, picked deterministically.
  List<Look> storyFrames(Person who) {
    const lines = [
      'Grateful for Sunday service',
      'Verse of the day\nJoel 2:25',
      'Choir practice tonight',
      'Youth camp countdown!',
      'Praying for you all',
      'Good morning, church family',
    ];
    final seed = who.id.codeUnits.fold<int>(0, (a, b) => a + b);
    return [
      Look(
        kLooks[seed % kLooks.length].colors,
        kLooks[seed % kLooks.length].icon,
        lines[seed % lines.length],
      ),
      Look(
        kLooks[(seed + 2) % kLooks.length].colors,
        kLooks[(seed + 2) % kLooks.length].icon,
        lines[(seed + 3) % lines.length],
      ),
    ];
  }
}

final noahgram = NoahgramState();
