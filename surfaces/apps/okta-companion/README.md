# @thrunt-surfaces/okta-companion

Companion integration for Okta that provides API query helpers for the System Log and entity enrichment within THRUNT hunt workflows.

## What This Does

- **System Log Query Builder** — Translates hunt parameters (actor, target, event types, time window) into QuerySpec-compatible queries for the Okta System Log API (`/api/v1/logs`). These can be executed by THRUNT connectors to pull authentication and authorization events.
- **Entity Enrichment** — Stub enrichment for Okta entities (users, groups, apps). In production, this resolves entity details via the Okta Management API.

## How Okta Extensibility Works

Okta does **not** have a plugin or app framework for the admin console. There is no way to embed custom UI, add sidebar panels, or inject functionality into the Okta admin dashboard.

Integration with Okta is achieved through:

1. **Management API** — RESTful API for users, groups, apps, system logs, and policy management.
2. **System Log API** — Event stream of all authentication and admin actions.
3. **Event Hooks** — Webhooks triggered by specific Okta events (limited set of event types).
4. **Inline Hooks** — Synchronous callouts during authentication flows (registration, token enrichment).

For threat hunting, the System Log API is the primary data source. This companion focuses on making it easy to build structured queries against it.

## Limitations

- Entity enrichment is currently a stub. It returns suggested API endpoints but does not make live API calls. An Okta API token must be configured in the connector profile to enable live enrichment.
- The System Log API has rate limits (typically 120 requests/minute for the `/api/v1/logs` endpoint). The query builder sets conservative pagination defaults.
- Okta's filter expression language is limited compared to full query languages. Complex conditions may require multiple API calls.
- Event Hook coverage is incomplete — not all event types are available as hook triggers.

## Integration Architecture

```
Okta Admin Console
  └── Browser Extension Okta Adapter (primary in-console surface)
        └── surface-bridge API (localhost:7483)
              └── THRUNT case state (.planning/)

Okta API (server-side)
  ├── System Log API → okta-companion query builder → THRUNT connector
  ├── Users/Groups/Apps API → okta-companion entity enrichment
  └── Event Hooks → future: webhook receiver → bridge API
```

The **browser extension's Okta adapter** is the primary integration surface for analysts working in the Okta admin console. This companion provides the API query helpers that the connector uses server-side.

## Future Path

- **Live entity enrichment** — Connect to the Okta Management API to resolve user profiles, group memberships, app assignments, and factor enrollment.
- **Event Hook receiver** — Accept Okta Event Hooks to trigger THRUNT case updates in real-time (e.g., suspicious authentication events opening new cases).
- **Behavioral analytics correlation** — Cross-reference Okta authentication patterns with THRUNT hunt hypotheses.
- **Policy analysis** — Query Okta policies to assess whether observed behavior violates configured security policies.

## Usage

```typescript
import { OktaCompanion } from '@thrunt-surfaces/okta-companion';

const companion = new OktaCompanion();

// Build a System Log query for failed login attempts
const query = companion.buildSystemLogQuery({
  eventTypes: ['user.session.start'],
  actorId: 'suspect-user-id',
  since: '2025-01-01T00:00:00Z',
  limit: 50,
});

// Enrich a user entity
const enrichment = companion.enrichEntity('user', 'john.doe@example.com');
```
