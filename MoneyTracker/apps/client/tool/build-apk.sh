#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
config_file="$project_dir/.env.json"
if [[ ! -f "$config_file" ]]; then
  echo "Missing $config_file. Copy .env.example.json to .env.json and set its values."
  exit 78
fi

api_base_url="$(jq -r '.apiBaseUrl // empty' "$config_file")"
supabase_url="$(jq -r '.supabaseUrl // empty' "$config_file")"
supabase_key="$(jq -r '.supabaseAnonKey // empty' "$config_file")"
if [[ -z "$api_base_url" || -z "$supabase_url" || -z "$supabase_key" ]]; then
  echo "apiBaseUrl, supabaseUrl, and supabaseAnonKey are required in .env.json."
  exit 65
fi

cd "$project_dir"
exec flutter build apk --debug \
  --dart-define="API_BASE_URL=$api_base_url" \
  --dart-define="SUPABASE_URL=$supabase_url" \
  --dart-define="SUPABASE_ANON_KEY=$supabase_key"
