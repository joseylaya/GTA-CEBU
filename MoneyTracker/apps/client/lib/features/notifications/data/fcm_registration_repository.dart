import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;

/// Registers the current device only after Supabase authentication succeeds.
class FcmRegistrationRepository {
  FcmRegistrationRepository({http.Client? client, FirebaseMessaging? messaging})
      : _client = client ?? http.Client(),
        _messaging = messaging;

  static const _apiBaseUrl = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'http://127.0.0.1:8081');
  final http.Client _client;
  final FirebaseMessaging? _messaging;

  Future<void> register({required String accessToken, required String platform}) async {
    // This is deliberately lazy. A fresh development build may not have
    // FlutterFire configuration yet, and should still be able to open.
    if (Firebase.apps.isEmpty) await Firebase.initializeApp();
    final messaging = _messaging ?? FirebaseMessaging.instance;
    await messaging.requestPermission();
    final token = await messaging.getToken();
    if (token == null) return;
    await _client.put(
      Uri.parse('$_apiBaseUrl/api/v1/devices/fcm-token'),
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'token': token, 'platform': platform}),
    );
  }
}
