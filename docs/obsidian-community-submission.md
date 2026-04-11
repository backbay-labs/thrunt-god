# Obsidian Community Submission Flow

Use this flow whenever a new THRUNT God Obsidian plugin version is being prepared for release and directory maintenance.

## 1. Synchronize submission metadata

```bash
npm run sync:obsidian-submission
```

This copies `apps/obsidian/manifest.json` and `apps/obsidian/versions.json` into the repository root so the community-plugin directory can read the same metadata that the package actually ships.

Required repo-root files before submission or update:

- `README.md`
- `LICENSE`
- `manifest.json`
- `versions.json`

## 2. Build the release bundle

```bash
npm run bundle:obsidian-release
```

That command must produce these GitHub release assets:

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json`

The release tag must exactly match the version inside `manifest.json`.

## 3. Verify the community-plugin entry metadata

The ready-to-paste PR object lives in:

- `docs/obsidian-community-plugin-entry.json`

It should match the current plugin metadata and repository location.

## 4. Open or update the `obsidianmd/obsidian-releases` PR

Checklist:

1. Confirm root `README.md`, `manifest.json`, and `versions.json` are committed and current.
2. Confirm the GitHub release contains `manifest.json`, `main.js`, `styles.css`, and `versions.json`.
3. Confirm the release tag matches the plugin version.
4. Add or update the `community-plugins.json` entry using `docs/obsidian-community-plugin-entry.json`.
5. In the PR description, note that the repo-root metadata was synchronized with `npm run sync:obsidian-submission` and the release artifacts were generated via `npm run bundle:obsidian-release`.

## 5. After merge

- Smoke-test installation from the community directory entry in Obsidian.
- Keep `README.md` and the release notes aligned with the current plugin capabilities and install guidance.
