# Fix Google Sign-In SHA-1 mismatch

Current release / sideload APKs are signed with the **upload keystore**, not the debug key.
Firebase currently only has the **debug** SHA-1 → Google returns developer error / SHA-1 mismatch.

## Add this fingerprint (required)

**Package:** `com.travelid.app`  
**Project:** `travel-id-9c25c`

### Release (upload) keystore — add this now

```
SHA-1:   F1:A9:8D:AD:F2:A2:14:AE:93:F2:C9:68:BB:08:2A:81:69:F1:16:9E
SHA-256: 81:44:96:5E:C9:64:D2:04:D3:6D:14:B1:D3:ED:69:B9:7B:7F:B4:B0:F6:1E:EA:6F:D9:3B:A7:1C:57:D0:82:EE
```

### Debug keystore (keep for local debug builds)

```
SHA-1:   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

## Steps

1. Open [Firebase Console](https://console.firebase.google.com/project/travel-id-9c25c/settings/general) → **Project settings**
2. Under **Your apps** → Android `com.travelid.app`
3. **Add fingerprint** → paste the **Release SHA-1** above → Save
4. (Optional) Add SHA-256 too
5. Download the updated `google-services.json` and replace the project root file
6. Wait 1–5 minutes, then try Google Sign-In again (no APK rebuild required for SHA add alone)

## After Play Store App Signing

When the app is on Play, also add the **App signing key certificate** SHA-1 from:

Play Console → Travel ID → Setup → App signing

That SHA is different from the upload key and is required for Play-installed builds.
