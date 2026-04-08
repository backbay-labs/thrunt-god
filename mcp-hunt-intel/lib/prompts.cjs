'use strict';

const { getThreatProfile, listThreatProfiles, compareDetections } = require('./coverage.cjs');
const { lookupTechnique } = require('./intel.cjs');

const PROMPT_DEFS = {
  'ransomware-readiness': {
    description: 'Assess detection readiness against ransomware techniques. Returns relevant ATT&CK techniques, current detection coverage, and a suggested investigation approach.',
    profiles: ['ransomware'],
    suggested_approach: [
      '1. Review detection gaps for high-impact ransomware techniques (encryption, recovery inhibition, service stop)',
      '2. Prioritize coverage for initial access and lateral movement vectors',
      '3. Validate existing detections against recent ransomware TTP reports',
      '4. Check for behavioral detections vs signature-only rules',
      '5. Assess data source availability for uncovered techniques',
    ].join('\n'),
  },
  'apt-emulation': {
    description: 'Plan APT adversary emulation with technique coverage analysis. Returns APT-associated techniques, detection gaps, and an emulation planning approach.',
    profiles: ['apt'],
    suggested_approach: [
      '1. Map target APT group techniques to your detection stack',
      '2. Identify detection gaps in the kill chain (initial access through exfiltration)',
      '3. Prioritize emulation of techniques with no detection coverage',
      '4. Plan purple team exercises around credential access and lateral movement gaps',
      '5. Document findings as detection engineering backlog items',
    ].join('\n'),
  },
  'detection-sprint': {
    description: 'Plan a detection engineering sprint across all threat categories. Returns comprehensive technique coverage across ransomware, APT, initial-access, persistence, credential-access, and defense-evasion profiles.',
    profiles: null,
    suggested_approach: [
      '1. Triage gaps by severity: prioritize techniques seen in active campaigns',
      '2. Group uncovered techniques by data source for efficient rule authoring',
      '3. Start with high-confidence detections (specific process names, known tool signatures)',
      '4. Layer behavioral detections for technique variants',
      '5. Validate each new detection against known-good baselines to minimize false positives',
      '6. Target 2-3 new detections per sprint day',
    ].join('\n'),
  },
  'soc-investigation': {
    description: 'Start a SOC investigation with coverage context for initial access, persistence, and credential access techniques. Returns relevant techniques, detection status, and an investigation workflow.',
    profiles: ['initial-access', 'persistence', 'credential-access'],
    suggested_approach: [
      '1. Identify the initial access vector and check detection coverage for that technique',
      '2. Search for persistence mechanisms -- focus on gaps where you have no alerting',
      '3. Check credential access technique coverage to assess lateral movement risk',
      '4. Cross-reference with past cases for similar attack patterns',
      '5. Log investigation decisions and learnings for institutional memory',
    ].join('\n'),
  },
};

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} def - Prompt definition from PROMPT_DEFS
 * @returns {string}
 */
function buildPromptContent(db, def) {
  const allProfiles = def.profiles || listThreatProfiles();
  const techIdSet = new Set();
  const profileSummaries = [];

  for (const profileName of allProfiles) {
    const ids = getThreatProfile(profileName);
    if (ids) {
      for (const id of ids) techIdSet.add(id);
      profileSummaries.push({ name: profileName, count: ids.length });
    }
  }

  const techIds = [...techIdSet];

  const techniques = [];
  let coveredCount = 0;
  let gapCount = 0;

  for (const tid of techIds) {
    const tech = lookupTechnique(db, tid);
    const coverage = compareDetections(db, tid);
    const hasCoverage = coverage && coverage.source_count > 0;

    if (hasCoverage) coveredCount++;
    else gapCount++;

    techniques.push({
      id: tid,
      name: tech ? tech.name : tid,
      tactic: tech ? (tech.tactics || 'unknown') : 'unknown',
      covered: hasCoverage,
      source_count: coverage ? coverage.source_count : 0,
      sources: coverage ? coverage.sources.map(s => s.format || s.source_format || '') : [],
    });
  }

  const sections = [];

  sections.push('## Threat Profiles');
  for (const ps of profileSummaries) {
    sections.push(`- **${ps.name}**: ${ps.count} techniques`);
  }

  sections.push('');
  sections.push('## Coverage Summary');
  sections.push(`- **Total techniques**: ${techIds.length}`);
  sections.push(`- **Covered**: ${coveredCount} (${techIds.length ? Math.round(coveredCount / techIds.length * 100) : 0}%)`);
  sections.push(`- **Gaps**: ${gapCount}`);

  sections.push('');
  sections.push('## Technique Details');
  const gaps = techniques.filter(t => !t.covered);
  const covered = techniques.filter(t => t.covered);

  if (gaps.length > 0) {
    sections.push('');
    sections.push('### Detection Gaps (no coverage)');
    for (const t of gaps) {
      sections.push(`- **${t.id}** ${t.name} [${t.tactic}]`);
    }
  }

  if (covered.length > 0) {
    sections.push('');
    sections.push('### Covered Techniques');
    for (const t of covered) {
      sections.push(`- **${t.id}** ${t.name} [${t.tactic}] -- ${t.source_count} source(s): ${t.sources.join(', ')}`);
    }
  }

  sections.push('');
  sections.push('## Suggested Approach');
  sections.push(def.suggested_approach);

  return sections.join('\n');
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('better-sqlite3').Database} db
 */
function registerPrompts(server, db) {
  for (const [name, def] of Object.entries(PROMPT_DEFS)) {
    server.prompt(
      name,
      def.description,
      async () => {
        const content = buildPromptContent(db, def);
        return {
          messages: [{
            role: 'user',
            content: { type: 'text', text: content },
          }],
        };
      }
    );
  }
}

module.exports = {
  registerPrompts,
  buildPromptContent,
  PROMPT_DEFS,
};
