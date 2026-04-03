# Examples

Realistic hunt artifacts from completed threat hunts, demonstrating thrunt-god's v1.0 capabilities. Each example contains the full `.hunt/` artifact tree as it would appear after a real hunt completes.

## Available Examples

### `oauth-session-hijack/`

OAuth phishing leading to consent grant abuse and mailbox exfiltration. Uses the `family.oauth-phishing-session-hijack` pack. Covers token replay, illicit consent grants, and mail forwarding rule creation.

### `brute-force-to-persistence/`

Password spray escalating through credential stuffing, MFA fatigue, and unauthorized data access. Uses the `domain.identity-abuse` pack. Covers multi-stage identity abuse from initial spray through persistence establishment.

## v1.0 Features Demonstrated

**Dataset-Aware Query Defaults** -- Each `QRY-*.md` file shows how `dataset.kind` determines pagination and timeout defaults. Identity datasets paginate at 200 results/page, cloud datasets at 500/page, and alert datasets at 100/page. These defaults appear in the query metadata header.

**Template Clustering (Drain Parser)** -- Query result summaries include `templates=N`, showing how raw events were grouped into structural templates via the Drain algorithm. Security-specific masking replaces IPs with `<IP>`, UUIDs with `<UUID>`, timestamps with `<TS>`, and other variable tokens before clustering. Same masking rules as `DEFAULT_SECURITY_MASKS` in `drain.cjs`.

**Event Deduplication** -- The brute-force example demonstrates `by_id` dedup, which removes pagination overlap duplicates that occur when paginated queries return events already seen in prior pages.

**Anomaly Framing** -- Receipts follow the five-step sequential prediction pattern:
1. Entity timeline construction
2. Baseline establishment
3. Prediction generation
4. Deviation scoring
5. Receipt documentation

**Pack Progressions** -- Both hunts reference `expected_progressions` from their respective packs, comparing actual observed attack chains against the expected patterns defined in pack configuration.

**Sequential Evidence Integrity** -- `EVIDENCE_REVIEW.md` shows all validation checks passing, including anti-pattern detection for post-hoc rationalization, missing baseline references, and score inflation.

## Artifact Structure

```
example-name/
├── README.md              # Scenario overview
└── .hunt/                 # Hunt artifacts (mirrors .planning/ in real hunts)
    ├── MISSION.md          # Signal, scope, working theory
    ├── HYPOTHESES.md       # Testable assertions with verdicts
    ├── SUCCESS_CRITERIA.md # Quality gates and exit conditions
    ├── HUNTMAP.md          # Phase roadmap
    ├── STATE.md            # Current position (completed)
    ├── FINDINGS.md         # Final verdicts and recommendations
    ├── EVIDENCE_REVIEW.md  # Publishability assessment
    ├── environment/
    │   └── ENVIRONMENT.md  # Telemetry surfaces and blind spots
    ├── QUERIES/
    │   └── QRY-*.md        # Query execution logs with template metadata
    └── RECEIPTS/
        └── RCT-*.md        # Evidence chain-of-custody with anomaly scores
```

## How to Read the Examples

1. **README.md** -- Start here for the scenario overview and attack narrative.
2. **MISSION.md** -- The signal or detection that triggered the hunt.
3. **HYPOTHESES.md** -- What was tested, with ✅ confirmed / ⚠ inconclusive verdicts.
4. **QUERIES/** -- How data was collected. Note the `templates=N` in each Result Summary section showing Drain clustering output.
5. **RECEIPTS/** -- The anomaly framing pattern: baseline, prediction, deviation score, and finding.
6. **FINDINGS.md** -- Final verdict, confirmed kill chain, and recommendations.
7. **EVIDENCE_REVIEW.md** -- Quality gate results and publishability assessment.

## Notes

- These are static examples -- no live connectors or data sources are required.
- Template patterns use the same masking as `DEFAULT_SECURITY_MASKS` in `drain.cjs`.
- All timestamps, IP addresses, and identifiers are fictional but realistic.
- The artifact format matches what thrunt-god's runtime produces via `evidence.cjs`.
