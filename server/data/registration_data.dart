import 'package:flutter/foundation.dart';

import 'noahgram_data.dart';
import 'world_data.dart';

/// Demo state for the new-member registration. Replace the actions with API
/// calls; the server must store the declaration, ID proof, photo and video.

enum RegStatus { pending, approved, videoReturned }

/// Numbers that are already members (they skip registration).
const kDemoMembers = {'+91 98765 43210'};

bool isExistingMember(String phone) => kDemoMembers.contains(phone.trim());

/// ID proofs: translation key of the label, and a number placeholder.
const kIdTypes = [
  ('aadhaar', 'reg_id_aadhaar', '2345 6789 0123'),
  ('pan', 'reg_id_pan', 'ABCDE1234F'),
  ('passport', 'reg_id_passport', 'A1234567'),
  ('dl', 'reg_id_dl', 'MH12 20110012345'),
  ('voter', 'reg_id_voter', 'ABC1234567'),
];

const kMinVideoSeconds = 10;
const kMaxVideoSeconds = 30;
const kOfficePhone = '+91 98200 00000';

/// Largest document or photo accepted, in bytes.
const kMaxUploadBytes = 5 * 1024 * 1024;
const kDocExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
const kPhotoExtensions = ['jpg', 'jpeg', 'png'];

String _compact(String v) => v.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();

/// Error key (translation) for a name part, or null when it is fine.
String? nameError(String v, {bool required = true}) {
  final t = v.trim();
  if (t.isEmpty) return required ? 'reg_err_name' : null;
  return RegExp(r"^[\p{L}][\p{L} .'-]{1,}$", unicode: true).hasMatch(t)
      ? null
      : 'reg_err_name';
}

String? emailError(String v) =>
    RegExp(r'^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$').hasMatch(v.trim())
    ? null
    : 'reg_err_email';

/// Members must be at least 18.
String? dobError(DateTime? d) {
  if (d == null) return null;
  final now = DateTime.now();
  var age = now.year - d.year;
  if (now.month < d.month || (now.month == d.month && now.day < d.day)) age--;
  return age >= 18 ? null : 'reg_err_dob18';
}

String? pinError(String v) =>
    RegExp(r'^[1-9]\d{5}$').hasMatch(v.trim()) ? null : 'reg_err_pin';

String? addressError(String v) => v.trim().length >= 5 ? null : 'reg_err_addr';

/// Format check for each ID type; returns an error key or null.
String? idNumberError(String? type, String v) {
  final c = _compact(v);
  final ok = switch (type) {
    'aadhaar' => RegExp(r'^[2-9]\d{11}$').hasMatch(c),
    'pan' => RegExp(r'^[A-Z]{5}\d{4}[A-Z]$').hasMatch(c),
    'passport' => RegExp(r'^[A-PR-WY][1-9]\d{5}[1-9]$').hasMatch(c),
    'dl' => RegExp(r'^[A-Z]{2}\d{2}(19|20)\d{2}\d{7}$').hasMatch(c),
    'voter' => RegExp(r'^[A-Z]{3}\d{7}$').hasMatch(c),
    _ => false,
  };
  return ok ? null : 'reg_err_$type';
}

class RegistrationState extends ChangeNotifier {
  // Step 1: details
  String firstName = '';
  String middleName = '';
  String lastName = '';
  String email = '';
  String gender = ''; // male | female | other
  DateTime? dob;
  String marital =
      ''; // single | married | widow | widower | separated | divorced
  String reference = '';

  // Step 2: address
  String address1 = '';
  String address2 = '';
  String country = 'India';
  String state = '';
  String city = '';
  String pin = '';

  // Step 3: ID proof
  String? idType;
  String idNumber = '';
  String? idFile; // display name
  String? idPath; // local path of the picked file

  // Step 4: photo
  String? photoFile; // display name
  String? photoPath; // local path of the picked image

  // Step 5: declaration
  bool agreed = false;
  String signature = '';
  DateTime? signedOn;

  // Step 6: video
  int? videoSeconds;
  String? videoPath; // the recorded file (null in the demo fallback)

  // Outcome
  String phone = '';
  bool completed = false;
  RegStatus status = RegStatus.pending;

  /// Call after changing a field so listeners (the footer button) refresh.
  void touch() => notifyListeners();

  void start(String phoneNumber) {
    phone = phoneNumber;
    firstName = middleName = lastName = email = gender = marital = '';
    reference = address1 = address2 = city = pin = idNumber = signature = '';
    dob = null;
    country = 'India';
    state = '';
    idType = idFile = idPath = photoFile = photoPath = null;
    agreed = false;
    signedOn = null;
    videoSeconds = null;
    videoPath = null;
    completed = false;
    status = RegStatus.pending;
    notifyListeners();
  }

  // ── Derived ────────────────────────────────────────────────────────────
  String get fullName => [
    firstName,
    middleName,
    lastName,
  ].map((p) => p.trim()).where((p) => p.isNotEmpty).join(' ');

  String get honorific => switch (gender) {
    'male' => 'Mr',
    'female' => marital == 'married' ? 'Mrs' : 'Ms',
    _ => '',
  };

  /// e.g. "Mr Shashank Sanjay Gupta".
  String get displayName => '$honorific $fullName'.trim();

  bool get signatureMatches =>
      signature.trim().isNotEmpty &&
      signature.trim().toLowerCase() == fullName.toLowerCase();

  bool get detailsValid =>
      nameError(firstName) == null &&
      nameError(middleName, required: false) == null &&
      nameError(lastName) == null &&
      emailError(email) == null &&
      gender.isNotEmpty &&
      dob != null &&
      dobError(dob) == null &&
      marital.isNotEmpty &&
      nameError(reference, required: false) == null;

  bool get addressValid =>
      addressError(address1) == null &&
      city.trim().isNotEmpty &&
      country.isNotEmpty &&
      (state.isNotEmpty || (World.ready?.statesOf(country).isEmpty ?? true)) &&
      pinError(pin) == null;

  bool get idValid =>
      idType != null &&
      idNumberError(idType, idNumber) == null &&
      idFile != null;

  bool get photoValid => photoFile != null;

  bool get declarationValid => agreed && signatureMatches;

  bool get videoValid =>
      videoSeconds != null &&
      videoSeconds! >= kMinVideoSeconds &&
      videoSeconds! <= kMaxVideoSeconds;

  bool stepValid(int step) => switch (step) {
    0 => detailsValid,
    1 => addressValid,
    2 => idValid,
    3 => photoValid,
    4 => declarationValid,
    _ => videoValid,
  };

  // ── Actions ────────────────────────────────────────────────────────────
  /// Sets the signing date the first time the declaration is accepted.
  void sign() {
    signedOn ??= DateTime.now();
    notifyListeners();
  }

  void complete() {
    completed = true;
    status = RegStatus.pending;
    notifyListeners();
  }

  /// Demo: the office approves. The member's name then shows across the app.
  void approve() {
    status = RegStatus.approved;
    noahgram.updateProfile(name: fullName, bio: noahgram.me.bio);
    notifyListeners();
  }

  /// Demo: the office sends the video back for a re-record.
  void returnVideo() {
    status = RegStatus.videoReturned;
    videoSeconds = null;
    videoPath = null;
    notifyListeners();
  }
}

final registration = RegistrationState();
