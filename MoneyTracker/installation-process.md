## Prerequisites

| Requirement | Details |
|---|---|
| Network | Android device(s) and dev machine on the **same Wi-Fi network** |
| ADB | Installed via Android Studio or Flutter SDK |
| USB cable | Needed **once per session** for initial pairing (Android 10 and below) or not at all (Android 11+) |
| USB Debugging | `Settings > Developer Options > USB Debugging = ON` |

---

## Two-Device Setup (Phase 3 — Realtime + FCM Testing)

Phase 3 requires **Device A** (runner) and **Device B** (requester) on the same errand.

### Step 1 — Get Both IPs

```
Device A IP: 192.168.1.x   (primary dev phone)
Device B IP: 192.168.1.y   (second phone)
```

### Step 2 — Pair Device A (USB)

**Windows**
```powershell
adb devices                          # note Device A serial
adb -s DEVICE_A_SERIAL tcpip 5555
adb connect 192.168.1.x:5555
# unplug Device A
```

**macOS**
```bash
adb devices                          # note Device A serial
adb -s DEVICE_A_SERIAL tcpip 5555
adb connect 192.168.1.x:5555
# unplug Device A
```

### Step 3 — Pair Device B (USB)

**Windows**
```powershell
adb devices                          # note Device B serial
adb -s DEVICE_B_SERIAL tcpip 5555
adb connect 192.168.1.y:5555
# unplug Device B
```

**macOS**
```bash
adb devices                          # note Device B serial
adb -s DEVICE_B_SERIAL tcpip 5555
adb connect 192.168.1.y:5555
# unplug Device B
```

### Step 4 — Verify Both Connected

```bash
# Windows & macOS
adb devices
# Expected:
# 192.168.1.x:5555    device   ← Device A
# 192.168.1.y:5555    device   ← Device B
```

### Step 5 — Run App on Both Devices

Open **two separate terminals:**

**Windows**
```powershell
# Terminal 1 — Device A (runner account)
fvm flutter run -d 192.168.1.x:5555

# Terminal 2 — Device B (requester account)
fvm flutter run -d 192.168.1.y:5555
```

**macOS**
```bash
# Terminal 1 — Device A (runner account)
fvm flutter run -d 192.168.1.x:5555
# Terminal 2 — Device B (requester account)
fvm flutter run -d 192.168.1.y:5555
```