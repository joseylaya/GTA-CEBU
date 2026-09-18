import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  const supabasePublishableKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  // Credentials are injected through --dart-define. This allows the shell UI
  // to run on a new device before a Supabase project is configured.
  if (supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty) {
    await Supabase.initialize(
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
    );
  }
  // Firebase.initializeApp() is enabled after FlutterFire config is generated
  // for the Android/iOS project. FCM registration is only attempted after auth.
  runApp(const ProviderScope(child: SplitShareApp()));
}
