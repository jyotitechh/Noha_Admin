import 'package:flutter/material.dart';

/// Demo state for the pages inside the Me tab (location, identity & consent,
/// profile photo, store, rewards). Replace the methods with API calls later.

class LocationItem {
  const LocationItem(this.name, this.group, this.members);

  final String name;
  final String group;
  final int members;
}

enum PhotoStatus { review, approved, returned }

class PhotoEntry {
  PhotoEntry({
    required this.titleKey,
    required this.at,
    required this.status,
    this.by,
  });

  final String titleKey;
  final DateTime at;
  final PhotoStatus status;

  /// Reviewer, for approved photographs.
  final String? by;
}

class Product {
  const Product(this.id, this.name, this.category, this.rupees);

  final String id;
  final String name;

  /// `books`, `media`, `gifts` or `study`.
  final String category;
  final int rupees;
}

class Payout {
  const Payout(this.amount, this.date, this.batch, {this.paid = true});

  final double amount;
  final DateTime date;
  final String batch;
  final bool paid;
}

/// 3120 -> "3,120".
String groupDigits(int n) => n.toString().replaceAllMapped(
  RegExp(r'(\d)(?=(\d{3})+$)'),
  (m) => '${m[1]},',
);

/// Formats rupees: `₹1,200` for whole amounts, `₹62.40` for fractions.
String rupees(num value, {bool decimals = false}) {
  final fixed = decimals ? value.toStringAsFixed(2) : value.round().toString();
  final parts = fixed.split('.');
  final whole = parts[0].replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'),
    (m) => '${m[1]},',
  );
  return '₹$whole${parts.length > 1 ? '.${parts[1]}' : ''}';
}

class MeState extends ChangeNotifier {
  // ── Location ──────────────────────────────────────────────────────────
  static const locations = [
    LocationItem('Dadar East', 'Mumbai Metro', 3120),
    LocationItem('Andheri West', 'Mumbai Metro', 1880),
    LocationItem('Pune Camp', 'West', 2410),
    LocationItem('Nashik', 'West', 940),
    LocationItem('Kochi', 'South', 1660),
  ];

  LocationItem location = locations.first;

  void setLocation(LocationItem l) {
    location = l;
    notifyListeners();
  }

  // ── Identity & consent ────────────────────────────────────────────────
  static const aadhaarLast4 = '4417';
  static const identityTotal = 3;

  DateTime? consentAt;
  int? videoSeconds;

  bool get consentDone => consentAt != null;
  bool get videoDone => videoSeconds != null;

  /// Aadhaar is already verified in the demo, so it always counts.
  int get identityDone => 1 + (consentDone ? 1 : 0) + (videoDone ? 1 : 0);

  void agreeConsent() {
    consentAt ??= DateTime.now();
    notifyListeners();
  }

  /// Camera capture isn't wired yet; this records a demo 18 second video.
  void submitVideo([int seconds = 18]) {
    videoSeconds ??= seconds;
    notifyListeners();
  }

  // ── Profile photo ─────────────────────────────────────────────────────
  final photos = <PhotoEntry>[];

  PhotoEntry? get pendingPhoto {
    for (final p in photos) {
      if (p.status == PhotoStatus.review) return p;
    }
    return null;
  }

  /// Image picking needs a plugin; this stands in for a real upload.
  void uploadPhoto() {
    photos.insert(
      0,
      PhotoEntry(
        titleKey: 'ph_portrait',
        at: DateTime.now(),
        status: PhotoStatus.review,
      ),
    );
    notifyListeners();
  }

  // ── Store ─────────────────────────────────────────────────────────────
  static const products = [
    Product('p1', 'The Weight of Grace', 'books', 350),
    Product('p2', 'Praying the Psalms', 'books', 420),
    Product('p3', 'Worship album · Kochi', 'media', 250),
    Product('p4', 'Study Bible · Marathi', 'books', 1200),
    Product('p5', 'Prayer journal', 'gifts', 180),
    Product('p6', 'Cross pendant', 'gifts', 300),
    Product('p7', 'Foundations workbook', 'study', 150),
    Product('p8', 'Bible study guide', 'study', 220),
  ];

  final cart = <String, int>{};

  int get cartCount => cart.values.fold(0, (a, b) => a + b);

  int get cartTotal {
    var total = 0;
    cart.forEach((id, n) {
      total += products.firstWhere((p) => p.id == id).rupees * n;
    });
    return total;
  }

  void addToCart(Product p) {
    cart[p.id] = (cart[p.id] ?? 0) + 1;
    notifyListeners();
  }

  /// Called after the payment is confirmed (see `showPaymentSheet`).
  void clearCart() {
    cart.clear();
    notifyListeners();
  }

  // ── Rewards ───────────────────────────────────────────────────────────
  static const likeRate = 0.005; // 0.5 paise, in rupees
  static const commentRate = 0.02; // 2 paise
  static const postRate = 0.03; // 3 paise
  static const minimumWithdrawal = 50;

  final int likes = 4280;
  final int comments = 1120;
  final int posts = 620;
  final payouts = <Payout>[];
  double paidOut = 0;
  bool withdrawalPending = false;

  double get likesEarned => likes * likeRate;
  double get commentsEarned => comments * commentRate;
  double get postsEarned => posts * postRate;
  double get available =>
      withdrawalPending ? 0 : likesEarned + commentsEarned + postsEarned;

  bool get canWithdraw => !withdrawalPending && available >= minimumWithdrawal;

  /// Requests a payout of everything available. The finance office pays it.
  void withdraw() {
    if (!canWithdraw) return;
    payouts.insert(
      0,
      Payout(available, DateTime.now(), 'PB-PENDING', paid: false),
    );
    withdrawalPending = true;
    notifyListeners();
  }

  MeState() {
    final now = DateTime.now();
    photos.addAll([
      PhotoEntry(
        titleKey: 'ph_portrait',
        at: now.subtract(const Duration(hours: 2)),
        status: PhotoStatus.review,
      ),
      PhotoEntry(
        titleKey: 'ph_portrait',
        at: DateTime(2024, 3, 14),
        status: PhotoStatus.approved,
        by: 'S. Menon',
      ),
      PhotoEntry(
        titleKey: 'ph_group',
        at: DateTime(2024, 3, 2),
        status: PhotoStatus.returned,
      ),
    ]);
    payouts.addAll([
      Payout(58.20, DateTime(2026, 6, 14), 'PB-2026-0612'),
      Payout(71.05, DateTime(2026, 1, 2), 'PB-2026-0014'),
    ]);
  }
}

final meState = MeState();
