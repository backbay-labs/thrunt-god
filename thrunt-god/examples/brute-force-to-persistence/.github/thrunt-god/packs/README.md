# THRUNT Pack Registry

Built-in THRUNT packs live in `thrunt-god/packs/`. Project-local packs live in `.planning/packs/`.

Registry layout:

- `foundations/` for reusable shared pack fragments that domain and family packs compose
- `techniques/` for ATT&CK-oriented technique packs
- `domains/` for identity, email, cloud, insider-risk, and ransomware pack families
- `families/` for threat-family or campaign packs
- `examples/` for starter reference packs that are real registry entries
- `templates/` for non-registry authoring examples

The starter built-in technique library currently covers:

- `T1059` Command and Scripting Interpreter
- `T1078` Valid Accounts
- `T1098` Account Manipulation
- `T1110` Brute Force
- `T1566` Phishing

The first composed domain packs currently ship:

- `domain.identity-abuse`
- `domain.email-intrusion`
- `domain.insider-risk`
- `domain.cloud-abuse`
- `domain.ransomware-precursors`

The first family-level pack currently ships:

- `family.oauth-phishing-session-hijack`

Resolution rules:

1. THRUNT loads built-in packs first.
2. THRUNT loads `.planning/packs/` second.
3. Local packs override built-in packs when ids collide.
4. Duplicate ids within the same registry source fail closed.

Composition rules:

1. Packs can declare `extends` to compose one or more foundation, technique, domain, or family packs.
2. Parent packs are resolved in order, then the child pack overlays the merged result.
3. Composition fails closed on missing pack ids, cycles, or invalid merged output.

Useful maintainer commands:

- `node thrunt-god/bin/thrunt-tools.cjs pack list`
- `node thrunt-god/bin/thrunt-tools.cjs pack show <pack-id>`
- `node thrunt-god/bin/thrunt-tools.cjs pack bootstrap <pack-id>`
- `node thrunt-god/bin/thrunt-tools.cjs pack validate <pack-id> --param key=value`
- `node thrunt-god/bin/thrunt-tools.cjs pack render-targets <pack-id> --param key=value`
- `node thrunt-god/bin/thrunt-tools.cjs pack lint [<pack-id>]`
- `node thrunt-god/bin/thrunt-tools.cjs pack test [<pack-id>]`
- `node thrunt-god/bin/thrunt-tools.cjs pack init <pack-id> --kind <kind>`

Authoring expectations:

- Every shipped pack should include example parameters in `examples.parameters` so `pack test` can smoke-test bootstrap and execution rendering.
- Use `pack lint` before publishing pack changes.
- Use `pack init` to scaffold new local packs in `.planning/packs/` instead of copying old JSON by hand.

Template files under `templates/` are intentionally excluded from registry discovery.
