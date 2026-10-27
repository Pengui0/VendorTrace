# VendorTrace QA Execution Report

**Review date:** 25 October 2026  
**Reviewed artifact:** `vendortrace (2).zip` supplied by the user  
**Scope:** Source review, TypeScript validation, scripted backend/provider tests, demo-data integrity, integration-contract behavior, and packaging safety.

## Release decision

**READY FOR LOCAL DEMO / CODE-LEVEL QA PASSED WITH LIMITATIONS. NOT PRODUCTION-CLEARED.**

The server-side TypeScript check passes and all 14 scripted test suites pass. This run did **not** complete a Vite production bundle build, browser-based UI smoke test, or real external-provider transaction. It therefore does not prove every UI interaction or live API integration works in the user's environment.

## Test results

### TypeScript

- Command: `npx tsc --noEmit`
- Result: **PASS**
- Meaning: The TypeScript project type-checks in the available environment.

### Automated suite

- Result: **362 assertions passed, 0 failed, across 14 suites**.
- Discovery orchestration: 28 passed
- Risk finding validation/normalization: 21 passed
- IndiaCos provider resolution: 43 passed
- TinyFish streaming/progress adapter: 21 passed
- Entity tracing/candidate discovery: 27 passed
- Cross-validation/deterministic scoring: 25 passed
- Entity graph/network model: 16 passed
- Monitoring/change-detection diff engine: 27 passed
- PDF/CSV export: 15 passed
- Search/filter workflows: 15 passed
- Security hardening (SSRF, payloads, auth checks): 22 passed
- End-to-end orchestration integration pipeline: 31 passed
- Demo fixture integrity/confidence consistency: 35 passed
- Live provider contract tests with **mocked HTTP responses**: 36 passed

The automated test runner was compiled with TypeScript to a temporary output directory and executed under Node. Provider contract tests use mocked HTTP; they are not live calls to TinyFish or IndiaCos.

### Production bundle

- Command: `npm run build`
- Result: **BLOCKED in this Linux review environment**.
- Observed failure: `sh: 1: vite: Permission denied`.
- Direct invocation of the Vite entrypoint also exposed the absent Linux-specific optional native binding in the uploaded `node_modules`. That directory is platform-specific and is intentionally excluded from the handoff archive. A fresh dependency install is required on the target OS before reassessing the build.
- No successful Vite build or browser-based smoke test is claimed.

## Confirmed fixes made

### Demo mode and truthful status

- Propagated the selected demo/live mode into investigation and re-run requests.
- Distinguished demo simulation controls from live streaming controls.
- Removed misleading synthetic latency and fake “queued/live” statuses where no live task was running.
- Ensured mock connection checks do not overwrite the stored health of a real provider probe.
- Changed “API key present” UI state to “Configured · Untested” until a genuine live probe succeeds.

### Demo/source integrity

- Added a central labeling step that labels offline demo results as synthetic and links sources only to reserved `.invalid` domains.
- Ensured mock evidence cannot be presented as live source research.
- Made confidence/source counts consistent with the fixture evidence.
- Marked the canned walkthrough's coverage as partial when the adverse-media dimension is absent.
- Changed related demo entities to `UNKNOWN` instead of implying they are clean without their own scan.
- Removed inaccurate labels that described synthetic fixture content as a live or official lookup.

### Vendor directory and reporting consistency

- Unified the sources used for vendor listing and dashboard statistics, with de-duplication, so the Vendor Directory and overview count do not intentionally read unrelated demo stores.
- Corrected report-history identity mapping to use vendor identity instead of a synthetic report-ID alias.
- Related entities remain `UNKNOWN` until a separate scan produces supporting evidence.

### IndiaCos provider contract and tracing

- Updated provider handling for documented company, director, GST, court/case, search and office response layouts.
- Added mocked contract tests for director responses, directorship links, address search and evidence provenance.
- Layer 2 now differentiates registry-record director links from name-only matches and unknown linkage.
- Shared registered addresses create candidate leads, not proof of ownership, misconduct or shared control.
- Company lookup mock adapters now return known named fixtures only for exact known fixture identifiers. Unknown identifiers return an explicit `UNKNOWN` placeholder; arbitrary company-name searches no longer silently resolve to Tata Steel.
- Selected demo candidates now display their own selected candidate fields instead of fields inherited from a different fixture.
- Split the registry cache into separate demo and live namespaces so synthetic cached entries cannot satisfy a live-mode lookup.

### Coverage and confidence

- Coverage is calculated over actual reporting dimensions, not merely a count of provider tasks marked complete.
- A queued adverse-media task can no longer coexist with a false complete-coverage label.
- Regression tests cover confidence, evidence-source counts, provider partial failures and unresolved entities.

## Important remaining limitations / release blockers

1. **No live API calls were executed.** No usable TinyFish/IndiaCos credentials were included in the uploaded archive. The IndiaCos key remains unconfigured in the supplied state. Live credentials, provider account permissions, quotas and live response behavior must be checked by the project owner in a secured environment.
2. **Durable storage is not wired/verified.** The current repository adapter is an in-memory adapter and data may reset when the server process restarts. Do not represent this as durable multi-user SaaS storage. A real persistence adapter (for example, correctly configured Firestore or another database) must be implemented and tested before production.
3. **Scheduled monitoring is not enabled.** The UI correctly indicates that checks are run manually. Daily/weekly/monthly preferences do not constitute a working background scheduler.
4. **Authentication is disabled by default in `.env.example`.** Do not expose this service publicly until authentication, authorization, tenant/data isolation, rate limits and production secret handling are configured and tested.
5. **Some government sources are not independent direct integrations.** Current workflow coverage depends on the actual provider contract and availability; do not imply a direct e-Courts, tribunal, GeM or CPP portal integration unless its connection has been implemented and verified.
6. **Browser end-to-end testing was not performed.** Responsive layout, all button paths, browser console errors, and actual generated PDF appearance should be manually smoke-tested on the target Windows environment after installing dependencies.
7. **Production build remains unverified here.** The platform-specific `node_modules` shipped in the input ZIP was not reusable in this Linux environment. The final handoff excludes `node_modules` and generated `dist`; perform a clean install on the target environment.

## Recommended verification on the Windows development machine

Run these commands in the extracted project directory after ensuring the server is stopped and the required Node.js version is installed:

```powershell
# Clean generated / platform-specific dependencies if present
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

# Install from lockfile and run checks
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Then in the browser:

- Test synthetic demo mode and verify the demo banner is visible on reports, source links, exports and entity graph.
- Confirm unknown mock identifiers remain `UNKNOWN` and never resolve to an unrelated real company.
- Confirm the report shows partial coverage if any reporting dimension is queued, failed or unavailable.
- Confirm vendor count/list and investigation history agree after creating, reopening and re-running a vendor.
- Configure provider credentials only through the server-side secrets mechanism, then run each provider's **live** connection test and one bounded test lookup.
- Confirm a mock test does not mark the live provider healthy, and live lookup never falls back to synthetic data when credentials are missing or a call fails.
- Restart the server and confirm/document expected data loss until durable storage is wired.
- Confirm the monitoring page describes manual reruns honestly until a real scheduler exists.

## Security / data hygiene checks applied to handoff

- The supplied archive contained `.env.example` but no `.env`, `.env.local`, or `.env.production` file. No real API credential file was found in the uploaded ZIP.
- The **full-file package** requested by the user preserves all files from the original archive, including `node_modules/`, the original generated `dist/`, `.aistudio/` artifacts, lockfiles, configuration, and source. The source tree overlays the reviewed fixes and adds the two regression suites plus this report. No original path was intentionally removed.
- `node_modules/` is platform-specific and may be stale after source/lockfile changes. It is included for completeness; on the target Windows machine, `npm ci` refreshes dependencies using the lockfile. This replacement happens locally only when the user runs that command.
- The included `dist/` directory is retained from the original upload and was **not rebuilt** after the source modifications. Do not treat it as the current production output; `npm run build` must regenerate it.
- `.env.example` remains as the setup template. Do not put real keys in source files, frontend code, logs, reports, chat prompts, or version control.
- Keep API keys server-side. Authentication is disabled by default, persistent storage is not wired, and scheduled monitoring is not enabled in this build. Do not deploy publicly with real data until those gaps have been implemented and verified.

## Summary

VendorTrace's code-level checks pass after the modifications described above. The strongest improvements are honest demo/live separation, source-backed confidence consistency, cache isolation, safer entity tracing, and coverage accuracy. Treat the result as a stronger **local-demo candidate**, not yet a verified live production service, until clean install/build, UI smoke tests, live API probes and durable-storage/auth work are completed.
