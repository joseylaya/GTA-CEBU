import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const _apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8081');
const _ink = Color(0xFF0E1930);
const _muted = Color(0xFF637592);
const _green = Color(0xFF22C96B);

class InvitationsSheet extends StatefulWidget {
  const InvitationsSheet({required this.token, super.key});
  final String token;
  @override
  State<InvitationsSheet> createState() => _InvitationsSheetState();
}

class _InvitationsSheetState extends State<InvitationsSheet> {
  late Future<List<Map<String, dynamic>>> _invitations;
  String? _error;
  @override
  void initState() {
    super.initState();
    _invitations = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final response = await http
        .get(Uri.parse('$_apiBaseUrl/api/v1/invitations'), headers: {
      'Authorization': 'Bearer ${widget.token}'
    }).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) throw Exception();
    return List<Map<String, dynamic>>.from(
        (jsonDecode(response.body) as Map<String, dynamic>)['data'] as List);
  }

  Future<void> _respond(String id, bool accept) async {
    setState(() => _error = null);
    try {
      final response = await http.post(
          Uri.parse(
              '$_apiBaseUrl/api/v1/invitations/$id/${accept ? 'accept' : 'decline'}'),
          headers: {
            'Authorization': 'Bearer ${widget.token}'
          }).timeout(const Duration(seconds: 15));
      if (response.statusCode != 204) throw Exception();
      if (mounted) setState(() => _invitations = _load());
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not update this invitation.');
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
      child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 28),
          child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _invitations,
              builder: (context, snapshot) {
                final invitations = snapshot.data ?? [];
                return ListView(shrinkWrap: true, children: [
                  Center(
                      child: Container(
                          width: 42,
                          height: 4,
                          decoration: BoxDecoration(
                              color: const Color(0xFFD7DEE7),
                              borderRadius: BorderRadius.circular(8)))),
                  const SizedBox(height: 22),
                  const Text('Your invitations',
                      style: TextStyle(
                          color: _ink,
                          fontSize: 24,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 5),
                  const Text('Join shared Trackers sent to this email.',
                      style: TextStyle(color: _muted)),
                  const SizedBox(height: 20),
                  if (snapshot.connectionState != ConnectionState.done)
                    const Center(
                        child: Padding(
                            padding: EdgeInsets.all(22),
                            child: CircularProgressIndicator()))
                  else if (snapshot.hasError)
                    const Text('Could not load invitations.',
                        style: TextStyle(color: _muted))
                  else if (invitations.isEmpty)
                    Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                            color: const Color(0xFFF7F9FB),
                            borderRadius: BorderRadius.circular(18)),
                        child: const Column(children: [
                          Icon(Icons.mark_email_read_outlined,
                              color: _green, size: 34),
                          SizedBox(height: 10),
                          Text('You have no pending invitations.',
                              style: TextStyle(color: _muted))
                        ]))
                  else
                    for (final invite in invitations)
                      Container(
                          margin: const EdgeInsets.only(bottom: 11),
                          padding: const EdgeInsets.all(15),
                          decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(18),
                              border:
                                  Border.all(color: const Color(0xFFE5EAF1))),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Tracker invitation',
                                    style: TextStyle(
                                        color: _ink,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16)),
                                const SizedBox(height: 5),
                                Text(
                                    'Invited as ${(invite['role'] as String).toUpperCase()}',
                                    style: const TextStyle(
                                        color: _muted, fontSize: 12)),
                                const SizedBox(height: 12),
                                Row(children: [
                                  Expanded(
                                      child: OutlinedButton(
                                          onPressed: () => _respond(
                                              invite['id'] as String, false),
                                          child: const Text('Decline'))),
                                  const SizedBox(width: 10),
                                  Expanded(
                                      child: FilledButton(
                                          onPressed: () => _respond(
                                              invite['id'] as String, true),
                                          child: const Text('Accept')))
                                ])
                              ])),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_error!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error))),
                ]);
              })));
}
