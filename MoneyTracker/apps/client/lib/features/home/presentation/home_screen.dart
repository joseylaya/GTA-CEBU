import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../auth/presentation/auth_controller.dart';
import '../../trackers/presentation/tracker_detail_screen.dart';
import 'invitations_sheet.dart';

const _apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8081');
const _ink = Color(0xFF0E1930);
const _muted = Color(0xFF637592);
const _green = Color(0xFF22C96B);

class TrackerSummary {
  const TrackerSummary(
      {required this.id,
      required this.name,
      required this.currencyCode,
      required this.role,
      this.totalMinor = 0,
      this.memberCount = 1,
      this.myBalanceMinor = 0});
  final String id;
  final String name;
  final String currencyCode;
  final String role;
  final int totalMinor;
  final int memberCount;
  final int myBalanceMinor;

  factory TrackerSummary.fromJson(Map<String, dynamic> json) => TrackerSummary(
        id: json['id'] as String,
        name: json['name'] as String,
        currencyCode: json['currency_code'] as String,
        role: json['role'] as String,
      );
}

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late Future<List<TrackerSummary>> _trackers;

  @override
  void initState() {
    super.initState();
    _trackers = _load();
  }

  Future<List<TrackerSummary>> _load() async {
    final token = ref.read(authControllerProvider).session?.accessToken;
    if (token == null) return [];
    final response = await http.get(Uri.parse('$_apiBaseUrl/api/v1/trackers'),
        headers: {
          'Authorization': 'Bearer $token'
        }).timeout(const Duration(seconds: 15));
    if (response.statusCode == 401) {
      await ref.read(authControllerProvider.notifier).logout();
      return [];
    }
    if (response.statusCode != 200) throw Exception('Could not load Trackers.');
    final data = (jsonDecode(response.body) as Map<String, dynamic>)['data']
        as List<dynamic>;
    final trackers = data
        .map((item) => TrackerSummary.fromJson(item as Map<String, dynamic>))
        .toList();
    final userId = ref.read(authControllerProvider).session?.userId;
    return Future.wait(trackers.map((tracker) async {
      try {
        final responses = await Future.wait([
          http.get(
              Uri.parse('$_apiBaseUrl/api/v1/trackers/${tracker.id}/expenses'),
              headers: {'Authorization': 'Bearer $token'}),
          http.get(
              Uri.parse('$_apiBaseUrl/api/v1/trackers/${tracker.id}/balances'),
              headers: {'Authorization': 'Bearer $token'}),
          http.get(
              Uri.parse('$_apiBaseUrl/api/v1/trackers/${tracker.id}/members'),
              headers: {'Authorization': 'Bearer $token'}),
        ]).timeout(const Duration(seconds: 12));
        if (responses.any((response) => response.statusCode != 200)) {
          return tracker;
        }
        final expenses = List<Map<String, dynamic>>.from(
            (jsonDecode(responses[0].body) as Map<String, dynamic>)['data']
                as List);
        final balances = (jsonDecode(responses[1].body)
            as Map<String, dynamic>)['data'] as Map<String, dynamic>;
        final members = List<Map<String, dynamic>>.from(
            (jsonDecode(responses[2].body) as Map<String, dynamic>)['data']
                as List);
        final myBalance = (balances['member_balances'] as List)
            .cast<Map<String, dynamic>>()
            .where((item) => item['user_id'] == userId)
            .map((item) => item['balance_minor'] as int)
            .firstOrNull;
        return TrackerSummary(
            id: tracker.id,
            name: tracker.name,
            currencyCode: tracker.currencyCode,
            role: tracker.role,
            totalMinor: expenses.fold<int>(0,
                (total, expense) => total + (expense['amount_minor'] as int)),
            memberCount: members.length,
            myBalanceMinor: myBalance ?? 0);
      } catch (_) {
        return tracker;
      }
    }));
  }

  void _refresh() => setState(() => _trackers = _load());

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    if (auth.session == null) {
      return const Scaffold(body: Center(child: Text('Sign in to continue.')));
    }
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        backgroundColor: _green,
        foregroundColor: Colors.white,
        elevation: 3,
        shape: const CircleBorder(),
        onPressed: () async {
          final created = await showModalBottomSheet<bool>(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.white,
            shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            builder: (_) =>
                CreateTrackerSheet(token: auth.session!.accessToken),
          );
          if (created == true) _refresh();
        },
        child: const Icon(Icons.add, size: 28),
      ),
      bottomNavigationBar: _BottomNavigation(
          onHome: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => HomeOverviewScreen(
                  token: auth.session!.accessToken,
                  name: auth.session!.name,
                  currentUserId: auth.session!.userId))),
          onActivity: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => ActivityFeedScreen(
                  token: auth.session!.accessToken,
                  currentUserId: auth.session!.userId))),
          onProfile: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => ProfileScreen(
                  name: auth.session!.name,
                  email: auth.session!.email,
                  onLogout: () async {
                    await ref.read(authControllerProvider.notifier).logout();
                    if (context.mounted) {
                      Navigator.of(context).popUntil((route) => route.isFirst);
                    }
                  })))),
      body: SafeArea(
        child: FutureBuilder<List<TrackerSummary>>(
          future: _trackers,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) return _LoadError(onRetry: _refresh);
            final trackers = snapshot.data ?? [];
            return RefreshIndicator(
              color: _green,
              onRefresh: () async => _refresh(),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 112),
                children: [
                  Row(children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                          color: const Color(0xFFDDF9E8),
                          borderRadius: BorderRadius.circular(15)),
                      child: const Icon(Icons.account_balance_wallet_rounded,
                          color: _green),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text('Trackers',
                              style: TextStyle(
                                  color: _ink,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 26,
                                  letterSpacing: -0.8)),
                          SizedBox(height: 2),
                          Text('Shared expenses, made simple',
                              style: TextStyle(color: _muted, fontSize: 13)),
                        ])),
                    IconButton(
                        onPressed: () async {
                          await showModalBottomSheet<void>(
                              context: context,
                              backgroundColor: Colors.white,
                              isScrollControlled: true,
                              shape: const RoundedRectangleBorder(
                                  borderRadius: BorderRadius.vertical(
                                      top: Radius.circular(28))),
                              builder: (_) => InvitationsSheet(
                                  token: auth.session!.accessToken));
                          _refresh();
                        },
                        icon: const Icon(Icons.notifications_none_rounded,
                            color: _muted),
                        tooltip: 'Invitations'),
                  ]),
                  const SizedBox(height: 24),
                  _DashboardMetrics(trackers: trackers),
                  const SizedBox(height: 28),
                  Row(children: [
                    const Text('Your Trackers',
                        style: TextStyle(
                            color: _ink,
                            fontSize: 25,
                            letterSpacing: -0.65,
                            fontWeight: FontWeight.w800)),
                    const Spacer(),
                    const Text('View All  ›',
                        style: TextStyle(
                            color: _green,
                            fontSize: 15,
                            fontWeight: FontWeight.w800)),
                  ]),
                  const SizedBox(height: 12),
                  if (trackers.isEmpty)
                    _EmptyState(onCreate: () async {
                      final created = await showModalBottomSheet<bool>(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: Colors.white,
                          shape: const RoundedRectangleBorder(
                              borderRadius: BorderRadius.vertical(
                                  top: Radius.circular(28))),
                          builder: (_) => CreateTrackerSheet(
                              token: auth.session!.accessToken));
                      if (created == true) _refresh();
                    })
                  else ...[
                    for (var index = 0; index < trackers.length; index++) ...[
                      _TrackerCard(
                        tracker: trackers[index],
                        index: index,
                        onTap: () => Navigator.of(context)
                            .push(MaterialPageRoute(
                                builder: (_) => TrackerDetailScreen(
                                    trackerId: trackers[index].id,
                                    name: trackers[index].name,
                                    currencyCode: trackers[index].currencyCode,
                                    token: auth.session!.accessToken,
                                    currentUserId: auth.session!.userId)))
                            .then((_) => _refresh()),
                      ),
                      if (index != trackers.length - 1)
                        const SizedBox(height: 13),
                    ],
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _DashboardMetrics extends StatelessWidget {
  const _DashboardMetrics({required this.trackers});
  final List<TrackerSummary> trackers;
  @override
  Widget build(BuildContext context) {
    final owed = trackers.fold<int>(
        0,
        (total, tracker) =>
            total + (tracker.myBalanceMinor > 0 ? tracker.myBalanceMinor : 0));
    final currency = trackers.isEmpty ? 'PHP' : trackers.first.currencyCode;
    String money(int value) => '$currency ${(value / 100).toStringAsFixed(2)}';
    return Row(children: [
      Expanded(
          child: _MetricCard(
              title: 'TOTAL BALANCE',
              value: money(owed),
              icon: Icons.trending_up_rounded,
              caption: owed > 0 ? 'Owed to you' : 'All settled',
              highlight: true)),
      const SizedBox(width: 14),
      Expanded(
          child: _MetricCard(
              title: 'ACTIVE TRACKERS',
              value: '${trackers.length}',
              icon: Icons.flag_rounded,
              caption: '${trackers.length} ready',
              highlight: false)),
    ]);
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard(
      {required this.title,
      required this.value,
      required this.icon,
      required this.caption,
      required this.highlight});
  final String title;
  final String value;
  final IconData icon;
  final String caption;
  final bool highlight;
  @override
  Widget build(BuildContext context) => Container(
      height: 174,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
              color: highlight ? _green : const Color(0xFFE1E7EE),
              width: highlight ? 2 : 1.2),
          boxShadow: const [
            BoxShadow(
                color: Color(0x090E1930), blurRadius: 7, offset: Offset(0, 3))
          ]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: const TextStyle(
                color: _muted,
                fontSize: 11,
                letterSpacing: 1.05,
                fontWeight: FontWeight.w800)),
        const SizedBox(height: 16),
        FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: TextStyle(
                    color: highlight ? _green : _ink,
                    fontSize: 30,
                    letterSpacing: -1.1,
                    fontWeight: FontWeight.w800))),
        const Spacer(),
        Row(children: [
          Icon(icon, color: _green, size: 16),
          const SizedBox(width: 5),
          Expanded(
              child: Text(caption,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: _green,
                      fontSize: 12,
                      fontWeight: FontWeight.w700)))
        ])
      ]));
}

class _TrackerCard extends StatelessWidget {
  const _TrackerCard(
      {required this.tracker, required this.index, required this.onTap});
  final TrackerSummary tracker;
  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const colors = [
      Color(0xFFDDF9E8),
      Color(0xFFE8EEFF),
      Color(0xFFFFEBD9),
      Color(0xFFF2E8FF)
    ];
    const icons = [
      Icons.people_alt_rounded,
      Icons.flight_takeoff_rounded,
      Icons.home_work_rounded,
      Icons.celebration_rounded
    ];
    final color = colors[index % colors.length];
    final role = tracker.role.toUpperCase();
    final balance = tracker.myBalanceMinor;
    final amount =
        '${tracker.currencyCode} ${(tracker.totalMinor / 100).toStringAsFixed(2)}';
    final balanceLabel = balance > 0
        ? "You're owed ${tracker.currencyCode} ${(balance / 100).toStringAsFixed(2)}"
        : balance < 0
            ? 'You owe ${tracker.currencyCode} ${(balance.abs() / 100).toStringAsFixed(2)}'
            : 'All settled up';
    final balanceColor = balance < 0 ? const Color(0xFFE9355B) : _green;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(21),
      child: InkWell(
        borderRadius: BorderRadius.circular(21),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE5EAF1)),
              boxShadow: const [
                BoxShadow(
                    color: Color(0x080E1930),
                    blurRadius: 7,
                    offset: Offset(0, 3))
              ]),
          child: Column(children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                      color: color, borderRadius: BorderRadius.circular(18)),
                  child:
                      Icon(icons[index % icons.length], color: _ink, size: 32)),
              const SizedBox(width: 18),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(tracker.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: _ink,
                            fontWeight: FontWeight.w800,
                            fontSize: 21,
                            letterSpacing: -0.45)),
                    const SizedBox(height: 4),
                    const Text('Shared expenses',
                        style: TextStyle(color: _muted, fontSize: 14)),
                  ])),
              _RoleChip(role: role),
            ]),
            const SizedBox(height: 18),
            const Divider(height: 1, color: Color(0xFFF0F3F6)),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(balanceLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: balanceColor,
                            fontSize: 15,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    Text('Total: $amount',
                        style: const TextStyle(
                            color: Color(0xFF91A1BA), fontSize: 15))
                  ])),
              _MemberStack(count: tracker.memberCount),
            ])
          ]),
        ),
      ),
    );
  }
}

class _MemberStack extends StatelessWidget {
  const _MemberStack({required this.count});
  final int count;
  @override
  Widget build(BuildContext context) {
    const colors = [Color(0xFFFBE6D0), Color(0xFFE3F1FF), Color(0xFFEDE0FF)];
    final visible = count.clamp(0, 3).toInt();
    return SizedBox(
        width: visible == 0
            ? 36
            : 36 + (visible - 1) * 21.0 + (count > 3 ? 30 : 0),
        height: 38,
        child: Stack(children: [
          for (var index = 0; index < visible; index++)
            Positioned(
                left: index * 21.0,
                child: CircleAvatar(
                    radius: 18,
                    backgroundColor: colors[index],
                    child: const Icon(Icons.person_rounded,
                        color: _muted, size: 19))),
          if (count > 3)
            Positioned(
                left: visible * 21.0,
                child: CircleAvatar(
                    radius: 18,
                    backgroundColor: const Color(0xFFF1F4F8),
                    child: Text('+${count - 3}',
                        style: const TextStyle(
                            color: _muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800))))
        ]));
  }
}

class _RoleChip extends StatelessWidget {
  const _RoleChip({required this.role});
  final String role;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
            color: role == 'OWNER' || role == 'EDITOR'
                ? const Color(0xFFE1F8EA)
                : const Color(0xFFF0F3F7),
            borderRadius: BorderRadius.circular(7)),
        child: Text(role,
            style: TextStyle(
                color: role == 'OWNER' || role == 'EDITOR'
                    ? const Color(0xFF168A48)
                    : _muted,
                fontSize: 10,
                letterSpacing: .6,
                fontWeight: FontWeight.w800)),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onCreate});
  final VoidCallback onCreate;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(28, 30, 28, 26),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: const Color(0xFFE5EAF1))),
        child: Column(children: [
          Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                  color: const Color(0xFFDDF9E8),
                  borderRadius: BorderRadius.circular(18)),
              child:
                  const Icon(Icons.add_chart_rounded, color: _green, size: 30)),
          const SizedBox(height: 16),
          const Text('Start your first Tracker',
              style: TextStyle(
                  color: _ink, fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 7),
          const Text(
              'Create a shared space for expenses with friends, family, or your team.',
              textAlign: TextAlign.center,
              style: TextStyle(color: _muted, height: 1.45)),
          const SizedBox(height: 20),
          SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                  onPressed: onCreate,
                  icon: const Icon(Icons.add),
                  label: const Text('Create Tracker'))),
        ]),
      );
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
      child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_rounded, size: 40, color: _muted),
            const SizedBox(height: 12),
            const Text('Could not load your Trackers.',
                style: TextStyle(color: _ink, fontWeight: FontWeight.w700)),
            TextButton(onPressed: onRetry, child: const Text('Try again')),
          ])));
}

class _BottomNavigation extends StatelessWidget {
  const _BottomNavigation(
      {required this.onHome,
      required this.onActivity,
      required this.onProfile});
  final VoidCallback onHome;
  final VoidCallback onActivity;
  final VoidCallback onProfile;
  @override
  Widget build(BuildContext context) => Container(
        height: 74,
        decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Color(0xFFE8EDF2)))),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
          _NavItem(icon: Icons.home_outlined, label: 'Home', onTap: onHome),
          const _NavItem(
              icon: Icons.account_balance_wallet_rounded,
              label: 'Trackers',
              active: true),
          _NavItem(
              icon: Icons.history_rounded,
              label: 'Activity',
              onTap: onActivity),
          _NavItem(
              icon: Icons.person_outline_rounded,
              label: 'Profile',
              onTap: onProfile),
        ]),
      );
}

class _NavItem extends StatelessWidget {
  const _NavItem(
      {required this.icon,
      required this.label,
      this.active = false,
      this.onTap});
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
      onTap: onTap,
      child: SizedBox(
          width: 68,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon,
                color: active ? _green : const Color(0xFF98A5B5), size: 23),
            const SizedBox(height: 3),
            Text(label,
                style: TextStyle(
                    color: active ? _green : const Color(0xFF98A5B5),
                    fontSize: 10,
                    fontWeight: active ? FontWeight.w800 : FontWeight.w600)),
          ])));
}

class HomeOverviewScreen extends StatelessWidget {
  const HomeOverviewScreen(
      {required this.token,
      required this.name,
      required this.currentUserId,
      super.key});
  final String token;
  final String name;
  final String currentUserId;

  Future<List<TrackerSummary>> _load() async {
    final response = await http.get(Uri.parse('$_apiBaseUrl/api/v1/trackers'),
        headers: {
          'Authorization': 'Bearer $token'
        }).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) throw Exception();
    return ((jsonDecode(response.body) as Map<String, dynamic>)['data'] as List)
        .cast<Map<String, dynamic>>()
        .map(TrackerSummary.fromJson)
        .toList();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      bottomNavigationBar: _PageNavigation(
          active: 0,
          onHome: () {},
          onTrackers: () => Navigator.pop(context),
          onActivity: () => Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                  builder: (_) => ActivityFeedScreen(
                      token: token, currentUserId: currentUserId))),
          onProfile: () {}),
      body: SafeArea(
          child: FutureBuilder<List<TrackerSummary>>(
              future: _load(),
              builder: (context, snapshot) {
                final trackers = snapshot.data ?? [];
                return ListView(
                    padding: const EdgeInsets.fromLTRB(28, 22, 28, 105),
                    children: [
                      Row(children: [
                        Container(
                            width: 60,
                            height: 60,
                            decoration: const BoxDecoration(
                                color: Color(0xFFE8F9EF),
                                shape: BoxShape.circle),
                            child: const Icon(Icons.celebration_rounded,
                                color: _green, size: 29)),
                        const SizedBox(width: 14),
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Text('Hey, $name!',
                                  style: const TextStyle(
                                      color: _ink,
                                      fontSize: 25,
                                      fontWeight: FontWeight.w800)),
                              const Text('Ready to sync up today?',
                                  style: TextStyle(color: _muted, fontSize: 14))
                            ])),
                        const Icon(Icons.notifications_none_rounded,
                            color: _muted)
                      ]),
                      const SizedBox(height: 30),
                      Container(
                          padding: const EdgeInsets.all(23),
                          decoration: BoxDecoration(
                              color: const Color(0xFFF0FBF4),
                              borderRadius: BorderRadius.circular(28),
                              border:
                                  Border.all(color: const Color(0xFFC9F1D9))),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Row(children: [
                                  Icon(Icons.groups_rounded,
                                      color: _green, size: 19),
                                  SizedBox(width: 8),
                                  Text('SHARED SPACES',
                                      style: TextStyle(
                                          color: _green,
                                          fontSize: 12,
                                          letterSpacing: 1.1,
                                          fontWeight: FontWeight.w800))
                                ]),
                                const SizedBox(height: 13),
                                Text(
                                    '${trackers.length} active Tracker${trackers.length == 1 ? '' : 's'}',
                                    style: const TextStyle(
                                        color: _ink,
                                        fontSize: 29,
                                        fontWeight: FontWeight.w900)),
                                const SizedBox(height: 5),
                                const Text(
                                    'Keep every shared expense clear and in one place.',
                                    style:
                                        TextStyle(color: _muted, height: 1.35))
                              ])),
                      const SizedBox(height: 31),
                      const Text('Shared Spaces',
                          style: TextStyle(
                              color: _ink,
                              fontSize: 22,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(height: 15),
                      if (snapshot.connectionState != ConnectionState.done)
                        const Center(
                            child: Padding(
                                padding: EdgeInsets.all(28),
                                child: CircularProgressIndicator()))
                      else if (trackers.isEmpty)
                        const _OverviewEmpty()
                      else
                        for (var i = 0; i < trackers.length; i++)
                          Padding(
                              padding: const EdgeInsets.only(bottom: 13),
                              child: _OverviewTrackerCard(
                                  tracker: trackers[i],
                                  index: i,
                                  onTap: () => Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                          builder: (_) => TrackerDetailScreen(
                                              trackerId: trackers[i].id,
                                              name: trackers[i].name,
                                              currencyCode:
                                                  trackers[i].currencyCode,
                                              token: token,
                                              currentUserId: currentUserId)))))
                    ]);
              })));
}

class ActivityFeedScreen extends StatelessWidget {
  const ActivityFeedScreen(
      {required this.token, required this.currentUserId, super.key});
  final String token;
  final String currentUserId;
  Future<List<Map<String, dynamic>>> _load() async {
    final list = await http.get(Uri.parse('$_apiBaseUrl/api/v1/trackers'),
        headers: {'Authorization': 'Bearer $token'});
    if (list.statusCode != 200) throw Exception();
    final trackers =
        ((jsonDecode(list.body) as Map<String, dynamic>)['data'] as List)
            .cast<Map<String, dynamic>>();
    final batches = await Future.wait(trackers.map((tracker) async {
      final response = await http.get(
          Uri.parse('$_apiBaseUrl/api/v1/trackers/${tracker['id']}/activity'),
          headers: {'Authorization': 'Bearer $token'});
      if (response.statusCode != 200) return <Map<String, dynamic>>[];
      return ((jsonDecode(response.body) as Map<String, dynamic>)['data']
              as List)
          .cast<Map<String, dynamic>>()
          .map((event) => {...event, 'tracker_name': tracker['name']})
          .toList();
    }));
    final all = batches.expand((batch) => batch).toList();
    all.sort((a, b) =>
        (b['created_at'] as String).compareTo(a['created_at'] as String));
    return all;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      bottomNavigationBar: _PageNavigation(
          active: 2,
          onHome: () => Navigator.pop(context),
          onTrackers: () => Navigator.pop(context),
          onActivity: () {},
          onProfile: () {}),
      body: SafeArea(
          child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _load(),
              builder: (context, snapshot) => Column(children: [
                    Padding(
                        padding: const EdgeInsets.fromLTRB(18, 16, 22, 17),
                        child: Row(children: [
                          IconButton(
                              onPressed: () => Navigator.pop(context),
                              icon: const Icon(Icons.arrow_back_ios_new_rounded,
                                  size: 20)),
                          const Expanded(
                              child: Text('Activity Feed',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                      color: _ink,
                                      fontSize: 21,
                                      fontWeight: FontWeight.w800))),
                          const Icon(Icons.filter_list_rounded, color: _ink)
                        ])),
                    const Divider(height: 1, color: Color(0xFFE7ECF2)),
                    Expanded(
                        child: snapshot.connectionState != ConnectionState.done
                            ? const Center(child: CircularProgressIndicator())
                            : snapshot.hasError
                                ? const Center(
                                    child: Text('Could not load activity.'))
                                : (snapshot.data ?? []).isEmpty
                                    ? const _ActivityEmpty()
                                    : ListView.separated(
                                        padding: const EdgeInsets.fromLTRB(
                                            28, 26, 28, 28),
                                        itemCount: snapshot.data!.length,
                                        separatorBuilder: (_, __) =>
                                            const SizedBox(height: 16),
                                        itemBuilder: (_, index) =>
                                            _ActivityCard(
                                                event: snapshot.data![index])))
                  ]))));
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen(
      {required this.name,
      required this.email,
      required this.onLogout,
      super.key});
  final String name;
  final String email;
  final Future<void> Function() onLogout;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late String _name = widget.name;
  bool _notifications = true;

  Future<void> _editName() async {
    final controller = TextEditingController(text: _name);
    final name = await showModalBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        builder: (sheetContext) => Padding(
            padding: EdgeInsets.fromLTRB(
                24, 20, 24, 24 + MediaQuery.of(sheetContext).viewInsets.bottom),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('Edit profile',
                  style: TextStyle(
                      color: _ink, fontSize: 23, fontWeight: FontWeight.w800)),
              const SizedBox(height: 18),
              TextField(
                  controller: controller,
                  autofocus: true,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                      labelText: 'Display name',
                      prefixIcon: Icon(Icons.person_outline_rounded))),
              const SizedBox(height: 18),
              SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                      onPressed: () =>
                          Navigator.pop(sheetContext, controller.text.trim()),
                      child: const Text('Save changes')))
            ])));
    if (name == null || name.isEmpty || name == _name) return;
    try {
      await Supabase.instance.client.auth
          .updateUser(UserAttributes(data: {'name': name}));
      if (!mounted) return;
      setState(() => _name = name);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Profile updated.')));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not update your profile.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      bottomNavigationBar: _PageNavigation(
          active: 3,
          onHome: () => Navigator.pop(context),
          onTrackers: () => Navigator.pop(context),
          onActivity: () {},
          onProfile: () {}),
      body: SafeArea(
          child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 26, 24, 35),
              children: [
            const Text('Profile',
                style: TextStyle(
                    color: _ink, fontSize: 28, fontWeight: FontWeight.w800)),
            const SizedBox(height: 25),
            Center(
                child: CircleAvatar(
                    radius: 42,
                    backgroundColor: const Color(0xFFE1F8EA),
                    child: Text(_name.isEmpty ? '?' : _name[0].toUpperCase(),
                        style: const TextStyle(
                            color: _green,
                            fontSize: 31,
                            fontWeight: FontWeight.w800)))),
            const SizedBox(height: 13),
            Text(_name,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: _ink, fontSize: 21, fontWeight: FontWeight.w800)),
            const SizedBox(height: 3),
            Text(widget.email,
                textAlign: TextAlign.center,
                style: const TextStyle(color: _muted)),
            const SizedBox(height: 33),
            _ProfileRow(
                icon: Icons.person_outline_rounded,
                title: 'Account details',
                detail: 'Edit your display name',
                onTap: _editName),
            _NotificationRow(
                enabled: _notifications,
                onChanged: (value) => setState(() => _notifications = value)),
            const _ProfileRow(
                icon: Icons.notifications_none_rounded,
                title: 'Notifications',
                detail: 'Tracker and invitation updates'),
            const _ProfileRow(
                icon: Icons.help_outline_rounded,
                title: 'Help & feedback',
                detail: 'Get support for SplitShare'),
            const SizedBox(height: 21),
            FilledButton.tonalIcon(
                onPressed: widget.onLogout,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Log out'))
          ])));
}

class _PageNavigation extends StatelessWidget {
  const _PageNavigation(
      {required this.active,
      required this.onHome,
      required this.onTrackers,
      required this.onActivity,
      required this.onProfile});
  final int active;
  final VoidCallback onHome;
  final VoidCallback onTrackers;
  final VoidCallback onActivity;
  final VoidCallback onProfile;
  @override
  Widget build(BuildContext context) => Container(
      height: 74,
      decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFE8EDF2)))),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
        _NavItem(
            icon: Icons.home_outlined,
            label: 'Home',
            active: active == 0,
            onTap: onHome),
        _NavItem(
            icon: Icons.account_balance_wallet_rounded,
            label: 'Trackers',
            active: active == 1,
            onTap: onTrackers),
        _NavItem(
            icon: Icons.history_rounded,
            label: 'Activity',
            active: active == 2,
            onTap: onActivity),
        _NavItem(
            icon: Icons.person_outline_rounded,
            label: 'Profile',
            active: active == 3,
            onTap: onProfile),
      ]));
}

class _OverviewTrackerCard extends StatelessWidget {
  const _OverviewTrackerCard(
      {required this.tracker, required this.index, required this.onTap});
  final TrackerSummary tracker;
  final int index;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    const icons = [
      Icons.home_rounded,
      Icons.flight_takeoff_rounded,
      Icons.restaurant_rounded,
      Icons.groups_rounded
    ];
    const colors = [
      Color(0xFFDDEBFF),
      Color(0xFFFFF0C6),
      Color(0xFFFFE2E8),
      Color(0xFFDDF9E8)
    ];
    return Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(24),
            child: Container(
                padding: const EdgeInsets.all(19),
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: const Color(0xFFE5EAF1))),
                child: Row(children: [
                  Container(
                      width: 54,
                      height: 54,
                      decoration: BoxDecoration(
                          color: colors[index % colors.length],
                          borderRadius: BorderRadius.circular(17)),
                      child: Icon(icons[index % icons.length], color: _ink)),
                  const SizedBox(width: 15),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(tracker.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: _ink,
                                fontSize: 18,
                                fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text('${tracker.currencyCode} • Shared Tracker',
                            style: const TextStyle(color: _muted, fontSize: 13))
                      ])),
                  const Icon(Icons.arrow_forward_ios_rounded,
                      color: Color(0xFF9AABC0), size: 17)
                ]))));
  }
}

class _OverviewEmpty extends StatelessWidget {
  const _OverviewEmpty();
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: const Color(0xFFE5EAF1))),
      child: const Column(children: [
        Icon(Icons.groups_outlined, color: _green, size: 43),
        SizedBox(height: 12),
        Text('No shared spaces yet',
            style: TextStyle(
                color: _ink, fontSize: 17, fontWeight: FontWeight.w800)),
        SizedBox(height: 5),
        Text('Create a Tracker to start sharing expenses.',
            textAlign: TextAlign.center, style: TextStyle(color: _muted))
      ]));
}

class _ActivityEmpty extends StatelessWidget {
  const _ActivityEmpty();
  @override
  Widget build(BuildContext context) => const Center(
      child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.history_rounded, size: 48, color: _green),
            SizedBox(height: 12),
            Text('No activity yet',
                style: TextStyle(
                    color: _ink, fontSize: 18, fontWeight: FontWeight.w800)),
            SizedBox(height: 5),
            Text('Expenses, settlements, and member changes will appear here.',
                textAlign: TextAlign.center, style: TextStyle(color: _muted))
          ])));
}

class _ActivityCard extends StatelessWidget {
  const _ActivityCard({required this.event});
  final Map<String, dynamic> event;
  @override
  Widget build(BuildContext context) {
    final action =
        (event['action'] as String).replaceAll('.', ' ').replaceAll('_', ' ');
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
          width: 44,
          height: 44,
          decoration: const BoxDecoration(
              color: Color(0xFFE1F8EA), shape: BoxShape.circle),
          child: const Icon(Icons.bolt_rounded, color: _green)),
      const SizedBox(width: 13),
      Expanded(
          child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(17),
                  border: Border.all(color: const Color(0xFFE5EAF1))),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(action[0].toUpperCase() + action.substring(1),
                        style: const TextStyle(
                            color: _ink, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(event['tracker_name'] as String,
                        style: const TextStyle(
                            color: _green,
                            fontSize: 12,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(_when(event['created_at'] as String),
                        style: const TextStyle(color: _muted, fontSize: 11))
                  ])))
    ]);
  }

  String _when(String raw) {
    final date = DateTime.tryParse(raw)?.toLocal();
    if (date == null) return '';
    return '${date.month}/${date.day}/${date.year}';
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow(
      {required this.icon,
      required this.title,
      required this.detail,
      this.onTap});
  final IconData icon;
  final String title;
  final String detail;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: const Color(0xFFE5EAF1))),
      child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(17),
          child: Padding(
              padding: const EdgeInsets.all(15),
              child: Row(children: [
                Icon(icon, color: _green),
                const SizedBox(width: 13),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(title,
                          style: const TextStyle(
                              color: _ink, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(detail,
                          style: const TextStyle(color: _muted, fontSize: 12))
                    ])),
                const Icon(Icons.chevron_right_rounded, color: _muted)
              ]))));
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.enabled, required this.onChanged});
  final bool enabled;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) => Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(15, 8, 8, 8),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: const Color(0xFFE5EAF1))),
      child: Row(children: [
        const Icon(Icons.notifications_none_rounded, color: _green),
        const SizedBox(width: 13),
        const Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Notifications',
              style: TextStyle(color: _ink, fontWeight: FontWeight.w800)),
          SizedBox(height: 2),
          Text('Tracker and invitation updates',
              style: TextStyle(color: _muted, fontSize: 12))
        ])),
        Switch(value: enabled, onChanged: onChanged, activeThumbColor: _green)
      ]));
}

class CreateTrackerSheet extends StatefulWidget {
  const CreateTrackerSheet({required this.token, super.key});
  final String token;
  @override
  State<CreateTrackerSheet> createState() => _CreateTrackerSheetState();
}

class _CreateTrackerSheetState extends State<CreateTrackerSheet> {
  final _name = TextEditingController();
  final _currency = TextEditingController(text: 'PHP');
  String? _error;
  bool _loading = false;

  Future<void> _create() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await http
          .post(Uri.parse('$_apiBaseUrl/api/v1/trackers'),
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ${widget.token}'
              },
              body: jsonEncode({
                'name': _name.text,
                'currency_code': _currency.text,
                'currency_exponent': 2
              }))
          .timeout(const Duration(seconds: 15));
      if (response.statusCode != 201) throw Exception();
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Could not create the Tracker. Check the name and try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _currency.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            24, 20, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                  child: Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                          color: const Color(0xFFD7DEE7),
                          borderRadius: BorderRadius.circular(8)))),
              const SizedBox(height: 24),
              const Text('Create a Tracker',
                  style: TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w800, color: _ink)),
              const SizedBox(height: 5),
              const Text('A shared home for your expenses.',
                  style: TextStyle(color: _muted)),
              const SizedBox(height: 22),
              TextField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                      labelText: 'Tracker name',
                      prefixIcon: Icon(Icons.account_balance_wallet_outlined))),
              const SizedBox(height: 12),
              TextField(
                  controller: _currency,
                  maxLength: 3,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                      labelText: 'Currency code',
                      prefixIcon: Icon(Icons.payments_outlined))),
              if (_error != null)
                Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(_error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error))),
              const SizedBox(height: 12),
              SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                      onPressed: _loading ? null : _create,
                      child: Text(_loading ? 'Creating…' : 'Create Tracker'))),
            ]),
      );
}
