# Play Console — Data safety (guide)

Answer based on current Travel ID behaviour:

## Collected / processed

| Data type | Collected? | Shared? | Purpose | Notes |
|-----------|------------|---------|---------|-------|
| Email / name (Google) | Yes (via Google Sign-In) | With Google only | Account | Session on device |
| Photos / files (tickets) | Yes (user-selected) | No | App functionality | Parsed on device / optional AI extract via your API |
| Location | Yes (approximate/precise when allowed) | Live-status providers may receive train/route context | App functionality | GPS speed / remaining distance |
| App activity | No analytics SDK by default | — | — | |
| Device IDs | Possibly via Google / FCM | Google | Auth / notifications | |

## Security

- Data encrypted in transit (HTTPS) for API / Google / live status.
- Users can delete local wallet (clear data / uninstall).
- You can request account deletion by clearing app data / uninstalling (document in-app).

## Not sold

Data is not sold. Not used for ads personalization in-app today.
