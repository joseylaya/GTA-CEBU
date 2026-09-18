import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFFDDF9E8),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(12),
                      child: Icon(
                        Icons.account_balance_wallet_rounded,
                        color: Color(0xFF22C96B),
                      ),
                    ),
                  ),
                  const Expanded(
                    child: Center(
                      child: Text(
                        'SplitShare',
                        style: TextStyle(
                            fontSize: 24, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  const SizedBox(width: 42),
                ],
              ),
              const SizedBox(height: 28),
              Container(
                  height: 190,
                  decoration: BoxDecoration(
                      gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF103E2A), Color(0xFF22C96B)]),
                      borderRadius: BorderRadius.circular(24)),
                  child: Stack(children: [
                    const Positioned(
                        right: -24,
                        top: -35,
                        child: CircleAvatar(
                            radius: 92, backgroundColor: Color(0x3322C96B))),
                    const Positioned(
                        left: 24,
                        bottom: 23,
                        child: Icon(Icons.groups_rounded,
                            color: Colors.white, size: 72)),
                    Positioned(
                        left: 24,
                        right: 24,
                        top: 24,
                        child: Text('Split bills.\nKeep friends.',
                            style: Theme.of(context)
                                .textTheme
                                .headlineSmall
                                ?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800)))
                  ])),
              const SizedBox(height: 30),
              Text(
                'Welcome to SplitShare',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Text(
                'The easy way to share expenses with the people you trust — without awkward conversations.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 25),
              const Row(children: [
                Expanded(
                    child: _WelcomeFeature(
                        icon: Icons.receipt_long_rounded,
                        label: 'Split bills\nclearly')),
                SizedBox(width: 12),
                Expanded(
                    child: _WelcomeFeature(
                        icon: Icons.notifications_active_rounded,
                        label: 'Settle up\non time')),
              ]),
              const Spacer(),
              FilledButton(
                onPressed: () => context.go('/auth/register'),
                child: const Text('Get Started'),
              ),
              const SizedBox(height: 12),
              FilledButton.tonal(
                onPressed: () => context.go('/auth/login'),
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(56)),
                child: const Text('Log In'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WelcomeFeature extends StatelessWidget {
  const _WelcomeFeature({required this.icon, required this.label});
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE5EAF1))),
      child: Row(children: [
        Icon(icon, color: const Color(0xFF22C96B)),
        const SizedBox(width: 8),
        Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)))
      ]));
}
