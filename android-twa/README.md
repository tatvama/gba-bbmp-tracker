# GBA Tracker — Android shell (Trusted Web Activity)

This is a ~1 MB Android wrapper that opens `https://rti.taatvam.com` full-screen
inside Chrome, with no browser UI, its own launcher icon and its own entry in the
recents list.

**It contains no copy of the app.** That is the point: whatever is deployed to
`rti.taatvam.com` is what every phone shows on the next screen load. Shipping a
web change needs no APK rebuild, no reinstall and no Play Store review.

Because the shell *is* Chrome, the things a plain WebView breaks all keep
working: live camera document scanning (`getUserMedia`), client-generated
PDF/DOCX/XLSX downloads (`blob:` + `a.download`), file pickers, and Web Push.

## You almost never need to rebuild this

| Change | Rebuild needed? |
|---|---|
| Any page, style, feature, API, or data change | **No** — deploy the web app as usual |
| App name, launcher icon, splash colours, package id | Yes |
| Android target SDK bump | Yes |

## Prerequisites

- JDK 17 (`JAVA_HOME`, currently Microsoft OpenJDK 17.0.18)
- Android SDK with platform `android-36` and build-tools `37.0.0`
- The signing keystore at `D:\gba-bbmp-tracker\secrets\` — see the README there.
  **Losing it means installed apps can never be updated.**

## Rebuilding

```bash
cd android-twa
export ANDROID_HOME="C:/Users/tatva/AppData/Local/Android/Sdk"
export JAVA_HOME="C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot"
export GRADLE_OPTS="-Djavax.net.ssl.trustStoreType=Windows-ROOT"
./gradlew assembleRelease bundleRelease --no-daemon
```

Then align and sign (Gradle intentionally emits an *unsigned* APK):

```bash
export KS_PW="$(cat D:/gba-bbmp-tracker/secrets/keystore-password.txt)"
BT="$ANDROID_HOME/build-tools/37.0.0"
"$BT/zipalign.exe" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk dist/aligned.apk
"$BT/apksigner.bat" sign --ks D:/gba-bbmp-tracker/secrets/gba-twa.keystore \
  --ks-key-alias gba-twa --ks-pass env:KS_PW --key-pass env:KS_PW \
  --out dist/GBA-Tracker-1.0.0.apk dist/aligned.apk
rm dist/aligned.apk*
```

Bump `appVersionCode` (and `appVersionName`) in `twa-manifest.json` first if you
are shipping an update — Android refuses to install an APK whose versionCode is
not higher than the installed one.

To regenerate the Android project after editing `twa-manifest.json`:

```bash
npx @bubblewrap/cli update --skipVersionUpgrade
```

Then re-apply the patch noted under "Gotchas" below and rebuild.

## Publishing

```bash
npm run apk:publish
```

Uploads `dist/*.apk` to R2 and prints the public URL that `/app` serves.

## Two environment gotchas (both cost real time — read before debugging)

**1. `bubblewrap build` does not work on this machine; use Gradle directly.**
Bubblewrap validates the SDK by requiring a `tools/` or `bin/` directory at the
SDK *root* (an old SDK layout) and pins build-tools `36.1.0`. A modern
Android-Studio SDK has neither — it puts those under `cmdline-tools/latest/bin` —
so `bubblewrap build` fails with `The provided androidSdk isn't correct`.
`bubblewrap update` is unaffected (it never touches the SDK), which is why the
flow above uses `update` for generation and Gradle for the build.

**2. Norton intercepts TLS, so the JVM cannot download anything by default.**
Norton Antivirus re-signs every HTTPS response with its own local root
("Norton Web/Mail Shield Root"). Windows trusts it — curl, npm and Chrome are
fine — but the JDK ships an independent truststore that does not, so Gradle
wrapper and Maven downloads fail with:

```
PKIX path building failed: unable to find valid certification path to requested target
```

Fixed *without* importing any certificate, by telling the JVM to use the Windows
trust store: `-Djavax.net.ssl.trustStoreType=Windows-ROOT`. It is set for the
build JVM in `gradle.properties`, and must also be exported as `GRADLE_OPTS` for
the wrapper's own download step (the wrapper JVM starts before
`gradle.properties` is read). Remove both if this is ever built on Linux/CI.

## Assetlinks — what removes the URL bar

`public/.well-known/assetlinks.json` in the web app pins this APK's signing
certificate SHA-256. On launch, Chrome fetches that file and checks it against
the installed app; on a match it drops the address bar, otherwise the app still
works but looks like a browser.

Current fingerprint (must match the keystore):

```
94:90:41:7E:D7:A6:C2:F8:96:50:2C:6E:3E:25:16:94:13:50:4E:3A:CE:99:05:60:D8:94:DE:59:7E:B2:2D:1C
```

Verify a built APK actually carries it:

```bash
"$BT/apksigner.bat" verify --print-certs dist/GBA-Tracker-1.0.0.apk
```

## A note on the generated project

`app/build.gradle` and `app/src/main/res/raw/web_app_manifest.json` are
bubblewrap output but contain two **hand-corrected** values. The APK had to be
built before the web manifest was deployed, so generation read a local copy of
the manifest, and bubblewrap wrote `http://127.0.0.1:4600/...` into both files as
`webManifestUrl`. Both now say `https://rti.taatvam.com/...`. Re-running
`bubblewrap update` once the manifest is live will produce the correct values on
its own; re-running it while the site is unreachable will reintroduce whatever
URL it was given, so check those two files after any `update`.
