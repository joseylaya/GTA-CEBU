import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:splitshare/app/app.dart';

void main() {
  testWidgets('shows the SplitShare welcome shell', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: SplitShareApp()));

    expect(find.text('SplitShare'), findsOneWidget);
    expect(find.text('Get started'), findsOneWidget);
    expect(find.text('Log in'), findsOneWidget);
  });
}
