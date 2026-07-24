# Travel ID — Google Play Store release pack

Upload package: **`com.travelid.app`**  
Version: **1.0.1** (versionCode **132**)

## What to upload

| File | Where |
|------|--------|
| **Android App Bundle** | `dist/playstore/TravelID-1.0.1-132.aab` |
| Upload keystore (backup only — never upload to Play) | `android/app/travelid-upload.keystore` |
| Key passwords | `dist/playstore/UPLOAD_KEY_BACKUP.txt` (keep private) |

Play Console → **Create app** → **Production** (or Internal testing) → **Create new release** → upload the `.aab`.

Enable **Google Play App Signing** when prompted (recommended).

## Store listing (copy/paste)

See:

- `listing/title.txt`
- `listing/short-description.txt`
- `listing/full-description.txt`
- `listing/categories.txt`

## Graphics

| Asset | Spec | File |
|-------|------|------|
| App icon | 512 × 512 PNG, 32-bit | `graphics/icon-512.png` |
| Feature graphic | 1024 × 500 JPG/PNG | `graphics/feature-graphic-1024x500.png` |
| Phone screenshots | min 2, 16:9 or 9:16 | Capture from device → `graphics/screenshots/` |

## Privacy policy (required)

Hosted file in repo: `website/privacy.html`  

Publish it (GitHub Pages, Firebase, your domain) and set the public URL in Play Console → **App content → Privacy policy**.

Suggested path once hosted: `https://YOUR-DOMAIN/privacy.html`

## Data safety / content

- Tickets stay **on-device** (AsyncStorage). No cloud wallet sync.
- Google Sign-In for account.
- Location for live train speed / bus distance.
- Camera for ticket scan / photos.
- Fill Play **Data safety** form using `listing/data-safety-notes.md`.

## Build again later

```powershell
cd android
.\gradlew.bat bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Copy to `dist/playstore/` and bump `versionCode` in `android/app/build.gradle` + `app.json` before each Play upload.
