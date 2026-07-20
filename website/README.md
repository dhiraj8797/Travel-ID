# Travel ID website

Static marketing site for the Travel ID Android app.

## Preview locally

```powershell
cd website
npx --yes serve .
```

Then open the URL shown (usually http://localhost:3000).

## Pages

- `index.html` — landing
- `privacy.html` / `terms.html` / `data-privacy.html` — legal (store listing)

## Download

APK is served from `downloads/TravelID-release.apk`. After each release:

```powershell
Copy-Item -Force dist\TravelID-release.apk website\downloads\TravelID-release.apk
```
