# Obsidian Release Flow

Use the root maintainer command to produce the release-ready Obsidian bundle:

```bash
npm run bundle:obsidian-release
```

That command does three things:

1. Verifies version alignment across:
   - `package.json`
   - `apps/obsidian/package.json`
   - `apps/obsidian/manifest.json`
   - `apps/obsidian/versions.json`
2. Builds the plugin through the root `build:obsidian` script.
3. Copies the release assets into `dist/obsidian-release/`.

The expected GitHub release assets are:

- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`

The CI release path lives in `.github/workflows/release.yml` and mirrors the local flow:

- installs Obsidian dependencies with `npm --prefix apps/obsidian ci`
- runs `npm run bundle:obsidian-release`
- uploads the four Obsidian assets to the GitHub release alongside the existing npm and VSIX artifacts

If the root package version, Obsidian package version, manifest version, or `versions.json` mapping drift apart, the local bundle command and the release workflow both fail before publishing.
