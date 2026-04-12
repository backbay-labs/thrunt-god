# Surfaces Roadmap — From Scaffold to Production

## Recommended Production Sequence

### Phase 1: Bridge + Extension (Highest Value)

**Take first**: The surface bridge and browser extension.

These two components deliver immediate operator value across every supported platform without requiring vendor-specific plugin approval, version coupling, or marketplace enrollment.

**Production work needed:**
- File watcher for real-time `.planning/` change detection in the bridge
- Wire bridge mutation operations to `thrunt-tools.cjs` subprocess calls
- Harden artifact parsing (hypothesis extraction, findings extraction)
- Browser extension build pipeline (production minification, source maps)
- Chrome Web Store submission
- Firefox MV3 port

### Phase 2: Splunk App (Most Realistic Native)

**Take second**: Splunk has the most accessible app framework.

**Production work needed:**
- Custom search commands wrapping `thrunt-tools.cjs` runtime execute
- Modular input for streaming bridge events into Splunk indexes
- Alert action for "Open THRUNT case from alert"
- Splunkbase packaging and submission

### Phase 3: Sentinel Companion (Largest Enterprise Audience)

**Take third**: Sentinel/Azure is the dominant enterprise SIEM.

**Production work needed:**
- Azure Function app bridging Sentinel incidents to THRUNT cases
- ARM templates for full deployment (Function App + Workbook + Logic App)
- Custom Data Connector for THRUNT receipts → Sentinel workspace
- Sentinel Playbook (Logic App) for automated hunt triggers

### Phase 4: Elastic/Kibana Plugin

**Take fourth**: Only after the extension provides enough standalone value.

**Production work needed:**
- Match specific Kibana version target
- Saved object integration for persistent case state
- Alerting rule integration
- Kibana developer tools panel for QuerySpec execution

### Phase 5: Cloud Console Companions (AWS, GCP)

**Take fifth**: API-level integration for CloudTrail/Cloud Logging.

**Production work needed:**
- CloudTrail Lake integration (direct SQL queries from bridge)
- AWS EventBridge integration for automated signal intake
- GCP Chronicle SIEM integration (if customer uses Chronicle)
- Cloud Function bridges for real-time event forwarding

### Phase 6: Identity & Endpoint Companions (Okta, M365, CrowdStrike)

**Take last**: API helpers become more valuable as the hunt runtime matures.

**Production work needed:**
- Okta Workflows integration for automated hunt triggers
- Microsoft Graph Security API integration for M365 Defender
- CrowdStrike Marketplace app (requires partner enrollment)

## Open Questions

1. Should the bridge support multi-workspace mode (multiple `.planning/` roots)?
2. Should the extension store case state locally for offline viewing?
3. Should companion packages generate detection rules in vendor-native formats?
4. Should the bridge expose a GraphQL API in addition to REST?

## Success Metrics

- **Bridge adoption**: Number of surfaces connecting per session
- **Evidence capture rate**: Clips per hunt phase through the extension
- **Vendor coverage**: Percentage of operator console time with an active THRUNT surface
- **Time to first evidence**: From signal intake to first attached evidence via any surface
