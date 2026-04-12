# Surfaces Architecture — Assumptions

All assumptions made during scaffolding instead of asking clarifying questions.

## Runtime Integration

1. **File-based artifact model is the source of truth.** The surface bridge reads `.planning/` artifacts (STATE.md, HUNTMAP.md, MISSION.md, QUERIES/, RECEIPTS/, FINDINGS.md) by parsing markdown frontmatter and section text, exactly as the VS Code extension and TUI already do.

2. **No database duplication.** The bridge does not maintain its own database of hunt state. It reads `.planning/` on demand and caches projections in memory with file-watcher invalidation.

3. **thrunt-tools.cjs is the execution layer.** For operations that mutate state (run pack, advance phase, attach evidence), the bridge shells out to `thrunt-tools.cjs` subcommands with `--raw` JSON output, matching the pattern used by `apps/terminal/src/thrunt-bridge/`.

4. **Connector SDK types are the canonical contracts.** QuerySpec (v1.0), ResultEnvelope (v1.0), ConnectorCapabilities, AuthProfile, and the dataset/pagination/execution normalization functions from `connector-sdk.cjs` are the ground truth. Surfaces contracts re-express these as TypeScript interfaces but do not diverge.

## Package Architecture

5. **Bun workspaces for new TS packages.** The TUI (`apps/terminal`) already uses Bun with ESM modules and `bun test`. New surfaces packages follow the same convention: ESM, Bun-native, TypeScript strict mode, `allowImportingTsExtensions`.

6. **No root workspace modification.** The root `package.json` is the published npm package for thrunt-god. The surfaces workspace is self-contained under `surfaces/` with its own `package.json` workspace root, avoiding any risk of breaking the published package.

7. **Shared types via workspace imports.** Packages reference each other via `workspace:*` protocol (e.g., `@thrunt-surfaces/contracts`). No `file:` paths.

8. **Biome for linting/formatting.** Consistent with the root repo's biome.json conventions: 2-space indentation, single quotes, ES5 trailing commas.

## Browser Extension

9. **Manifest V3 Chrome extension.** MV3 is the current standard. Firefox MV3 compatibility is a follow-up concern, not a blocker.

10. **Side panel as primary UI.** The extension uses Chrome's Side Panel API for the case sidebar rather than a popup, since hunt context needs persistent screen space.

11. **Content scripts per-adapter.** Each vendor console gets a content script that uses the site-adapter interface to extract page context (current query, selected entities, table data). The content script framework is shared; the DOM selectors and extraction logic are per-adapter.

12. **Bridge communication via localhost HTTP + WebSocket.** The extension talks to the surface bridge over `http://localhost:7483` (default port). No cloud relay. This means the bridge must be running locally for the extension to function.

13. **Mock mode for extension development.** When the bridge is unavailable, the extension falls back to mock data from `surfaces-mocks` for UI development and testing.

## Vendor Integration Strategy

14. **Splunk app shell is realistic.** Splunk's app framework (app.conf, default/data/ui/) is well-documented and a real `.tar.gz` app can be installed. The scaffold includes a minimal app structure.

15. **Elastic/Kibana plugin shell is realistic but version-coupled.** Kibana plugins require matching the exact Kibana version. The scaffold provides a plugin skeleton but documents the tight coupling.

16. **Sentinel has no clean plugin model.** Azure Sentinel's extensibility is through Workbooks, Playbooks (Logic Apps), and Data Connectors — not traditional plugins. The companion package provides ARM templates and workbook JSON skeletons.

17. **Okta, M365 Defender, CrowdStrike, AWS, GCP are companion-only.** These platforms do not expose a general-purpose plugin/app framework. The browser extension's site adapters are the primary integration surface. Companion packages provide SDK wrappers, API helpers, and documentation for future deeper integration.

18. **CrowdStrike Falcon has a Marketplace app model** but requires partner enrollment. The scaffold is a companion package, not a Falcon app.

19. **AWS and GCP console integrations are browser-extension-driven.** Neither cloud console has a plugin model. The companion packages provide CloudTrail/Cloud Logging API helpers and the browser extension provides the in-console UI overlay.

## Case Model

20. **One shared case projection.** The case model is derived from MISSION.md (case identity), STATE.md (phase/progress), HUNTMAP.md (phase definitions), and aggregated QUERIES/RECEIPTS/FINDINGS. All surfaces render the same projection.

21. **Case ID is the `.planning/` directory identity.** There is no separate case ID system. The case is identified by its workspace path and the `MISSION.md` frontmatter fields.

## Auth & Security

22. **Bridge auth is local-only and token-scoped.** The bridge binds to localhost only and now issues session tokens through a local handshake for both HTTP and WebSocket access. This remains a single-operator local trust model, not a network-facing auth system.

23. **Browser extension uses no vendor credentials.** The extension reads page content from the DOM of already-authenticated vendor sessions. It does not store or proxy vendor API credentials.

24. **Connector credentials remain in `.planning/config.json` secret_refs.** The bridge resolves secrets via the existing `resolveSecretRefs()` mechanism (env vars, files, commands). No new credential storage.

## Development & Testing

25. **Phase-three validation includes real browser fixtures and mutation-path tests.** Smoke coverage still exists, but Okta, Sentinel, AWS extraction and bridge mutation flows are now regression-tested end-to-end against local fixtures and fresh temp workspaces.

26. **No Moon integration for surfaces.** The root repo uses Moon for the main workspace. The surfaces workspace uses Bun's native workspace support to stay self-contained.

27. **Port 7483 for the surface bridge.** Chosen to avoid conflicts with common dev ports (3000-3010, 5173, 8080). Configurable via `THRUNT_BRIDGE_PORT` env var.
