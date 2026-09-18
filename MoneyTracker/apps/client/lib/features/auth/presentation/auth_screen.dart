import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth_controller.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({required this.mode, super.key});
  final String mode;

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool get _isRegistration => widget.mode == 'register';

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final succeeded = await ref.read(authControllerProvider.notifier).submit(
          isRegistration: _isRegistration,
          name: _name.text,
          email: _email.text,
          password: _password.text,
        );
    if (succeeded && mounted) context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/'),
          ),
          title: Text(_isRegistration ? 'Create account' : 'Log in'),
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: ListView(
                  padding: const EdgeInsets.all(24),
                  children: [
                    Text(
                        _isRegistration
                            ? 'Start sharing clearly.'
                            : 'Welcome back.',
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 24),
                    if (_isRegistration) ...[
                      TextFormField(
                          controller: _name,
                          decoration: const InputDecoration(labelText: 'Name'),
                          validator: (value) =>
                              value == null || value.trim().isEmpty
                                  ? 'Enter your name.'
                                  : null),
                      const SizedBox(height: 16),
                    ],
                    TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: 'Email'),
                        validator: (value) =>
                            value == null || !value.contains('@')
                                ? 'Enter a valid email.'
                                : null),
                    const SizedBox(height: 16),
                    TextFormField(
                        controller: _password,
                        obscureText: true,
                        decoration:
                            const InputDecoration(labelText: 'Password'),
                        validator: (value) => value == null || value.length < 12
                            ? 'Use at least 12 characters.'
                            : null),
                    if (auth.error != null)
                      Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: Text(auth.error!,
                              style: TextStyle(
                                  color: Theme.of(context).colorScheme.error))),
                    const SizedBox(height: 24),
                    FilledButton(
                        onPressed: auth.isLoading ? null : _submit,
                        child: Text(auth.isLoading
                            ? 'Please wait…'
                            : _isRegistration
                                ? 'Create account'
                                : 'Log in')),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: auth.isLoading
                          ? null
                          : () => context.go(
                                _isRegistration
                                    ? '/auth/login'
                                    : '/auth/register',
                              ),
                      child: Text(
                        _isRegistration
                            ? 'Already have an account? Log in'
                            : 'Don’t have an account? Create one',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
