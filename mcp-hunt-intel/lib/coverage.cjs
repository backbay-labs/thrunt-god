'use strict';

const { lookupTechnique, getTechniquesByTactic } = require('./intel.cjs');

const THREAT_PROFILES = {
  ransomware: [
    'T1486',     // Data Encrypted for Impact
    'T1490',     // Inhibit System Recovery
    'T1489',     // Service Stop
    'T1059',     // Command and Scripting Interpreter
    'T1047',     // Windows Management Instrumentation
    'T1569.002', // Service Execution
    'T1021.001', // Remote Desktop Protocol
    'T1078',     // Valid Accounts
    'T1053.005', // Scheduled Task
    'T1543.003', // Windows Service
    'T1112',     // Modify Registry
    'T1562.001', // Disable or Modify Tools
    'T1070.004', // File Deletion
    'T1027',     // Obfuscated Files or Information
    'T1105',     // Ingress Tool Transfer
  ],

  apt: [
    'T1566',     // Phishing
    'T1566.001', // Spearphishing Attachment
    'T1059',     // Command and Scripting Interpreter
    'T1059.001', // PowerShell
    'T1059.003', // Windows Command Shell
    'T1047',     // Windows Management Instrumentation
    'T1053.005', // Scheduled Task
    'T1078',     // Valid Accounts
    'T1078.002', // Domain Accounts
    'T1003',     // OS Credential Dumping
    'T1003.001', // LSASS Memory
    'T1021.001', // Remote Desktop Protocol
    'T1021.002', // SMB/Windows Admin Shares
    'T1071.001', // Web Protocols
    'T1105',     // Ingress Tool Transfer
    'T1027',     // Obfuscated Files or Information
    'T1562.001', // Disable or Modify Tools
    'T1070.004', // File Deletion
    'T1041',     // Exfiltration Over C2 Channel
    'T1560.001', // Archive via Utility
  ],

  'initial-access': [
    'T1566',     // Phishing
    'T1566.001', // Spearphishing Attachment
    'T1566.002', // Spearphishing Link
    'T1190',     // Exploit Public-Facing Application
    'T1133',     // External Remote Services
    'T1078',     // Valid Accounts
    'T1199',     // Trusted Relationship
    'T1195.002', // Compromise Software Supply Chain
  ],

  persistence: [
    'T1053.005', // Scheduled Task
    'T1543.003', // Windows Service
    'T1547.001', // Registry Run Keys
    'T1098',     // Account Manipulation
    'T1136',     // Create Account
    'T1078',     // Valid Accounts
    'T1574.002', // DLL Side-Loading
    'T1546.003', // WMI Event Subscription
    'T1505.003', // Web Shell
    'T1037.001', // Logon Script
  ],

  'credential-access': [
    'T1003',     // OS Credential Dumping
    'T1003.001', // LSASS Memory
    'T1003.003', // NTDS
    'T1110',     // Brute Force
    'T1555',     // Credentials from Password Stores
    'T1552.001', // Credentials in Files
    'T1558.003', // Kerberoasting
    'T1056.001', // Keylogging
  ],

  'defense-evasion': [
    'T1562.001', // Disable or Modify Tools
    'T1070',     // Indicator Removal
    'T1070.004', // File Deletion
    'T1027',     // Obfuscated Files or Information
    'T1036',     // Masquerading
    'T1036.005', // Match Legitimate Name or Location
    'T1218.011', // Rundll32
    'T1112',     // Modify Registry
    'T1574.002', // DLL Side-Loading
    'T1055',     // Process Injection
    'T1497.001', // System Checks for Virtualization
    'T1140',     // Deobfuscate/Decode Files
  ],
};

/**
 * @param {string} name - Profile name (e.g., 'ransomware', 'APT')
 * @returns {string[]|null}
 */
function getThreatProfile(name) {
  if (!name || typeof name !== 'string') return null;
  const key = name.toLowerCase().trim();
  return THREAT_PROFILES[key] || null;
}

/** @returns {string[]} */
function listThreatProfiles() {
  return Object.keys(THREAT_PROFILES);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} input - Technique ID (e.g., 'T1059') or free-text query
 * @returns {object} { technique_id, technique_name, sources, source_count }
 */
function compareDetections(db, input) {
  if (!input || typeof input !== 'string') {
    return { technique_id: null, technique_name: null, sources: [], source_count: 0 };
  }

  const trimmed = input.trim();

  if (/^T\d{4}/i.test(trimmed)) {
    return _compareForTechnique(db, trimmed.toUpperCase());
  }

  try {
    const ftsRows = db.prepare(
      'SELECT id FROM techniques_fts WHERE techniques_fts MATCH ? LIMIT 5'
    ).all(trimmed);

    if (ftsRows.length === 0) {
      return { technique_id: null, technique_name: null, sources: [], source_count: 0 };
    }

    return _compareForTechnique(db, ftsRows[0].id);
  } catch {
    return { technique_id: null, technique_name: null, sources: [], source_count: 0 };
  }
}

function _compareForTechnique(db, techniqueId) {
  const tech = lookupTechnique(db, techniqueId);
  const techniqueName = tech ? tech.name : null;

  let rows;
  try {
    rows = db.prepare(
      'SELECT id, title, source_format, severity FROM detections WHERE technique_ids LIKE ?'
    ).all(`%${techniqueId}%`);
  } catch {
    rows = [];
  }

  const sources = rows.map(r => ({
    format: r.source_format,
    rule_id: r.id,
    title: r.title,
    severity: r.severity,
  }));

  const formatSet = new Set(sources.map(s => s.format));

  return {
    technique_id: techniqueId,
    technique_name: techniqueName,
    sources,
    source_count: formatSet.size,
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} techniqueId - Technique ID (e.g., 'T1047')
 * @returns {object} { technique_id, technique_name, tactic, suggestion_basis, similar_rules, data_sources }
 */
function suggestDetections(db, techniqueId) {
  if (!techniqueId || typeof techniqueId !== 'string') {
    return {
      technique_id: null,
      technique_name: null,
      tactic: null,
      suggestion_basis: '',
      similar_rules: [],
      data_sources: [],
    };
  }

  const normalised = techniqueId.toUpperCase().trim();

  const tech = lookupTechnique(db, normalised);
  if (!tech) {
    return {
      technique_id: normalised,
      technique_name: null,
      tactic: null,
      suggestion_basis: 'Technique not found in ATT&CK database',
      similar_rules: [],
      data_sources: [],
    };
  }

  const dataSources = tech.data_sources
    ? tech.data_sources.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const tactics = tech.tactics
    ? tech.tactics.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const primaryTactic = tactics[0] || '';

  const similarRules = [];

  if (primaryTactic) {
    const siblingTechs = getTechniquesByTactic(db, primaryTactic);
    const siblingIds = siblingTechs
      .map(t => t.id)
      .filter(id => id !== normalised);

    for (const sibId of siblingIds) {
      if (similarRules.length >= 10) break;

      try {
        const detRows = db.prepare(
          'SELECT id, title, logsource, source_format FROM detections WHERE technique_ids LIKE ? LIMIT ?'
        ).all(`%${sibId}%`, 10 - similarRules.length);

        for (const row of detRows) {
          if (similarRules.length >= 10) break;
          similarRules.push({
            id: row.id,
            title: row.title,
            logsource: row.logsource,
            source_format: row.source_format,
          });
        }
      } catch {}
    }
  }

  const suggestionBasis = primaryTactic
    ? `Rules from same tactic: ${primaryTactic}`
    : 'No tactic information available';

  return {
    technique_id: normalised,
    technique_name: tech.name,
    tactic: primaryTactic || null,
    suggestion_basis: suggestionBasis,
    similar_rules: similarRules,
    data_sources: dataSources,
  };
}

module.exports = {
  THREAT_PROFILES,
  getThreatProfile,
  listThreatProfiles,
  compareDetections,
  suggestDetections,
};
