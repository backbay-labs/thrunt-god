# THRUNT Surfaces — Elastic Kibana Plugin

Minimal Kibana plugin shell for the THRUNT threat hunting operator surface. This is a scaffold, not a production-ready plugin.

## Important: Kibana version coupling

Kibana plugins must match the exact Kibana version they target. The `kibanaVersion` field in `kibana.json` is set to `8.x` as a placeholder. For a real deployment, this must be pinned to the exact version (e.g., `8.12.0`) and the plugin must be built against that version's plugin API.

## What it does

The plugin registers a side navigation entry in Kibana called "THRUNT Surfaces". Clicking it renders a minimal panel that fetches and displays hunt case data from the local THRUNT surface bridge at `http://127.0.0.1:7483`.

The case view shows:

- Hunt case title and status
- Phase progress
- Hypotheses with status
- Recent queries with event counts

## Prerequisites

- Kibana 8.x
- The THRUNT surface bridge running locally (`bun run dev:bridge` from the surfaces workspace)

## Development

Kibana plugin development requires a local Kibana source checkout and building within Kibana's plugin framework:

```bash
# Clone Kibana and place this plugin in the plugins directory
cp -r elastic-kibana-plugin /path/to/kibana/plugins/thrunt_surfaces/

# Run Kibana in development mode
cd /path/to/kibana
yarn kbn bootstrap
yarn start
```

## Browser extension as alternative

The THRUNT browser extension's Elastic/Kibana adapter provides more immediate value than this native plugin. The extension works across Kibana versions without version coupling, injects a side panel overlay, and supports the same case view and evidence capture workflows. For most deployments, the browser extension is the recommended approach.

## Limitations

- No saved object integration — hunt cases are not stored as Kibana saved objects
- No alerting integration — Elastic alerts are not automatically promoted to hunt cases
- No Lens or Dashboard embedding — the case view is standalone HTML, not a Kibana visualization
- No server-side component — all data comes from the client-side bridge connection

## Future

- Kibana app with saved object integration for persisting hunt case references
- Security alert correlation panel that maps Elastic Security alerts to active hypotheses
- Lens custom visualization for rendering hunt progress and evidence graphs
- Server-side plugin component for bridge communication without browser CORS constraints
