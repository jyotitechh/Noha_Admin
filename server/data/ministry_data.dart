import 'package:flutter/material.dart';

import 'jodie_data.dart' show ChatMessage;

/// Demo data for the Me tab: the member's pastor, cell leader and the church
/// office, plus the record shown under "Your record". Replace with the API.

class MinistryContact {
  MinistryContact({
    required this.id,
    required this.name,
    required this.roleKey,
    required this.colors,
    List<ChatMessage>? messages,
    this.unread = 0,
  }) : messages = messages ?? [];

  final String id;
  final String name;

  /// Translation key of the role line, e.g. `ch_pastor_role`.
  final String roleKey;
  final List<Color> colors;
  final List<ChatMessage> messages;
  int unread;

  String get initials => name
      .replaceAll('Ps. ', '')
      .split(' ')
      .where((p) => p.isNotEmpty)
      .take(2)
      .map((p) => p[0].toUpperCase())
      .join();

  ChatMessage? get last => messages.isEmpty ? null : messages.last;
}

class MemberRecord {
  const MemberRecord({
    this.memberSince = 2014,
    this.place = 'Dadar',
    this.cell = '12',
    this.cellArea = 'Dadar East',
    this.familyLinked = 4,
  });

  final int memberSince;
  final String place;
  final String cell;
  final String cellArea;
  final int familyLinked;
}

class MinistryState extends ChangeNotifier {
  MinistryState() {
    _seed();
  }

  final record = const MemberRecord();
  late final MinistryContact pastor;
  late final MinistryContact leader;
  late final MinistryContact office;

  List<MinistryContact> get contacts => [pastor, leader, office];

  int get unreadTotal => contacts.fold(0, (sum, c) => sum + c.unread);

  void _seed() {
    final now = DateTime.now();
    DateTime at(int daysAgo, int h, int m) {
      final d = now.subtract(Duration(days: daysAgo));
      return DateTime(d.year, d.month, d.day, h, m);
    }

    pastor = MinistryContact(
      id: 'pastor',
      name: 'Ps. Emmanuel Kumar',
      roleKey: 'ch_pastor_role',
      colors: const [Color(0xFF3F3C9E), Color(0xFF7C6BD6)],
      unread: 2,
      messages: [
        ChatMessage(
          'Pastor, please pray for Hannah. Her exams begin on Monday.',
          mine: true,
          at: at(0, 8, 52),
        ),
        ChatMessage(
          'We will pray for Hannah\'s exams.',
          mine: false,
          at: at(0, 9, 18),
        ),
        ChatMessage(
          'Bring her on Sunday, we will pray over her after the second service.',
          mine: false,
          at: at(0, 9, 20),
        ),
      ],
    );
    leader = MinistryContact(
      id: 'leader',
      name: 'Blessy Mathew',
      roleKey: 'ch_leader_role',
      colors: const [Color(0xFFA0267F), Color(0xFFE07AB0)],
      messages: [
        ChatMessage(
          'Cell 12 meets this Wednesday at 7:30 pm at my home.',
          mine: false,
          at: at(1, 18, 5),
        ),
        ChatMessage(
          'I will be there. Thank you!',
          mine: true,
          at: at(1, 18, 20),
        ),
      ],
    );
    office = MinistryContact(
      id: 'office',
      name: 'Church office',
      roleKey: 'ch_office_role',
      colors: const [Color(0xFF1F7A6B), Color(0xFF58C0A5)],
      messages: [
        ChatMessage(
          'Your Aadhaar verification is pending. Please upload the consent form.',
          mine: false,
          at: at(2, 11, 40),
        ),
      ],
    );
  }

  void markRead(MinistryContact c) {
    if (c.unread != 0) {
      c.unread = 0;
      notifyListeners();
    }
  }

  void send(MinistryContact c, String text) {
    if (text.trim().isEmpty) return;
    c.messages.add(ChatMessage(text.trim(), mine: true));
    notifyListeners();
  }
}

final ministry = MinistryState();
