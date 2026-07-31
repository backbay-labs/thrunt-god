# THRUNT Surfaces — Splunk App

Minimal Splunk app shell for the THRUNT threat hunting operator surface. This app provides a dashboard within Splunk that displays active hunt case state by reading from the local THRUNT surface bridge.

## Installation

### Copy to Splunk apps directory

```bash
cp -r splunk-app $SPLUNK_HOME/etc/apps/thrunt_surfaces/
```

Then restart Splunk or use the CLI:

```bash
$SPLUNK_HOME/bin/splunk restart
```

### Package and install via Splunk UI

```bash
tar czf thrunt-surfaces.tar.gz -C .. splunk-app
```

Then in Splunk Web: **Apps > Manage Apps > Install app from file** and upload the `.tar.gz`.

## How it works

The app reads from the local THRUNT surface bridge running at `http://127.0.0.1:7483`. The bridge serves case state over a simple REST API, and the app's dashboard panels render that data.

Dashboard panels:

- **Case Status** — active hunt case title, status, phase progress, and last activity timestamp
- **Recent Queries** — queries executed during the hunt with connector, event count, and timing
- **Hypotheses** — hunt hypotheses with color-coded status (Supported, Disproved, Inconclusive, Open)
- **Search Handoff** — instructions for clipping Splunk search results into the active THRUNT case

## Prerequisites

- Splunk Enterprise or Splunk Cloud
- The THRUNT surface bridge running locally (`bun run dev:bridge` from the surfaces workspace)

## Search handoff

Clipping search results from Splunk into a THRUNT case requires the THRUNT browser extension. The extension injects a "Clip to THRUNT" action into Splunk's search results UI, which sends selected events to the surface bridge for attachment to the active case.

## Limitations

- No native Splunk search integration — the app does not execute SPL queries itself
- No custom search commands — QuerySpec execution is not wired to Splunk's search pipeline
- No modular inputs — the app does not ingest data from the bridge into Splunk indexes
- Dashboard panels use simple HTML; no Splunk visualization framework integration

## Future

- Custom search commands for executing THRUNT QuerySpec queries from the Splunk search bar
- Modular input for streaming bridge events into a Splunk index
- Splunk visualization framework panels with proper drill-down support
- Alert action for promoting Splunk alerts to THRUNT hunt cases
