# Quick rebuild of the Play Store AAB (Windows)
$ErrorActionPreference = "Stop"
$env:ANDROID_HOME = "C:\Users\dhira\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
$env:Path = @("C:\Windows\System32","C:\Windows","C:\Program Files\nodejs","$env:JAVA_HOME\bin","$env:ANDROID_HOME\platform-tools") -join ";"

$root = Split-Path $PSScriptRoot -Parent
if (Test-Path "$root\.env") {
  $env:EXPO_PUBLIC_GEMINI_API_KEY = ((Get-Content "$root\.env" | Where-Object { $_ -match '^EXPO_PUBLIC_GEMINI_API_KEY=' }) -replace '^EXPO_PUBLIC_GEMINI_API_KEY=','')
}
$env:EXPO_PUBLIC_GEMINI_MODEL = "gemini-flash-latest"

if (!(Test-Path "$root\android\keystore.properties")) {
  throw "Missing android/keystore.properties — restore upload key before building."
}

Set-Location "$root\android"
.\gradlew.bat bundleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "bundleRelease failed" }

$out = "$root\dist\playstore"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$aab = Get-ChildItem "$root\android\app\build\outputs\bundle\release\*.aab" | Select-Object -First 1
$vc = (Select-String -Path "$root\android\app\build.gradle" -Pattern 'versionCode\s+(\d+)').Matches.Groups[1].Value
$vn = (Select-String -Path "$root\android\app\build.gradle" -Pattern 'versionName\s+"([^"]+)"').Matches.Groups[1].Value
$dest = Join-Path $out "TravelID-$vn-$vc.aab"
Copy-Item $aab.FullName $dest -Force
Copy-Item $aab.FullName (Join-Path $out "TravelID-release.aab") -Force
Write-Host "AAB ready: $dest"
Get-Item $dest | Format-List FullName, Length, LastWriteTime
