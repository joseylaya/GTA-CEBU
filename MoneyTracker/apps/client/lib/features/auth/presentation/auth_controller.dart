import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../../notifications/data/fcm_registration_repository.dart';

class AuthState {
  const AuthState({this.session, this.isLoading = false, this.error});
  final AuthSession? session;
  final bool isLoading;
  final String? error;

  AuthState copyWith({AuthSession? session, bool? isLoading, String? error, bool clearError = false}) => AuthState(
        session: session ?? this.session,
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : error ?? this.error,
      );
}

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository());
final fcmRegistrationRepositoryProvider =
    Provider<FcmRegistrationRepository>((ref) => FcmRegistrationRepository());
final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) => AuthController(
    ref.read(authRepositoryProvider),
    ref.read(fcmRegistrationRepositoryProvider),
  ),
);

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository, this._fcmRegistration) : super(const AuthState());
  final AuthRepository _repository;
  final FcmRegistrationRepository _fcmRegistration;

  Future<void> restore() async => state = state.copyWith(session: await _repository.restore());

  Future<bool> submit({required bool isRegistration, required String name, required String email, required String password}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final session = isRegistration
          ? await _repository.register(name: name, email: email, password: password)
          : await _repository.login(email: email, password: password);
      // A token failure must never make a successful Supabase sign-in fail.
      // It is retried on the next completed sign-in.
      try {
        await _fcmRegistration.register(
          accessToken: session.accessToken,
          platform: _fcmPlatform(),
        );
      } catch (_) {}
      state = AuthState(session: session);
      return true;
    } on AuthException catch (error) {
      state = AuthState(error: error.message);
      return false;
    }
  }

  Future<void> logout() async {
    await _repository.clear();
    state = const AuthState();
  }
}

String _fcmPlatform() {
  if (kIsWeb) return 'web';
  return defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
}
