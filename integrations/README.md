# Integrations - Credentials Setup

## Benötigte Dateien

Die echten Credential-Dateien sind NICHT im Repo (aus Sicherheitsgründen).
Du musst sie selbst erstellen:

### 1. Sipgate Credentials
```bash
cp creds.txt.example creds.txt
# Dann creds.txt bearbeiten und Werte eintragen
```

### 2. Vonage Credentials
```bash
cp vonage-creds.txt.example vonage-creds.txt
cp vonage.txt.example vonage.txt
# Dann beide Dateien bearbeiten
```

## Wo bekommst du die Credentials?

| Service | Dashboard URL |
|---------|---------------|
| Sipgate | https://app.sipgate.com/w0/personal-access-token |
| Vonage  | https://dashboard.nexmo.com/ |

## Datei-Übersicht

| Datei | Zweck |
|-------|-------|
| `creds.txt` | Sipgate API Key/Secret/Number |
| `vonage-creds.txt` | Vonage API Credentials |
| `vonage.txt` | Vonage Config (alternativer Speicherort) |
