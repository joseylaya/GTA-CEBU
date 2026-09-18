import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

class AuthSession {
  const AuthSession(
      {required this.userId,
      required this.accessToken,
      required this.email,
      required this.name});

  final String userId;
  final String accessToken;
  final String email;
  final String name;
}

class AuthException implements Exception {
  const AuthException(this.code, this.message);
  final String code;
  final String message;
}

class AuthRepository {
  static const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const _supabasePublishableKey =
      String.fromEnvironment('SUPABASE_ANON_KEY');

  bool get _isConfigured =>
      _supabaseUrl.isNotEmpty && _supabasePublishableKey.isNotEmpty;

  dynamic get _client {
    if (!_isConfigured) {
      throw const AuthException(
        'SUPABASE_NOT_CONFIGURED',
        'Sign-in is not configured yet. Launch the app with SUPABASE_URL and SUPABASE_ANON_KEY.',
      );
    }
    return supabase.Supabase.instance.client.auth;
  }

  Future<AuthSession> register(
          {required String name,
          required String email,
          required String password}) =>
      _signUp(name: name, email: email, password: password);

  Future<AuthSession> login(
          {required String email, required String password}) =>
      _signIn(email: email, password: password);

  Future<AuthSession> _signUp(
      {required String name,
      required String email,
      required String password}) async {
    try {
      final response = await _client.signUp(
        email: email,
        password: password,
        data: {'name': name},
      );
      if (response.session == null) {
        throw const AuthException('EMAIL_CONFIRMATION_REQUIRED',
            'Check your email to confirm your account, then sign in.');
      }
      return _fromSession(response.session!);
    } on AuthException {
      rethrow;
    } on supabase.AuthException catch (error) {
      throw AuthException(error.statusCode ?? 'AUTH_ERROR', error.message);
    }
  }

  Future<AuthSession> _signIn(
      {required String email, required String password}) async {
    try {
      final response =
          await _client.signInWithPassword(email: email, password: password);
      return _fromSession(response.session);
    } on AuthException {
      rethrow;
    } on supabase.AuthException catch (error) {
      throw AuthException(error.statusCode ?? 'AUTH_ERROR', error.message);
    }
  }

  AuthSession _fromSession(supabase.Session? session) {
    if (session == null || session.user.email == null) {
      throw const AuthException(
          'AUTH_ERROR', 'Supabase did not return a valid session.');
    }
    final email = session.user.email!;
    final metadata = session.user.userMetadata;
    return AuthSession(
      userId: session.user.id,
      accessToken: session.accessToken,
      email: email,
      name: metadata?['name'] as String? ?? email.split('@').first,
    );
  }

  Future<AuthSession?> restore() async {
    if (!_isConfigured) return null;
    final session = _client.currentSession;
    return session == null ? null : _fromSession(session);
  }

  Future<void> clear() => _isConfigured ? _client.signOut() : Future.value();
}
