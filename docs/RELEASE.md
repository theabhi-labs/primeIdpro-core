# PRIME ID PRO — RELEASE & CODE SIGNING GUIDE

## 1. Release Flow

```text
Developer / CI
     ↓
Run Automated Tests (npm run test:modules)
     ↓
Build Frontend & Backend Assets
     ↓
Digital Code Signing (Authenticode)
     ↓
Package NSIS Installer & latest.yml
     ↓
Verify Checksums & Signatures
     ↓
Publish to Update Server / GitHub Releases
     ↓
Stable Channel End-Users
```

---

## 2. Windows Code Signing (Authenticode)

### 2.1 Environment Variables
Set the following secrets in CI (e.g. GitHub Actions / Azure DevOps) or in your local signing environment:

```powershell
# For PFX Certificate file
$env:WIN_CSC_LINK = "path/to/certificate.pfx"
$env:WIN_CSC_KEY_PASSWORD = "YourCertificatePassword"

# Or Azure Trusted Signing / Hardware Token
$env:AZURE_KEY_VAULT_URI = "https://..."
```

### 2.2 Electron Builder Configuration
The `electron/package.json` build section contains:
```json
"win": {
  "target": [
    {
      "target": "nsis",
      "arch": ["x64"]
    }
  ],
  "icon": "assets/icon.ico",
  "publisherName": "Prime ID Pro"
}
```

When `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are provided, `electron-builder` automatically signs both `PrimeIdPro.exe` and the NSIS setup installer.

---

## 3. Release Metadata (`latest.yml`)

The auto-update server publishes `latest.yml`:
```yaml
version: 1.0.0
files:
  - url: PrimeIdPro-Setup-1.0.0.exe
    sha512: <SHA512_CHECKSUM>
    size: 85293840
path: PrimeIdPro-Setup-1.0.0.exe
sha512: <SHA512_CHECKSUM>
releaseDate: '2026-08-31T04:00:00.000Z'
minimumSupportedVersion: 1.0.0
mandatory: false
releaseNotes: "Production release with offline job engine and device binding."
```

---

## 4. Release Checklist
1. Verify semantic version in `electron/package.json` and `backend/app/core/config.py`.
2. Run `npm run test:modules` and confirm 100% tests pass.
3. Build frontend (`npm run build`) and backend.
4. Execute `npm run dist` with valid code signing credentials.
5. Verify digital signature:
   ```powershell
   Get-AuthenticodeSignature release\PrimeIdPro-Setup-1.0.0.exe
   ```
6. Upload installer, blockmap, and `latest.yml` to the update endpoint.
