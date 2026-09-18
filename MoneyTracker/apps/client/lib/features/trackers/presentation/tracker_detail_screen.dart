import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'invite_member_sheet.dart';
import 'record_settlement_sheet.dart';
import 'tracker_chat_screen.dart';

const _apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8081');
const _ink = Color(0xFF0E1930);
const _muted = Color(0xFF637592);
const _green = Color(0xFF22C96B);

class TrackerDetailScreen extends StatefulWidget {
  const TrackerDetailScreen(
      {required this.trackerId,
      required this.name,
      required this.currencyCode,
      required this.token,
      required this.currentUserId,
      super.key});
  final String trackerId;
  final String name;
  final String currencyCode;
  final String token;
  final String currentUserId;

  @override
  State<TrackerDetailScreen> createState() => _TrackerDetailScreenState();
}

class _TrackerDetailScreenState extends State<TrackerDetailScreen> {
  late Future<_TrackerData> _data;
  int _section = 0;
  RealtimeChannel? _liveChannel;

  @override
  void initState() {
    super.initState();
    _data = _load();
    _liveChannel = Supabase.instance.client
        .channel('tracker-live-${widget.trackerId}')
        .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'expenses',
            filter: PostgresChangeFilter(
                type: PostgresChangeFilterType.eq,
                column: 'tracker_id',
                value: widget.trackerId),
            callback: (_) => _refresh())
        .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'settlements',
            filter: PostgresChangeFilter(
                type: PostgresChangeFilterType.eq,
                column: 'tracker_id',
                value: widget.trackerId),
            callback: (_) => _refresh())
        .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'tracker_members',
            filter: PostgresChangeFilter(
                type: PostgresChangeFilterType.eq,
                column: 'tracker_id',
                value: widget.trackerId),
            callback: (_) => _refresh())
        .subscribe();
  }

  Map<String, String> get _headers =>
      {'Authorization': 'Bearer ${widget.token}'};
  Future<_TrackerData> _load() async {
    final responses = await Future.wait([
      http.get(
          Uri.parse(
              '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/expenses'),
          headers: _headers),
      http.get(
          Uri.parse(
              '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/balances'),
          headers: _headers),
      http.get(
          Uri.parse('$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/members'),
          headers: _headers),
      http.get(
          Uri.parse(
              '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/activity'),
          headers: _headers),
    ]).timeout(const Duration(seconds: 15));
    if (responses.any((response) => response.statusCode != 200)) {
      throw Exception('Could not load Tracker.');
    }
    List<Map<String, dynamic>> data(http.Response response) =>
        List<Map<String, dynamic>>.from((jsonDecode(response.body)
            as Map<String, dynamic>)['data'] as List);
    return _TrackerData(
        expenses: data(responses[0]),
        balances: (jsonDecode(responses[1].body)
            as Map<String, dynamic>)['data'] as Map<String, dynamic>,
        members: data(responses[2]),
        activity: data(responses[3]));
  }

  void _refresh() => setState(() => _data = _load());
  @override
  void dispose() {
    if (_liveChannel != null) {
      Supabase.instance.client.removeChannel(_liveChannel!);
    }
    super.dispose();
  }

  String _money(int amount) =>
      '${widget.currencyCode} ${(amount.abs() / 100).toStringAsFixed(2)}';
  int _netBalance(Map<String, dynamic> balances) =>
      (balances['member_balances'] as List)
          .fold<int>(0, (sum, item) => sum + (item['balance_minor'] as int));

  Future<void> _showPeople(_TrackerData data) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (_) => _PeopleSheet(
          trackerId: widget.trackerId,
          token: widget.token,
          currentUserId: widget.currentUserId,
          members: data.members,
          activity: data.activity,
          canManageMembers: data.members.any((member) =>
              member['user_id'] == widget.currentUserId &&
              member['role'] == 'owner'),
          onInvite: () async {
            final sent = await showModalBottomSheet<bool>(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.white,
                shape: const RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(28))),
                builder: (_) => InviteMemberSheet(
                    trackerId: widget.trackerId, token: widget.token));
            if (sent == true) _refresh();
          }),
    );
    _refresh();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
            child: FutureBuilder<_TrackerData>(
          future: _data,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(
                  child: TextButton(
                      onPressed: _refresh,
                      child: const Text(
                          'Could not load this Tracker. Try again')));
            }
            final data = snapshot.data!;
            final net = _netBalance(data.balances);
            final canManageFinances = data.members.any((member) =>
                member['user_id'] == widget.currentUserId &&
                (member['role'] == 'owner' || member['role'] == 'editor'));
            return RefreshIndicator(
              color: _green,
              onRefresh: () async => _refresh(),
              child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(
                        child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                      child: Row(children: [
                        IconButton(
                            onPressed: () => Navigator.of(context).pop(),
                            icon: const Icon(Icons.arrow_back_ios_new_rounded,
                                size: 20),
                            tooltip: 'Back'),
                        Expanded(
                            child: Text(widget.name,
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: _ink))),
                        IconButton(
                            onPressed: () => _showPeople(data),
                            icon: const Icon(Icons.more_horiz_rounded),
                            tooltip: 'Tracker options'),
                        IconButton(
                            onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                    builder: (_) => TrackerChatScreen(
                                        trackerId: widget.trackerId,
                                        trackerName: widget.name,
                                        token: widget.token,
                                        currentUserId: widget.currentUserId,
                                        memberCount: data.members.length,
                                        overallBalanceMinor: data.expenses
                                            .fold<int>(
                                                0,
                                                (total, expense) =>
                                                    total +
                                                    (expense['amount_minor']
                                                        as int))))),
                            icon: const Icon(Icons.forum_outlined),
                            tooltip: 'Tracker chat'),
                      ]),
                    )),
                    SliverToBoxAdapter(
                        child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                      child: _BalanceHero(
                          net: net,
                          currencyCode: widget.currencyCode,
                          memberCount: data.members.length,
                          onSettle: () => setState(() => _section = 1)),
                    )),
                    SliverToBoxAdapter(
                        child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 26, 20, 10),
                      child: Row(children: [
                        _SectionTab(
                            label: 'TRANSACTIONS',
                            active: _section == 0,
                            onTap: () => setState(() => _section = 0)),
                        const SizedBox(width: 26),
                        _SectionTab(
                            label: 'BALANCES',
                            active: _section == 1,
                            onTap: () => setState(() => _section = 1)),
                        const Spacer(),
                        IconButton(
                            onPressed: () => _showPeople(data),
                            icon: const Icon(Icons.people_alt_outlined,
                                color: _muted),
                            tooltip: 'Members and activity'),
                      ]),
                    )),
                    if (_section == 0)
                      _expenses(data.expenses)
                    else
                      _balances(data.balances, data.members, data.expenses,
                          canManageFinances),
                    const SliverToBoxAdapter(child: SizedBox(height: 110)),
                  ]),
            );
          },
        )),
        floatingActionButton: FloatingActionButton.extended(
          backgroundColor: _green,
          foregroundColor: Colors.white,
          elevation: 2,
          icon: const Icon(Icons.add_rounded),
          label: const Text('Add expense',
              style: TextStyle(fontWeight: FontWeight.w800)),
          onPressed: () async {
            final saved = await showModalBottomSheet<bool>(
              context: context,
              isScrollControlled: true,
              backgroundColor: Colors.white,
              shape: const RoundedRectangleBorder(
                  borderRadius:
                      BorderRadius.vertical(top: Radius.circular(28))),
              builder: (_) => _CreateExpenseSheet(
                  trackerId: widget.trackerId,
                  token: widget.token,
                  currencyCode: widget.currencyCode,
                  membersFuture: _data.then((value) => value.members)),
            );
            if (saved == true) _refresh();
          },
        ),
      );

  Widget _expenses(List<Map<String, dynamic>> expenses) {
    if (expenses.isEmpty) {
      return SliverToBoxAdapter(child: _EmptyTransactions(onAdd: () {}));
    }
    return SliverList.separated(
      itemCount: expenses.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, index) {
        final item = expenses[index];
        final icons = [
          Icons.restaurant_rounded,
          Icons.shopping_bag_rounded,
          Icons.directions_car_rounded,
          Icons.receipt_long_rounded
        ];
        final pastel = [
          const Color(0xFFFFE9DC),
          const Color(0xFFE3F1FF),
          const Color(0xFFE8E1FF),
          const Color(0xFFDDF9E8)
        ];
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(19),
                border: Border.all(color: const Color(0xFFE5EAF1))),
            child: Row(children: [
              Container(
                  width: 45,
                  height: 45,
                  decoration: BoxDecoration(
                      color: pastel[index % pastel.length],
                      borderRadius: BorderRadius.circular(14)),
                  child:
                      Icon(icons[index % icons.length], color: _ink, size: 22)),
              const SizedBox(width: 13),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(item['description'] as String,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: _ink,
                            fontSize: 16,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text('Paid ${item['expense_date']}',
                        style: const TextStyle(color: _muted, fontSize: 12)),
                  ])),
              Text(_money(item['amount_minor'] as int),
                  style: const TextStyle(
                      color: _ink, fontSize: 15, fontWeight: FontWeight.w800)),
            ]),
          ),
        );
      },
    );
  }

  Widget _balances(
      Map<String, dynamic> balances,
      List<Map<String, dynamic>> memberList,
      List<Map<String, dynamic>> expenses,
      bool canRecordSettlement) {
    final members = balances['member_balances'] as List;
    final debts =
        List<Map<String, dynamic>>.from(balances['pairwise_debts'] as List);
    return SliverToBoxAdapter(
        child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 2, 20, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('WHO IS EVEN?',
            style: TextStyle(
                color: _muted,
                fontSize: 11,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        for (final member in members) ...[
          _MemberBalance(member: member, money: _money),
          const SizedBox(height: 10),
        ],
        if (debts.isNotEmpty) ...[
          const SizedBox(height: 16),
          const Text('WHAT TO DO',
              style: TextStyle(
                  color: _muted,
                  fontSize: 11,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          for (final debt in debts)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _TransferCard(
                  debt: debt,
                  memberList: memberList,
                  money: _money,
                  canSettle: canRecordSettlement,
                  onSettle: () async {
                    final saved = await showModalBottomSheet<bool>(
                        context: context,
                        isScrollControlled: true,
                        backgroundColor: Colors.white,
                        shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(
                                top: Radius.circular(28))),
                        builder: (_) => RecordSettlementSheet(
                            trackerId: widget.trackerId,
                            token: widget.token,
                            currencyCode: widget.currencyCode,
                            debt: Map<String, dynamic>.from(debt),
                            fromName: _memberName(
                                memberList, debt['from_user_id'] as String),
                            toName: _memberName(
                                memberList, debt['to_user_id'] as String)));
                    if (saved == true) _refresh();
                  }),
            ),
        ],
        const SizedBox(height: 26),
        _SettlementExplanation(
            expenses: expenses, members: memberList, money: _money),
      ]),
    ));
  }

  String _memberName(List<Map<String, dynamic>> members, String userId) =>
      members
          .where((member) => member['user_id'] == userId)
          .map((member) => member['name'] as String)
          .firstOrNull ??
      'Member';
}

class _TransferCard extends StatelessWidget {
  const _TransferCard(
      {required this.debt,
      required this.memberList,
      required this.money,
      required this.canSettle,
      required this.onSettle});
  final Map<String, dynamic> debt;
  final List<Map<String, dynamic>> memberList;
  final String Function(int) money;
  final bool canSettle;
  final VoidCallback onSettle;
  @override
  Widget build(BuildContext context) {
    String name(String id) =>
        memberList
            .where((m) => m['user_id'] == id)
            .map((m) => m['name'] as String)
            .firstOrNull ??
        'Member';
    final payer = name(debt['from_user_id'] as String);
    final receiver = name(debt['to_user_id'] as String);
    final amount = money(debt['amount_minor'] as int);
    return Container(
        padding: const EdgeInsets.all(17),
        decoration: BoxDecoration(
            color: const Color(0xFFF8FBF9),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFCDEEDB))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('ONE SIMPLE PAYMENT',
              style: TextStyle(
                  color: _muted,
                  fontSize: 11,
                  letterSpacing: 1.1,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Text('$payer pays $receiver',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: _ink, fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
                child: _PaymentPerson(
                    name: payer,
                    caption: 'PAYS',
                    color: const Color(0xFFFFEED7))),
            Padding(
                padding: const EdgeInsets.symmetric(horizontal: 9),
                child: Column(children: [
                  Text(amount,
                      style: const TextStyle(
                          color: _ink,
                          fontSize: 18,
                          fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  const Icon(Icons.arrow_forward_rounded,
                      color: _green, size: 29)
                ])),
            Expanded(
                child: _PaymentPerson(
                    name: receiver,
                    caption: 'RECEIVES',
                    color: const Color(0xFFDDF9E8)))
          ]),
          if (canSettle) ...[
            const SizedBox(height: 17),
            SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                    onPressed: onSettle,
                    icon: const Icon(Icons.payments_outlined, size: 19),
                    label: const Text('Record this payment')))
          ],
        ]));
  }
}

class _PaymentPerson extends StatelessWidget {
  const _PaymentPerson(
      {required this.name, required this.caption, required this.color});
  final String name;
  final String caption;
  final Color color;
  @override
  Widget build(BuildContext context) => Column(children: [
        CircleAvatar(
            radius: 25,
            backgroundColor: color,
            child: Text(name.isEmpty ? '?' : name[0].toUpperCase(),
                style:
                    const TextStyle(color: _ink, fontWeight: FontWeight.w800))),
        const SizedBox(height: 6),
        Text(name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                color: _ink, fontSize: 13, fontWeight: FontWeight.w800)),
        const SizedBox(height: 2),
        Text(caption,
            style: const TextStyle(
                color: _muted,
                fontSize: 9,
                letterSpacing: .8,
                fontWeight: FontWeight.w800))
      ]);
}

class _SettlementExplanation extends StatelessWidget {
  const _SettlementExplanation(
      {required this.expenses, required this.members, required this.money});
  final List<Map<String, dynamic>> expenses;
  final List<Map<String, dynamic>> members;
  final String Function(int) money;
  @override
  Widget build(BuildContext context) {
    final total = expenses.fold<int>(
        0, (sum, expense) => sum + (expense['amount_minor'] as int));
    final count = members.length;
    if (total == 0 || count == 0) return const SizedBox.shrink();
    final base = total ~/ count;
    final remainder = total % count;
    final paid = <String, int>{
      for (final member in members) member['user_id'] as String: 0
    };
    for (final expense in expenses) {
      paid[expense['paid_by_user_id'] as String] =
          (paid[expense['paid_by_user_id'] as String] ?? 0) +
              (expense['amount_minor'] as int);
    }
    return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE5EAF1))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('HOW THIS IS CALCULATED',
              style: TextStyle(
                  color: _muted,
                  fontSize: 11,
                  letterSpacing: 1.15,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Text('Total shared expenses: ${money(total)}',
              style: const TextStyle(color: _ink, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(
              'Split equally among $count members: ${money(base)} each${remainder == 0 ? '' : ' + $remainder¢ rounding'}',
              style: const TextStyle(color: _muted, fontSize: 13)),
          const SizedBox(height: 14),
          for (var index = 0; index < members.length; index++) ...[
            _CalculationRow(
                name: members[index]['name'] as String,
                paid: money(paid[members[index]['user_id'] as String] ?? 0),
                share: money(base + (index < remainder ? 1 : 0))),
            if (index != members.length - 1) const Divider(height: 16)
          ],
          const SizedBox(height: 10),
          const Text(
              'Suggested settlements above are the minimum transfers needed to settle these equal shares.',
              style: TextStyle(color: _muted, fontSize: 12, height: 1.35)),
        ]));
  }
}

class _CalculationRow extends StatelessWidget {
  const _CalculationRow(
      {required this.name, required this.paid, required this.share});
  final String name;
  final String paid;
  final String share;
  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(
            child: Text(name,
                style:
                    const TextStyle(color: _ink, fontWeight: FontWeight.w700))),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('Paid $paid',
              style: const TextStyle(color: _muted, fontSize: 12)),
          Text('Share $share',
              style: const TextStyle(color: _muted, fontSize: 12))
        ])
      ]);
}

class _BalanceHero extends StatelessWidget {
  const _BalanceHero(
      {required this.net,
      required this.currencyCode,
      required this.memberCount,
      required this.onSettle});
  final int net;
  final String currencyCode;
  final int memberCount;
  final VoidCallback onSettle;
  @override
  Widget build(BuildContext context) {
    final label = net > 0
        ? 'TRACKER IS OWED'
        : net < 0
            ? 'TRACKER OWES'
            : 'ALL SETTLED UP';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
          color: const Color(0xFFE0F9EA),
          borderRadius: BorderRadius.circular(24)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.account_balance_wallet_rounded,
              color: _green, size: 19),
          const SizedBox(width: 7),
          Text(label,
              style: const TextStyle(
                  color: Color(0xFF278A51),
                  fontSize: 11,
                  letterSpacing: 1.25,
                  fontWeight: FontWeight.w800)),
          const Spacer(),
          Text('$memberCount members',
              style: const TextStyle(color: Color(0xFF5A8D70), fontSize: 12))
        ]),
        const SizedBox(height: 12),
        Text('$currencyCode ${(net.abs() / 100).toStringAsFixed(2)}',
            style: const TextStyle(
                color: _ink,
                fontSize: 31,
                letterSpacing: -1.2,
                fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
              child: Text(
                  net == 0
                      ? 'Everything is settled.'
                      : 'Calculated from shared expenses.',
                  style:
                      const TextStyle(color: Color(0xFF5A8D70), fontSize: 13))),
          TextButton(
              onPressed: net == 0 ? null : onSettle,
              child: const Text('Settle up'))
        ])
      ]),
    );
  }
}

class _SectionTab extends StatelessWidget {
  const _SectionTab(
      {required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
      onTap: onTap,
      child: Column(children: [
        Text(label,
            style: TextStyle(
                color: active ? _ink : _muted,
                fontSize: 11,
                letterSpacing: 1,
                fontWeight: FontWeight.w800)),
        const SizedBox(height: 9),
        Container(
            height: 2, width: 84, color: active ? _green : Colors.transparent)
      ]));
}

class _MemberBalance extends StatelessWidget {
  const _MemberBalance({required this.member, required this.money});
  final dynamic member;
  final String Function(int) money;
  @override
  Widget build(BuildContext context) {
    final amount = member['balance_minor'] as int;
    final tone = amount > 0
        ? const Color(0xFF168A48)
        : amount < 0
            ? const Color(0xFFD55A45)
            : _muted;
    final status = amount > 0
        ? 'is owed'
        : amount < 0
            ? 'owes'
            : 'settled up';
    final name = member['name'] as String;
    return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFE5EAF1))),
        child: Row(children: [
          CircleAvatar(
              radius: 20,
              backgroundColor: const Color(0xFFE8EEFF),
              child: Text(
                  name.isEmpty ? '?' : name.substring(0, 1).toUpperCase(),
                  style: const TextStyle(
                      color: _ink, fontWeight: FontWeight.w800))),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(name,
                    style: const TextStyle(
                        color: _ink, fontWeight: FontWeight.w800)),
                Text(status,
                    style: const TextStyle(color: _muted, fontSize: 12))
              ])),
          Text(money(amount),
              style: TextStyle(color: tone, fontWeight: FontWeight.w800)),
        ]));
  }
}

class _EmptyTransactions extends StatelessWidget {
  const _EmptyTransactions({required this.onAdd});
  final VoidCallback onAdd;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(28, 45, 28, 0),
      child: Column(children: [
        Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
                color: const Color(0xFFDDF9E8),
                borderRadius: BorderRadius.circular(20)),
            child: const Icon(Icons.receipt_long_rounded,
                color: _green, size: 31)),
        const SizedBox(height: 16),
        const Text('No expenses yet',
            style: TextStyle(
                color: _ink, fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        const Text(
            'Add the first expense and SplitShare will calculate everyone’s share equally.',
            textAlign: TextAlign.center,
            style: TextStyle(color: _muted, height: 1.45)),
      ]));
}

class _PeopleSheet extends StatelessWidget {
  const _PeopleSheet(
      {required this.trackerId,
      required this.token,
      required this.currentUserId,
      required this.members,
      required this.activity,
      required this.canManageMembers,
      required this.onInvite});
  final String trackerId;
  final String token;
  final String currentUserId;
  final List<Map<String, dynamic>> members;
  final List<Map<String, dynamic>> activity;
  final bool canManageMembers;
  final Future<void> Function() onInvite;
  @override
  Widget build(BuildContext context) => SafeArea(
      child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 28),
          child: ListView(shrinkWrap: true, children: [
            Center(
                child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                        color: const Color(0xFFD7DEE7),
                        borderRadius: BorderRadius.circular(8)))),
            const SizedBox(height: 22),
            const Text('People & activity',
                style: TextStyle(
                    color: _ink, fontSize: 23, fontWeight: FontWeight.w800)),
            if (canManageMembers) ...[
              const SizedBox(height: 18),
              Material(
                  color: _green,
                  borderRadius: BorderRadius.circular(18),
                  child: InkWell(
                      onTap: onInvite,
                      borderRadius: BorderRadius.circular(18),
                      child: const Padding(
                          padding: EdgeInsets.symmetric(
                              horizontal: 17, vertical: 15),
                          child: Row(children: [
                            Icon(Icons.person_add_alt_1_rounded,
                                color: Colors.white),
                            SizedBox(width: 12),
                            Expanded(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Text('Invite a member',
                                      style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 16)),
                                  SizedBox(height: 2),
                                  Text('Choose exactly what they can do',
                                      style: TextStyle(
                                          color: Color(0xFFC8F7D9),
                                          fontSize: 12))
                                ])),
                            Icon(Icons.arrow_forward_rounded,
                                color: Colors.white, size: 20),
                          ])))),
            ],
            const SizedBox(height: 20),
            const Text('MEMBERS',
                style: TextStyle(
                    color: _muted,
                    fontSize: 11,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            for (final member in members)
              Padding(
                  padding: const EdgeInsets.only(bottom: 9),
                  child: _MemberAccessCard(
                      member: member,
                      canManage: canManageMembers &&
                          member['user_id'] != currentUserId &&
                          member['role'] != 'owner',
                      trackerId: trackerId,
                      token: token,
                      onChanged: () => Navigator.pop(context))),
            const SizedBox(height: 18),
            const Text('RECENT ACTIVITY',
                style: TextStyle(
                    color: _muted,
                    fontSize: 11,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            if (activity.isEmpty)
              const Text('No activity yet.', style: TextStyle(color: _muted))
            else
              for (final event in activity.take(5))
                Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.circle, size: 9, color: _green),
                          const SizedBox(width: 10),
                          Expanded(
                              child: Text(
                                  (event['action'] as String)
                                      .replaceAll('_', ' '),
                                  style: const TextStyle(
                                      color: _ink,
                                      fontWeight: FontWeight.w600)))
                        ])),
          ])));
}

class _RolePill extends StatelessWidget {
  const _RolePill({required this.role});
  final String role;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
          color: role == 'owner' || role == 'editor'
              ? const Color(0xFFE1F8EA)
              : const Color(0xFFEAF0F6),
          borderRadius: BorderRadius.circular(7)),
      child: Text(role.toUpperCase(),
          style: TextStyle(
              color: role == 'owner' || role == 'editor'
                  ? const Color(0xFF168A48)
                  : _muted,
              fontSize: 10,
              fontWeight: FontWeight.w800)));
}

class _MemberAccessCard extends StatelessWidget {
  const _MemberAccessCard(
      {required this.member,
      required this.canManage,
      required this.trackerId,
      required this.token,
      required this.onChanged});
  final Map<String, dynamic> member;
  final bool canManage;
  final String trackerId;
  final String token;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final name = member['name'] as String;
    final role = member['role'] as String;
    return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(19),
            border: Border.all(color: const Color(0xFFE5EAF1))),
        child: Row(children: [
          CircleAvatar(
              radius: 23,
              backgroundColor: const Color(0xFFE6EDF5),
              child: Text(name.isEmpty ? '?' : name[0].toUpperCase(),
                  style: const TextStyle(
                      color: _ink, fontWeight: FontWeight.w800))),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(name,
                    style: const TextStyle(
                        color: _ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(member['email'] as String,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: _muted, fontSize: 12)),
                const SizedBox(height: 5),
                Text(_detail(role),
                    style:
                        const TextStyle(color: Color(0xFF91A1BA), fontSize: 11))
              ])),
          canManage
              ? TextButton.icon(
                  onPressed: () => _pickRole(context),
                  icon: const Icon(Icons.expand_more_rounded, size: 17),
                  label: Text(_roleTitle(role)),
                  style: TextButton.styleFrom(
                      foregroundColor: _roleColor(role),
                      backgroundColor: _roleColor(role).withValues(alpha: .1),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(11))))
              : _RolePill(role: role)
        ]));
  }

  Future<void> _pickRole(BuildContext context) async {
    final selected = await showModalBottomSheet<String>(
        context: context,
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        builder: (sheetContext) => SafeArea(
            child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 15, 24, 30),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                          color: const Color(0xFFD7DEE7),
                          borderRadius: BorderRadius.circular(8))),
                  const SizedBox(height: 20),
                  Text('Access for ${member['name']}',
                      style: const TextStyle(
                          color: _ink,
                          fontSize: 21,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  const Text('Choose what this member can do.',
                      style: TextStyle(color: _muted)),
                  const SizedBox(height: 18),
                  for (final option in const ['editor', 'commenter', 'viewer'])
                    _RoleChoice(
                        role: option,
                        selected: option == member['role'],
                        onTap: () => Navigator.pop(sheetContext, option))
                ]))));
    if (selected == null || selected == member['role'] || !context.mounted) {
      return;
    }
    try {
      final response = await http.post(
          Uri.parse(
              '$_apiBaseUrl/api/v1/trackers/$trackerId/members/${member['user_id']}/role'),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json'
          },
          body: jsonEncode({'role': selected}));
      if (response.statusCode == 204 && context.mounted) {
        onChanged();
      } else if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not update this member’s access.')));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not update this member’s access.')));
      }
    }
  }

  String _roleTitle(String role) =>
      '${role[0].toUpperCase()}${role.substring(1)}';
  String _detail(String role) => switch (role) {
        'editor' => 'Can add expenses and record settlements',
        'commenter' => 'Can view and participate in Tracker chat',
        'viewer' => 'Read-only access to this Tracker',
        _ => 'Full control of members and finances'
      };
  Color _roleColor(String role) => switch (role) {
        'editor' => const Color(0xFF168A48),
        'commenter' => const Color(0xFF2563EB),
        'viewer' => _muted,
        _ => const Color(0xFF168A48)
      };
}

class _RoleChoice extends StatelessWidget {
  const _RoleChoice(
      {required this.role, required this.selected, required this.onTap});
  final String role;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final title = '${role[0].toUpperCase()}${role.substring(1)}';
    final description = switch (role) {
      'editor' => 'Can add expenses and record settlements.',
      'commenter' => 'Can view the Tracker and use its chat.',
      _ => 'Can view balances, history, and members.'
    };
    final icon = switch (role) {
      'editor' => Icons.edit_outlined,
      'commenter' => Icons.chat_bubble_outline_rounded,
      _ => Icons.visibility_outlined
    };
    return Padding(
        padding: const EdgeInsets.only(bottom: 9),
        child: Material(
            color: selected ? const Color(0xFFEAF9F0) : const Color(0xFFF7F9FB),
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(16),
                child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                            color: selected
                                ? const Color(0xFFB6EDCD)
                                : Colors.transparent)),
                    child: Row(children: [
                      Icon(icon, color: selected ? _green : _muted),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text(title,
                                style: const TextStyle(
                                    color: _ink, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 2),
                            Text(description,
                                style: const TextStyle(
                                    color: _muted, fontSize: 12))
                          ])),
                      Icon(
                          selected
                              ? Icons.check_circle_rounded
                              : Icons.radio_button_unchecked_rounded,
                          color: selected ? _green : const Color(0xFFAFBCCB))
                    ])))));
  }
}

class _TrackerData {
  const _TrackerData(
      {required this.expenses,
      required this.balances,
      required this.members,
      required this.activity});
  final List<Map<String, dynamic>> expenses;
  final Map<String, dynamic> balances;
  final List<Map<String, dynamic>> members;
  final List<Map<String, dynamic>> activity;
}

class _CreateExpenseSheet extends StatefulWidget {
  const _CreateExpenseSheet(
      {required this.trackerId,
      required this.token,
      required this.currencyCode,
      required this.membersFuture});
  final String trackerId;
  final String token;
  final String currencyCode;
  final Future<List<Map<String, dynamic>>> membersFuture;
  @override
  State<_CreateExpenseSheet> createState() => _CreateExpenseSheetState();
}

class _CreateExpenseSheetState extends State<_CreateExpenseSheet> {
  final _description = TextEditingController();
  final _amount = TextEditingController();
  String? _error;
  bool _loading = false;
  Set<String> _participants = {};
  String _category = 'Dining';
  Future<void> _save(List<Map<String, dynamic>> members) async {
    final amount = (double.tryParse(_amount.text) ?? 0) * 100;
    if (_description.text.trim().isEmpty ||
        amount <= 0 ||
        _participants.isEmpty) {
      setState(() => _error =
          'Enter a description, a positive amount, and at least one participant.');
      return;
    }
    setState(() => _loading = true);
    try {
      final response = await http.post(
          Uri.parse(
              '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/expenses'),
          headers: {
            'Authorization': 'Bearer ${widget.token}',
            'Content-Type': 'application/json'
          },
          body: jsonEncode({
            'description': _description.text.trim(),
            'amount_minor': amount.round(),
            'paid_by_user_id': members.first['user_id'],
            'participant_user_ids': _participants.toList(),
            'expense_date': DateTime.now().toIso8601String().substring(0, 10)
          }));
      if (!mounted) return;
      if (response.statusCode == 201) {
        Navigator.pop(context, true);
      } else {
        setState(() {
          _loading = false;
          _error = ((jsonDecode(response.body) as Map<String, dynamic>)['error']
                  as Map?)?['message'] as String? ??
              'Could not create the expense.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not create the expense. Please try again.';
        });
      }
    }
  }

  @override
  void dispose() {
    _description.dispose();
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      FutureBuilder<List<Map<String, dynamic>>>(
          future: widget.membersFuture,
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return const SizedBox(
                  height: 220,
                  child: Center(child: CircularProgressIndicator()));
            }
            final members = snapshot.data!;
            _participants = _participants.isEmpty
                ? members.map((m) => m['user_id'] as String).toSet()
                : _participants;
            return Padding(
                padding: EdgeInsets.fromLTRB(
                    24, 16, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
                child: ListView(shrinkWrap: true, children: [
                  Center(
                      child: Container(
                          width: 42,
                          height: 4,
                          decoration: BoxDecoration(
                              color: const Color(0xFFD7DEE7),
                              borderRadius: BorderRadius.circular(8)))),
                  const SizedBox(height: 22),
                  const Text('Add Transaction',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: _ink,
                          fontSize: 22,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 28),
                  const Text('AMOUNT',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: _muted,
                          fontSize: 13,
                          letterSpacing: 1.2,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  TextField(
                      controller: _amount,
                      autofocus: true,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 43,
                          fontWeight: FontWeight.w800,
                          color: _ink),
                      decoration: InputDecoration(
                          hintText: '0.00',
                          hintStyle: const TextStyle(color: Color(0xFFCCD6E3)),
                          prefixText: '${widget.currencyCode} ',
                          prefixStyle: const TextStyle(
                              color: _green,
                              fontSize: 38,
                              fontWeight: FontWeight.w700),
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none)),
                  const SizedBox(height: 30),
                  const Text('WHAT WAS IT FOR?',
                      style: TextStyle(
                          color: _muted,
                          fontSize: 12,
                          letterSpacing: .7,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  TextField(
                      controller: _description,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                          hintText: 'Dinner, Groceries, Rent…',
                          prefixIcon: Icon(Icons.description_outlined))),
                  const SizedBox(height: 23),
                  const Text('CATEGORY',
                      style: TextStyle(
                          color: _muted,
                          fontSize: 12,
                          letterSpacing: .7,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 9),
                  Row(children: [
                    for (final option in const [
                      ('Dining', Icons.restaurant_rounded),
                      ('Grocery', Icons.shopping_cart_rounded),
                      ('Rent', Icons.home_rounded),
                      ('Other', Icons.more_horiz_rounded),
                    ]) ...[
                      Expanded(
                          child: _CategoryButton(
                              active: _category == option.$1,
                              icon: option.$2,
                              label: option.$1,
                              onTap: () =>
                                  setState(() => _category = option.$1))),
                      if (option.$1 != 'Other') const SizedBox(width: 8)
                    ]
                  ]),
                  const SizedBox(height: 25),
                  const Text('SPLIT EQUALLY BETWEEN',
                      style: TextStyle(
                          color: _muted,
                          fontSize: 11,
                          letterSpacing: 1.15,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 7),
                  for (final member in members)
                    _ParticipantTile(
                        member: member,
                        selected: _participants.contains(member['user_id']),
                        onTap: () => setState(() {
                              if (_participants.contains(member['user_id'])) {
                                _participants.remove(member['user_id']);
                              } else {
                                _participants.add(member['user_id'] as String);
                              }
                            })),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(_error!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error))),
                  const SizedBox(height: 12),
                  FilledButton(
                      onPressed: _loading ? null : () => _save(members),
                      child: Text(_loading ? 'Saving…' : 'Add expense')),
                ]));
          });
}

class _CategoryButton extends StatelessWidget {
  const _CategoryButton(
      {required this.active,
      required this.icon,
      required this.label,
      required this.onTap});
  final bool active;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
      color: active ? const Color(0xFFE8F9EF) : const Color(0xFFF5F7FA),
      borderRadius: BorderRadius.circular(15),
      child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(15),
          child: Container(
              height: 86,
              decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(
                      color: active
                          ? const Color(0xFFB6EDCD)
                          : Colors.transparent)),
              child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon,
                        color: active ? _green : const Color(0xFF91A1BA)),
                    const SizedBox(height: 5),
                    Text(label,
                        style: TextStyle(
                            color: active ? _green : _ink,
                            fontSize: 10,
                            fontWeight: FontWeight.w700))
                  ]))));
}

class _ParticipantTile extends StatelessWidget {
  const _ParticipantTile(
      {required this.member, required this.selected, required this.onTap});
  final Map<String, dynamic> member;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final name = member['name'] as String;
    return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(17),
            child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(17),
                child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(17),
                        border: Border.all(
                            color: selected
                                ? const Color(0xFFB6EDCD)
                                : const Color(0xFFE5EAF1))),
                    child: Row(children: [
                      CircleAvatar(
                          backgroundColor: const Color(0xFFE7EDF5),
                          child: Text(name[0].toUpperCase(),
                              style: const TextStyle(
                                  color: _ink, fontWeight: FontWeight.w800))),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text(name,
                                style: const TextStyle(
                                    color: _ink, fontWeight: FontWeight.w800)),
                            Text(selected ? 'Included' : 'Excluded',
                                style: const TextStyle(
                                    color: _muted, fontSize: 12))
                          ])),
                      Icon(
                          selected
                              ? Icons.check_circle_rounded
                              : Icons.circle_outlined,
                          color: selected ? _green : const Color(0xFFB2BFCE))
                    ])))));
  }
}
