# Requirements: THRUNT GOD Obsidian Distribution

**Defined:** 2026-04-11
**Core Value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.

## v3.3 Requirements

Requirements for v3.3 Zero-Friction Distribution. Each maps to exactly one roadmap phase.

### CLI Install

- [x] **INST-01**: User can run `npx thrunt-god@latest --obsidian` on macOS to install or update the Obsidian plugin without manual symlink steps
- [x] **INST-02**: Installer stages a production plugin bundle (`main.js`, `manifest.json`, `styles.css`) under `~/.thrunt/obsidian/` before touching any vault
- [x] **INST-03**: Installer detects Obsidian vaults from `~/Library/Application Support/obsidian/obsidian.json` and installs THRUNT God into each detected vault's `.obsidian/plugins/thrunt-god/` directory
- [x] **INST-04**: Re-running `--obsidian` refreshes the staged build and repairs broken or stale symlinks without duplicating plugin directories
- [x] **INST-05**: Installer reports per-vault success or failure and prints explicit next-step guidance to restart Obsidian and enable THRUNT God in Community Plugins
- [x] **INST-06**: If no vaults or Obsidian metadata are found, installer exits without partial writes and explains the manual install fallback

### Release Pipeline

- [x] **RELEASE-01**: Maintainer can produce the same production Obsidian bundle locally via repo scripts without hand-copying files from `apps/obsidian/`
- [x] **RELEASE-02**: Tag-based GitHub releases build the Obsidian plugin and fail if Obsidian package or manifest versions drift from the root release version
- [x] **RELEASE-03**: GitHub releases upload `main.js`, `manifest.json`, `styles.css`, and `versions.json` alongside existing npm and VSIX artifacts
- [x] **RELEASE-04**: CLI installer and GitHub release automation use the same canonical asset contract so both channels ship identical plugin contents

### Community Directory

- [ ] **COMM-01**: Plugin package meets baseline Obsidian community review expectations: safe DOM usage, proper event cleanup, theme-safe styling, and mobile-safe manifest metadata
- [ ] **COMM-02**: Obsidian-first users can understand install and use value from a public README with screenshots and community-plugin-oriented setup guidance
- [ ] **COMM-03**: Repository keeps `versions.json` and release metadata in sync through a documented release flow for each plugin version
- [ ] **COMM-04**: Repository contains the metadata, checklist, and submission notes needed to open and maintain an `obsidianmd/obsidian-releases` entry for THRUNT God

## Future Requirements

Deferred beyond v3.3. Tracked but not in the current roadmap.

### Cross-Platform Install

- **XPLAT-01**: Windows and Linux Obsidian vault auto-discovery
- **XPLAT-02**: Explicit installer flags to target only selected vaults or nonstandard Obsidian metadata locations

### Community Growth

- **GROW-01**: Automated screenshot or GIF generation for plugin releases
- **GROW-02**: CI validation against the live Obsidian community plugin schema before submission

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-enabling the plugin inside Obsidian | Trust boundary should stay inside Obsidian's own plugin approval flow |
| Windows/Linux vault autodiscovery in v3.3 | macOS path is the proven fast path; expand after the install contract is stable |
| New Obsidian workspace features unrelated to distribution | v3.3 is about installation and release channels, not widening product scope |
| Waiting for community-directory merge approval to call the milestone complete | External review timing is not under repo control; the milestone focuses on a submission-ready package and flow |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INST-01 | Phase 65 | Complete |
| INST-02 | Phase 65 | Complete |
| INST-03 | Phase 65 | Complete |
| INST-04 | Phase 65 | Complete |
| INST-05 | Phase 65 | Complete |
| INST-06 | Phase 65 | Complete |
| RELEASE-01 | Phase 66 | Complete |
| RELEASE-02 | Phase 66 | Complete |
| RELEASE-03 | Phase 66 | Complete |
| RELEASE-04 | Phase 66 | Complete |
| COMM-01 | Phase 67 | Pending |
| COMM-02 | Phase 67 | Pending |
| COMM-03 | Phase 67 | Pending |
| COMM-04 | Phase 67 | Pending |

**Coverage:**
- v3.3 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after roadmap creation*
