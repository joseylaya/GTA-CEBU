import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8081');
const _ink = Color(0xFF0E1930);
const _muted = Color(0xFF637592);

class RecordSettlementSheet extends StatefulWidget {
  const RecordSettlementSheet(
      {required this.trackerId,
      required this.token,
      required this.currencyCode,
      required this.debt,
      required this.fromName,
      required this.toName,
      super.key});
  final String trackerId;
  final String token;
  final String currencyCode;
  final Map<String, dynamic> debt;
  final String fromName;
  final String toName;
  @override
  State<RecordSettlementSheet> createState() => _RecordSettlementSheetState();
}

class _RecordSettlementSheetState extends State<RecordSettlementSheet> {
  late final TextEditingController _amount;
  final _method = TextEditingController();
  final _note = TextEditingController();
  bool _loading = false;
  String? _error;
  XFile? _receipt;
  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(
        text: ((widget.debt['amount_minor'] as int) / 100).toStringAsFixed(2));
  }

  Future<void> _save() async {
    final amount = (double.tryParse(_amount.text) ?? 0) * 100;
    if (amount <= 0 || amount.round() > (widget.debt['amount_minor'] as int)) {
      setState(() => _error = 'Enter an amount up to the outstanding debt.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      String? receiptPath;
      if (_receipt != null) {
        receiptPath =
            '${widget.trackerId}/settlements/${DateTime.now().microsecondsSinceEpoch}_${_receipt!.name}';
        await Supabase.instance.client.storage
            .from('MoneyTracker')
            .uploadBinary(receiptPath, await _receipt!.readAsBytes());
      }
      final response = await http
          .post(
              Uri.parse(
                  '$_apiBaseUrl/api/v1/trackers/${widget.trackerId}/settlements'),
              headers: {
                'Authorization': 'Bearer ${widget.token}',
                'Content-Type': 'application/json'
              },
              body: jsonEncode({
                'from_user_id': widget.debt['from_user_id'],
                'to_user_id': widget.debt['to_user_id'],
                'amount_minor': amount.round(),
                'settlement_date':
                    DateTime.now().toIso8601String().substring(0, 10),
                'payment_method':
                    _method.text.trim().isEmpty ? null : _method.text.trim(),
                'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
                'receipt_storage_path': receiptPath,
              }))
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      if (response.statusCode == 201) {
        Navigator.pop(context, true);
      } else {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        setState(() {
          _loading = false;
          _error = ((data['error'] as Map?)?['message'] as String?) ??
              'Could not record the settlement.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not record the settlement. Please try again.';
        });
      }
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    _method.dispose();
    _note.dispose();
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
        const SizedBox(height: 22),
        const Text('Record settlement',
            style: TextStyle(
                color: _ink, fontSize: 24, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text('${widget.fromName} paid ${widget.toName}',
            style: const TextStyle(color: _muted)),
        const SizedBox(height: 22),
        TextField(
            controller: _amount,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(
                color: _ink, fontSize: 24, fontWeight: FontWeight.w800),
            decoration: InputDecoration(
                labelText: 'Amount (${widget.currencyCode})',
                prefixIcon: const Icon(Icons.payments_rounded))),
        const SizedBox(height: 12),
        Material(
            color: const Color(0xFFF1FAF4),
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () async {
                  final selected = await ImagePicker().pickImage(
                      source: ImageSource.gallery,
                      imageQuality: 72,
                      maxWidth: 1600,
                      maxHeight: 1600);
                  if (selected != null && mounted) {
                    setState(() => _receipt = selected);
                  }
                },
                child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(children: [
                      Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12)),
                          child: const Icon(Icons.receipt_long_rounded,
                              color: Color(0xFF168A48))),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text(
                                _receipt == null
                                    ? 'Attach receipt'
                                    : _receipt!.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: _ink, fontWeight: FontWeight.w800)),
                            Text(
                                _receipt == null
                                    ? 'Optional · compressed before upload'
                                    : 'Ready to upload with this settlement',
                                style: const TextStyle(
                                    color: _muted, fontSize: 12))
                          ])),
                      Icon(
                          _receipt == null
                              ? Icons.add_circle_outline_rounded
                              : Icons.check_circle_rounded,
                          color: const Color(0xFF22C96B)),
                    ])))),
        const SizedBox(height: 12),
        TextField(
            controller: _method,
            decoration: const InputDecoration(
                labelText: 'Payment method (optional)',
                prefixIcon: Icon(Icons.account_balance_outlined))),
        const SizedBox(height: 12),
        TextField(
            controller: _note,
            maxLines: 2,
            decoration: const InputDecoration(
                labelText: 'Note (optional)',
                prefixIcon: Icon(Icons.notes_rounded))),
        if (_error != null)
          Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!,
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.error))),
        const SizedBox(height: 14),
        SizedBox(
            width: double.infinity,
            child: FilledButton(
                onPressed: _loading ? null : _save,
                child: Text(_loading ? 'Recording…' : 'Record settlement'))),
      ]));
}
