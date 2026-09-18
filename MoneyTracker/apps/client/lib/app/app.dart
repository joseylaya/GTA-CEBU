import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme/splitshare_theme.dart';
import '../features/auth/presentation/auth_controller.dart';

class SplitShareApp extends ConsumerStatefulWidget {
  const SplitShareApp({super.key});

  @override
  ConsumerState<SplitShareApp> createState() => _SplitShareAppState();
}

class _SplitShareAppState extends ConsumerState<SplitShareApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(authControllerProvider.notifier).restore());
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'SplitShare',
      theme: splitShareTheme,
      routerConfig: appRouter,
    );
  }
}
