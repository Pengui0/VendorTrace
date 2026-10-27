# VendorTrace — Full Project Handoff

**Package type:** Complete project archive, including original dependency and build folders  
**Source basis:** User-provided `vendortrace (2).zip` plus the reviewed source updates already prepared for VendorTrace  
**Important:** Read this file and `QA_EXECUTION_REPORT.md` before using the project with real vendor data.

## 1. Line-of-code count

Counts are for first-party application source and tests. They exclude `node_modules/`, generated `dist/`, lockfiles, docs, and binary assets.

| Category | Files | Physical lines (includes blank/comment lines) | Non-empty lines |
|---|---:|---:|---:|
| Production source (`src/` excluding tests + root `server.ts`) | 70 | 19,471 | 17,926 |
| Test code and test runners (`src/server/tests/`) | 26 | 3,645 | 3,258 |
| **Production + tests** | **96** | **23,116** | **21,184** |

This is a reproducible physical-line count, not a language-aware count that removes comments. Dependencies under `node_modules` are not counted as VendorTrace-authored code.

## 2. Evaluation verdict

**Current verdict: local demo candidate, not production-cleared.**

The included `QA_EXECUTION_REPORT.md` records the last completed QA run as **362 assertions passed, 0 failed across 14 suites**, with TypeScript validation passing. Those results were recorded before this full-file repackaging. They were not independently rerun in the current packaging pass because the uploaded `node_modules` contains platform-specific binaries that are not usable in this Linux review environment.

Production build, browser-based end-to-end checks, and real TinyFish/IndiaCos calls have not been verified in this packaging pass. Run the commands below on your Windows development machine before relying on the prior counts.

### Known limitations to address before production

- Repository storage is in-memory; records may reset when the Node process restarts.
- Automated daily/weekly/monthly monitoring is not enabled; investigation re-runs are manual.
- TinyFish and IndiaCos live calls require valid server-side keys and a successful live test.
- Authentication is disabled by default. Do not expose the app publicly with real data until authentication, authorization, rate limits, and tenant isolation are implemented and verified.
- The included `dist/` folder is preserved from the original ZIP and was not rebuilt after source updates. Regenerate it with `npm run build`.

## 3. How to run on Windows

1. Extract `VendorTrace_Full_Updated_Project.zip` to a writable folder.
2. Open PowerShell in the extracted `vendortrace` directory (the folder containing `package.json`).
3. Confirm Node.js and npm are installed:

```powershell
node --version
npm --version
```

4. Refresh the platform-specific dependencies from the lockfile. This replaces the existing `node_modules` directory on your machine with a clean install, so it is expected and does not mean the archive omitted files:

```powershell
npm ci
```

5. Create your local environment file if you need to configure provider keys:

```powershell
Copy-Item .env.example .env
```

6. Run the checks and start the application:

```powershell
npm run lint
npm test
npm run build
npm run dev
```

7. Open `http://localhost:3000`.

If `npm ci` fails, record the exact Node/npm version and error output. Do not delete `package-lock.json` to work around the failure.

## 4. How to verify the application

### A. Baseline and demo mode

- Confirm the prominent banner clearly says that the demo uses synthetic data.
- Run the Acme Horizon synthetic walkthrough.
- Confirm every synthetic evidence URL points to a reserved `.invalid` domain and each report/export keeps the synthetic-data disclaimer.
- Confirm unknown identifiers do not silently resolve to a different known company.
- Confirm that source unavailability or missing findings is not described as proof of zero risk.
- Confirm the first demo report shows partial coverage when adverse-media coverage is absent.
- Re-run the synthetic scenario. The second run should add a distinct disposed-arbitration fixture while retaining the contested recovery case and the single-source grievance for review.
- Confirm corroborated claims have two or more distinct source domains; single-source findings require human review; related companies remain `UNKNOWN` until independently scanned.

### B. Consistency across UI

- Compare dashboard tracked-vendor count with the Vendors directory and the unique vendor IDs in investigation history.
- Create, reopen, and re-run an investigation; check list entries, report IDs, evidence counts, and filters.
- Confirm a queued, failed, or unavailable required dimension prevents a false “complete coverage” label.
- Confirm mock connection tests do not overwrite a provider's real live-probe status.
- Confirm the Live Mode screen never silently falls back to synthetic evidence after a failed/missing live call.

### C. Provider setup and live mode

- In Settings, confirm missing keys show **Not Configured**, not **Connected**.
- Set provider keys only in `.env` for local testing or a trusted server-side secret manager for deployment.
- Restart the server after changing environment variables.
- Run each provider connection test and one bounded lookup; record the actual provider response/request ID and timestamp, without copying any key into the report.
- Verify failures (401/403, 429, timeout, 5xx, malformed response) are displayed as unavailable/failed and are not treated as clean results.
- Verify TinyFish and IndiaCos responses retain source URLs, snippets, timestamps, and identity-match context.

### D. Reports, exports, graph, and monitoring

- Open evidence details and verify source domains, snippets, captured timestamps, provenance, confidence labels, and human-review instructions.
- Confirm entity graph edges state whether they represent a linked registry ID, a verified director DIN, a shared registered address, or an unverified candidate.
- Confirm relationship alone never labels a related company fraudulent or clean.
- Export a PDF and CSV. Open both and confirm the export matches the report, preserves disclaimers and evidence IDs, and does not contain formula-injection payloads.
- Compare two runs and verify `NEW`, `CHANGED`, and `RESOLVED` labels reflect a real set comparison rather than merely a changed hash.
- Confirm Monitoring explicitly states manual-only operation while scheduling infrastructure is disabled.

### E. Security and release gate

- Search the client build and browser network/storage for API keys; none should be present.
- Confirm `.env` is not committed and do not include it in any shared ZIP.
- Confirm payload limits, URL allowlists/SSRF protections, timeouts, bounded retries, and rate limits behave as expected.
- Keep Cloud Run private until authentication and access-control review is complete.
- Require `npm run lint`, `npm test`, `npm run build`, and a manual browser smoke test to pass on the target Windows environment before claiming a release is verified.

## 5. Personal and project information to add

No personal identity information is required to run the synthetic demo.

### Required only for live integrations

- `TINYFISH_API_KEY`: your own TinyFish API key, added locally or in a server-side secret manager.
- `INDIACOS_API_KEY`: your own IndiaCos API key, added locally or in a server-side secret manager.
- `GEMINI_API_KEY`: optional for the summary/synthesis path described in the README.

Do not send these keys in chat, put them in frontend code, commit them to Git, or include them in a public ZIP. The sample `.env.example` is safe to share because its values are blank.

### Optional product branding

- Organization/workspace display name.
- Company logo and brand colors.
- Work contact email and support/privacy contact for a future authenticated product.
- Deployment URL after deployment is secured.

Do not add Aadhaar numbers, personal PAN details, personal bank data, passwords, OTPs, home addresses, or other unnecessary sensitive personal information. For real due diligence, use only company identifiers and source data that you are authorized to process, and do not use synthetic demo claims to make real procurement decisions.

## 6. Summary

This full-file package retains the original project files and overlays the reviewed fixes, two added regression suites, and updated QA/documentation files. It intentionally includes the original `node_modules/` and `dist/` directories because the user requested every file; those folders may be platform-specific or stale. Use `npm ci` and `npm run build` locally to regenerate environment-specific dependencies and production assets. The app is a strong local-demo candidate, but live providers, persistent storage, authentication, scheduling, production build, and UI end-to-end behavior still need verification before production use.
