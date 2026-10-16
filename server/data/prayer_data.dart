import 'package:flutter/foundation.dart';

class PrayerRequest {
  PrayerRequest({
    required this.categoryKey,
    required this.text,
    required this.anonymous,
    required this.everyone,
    this.mannaTitleKey,
  }) : at = DateTime.now();

  /// Translation key, e.g. `pr_cat_healing`.
  final String categoryKey;
  final String text;
  final bool anonymous;

  /// true: visible to the whole congregation.
  /// false: visible to the prayer warriors only.
  final bool everyone;

  /// Set when the request was written from a Daily Manna reading.
  final String? mannaTitleKey;
  final DateTime at;
}

/// Demo store for prayer requests. Replace [add] with an API call; the
/// backend should route requests to the prayer team.
class PrayerState extends ChangeNotifier {
  final requests = <PrayerRequest>[];

  void add({
    required String categoryKey,
    required String text,
    required bool anonymous,
    required bool everyone,
    String? mannaTitleKey,
  }) {
    requests.insert(
      0,
      PrayerRequest(
        categoryKey: categoryKey,
        text: text.trim(),
        anonymous: anonymous,
        everyone: everyone,
        mannaTitleKey: mannaTitleKey,
      ),
    );
    notifyListeners();
  }
}

final prayer = PrayerState();

const kPrayerCategories = [
  'pr_cat_healing',
  'pr_cat_family',
  'pr_cat_guidance',
  'pr_cat_thanks',
  'pr_cat_other',
];
