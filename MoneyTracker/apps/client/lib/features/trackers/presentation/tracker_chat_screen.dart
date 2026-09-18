import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

const _apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8081');
const _ink = Color(0xFF0E1930);
const _muted = Color(0xFF637592);
const _green = Color(0xFF22C96B);

class TrackerChatScreen extends StatefulWidget {
  const TrackerChatScreen(
      {required this.trackerId,
      required this.trackerName,
      required this.token,
      required this.currentUserId,
      required this.memberCount,
      required this.overallBalanceMinor,
      super.key});
  final String trackerId;
  final String trackerName;
  final String token;
  final String currentUserId;
  final int memberCount;
  final int overallBalanceMinor;
  @override
  State<TrackerChatScreen> createState() => _TrackerChatScreenState();
}

class _TrackerChatScreenState extends State<TrackerChatScreen> {
  final _message = TextEditingController();
  final _scroll = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  RealtimeChannel? _channel;
  String? _error;
  bool _sending = false;
  bool _loading = true;
  bool _loadFailed = false;

  @override
  void initState() {
    super.initState();
    _loadInitial();
    _subscribe();
  }

  void _subscribe() {
    try {
      _channel = Supabase.instance.client
          .channel('tracker-chat-${widget.trackerId}')
          .onPostgresChanges(
              event: PostgresChangeEvent.insert,
              schema: 'public',
              table: 'tracker_messages',
              filter: PostgresChangeFilter(
                  type: PostgresChangeFilterType.eq,
                  column: 'tracker_id',
                  value: widget.trackerId),
              callback: (payload) =>
                  _receiveRealtime(payload.newRecord['id'] as String?))
          // Re-fetch the affected message for reactions. The reaction row does
          // not carry a tracker id, so the API remains the membership-safe
          // source of truth before we paint the change.
          .onPostgresChanges(
              event: PostgresChangeEvent.all,
              schema: 'public',
              table: 'tracker_message_reactions',
              callback: (payload) => _refreshMessage(
                  (payload.newRecord['message_id'] ??
                      payload.oldRecord['message_id']) as String?))
          .subscribe();
    } catch (_) {
      // REST remains the source of truth if Realtime is not configured yet.
    }
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final response = await http.get(
        Uri.parse('$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/messages'),
        headers: {
          'Authorization': 'Bearer ${widget.token}'
        }).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) throw Exception();
    return List<Map<String, dynamic>>.from(
        (jsonDecode(response.body) as Map<String, dynamic>)['data'] as List);
  }

  Future<void> _loadInitial() async {
    try {
      final messages = await _load();
      if (mounted) {
        setState(() {
          _messages = messages;
          _loading = false;
          _loadFailed = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadFailed = true;
        });
      }
    }
  }

  Future<void> _receiveRealtime(String? messageId) async {
    if (messageId == null) return;
    if (_messages.any((message) => message['id'] == messageId)) {
      await _refreshMessage(messageId);
      return;
    }
    final message = await _fetchMessage(messageId);
    if (message == null || !mounted) return;
    if (_messages.any((item) => item['id'] == message['id'])) return;
    setState(() => _messages = [..._messages, message]);
    _scrollToLatest();
  }

  Future<Map<String, dynamic>?> _fetchMessage(String messageId) async {
    try {
      final response = await http.get(
          Uri.parse(
              '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/messages/$messageId'),
          headers: {
            'Authorization': 'Bearer ${widget.token}'
          }).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) return null;
      return (jsonDecode(response.body) as Map<String, dynamic>)['data']
          as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> _refreshMessage(String? messageId) async {
    if (messageId == null ||
        !_messages.any((message) => message['id'] == messageId)) {
      return;
    }
    final updated = await _fetchMessage(messageId);
    if (updated == null || !mounted) {
      return;
    }
    setState(() => _messages = _messages
        .map((message) => message['id'] == messageId ? updated : message)
        .toList());
  }

  void _append(Map<String, dynamic> message) {
    if (_messages.any((item) => item['id'] == message['id'])) return;
    setState(() => _messages = [..._messages, message]);
    _scrollToLatest();
  }

  void _scrollToLatest() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final body = _message.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final response = await http
          .post(
              Uri.parse(
                  '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/messages'),
              headers: {
                'Authorization': 'Bearer ${widget.token}',
                'Content-Type': 'application/json'
              },
              body: jsonEncode({'body': body}))
          .timeout(const Duration(seconds: 15));
      if (response.statusCode != 201) throw Exception();
      final message = (jsonDecode(response.body)
          as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      _message.clear();
      _append(message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Message could not be sent. Try again.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _react(String messageId, String emoji) async {
    try {
      final response = await http.post(
          Uri.parse(
              '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/messages/$messageId/reactions'),
          headers: {
            'Authorization': 'Bearer ${widget.token}',
            'Content-Type': 'application/json'
          },
          body: jsonEncode({'emoji': emoji}));
      if (response.statusCode == 200 && mounted) {
        final updated = (jsonDecode(response.body)
            as Map<String, dynamic>)['data'] as Map<String, dynamic>;
        setState(() => _messages = _messages
            .map((message) => message['id'] == messageId ? updated : message)
            .toList());
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _message.dispose();
    _scroll.dispose();
    if (_channel != null) Supabase.instance.client.removeChannel(_channel!);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
            child: Column(children: [
          Padding(
              padding: const EdgeInsets.fromLTRB(12, 9, 12, 10),
              child: Row(children: [
                IconButton(
                    onPressed: () {},
                    icon:
                        const Icon(Icons.arrow_back_ios_new_rounded, size: 20)),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                      Text(widget.trackerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: _ink,
                              fontWeight: FontWeight.w800,
                              fontSize: 20)),
                      Text('${widget.memberCount} members • Active',
                          style: TextStyle(color: _muted, fontSize: 12))
                    ])),
                IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.more_vert_rounded),
                    tooltip: 'Tracker options')
              ])),
          Padding(
              padding: const EdgeInsets.fromLTRB(26, 10, 26, 18),
              child: Container(
                  padding: const EdgeInsets.fromLTRB(26, 20, 14, 20),
                  decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFC7F1D9)),
                      boxShadow: const [
                        BoxShadow(
                            color: Color(0x080E1930),
                            blurRadius: 8,
                            offset: Offset(0, 3))
                      ]),
                  child: Row(children: [
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          const Text('OVERALL BALANCE',
                              style: TextStyle(
                                  color: _muted,
                                  fontSize: 12,
                                  letterSpacing: 1.15,
                                  fontWeight: FontWeight.w700)),
                          const SizedBox(height: 5),
                          Text(
                              'PHP ${(widget.overallBalanceMinor / 100).toStringAsFixed(2)}',
                              style: const TextStyle(
                                  color: _ink,
                                  fontSize: 29,
                                  letterSpacing: -1,
                                  fontWeight: FontWeight.w900))
                        ])),
                    FilledButton(
                        onPressed: () => Navigator.pop(context),
                        style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 56),
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12))),
                        child: const Text('Settle up'))
                  ]))),
          const Divider(height: 1, color: Color(0xFFE5EAF1)),
          Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _loadFailed
                      ? Center(
                          child: TextButton(
                              onPressed: _loadInitial,
                              child: const Text(
                                  'Could not load messages. Try again')))
                      : _messages.isEmpty
                          ? const _ChatEmpty()
                          : ListView.separated(
                              controller: _scroll,
                              padding:
                                  const EdgeInsets.fromLTRB(20, 20, 20, 12),
                              itemCount: _messages.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 12),
                              itemBuilder: (_, index) => _MessageBubble(
                                  message: _messages[index],
                                  mine: _messages[index]['sender_user_id'] ==
                                      widget.currentUserId,
                                  onReact: _react))),
          if (_error != null)
            Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(_error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                            fontSize: 12)))),
          Container(
              padding: EdgeInsets.fromLTRB(
                  16, 10, 16, 12 + MediaQuery.of(context).padding.bottom),
              decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Color(0xFFE5EAF1)))),
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Container(
                    width: 52,
                    height: 52,
                    decoration: const BoxDecoration(
                        color: Color(0xFFF0F3F6), shape: BoxShape.circle),
                    child:
                        const Icon(Icons.add_rounded, color: _ink, size: 28)),
                const SizedBox(width: 10),
                Expanded(
                    child: TextField(
                        controller: _message,
                        minLines: 1,
                        maxLines: 4,
                        textCapitalization: TextCapitalization.sentences,
                        onSubmitted: (_) => _send(),
                        decoration: InputDecoration(
                            hintText: 'Type a message or add expense',
                            hintStyle:
                                const TextStyle(color: _muted, fontSize: 16),
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 18, vertical: 14),
                            border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(28),
                                borderSide: BorderSide.none),
                            filled: true,
                            fillColor: Colors.white))),
                const SizedBox(width: 9),
                Material(
                    color: _green,
                    borderRadius: BorderRadius.circular(28),
                    child: InkWell(
                        onTap: _sending ? null : _send,
                        borderRadius: BorderRadius.circular(28),
                        child: SizedBox(
                            width: 56,
                            height: 56,
                            child: Center(
                                child: _sending
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2))
                                    : const Icon(Icons.send_rounded,
                                        color: Colors.white, size: 25)))))
              ])),
        ])),
      );
}

class _ChatEmpty extends StatelessWidget {
  const _ChatEmpty();
  @override
  Widget build(BuildContext context) => const Center(
      child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.forum_outlined, color: _green, size: 48),
            SizedBox(height: 14),
            Text('Start the conversation',
                style: TextStyle(
                    color: _ink, fontSize: 18, fontWeight: FontWeight.w800)),
            SizedBox(height: 6),
            Text('Only active members of this Tracker can see messages here.',
                textAlign: TextAlign.center,
                style: TextStyle(color: _muted, height: 1.4))
          ])));
}

class _MessageBubble extends StatefulWidget {
  const _MessageBubble(
      {required this.message, required this.mine, required this.onReact});
  final Map<String, dynamic> message;
  final bool mine;
  final void Function(String, String) onReact;
  @override
  State<_MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<_MessageBubble> {
  bool _showTime = false;
  @override
  Widget build(BuildContext context) {
    final name = widget.message['sender_name'] as String;
    final mine = widget.mine;
    final messageCard = GestureDetector(
      onTap: () => setState(() => _showTime = !_showTime),
      onLongPress: () => _reactionTray(context),
      child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
          decoration: BoxDecoration(
              color: mine ? _green : Colors.white,
              borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(20),
                  topRight: const Radius.circular(20),
                  bottomLeft: Radius.circular(mine ? 20 : 4),
                  bottomRight: Radius.circular(mine ? 4 : 20)),
              border: mine ? null : Border.all(color: const Color(0xFFE5EAF1))),
          child: Text(widget.message['body'] as String,
              style: const TextStyle(color: _ink, height: 1.38))),
    );
    return Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment:
            mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!mine) _avatar(name, false),
          if (!mine) const SizedBox(width: 10),
          Flexible(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 282),
                  child: Column(
                      crossAxisAlignment: mine
                          ? CrossAxisAlignment.end
                          : CrossAxisAlignment.start,
                      children: [
                        if (!mine)
                          Padding(
                              padding:
                                  const EdgeInsets.only(left: 4, bottom: 4),
                              child: Text(name,
                                  style: const TextStyle(
                                      color: _muted,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12))),
                        messageCard,
                        if ((widget.message['reactions'] as Map?)?.isNotEmpty ==
                            true)
                          Container(
                              margin: const EdgeInsets.only(top: 3),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                  color: const Color(0xFFF0F3F6),
                                  borderRadius: BorderRadius.circular(12)),
                              child: Text(
                                  (widget.message['reactions'] as Map)
                                      .entries
                                      .map((e) => '${e.key} ${e.value}')
                                      .join(' '),
                                  style: const TextStyle(fontSize: 12))),
                        if (_showTime)
                          Padding(
                              padding: const EdgeInsets.only(top: 5),
                              child: Text(
                                  _time(widget.message['created_at'] as String),
                                  style: const TextStyle(
                                      color: _muted, fontSize: 10))),
                      ]))),
          if (mine) const SizedBox(width: 10),
          if (mine) _avatar(name, true),
        ]);
  }

  Widget _avatar(String name, bool mine) => CircleAvatar(
      radius: 19,
      backgroundColor: mine ? _green : const Color(0xFFE6EDF5),
      child: Text(name.isEmpty ? '?' : name[0].toUpperCase(),
          style: const TextStyle(color: _ink, fontWeight: FontWeight.w800)));
  void _reactionTray(BuildContext context) {
    showDialog<void>(
        context: context,
        barrierColor: Colors.transparent,
        builder: (_) => Center(
            child: Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(28),
                elevation: 7,
                child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: ['👍', '❤️', '😂', '😮', '😢']
                            .map((emoji) => InkWell(
                                onTap: () {
                                  Navigator.pop(context);
                                  widget.onReact(
                                      widget.message['id'] as String, emoji);
                                },
                                borderRadius: BorderRadius.circular(22),
                                child: Padding(
                                    padding: const EdgeInsets.all(5),
                                    child: Text(emoji,
                                        style: const TextStyle(fontSize: 28)))))
                            .toList())))));
  }

  String _time(String value) {
    final date = DateTime.tryParse(value)?.toLocal();
    if (date == null) return '';
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    return '$hour:${date.minute.toString().padLeft(2, '0')} ${date.hour >= 12 ? 'PM' : 'AM'}';
  }
}
