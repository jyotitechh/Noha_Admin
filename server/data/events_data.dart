import 'package:flutter/material.dart';

/// Demo events + passes. Dates are generated relative to today so the demo
/// always has upcoming, past and booked items. Replace with API data later.

class EventItem {
  EventItem({
    required this.id,
    required this.titleKey,
    required this.place,
    required this.start,
    this.endsOn,
    this.seatsLeft,
    this.special = false,
    this.soon = false,
  });

  final String id;

  /// Translation key of the title.
  final String titleKey;
  final String place;
  final DateTime start;

  /// Last day of a multi-day event (the start time is then not shown).
  final DateTime? endsOn;
  int? seatsLeft;

  /// Shown under "Open for booking" on the Events tab.
  final bool special;

  /// Booking not open yet.
  final bool soon;

  bool get isPast => start.isBefore(DateTime.now());
}

class EventPass {
  EventPass({
    required this.event,
    required this.seats,
    required this.passes,
    required this.gate,
    required this.code,
    required this.bookedOn,
  });

  final EventItem event;
  final String seats;
  final String passes;
  final String gate;
  final String code;
  final DateTime bookedOn;
}

class EventsState extends ChangeNotifier {
  EventsState() {
    _seed();
  }

  final events = <EventItem>[];

  /// Newest first. The first one is shown as "Latest".
  final passes = <EventPass>[];

  DateTime get today => DateUtils.dateOnly(DateTime.now());

  void _seed() {
    final t = today;
    DateTime at(DateTime day, int h, int m) =>
        DateTime(day.year, day.month, day.day, h, m);

    // Weekly services and cell meetings around today.
    for (var o = -45; o <= 150; o++) {
      final d = t.add(Duration(days: o));
      final key = '${d.year}${d.month}${d.day}';
      if (d.weekday == DateTime.sunday) {
        events.add(
          EventItem(
            id: 'sun1-$key',
            titleKey: 'ev2_sunday1',
            place: 'Hall A',
            start: at(d, 8, 0),
          ),
        );
        events.add(
          EventItem(
            id: 'sun2-$key',
            titleKey: 'ev_sunday2',
            place: 'Hall A',
            start: at(d, 10, 30),
          ),
        );
      }
      if (d.weekday == DateTime.wednesday) {
        events.add(
          EventItem(
            id: 'cell-$key',
            titleKey: 'ev2_cell',
            place: "Blessy Mathew's home",
            start: at(d, 19, 30),
          ),
        );
      }
    }

    final night = EventItem(
      id: 'night',
      titleKey: 's1_title',
      place: 'Hall A',
      start: at(t.add(const Duration(days: 11)), 19, 0),
      seatsLeft: 180,
      special: true,
    );
    events.addAll([
      night,
      EventItem(
        id: 'marathi',
        titleKey: 'ev_marathi',
        place: 'Hall B',
        start: at(t.add(const Duration(days: 8)), 8, 0),
        seatsLeft: 90,
        special: true,
      ),
    ]);

    // Annual convention: 12-14 December (next one if this year's has passed).
    var convention = DateTime(t.year, 12, 12);
    if (convention.isBefore(t)) convention = DateTime(t.year + 1, 12, 12);
    events.add(
      EventItem(
        id: 'convention',
        titleKey: 'ev_convention',
        place: 'Goregaon',
        start: convention,
        endsOn: convention.add(const Duration(days: 2)),
        special: true,
        soon: true,
      ),
    );

    // Two passes the member already holds.
    final sunday = events.firstWhere(
      (e) => e.titleKey == 'ev_sunday2' && !e.isPast,
    );
    passes.addAll([
      EventPass(
        event: night,
        seats: 'B-05, B-06',
        passes: '2 of 4',
        gate: 'East',
        code: 'P-4413',
        bookedOn: t.subtract(const Duration(days: 1)),
      ),
      EventPass(
        event: sunday,
        seats: 'C-14, C-15',
        passes: '2 of 4',
        gate: 'North',
        code: 'P-4390',
        bookedOn: t.subtract(const Duration(days: 3)),
      ),
    ]);
  }

  // ── Queries ────────────────────────────────────────────────────────────
  bool isBooked(EventItem e) => passes.any((p) => p.event.id == e.id);

  /// Events starting on [day], earliest first.
  List<EventItem> on(DateTime day) =>
      events.where((e) => DateUtils.isSameDay(e.start, day)).toList()
        ..sort((a, b) => a.start.compareTo(b.start));

  bool hasEvents(DateTime day) =>
      events.any((e) => DateUtils.isSameDay(e.start, day));

  /// Special upcoming events, soonest first.
  List<EventItem> get open =>
      events.where((e) => e.special && !e.isPast).toList()
        ..sort((a, b) => a.start.compareTo(b.start));

  /// Whether [e] can be booked right now.
  bool canBook(EventItem e) => !e.isPast && !e.soon && !isBooked(e);

  // ── Actions ────────────────────────────────────────────────────────────
  /// Demo booking: two seats, newest pass first. Replace with an API call.
  void book(EventItem e) {
    if (!canBook(e)) return;
    final n = passes.length;
    final row = String.fromCharCode(65 + n % 6);
    passes.insert(
      0,
      EventPass(
        event: e,
        seats: '$row-0${n + 1}, $row-0${n + 2}',
        passes: '2 of 4',
        gate: const ['North', 'East', 'South'][n % 3],
        code: 'P-${4400 + n * 13}',
        bookedOn: DateTime.now(),
      ),
    );
    final left = e.seatsLeft;
    if (left != null) e.seatsLeft = left - 2;
    notifyListeners();
  }
}

final eventsState = EventsState();
