# SplitShare client

## Local configuration

Copy `.env.example.json` to `.env.json`, then fill in the API and Supabase values. The real file is ignored by Git.

```sh
cd apps/client
cp .env.example.json .env.json
```

For Wi-Fi device testing, set `apiBaseUrl` to your Mac's LAN address, for example `http://192.168.106.16:8081`.

## Run on a specific device

```sh
./tool/run-device.sh 192.168.104.109:5555
```

Build an installable debug APK with the same settings:

```sh
./tool/build-apk.sh
adb -s 192.168.104.109:5555 install -r build/app/outputs/flutter-apk/app-debug.apk
```
