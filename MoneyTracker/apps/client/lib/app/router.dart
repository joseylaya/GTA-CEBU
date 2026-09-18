import 'package:go_router/go_router.dart';

import '../features/auth/presentation/welcome_screen.dart';
import '../features/auth/presentation/auth_screen.dart';
import '../features/home/presentation/home_screen.dart';

final GoRouter appRouter = GoRouter(
  routes: <RouteBase>[
    GoRoute(
      path: '/',
      builder: (context, state) => const WelcomeScreen(),
    ),
    GoRoute(
      path: '/auth/:mode',
      builder: (context, state) => AuthScreen(mode: state.pathParameters['mode'] ?? 'login'),
    ),
    GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
  ],
);
