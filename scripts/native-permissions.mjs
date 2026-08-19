/**
 * Patches the generated native projects with the permissions Ashnight needs.
 *
 * iOS: WKWebView only shows the "Allow microphone/camera?" prompt when the app
 * declares usage descriptions in Info.plist. Without them getUserMedia fails
 * instantly, which is what "Microphone blocked" in the call overlay means.
 * It also makes the launch image fill the screen instead of letter-boxing.
 *
 * Android: the same calls need RECORD_AUDIO / CAMERA / MODIFY_AUDIO_SETTINGS
 * in AndroidManifest.xml.
 *
 * Safe to run repeatedly, and it silently skips platforms that aren't added.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

const IOS_KEYS = {
  NSMicrophoneUsageDescription:
    "Ashnight uses your microphone for voice and video calls with your specialist or client.",
  NSCameraUsageDescription:
    "Ashnight uses your camera for video calls and for photos you add to your profile or chat.",
  NSPhotoLibraryUsageDescription:
    "Ashnight needs photo access so you can upload a profile picture, portfolio images or chat attachments.",
  NSPhotoLibraryAddUsageDescription:
    "Ashnight saves receipts and images you download to your photo library.",
  NSLocationWhenInUseUsageDescription:
    "Ashnight uses your location only when you choose to share it in a chat.",
  // Without this key iOS refuses Face ID outright — the biometric toggle stays
  // disabled and checkBiometry() reports biometry as unavailable.
  NSFaceIDUsageDescription:
    "Ashnight uses Face ID to unlock the app so only you can open your account.",
};

const ANDROID_PERMISSIONS = [
  "android.permission.RECORD_AUDIO",
  "android.permission.CAMERA",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  // Required for the fingerprint / face unlock prompt.
  "android.permission.USE_BIOMETRIC",
  "android.permission.USE_FINGERPRINT",
];

function patchInfoPlist() {
  const path = resolve(root, "ios/App/App/Info.plist");
  if (!existsSync(path)) {
    console.log("• iOS not added yet — skipping Info.plist");
    return;
  }
  let plist = readFileSync(path, "utf8");
  let added = 0;

  for (const [key, description] of Object.entries(IOS_KEYS)) {
    if (plist.includes(`<key>${key}</key>`)) continue;
    plist = plist.replace(
      /<dict>/,
      `<dict>\n\t<key>${key}</key>\n\t<string>${description}</string>`,
    );
    added += 1;
  }

  if (added > 0) {
    writeFileSync(path, plist);
    console.log(`✓ Info.plist — added ${added} usage description(s)`);
  } else {
    console.log("✓ Info.plist — usage descriptions already present");
  }
}

function patchLaunchScreen() {
  const path = resolve(root, "ios/App/App/Base.lproj/LaunchScreen.storyboard");
  if (!existsSync(path)) return;
  const original = readFileSync(path, "utf8");
  // aspectFit leaves bars around the launch image; aspectFill covers the screen.
  const patched = original.replace(/contentMode="scaleAspectFit"/g, 'contentMode="scaleAspectFill"');
  if (patched !== original) {
    writeFileSync(path, patched);
    console.log("✓ LaunchScreen.storyboard — splash now fills the screen");
  } else {
    console.log("✓ LaunchScreen.storyboard — already full screen");
  }
}

function patchAndroidManifest() {
  const path = resolve(root, "android/app/src/main/AndroidManifest.xml");
  if (!existsSync(path)) {
    console.log("• Android not added yet — skipping AndroidManifest.xml");
    return;
  }
  let manifest = readFileSync(path, "utf8");
  const missing = ANDROID_PERMISSIONS.filter((name) => !manifest.includes(name));

  if (missing.length > 0) {
    const block = missing.map((name) => `    <uses-permission android:name="${name}" />`).join("\n");
    manifest = manifest.replace(/<\/manifest>/, `${block}\n</manifest>`);
    writeFileSync(path, manifest);
    console.log(`✓ AndroidManifest.xml — added ${missing.length} permission(s)`);
  } else {
    console.log("✓ AndroidManifest.xml — permissions already present");
  }
}

patchInfoPlist();
patchLaunchScreen();
patchAndroidManifest();
