import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const _apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8081');
const _ink = Color(0xFF0E1930);
const _muted = Color(0xFF637592);

class InviteMemberSheet extends StatefulWidget {
  const InviteMemberSheet({
    required this.trackerId,
    required this.token,
    super.key,
  });

  final String trackerId;
  final String token;

  @override
  State<InviteMemberSheet> createState() => _InviteMemberSheetState();
}

class _InviteMemberSheetState extends State<InviteMemberSheet> {
  final _email = TextEditingController();
  String _role = 'viewer';
  String? _error;
  bool _loading = false;
  bool _searching = false;
  List<Map<String, dynamic>> _candidates = [];
  Timer? _searchDebounce;

  void _search(String value) {
    _searchDebounce?.cancel();
    if (value.trim().length < 2) {
      setState(() {
        _candidates = [];
        _searching = false;
      });
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 280), () async {
      if (mounted) setState(() => _searching = true);
      try {
        final response = await http.get(
            Uri.parse(
                '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/member-candidates?q=${Uri.encodeQueryComponent(value.trim())}'),
            headers: {
              'Authorization': 'Bearer ${widget.token}'
            }).timeout(const Duration(seconds: 10));
        if (mounted &&
            _email.text.trim() == value.trim() &&
            response.statusCode == 200) {
          setState(() => _candidates = List<Map<String, dynamic>>.from(
              (jsonDecode(response.body) as Map<String, dynamic>)['data']
                  as List));
        }
      } catch (_) {
      } finally {
        if (mounted && _email.text.trim() == value.trim()) {
          setState(() => _searching = false);
        }
      }
    });
  }

  Future<void> _invite() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await http
          .post(
            Uri.parse(
                '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/invitations'),
            headers: {
              'Authorization': 'Bearer ${widget.token}',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({'email': email, 'role': _role}),
          )
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      if (response.statusCode == 201) {
        Navigator.pop(context, true);
        return;
      }
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      setState(() {
        _loading = false;
        _error = ((decoded['error'] as Map?)?['message'] as String?) ??
            'Could not send the invitation.';
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not send the invitation. Please try again.';
        });
      }
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
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
          const SizedBox(height: 23),
          Row(children: [
            Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                    color: const Color(0xFFDDF9E8),
                    borderRadius: BorderRadius.circular(15)),
                child: const Icon(Icons.person_add_alt_1_rounded,
                    color: Color(0xFF168A48))),
            const SizedBox(width: 13),
            const Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Invite a member',
                      style: TextStyle(
                          color: _ink,
                          fontSize: 23,
                          fontWeight: FontWeight.w800)),
                  SizedBox(height: 2),
                  Text('Add someone to this Tracker',
                      style: TextStyle(color: _muted, fontSize: 13)),
                ])),
          ]),
          const SizedBox(height: 20),
          Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                  color: const Color(0xFFF1FAF4),
                  borderRadius: BorderRadius.circular(15)),
              child: const Row(children: [
                Icon(Icons.info_outline_rounded,
                    color: Color(0xFF278A51), size: 19),
                SizedBox(width: 9),
                Expanded(
                    child: Text(
                        'They will accept after signing in with this email.',
                        style: TextStyle(
                            color: Color(0xFF397955),
                            fontSize: 12,
                            height: 1.35))),
              ])),
          const SizedBox(height: 22),
          TextField(
              controller: _email,
              autofocus: true,
              keyboardType: TextInputType.emailAddress,
              onChanged: _search,
              decoration: const InputDecoration(
                  labelText: 'Email address',
                  prefixIcon: Icon(Icons.alternate_email_rounded))),
          if (_searching || _candidates.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
                decoration: BoxDecoration(
                    color: const Color(0xFFF7F9FB),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE3E9F0))),
                child: _searching
                    ? const Padding(
                        padding: EdgeInsets.all(15),
                        child: Row(children: [
                          SizedBox(
                              width: 17,
                              height: 17,
                              child: CircularProgressIndicator(strokeWidth: 2)),
                          SizedBox(width: 10),
                          Text('Finding people…',
                              style: TextStyle(color: _muted, fontSize: 13))
                        ]))
                    : Column(children: [
                        for (final candidate in _candidates)
                          Material(
                              color: Colors.transparent,
                              child: InkWell(
                                  borderRadius: BorderRadius.circular(16),
                                  onTap: () => setState(() {
                                        _email.text =
                                            candidate['email'] as String;
                                        _candidates = [];
                                      }),
                                  child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Row(children: [
                                        CircleAvatar(
                                            radius: 18,
                                            backgroundColor:
                                                const Color(0xFFE0F9EA),
                                            child: Text(
                                                (candidate['name'] as String)
                                                    .substring(0, 1)
                                                    .toUpperCase(),
                                                style: const TextStyle(
                                                    color: _ink,
                                                    fontWeight:
                                                        FontWeight.w800))),
                                        const SizedBox(width: 10),
                                        Expanded(
                                            child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                              Text(candidate['name'] as String,
                                                  style: const TextStyle(
                                                      color: _ink,
                                                      fontWeight:
                                                          FontWeight.w800)),
                                              Text(candidate['email'] as String,
                                                  style: const TextStyle(
                                                      color: _muted,
                                                      fontSize: 12))
                                            ])),
                                        const Icon(
                                            Icons.add_circle_outline_rounded,
                                            color: Color(0xFF168A48),
                                            size: 20)
                                      ]))))
                      ])),
          ],
          const SizedBox(height: 18),
          const Text('ACCESS LEVEL',
              style: TextStyle(
                  color: _muted,
                  fontSize: 11,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          _AccessLevelOption(
              selected: _role == 'viewer',
              icon: Icons.visibility_outlined,
              title: 'Viewer',
              detail: 'Can see expenses, balances, and activity.',
              onTap: () => setState(() => _role = 'viewer')),
          const SizedBox(height: 9),
          _AccessLevelOption(
              selected: _role == 'commenter',
              icon: Icons.chat_bubble_outline_rounded,
              title: 'Commenter',
              detail: 'Can view the Tracker and comment.',
              onTap: () => setState(() => _role = 'commenter')),
          const SizedBox(height: 9),
          _AccessLevelOption(
              selected: _role == 'editor',
              icon: Icons.edit_outlined,
              title: 'Editor',
              detail: 'Can add expenses and record settlements.',
              onTap: () => setState(() => _role = 'editor')),
          if (_error != null)
            Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 12),
          SizedBox(
              width: double.infinity,
              child: FilledButton(
                  onPressed: _loading ? null : _invite,
                  child: Text(_loading ? 'Sending…' : 'Send invitation'))),
        ]),
      );
}

class _AccessLevelOption extends StatelessWidget {
  const _AccessLevelOption(
      {required this.selected,
      required this.icon,
      required this.title,
      required this.detail,
      required this.onTap});
  final bool selected;
  final IconData icon;
  final String title;
  final String detail;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
      color: selected ? const Color(0xFFF0FBF4) : Colors.white,
      borderRadius: BorderRadius.circular(17),
      child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(17),
          child: Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(17),
                  border: Border.all(
                      color: selected
                          ? const Color(0xFF22C96B)
                          : const Color(0xFFE2E8F0),
                      width: selected ? 1.7 : 1)),
              child: Row(children: [
                Container(
                    width: 39,
                    height: 39,
                    decoration: BoxDecoration(
                        color: selected
                            ? const Color(0xFFDDF9E8)
                            : const Color(0xFFF3F6F9),
                        borderRadius: BorderRadius.circular(12)),
                    child: Icon(icon,
                        color: selected ? const Color(0xFF168A48) : _muted,
                        size: 20)),
                const SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(title,
                          style: const TextStyle(
                              color: _ink,
                              fontWeight: FontWeight.w800,
                              fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(detail,
                          style: const TextStyle(
                              color: _muted, fontSize: 12, height: 1.25))
                    ])),
                const SizedBox(width: 8),
                Container(
                    width: 21,
                    height: 21,
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color:
                            selected ? const Color(0xFF22C96B) : Colors.white,
                        border: Border.all(
                            color: selected
                                ? const Color(0xFF22C96B)
                                : const Color(0xFFBBC6D4),
                            width: 1.5)),
                    child: selected
                        ? const Icon(Icons.check, size: 14, color: Colors.white)
                        : null),
              ]))));
}
