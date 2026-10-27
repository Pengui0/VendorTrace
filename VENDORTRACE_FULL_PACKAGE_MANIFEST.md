# VendorTrace Full Package Manifest

This package is intended to preserve the complete user-supplied project while layering in the reviewed updates.

## Included

- Full `src/` tree, updated source files, and original source files not part of the update.
- Full original `node_modules/` directory, including platform-specific native packages and `.bin` launchers.
- Original `dist/` build output (retained, not rebuilt after source changes).
- `.aistudio/` implementation-plan artifacts and metadata.
- `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `server.ts`, `firestore.rules`, `README.md`, and existing docs.
- QA execution report and the complete project handoff.
- New `demoConsistency.test.ts` and `liveProviderContract.test.ts` regression suites.

## Completeness audit

- The original archive had 14,663 file entries.
- All original file paths are present in the merged tree; no original file path was removed intentionally.
- The merged tree includes the reviewed source updates and new QA/report files.
- No `.env`, `.env.local`, or `.env.production` file was present in the supplied archive; `.env.example` is retained.
- The dependency/build folders are intentionally retained to satisfy the request for a full-file handoff. Run `npm ci` and `npm run build` on the target machine before relying on them.

See `VENDORTRACE_PROJECT_HANDOFF.md` for the LOC count, verdict, Windows run commands, verification checklist, and required/optional configuration.
