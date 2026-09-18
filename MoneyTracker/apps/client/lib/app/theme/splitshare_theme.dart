import 'package:flutter/material.dart';

const _primaryGreen = Color(0xFF22C96B);
const _background = Color(0xFFF6F8F7);
const _ink = Color(0xFF0E1930);
const _muted = Color(0xFF637592);

final ThemeData splitShareTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: _primaryGreen,
    primary: _primaryGreen,
    surface: Colors.white,
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: Colors.white,
    foregroundColor: _ink,
    elevation: 0,
    scrolledUnderElevation: 0,
    surfaceTintColor: Colors.white,
    titleTextStyle:
        TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _ink),
  ),
  cardTheme: CardThemeData(
    color: Colors.white,
    elevation: 0,
    margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: Color(0xFFE5EAF1)),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: const Color(0xFFF5F7FA),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
    border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
    enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: _primaryGreen, width: 2),
    ),
  ),
  scaffoldBackgroundColor: _background,
  textTheme: const TextTheme(
    headlineMedium: TextStyle(fontWeight: FontWeight.w800, color: _ink),
    titleLarge: TextStyle(fontWeight: FontWeight.w700, color: _ink),
    bodyLarge: TextStyle(color: _muted, height: 1.5),
    bodyMedium: TextStyle(color: _muted),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: _primaryGreen,
      foregroundColor: Colors.white,
      minimumSize: const Size.fromHeight(56),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
    ),
  ),
);
