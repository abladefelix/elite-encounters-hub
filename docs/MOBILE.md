# Ashnight on iOS and Android

Ashnight ships as a native app on both stores using **Capacitor**. There is no
second codebase: the app is a thin native shell around the same live Ashnight
deployment, so every feature you already have — rooms, chat, calls, escrow,
Paystack, gifts, wallet — behaves identically.

The **control room (`/ashnight-control`) is intentionally web only.** Opening it
inside the app shows a "Admin is web only" notice. Run admin work from a desktop
browser.

---

## 1. How the shell works

`capacitor.config.ts` sets `server.url` to the production site. The native app
opens that URL inside a secure in-app web view rather than bundling a static
copy of the site — required, because Ashnight uses server functions for auth,
escrow and payments.

- **Live URL** — defaults to `https://ashnight.caymanirs.com`. Override without
  editing the file: `ASHNIGHT_APP_URL=https://your-domain.com npm run mobile:sync`.
- **`mobile-shell/index.html`** — the offline screen shown when the device has no
  connection.
- **`src/components/native-shell.tsx`** — native-only status bar colour, keyboard
  inset handling for the chat composer, and Android hardware back button.
- **`src/lib/native.ts`** — `isNativeApp()` / `useIsNativeApp()` detection. The
  browser build is unaffected; every native call is behind these guards.
- **`allowNavigation`** — only the Ashnight domain, Paystack checkout and Google
  sign-in stay inside the app. Everything else opens in the system browser.

---

## 2. One-time machine setup

| Platform | Requirements |
| --- | --- |
| Android | Android Studio (latest), JDK 21, Play Console account ($25 one-off) |
| iOS | macOS, Xcode 16+, CocoaPods, Apple Developer Program ($99/year) |

You cannot build native binaries from the Lovable editor — export the repo to
GitHub, clone it locally, then run the steps below.

```bash
git clone <your-repo-url> ashnight
cd ashnight
npm install
```

---

## 3. Add the platforms

```bash
npm run build              # produces the web assets / offline shell
npm run mobile:add:android
npm run mobile:add:ios     # macOS only
npm run mobile:sync        # copies config + plugins into both projects
```

This creates `android/` and `ios/` folders. Commit them — they hold your signing
config, icons and permission strings.

Re-run `npm run mobile:sync` after every dependency change or config edit.

---

## 4. Required permissions (calls, photos, location)

Audio/video calls, portfolio uploads and location sharing need explicit
permissions. Add them once after `cap add`.

### iOS — `ios/App/App/Info.plist`

```xml
<key>NSCameraUsageDescription</key>
<string>Ashnight uses your camera for video calls and to add photos to your profile.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Ashnight uses your microphone for audio and video calls with specialists.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Ashnight lets you attach photos to your profile and to chats.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Ashnight shares your location in chat so a specialist can find the address.</string>
```

### Android — `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

Android web views also need the call permission bridge. In
`android/app/src/main/java/.../MainActivity.java`, WebRTC permission prompts are
handled by Capacitor's default bridge; if a call fails to get the mic, confirm
the runtime permission dialog was accepted in **Settings → Apps → Ashnight**.

---

## 5. Icons and splash screen

The brand artwork is already in the repo — nothing to draw:

| File | Used for |
| --- | --- |
| `assets/icon.png` (1024×1024) | iOS + Android app icon |
| `assets/icon-foreground.png` / `assets/icon-background.png` | Android adaptive icon layers |
| `assets/splash.png` / `assets/splash-dark.png` (2732×2732) | launch splash, light + dark |
| `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/manifest.webmanifest` | Add-to-Home-Screen icon on the mobile website |

Generate every platform size after `cap add` (and any time you replace the
artwork above):

```bash
npm run mobile:assets   # writes into android/ and ios/
npm run mobile:sync
```

Splash behaviour (colour, duration, no spinner) is set under `plugins.SplashScreen`
in `capacitor.config.ts`. Updating the logo in **Admin → Brand & wording**
changes the in-app logo immediately; store icons and the splash must be
regenerated with the commands above and resubmitted.


---

## 6. Build and release

```bash
npm run mobile:open:android   # Android Studio → Build → Generate Signed Bundle (.aab)
npm run mobile:open:ios       # Xcode → Product → Archive → Distribute App
```

Keep the Android keystore and its passwords somewhere safe — losing it means you
can never update the listing.

---

## 7. Store review notes

- **Apple in-app purchase:** Apple requires IAP for digital-only subscriptions.
  Client memberships are safest sold on the website; the app then unlocks the
  rooms tied to the account. Bookings and escrow payments for real-world cleaning
  services are physical services and may stay on Paystack.
- **Account deletion:** both stores require in-app deletion. Members request it
  from Profile; admins action it in the control room.
- **Admin panel:** excluded from the app on purpose — apps that are mostly
  dashboards get rejected under Apple guideline 4.2.
- **Login for reviewers:** provide a demo client account in App Store Connect
  and Play Console review notes.

---

## 8. Shipping web updates to the app

Because the shell loads the live site, any web change you publish reaches every
installed app on the next launch — no store review needed. You only resubmit
when you change native config: app name, icons, permissions, plugins or the
`server.url` domain.

## Microphone / camera permissions (calls)

iOS and Android only prompt for mic/camera when the native project declares them.
`bun run mobile:sync` now runs `scripts/native-permissions.mjs`, which adds the
usage descriptions to `ios/App/App/Info.plist`, the permissions to
`android/app/src/main/AndroidManifest.xml`, and switches the iOS launch image to
full-screen (`scaleAspectFill`).

```bash
git pull origin main
bun install
bun run build
bun run mobile:sync        # patches permissions + launch screen
bun run mobile:assets      # regenerates icons + 2732x2732 splashes
bun run mobile:sync
bun run mobile:open:ios    # delete the app from the device, then Run
```

Deleting the app first is required: iOS caches both the old launch image and a
previously denied microphone decision. After reinstalling, the first call shows
the system prompt. If it was denied earlier, re-enable it in
**Settings → Ashnight → Microphone / Camera**.

## Calls while the app is closed

In-app ringing (Realtime `call-ring:<userId>` channel) only reaches a member
while Ashnight is open or backgrounded with the web view alive. Ringing a fully
closed app requires an OS-level push: VoIP push (PushKit + CallKit) on iOS and a
high-priority FCM data message on Android, delivered from the server when a call
invite is created.

Members already control this from **Profile → Calls**
(`profiles.extra.calls`): accept calls, ring when the app is closed, ringtone
and vibrate. `ringWhenClosed` is stored and honoured the moment the native push
service is wired up — nothing pretends to work before then.
