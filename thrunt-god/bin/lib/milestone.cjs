/**
 * Milestone — Milestone and hypothesis lifecycle operations
 */

const fs = require('fs');
const path = require('path');
const { escapeRegex, getMilestonePhaseFilter, extractOneLinerFromBody, normalizeMd, planningPaths, getMissionDocInfo, getHuntmapDocInfo, output, error, PLANNING_DIR_NAME } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { writeStateMd, stateReplaceFieldWithFallback } = require('./state.cjs');

function markHypothesisEntriesSupported(content, reqIds) {
  let nextContent = content;
  const updated = [];
  const alreadyComplete = [];
  const notFound = [];

  for (const reqId of reqIds) {
    let found = false;
    const reqEscaped = escapeRegex(reqId);

    const checkboxPattern = new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${reqEscaped}\\*\\*)`, 'gi');
    if (checkboxPattern.test(nextContent)) {
      nextContent = nextContent.replace(checkboxPattern, '$1x$2');
      found = true;
    }

    const tablePattern = new RegExp(`(\\|\\s*${reqEscaped}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi');
    if (tablePattern.test(nextContent)) {
      nextContent = nextContent.replace(
        new RegExp(`(\\|\\s*${reqEscaped}\\s*\\|[^|]+\\|)\\s*(?:Pending|In Progress)\\s*(\\|)`, 'gi'),
        '$1 Complete $2'
      );
      found = true;
    }

    if (found) {
      updated.push(reqId);
    } else {
      const doneCheckbox = new RegExp(`-\\s*\\[x\\]\\s*\\*\\*${reqEscaped}\\*\\*`, 'gi');
      const doneTable = new RegExp(`\\|\\s*${reqEscaped}\\s*\\|[^|]+\\|\\s*Complete\\s*\\|`, 'gi');
      if (doneCheckbox.test(nextContent) || doneTable.test(nextContent)) {
        alreadyComplete.push(reqId);
      } else {
        notFound.push(reqId);
      }
    }
  }

  return { content: nextContent, updated, alreadyComplete, notFound };
}

function markHypothesesSupported(content, hypothesisIds) {
  let nextContent = content;
  const updated = [];
  const alreadyComplete = [];
  const notFound = [];

  for (const hypothesisId of hypothesisIds) {
    const matches = [...nextContent.matchAll(/^###\s+([A-Z0-9-]+):.*$/gm)];
    const match = matches.find(m => m[1].toUpperCase() === hypothesisId.toUpperCase());

    if (!match) {
      notFound.push(hypothesisId);
      continue;
    }

    const start = match.index;
    const currentIndex = matches.findIndex(m => m.index === start);
    const end = currentIndex >= 0 && currentIndex < matches.length - 1
      ? matches[currentIndex + 1].index
      : nextContent.length;
    const section = nextContent.slice(start, end);
    const statusMatch = section.match(/^-+\s*\*\*Status:\*\*\s*(.+)$/mi);

    if (!statusMatch) {
      notFound.push(hypothesisId);
      continue;
    }

    const currentStatus = statusMatch[1].trim();
    if (/^Supported$/i.test(currentStatus)) {
      alreadyComplete.push(hypothesisId);
      continue;
    }

    const updatedSection = section.replace(/^-+\s*\*\*Status:\*\*\s*.+$/mi, '- **Status:** Supported');
    nextContent = nextContent.slice(0, start) + updatedSection + nextContent.slice(end);
    updated.push(hypothesisId);
  }

  return { content: nextContent, updated, alreadyComplete, notFound };
}

function archivePlainDocument(sourcePath, archivePath) {
  if (!fs.existsSync(sourcePath)) return false;
  fs.writeFileSync(archivePath, fs.readFileSync(sourcePath, 'utf-8'), 'utf-8');
  return true;
}

function cmdHypothesesMarkComplete(cwd, reqIdsRaw, raw) {
  if (!reqIdsRaw || reqIdsRaw.length === 0) {
    error('hypothesis IDs required. Usage: hypotheses mark-complete HYP-01,HYP-02 or HYP-01 HYP-02');
  }

  // Accept comma-separated, space-separated, or bracket-wrapped: [HYP-01, HYP-02]
  const reqIds = reqIdsRaw
    .join(' ')
    .replace(/[\[\]]/g, '')
    .split(/[,\s]+/)
    .map(r => r.trim())
    .filter(Boolean);

  if (reqIds.length === 0) {
    error('no valid requirement IDs found');
  }

  const hypothesesPath = planningPaths(cwd).hypotheses;

  if (!fs.existsSync(hypothesesPath)) {
    output({ updated: false, reason: 'HYPOTHESES.md not found', ids: reqIds }, raw, 'no hypotheses file');
    return;
  }

  const source = 'HYPOTHESES.md';
  const initialContent = fs.readFileSync(hypothesesPath, 'utf-8');
  let operation = markHypothesesSupported(initialContent, reqIds);
  if (operation.updated.length === 0 && operation.notFound.length === reqIds.length) {
    operation = markHypothesisEntriesSupported(initialContent, reqIds);
  }
  const { content: nextContent, updated, alreadyComplete, notFound } = operation;

  if (updated.length > 0) {
    fs.writeFileSync(hypothesesPath, nextContent, 'utf-8');
  }

  output({
    updated: updated.length > 0,
    source,
    marked_complete: updated,
    already_complete: alreadyComplete,
    not_found: notFound,
    total: reqIds.length,
  }, raw, `${updated.length}/${reqIds.length} hypotheses marked complete`);
}

function cmdMilestoneComplete(cwd, version, options, raw) {
  if (!version) {
    error('version required for milestone complete (e.g., v1.0)');
  }

  const paths = planningPaths(cwd);
  const projectDoc = getMissionDocInfo(cwd);
  const roadmapDoc = getHuntmapDocInfo(cwd);
  const statePath = paths.state;
  const milestonesPath = path.join(cwd, PLANNING_DIR_NAME, 'MILESTONES.md');
  const archiveDir = path.join(cwd, PLANNING_DIR_NAME, 'milestones');
  const phasesDir = paths.phases;
  const today = new Date().toISOString().split('T')[0];
  const milestoneName = options.name || version;

  // Ensure archive directory exists
  fs.mkdirSync(archiveDir, { recursive: true });

  // Scope stats and accomplishments to only the phases belonging to the
  // current milestone's ROADMAP.  Uses the shared filter from core.cjs
  // (same logic used by cmdPhasesList and other callers).
  const isDirInMilestone = getMilestonePhaseFilter(cwd);

  // Gather stats from phases (scoped to current milestone only)
  let phaseCount = 0;
  let totalPlans = 0;
  let totalTasks = 0;
  const accomplishments = [];

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      if (!isDirInMilestone(dir)) continue;

      phaseCount++;
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      totalPlans += plans.length;

      // Extract one-liners from summaries
      for (const s of summaries) {
        try {
          const content = fs.readFileSync(path.join(phasesDir, dir, s), 'utf-8');
          const fm = extractFrontmatter(content);
          const oneLiner = fm['one-liner'] || extractOneLinerFromBody(content);
          if (oneLiner) {
            accomplishments.push(oneLiner);
          }
          // Count tasks: prefer **Tasks:** N from Performance section,
          // then <task XML tags, then ## Task N markdown headers
          const tasksFieldMatch = content.match(/\*\*Tasks:\*\*\s*(\d+)/);
          if (tasksFieldMatch) {
            totalTasks += parseInt(tasksFieldMatch[1], 10);
          } else {
            const xmlTaskMatches = content.match(/<task[\s>]/gi) || [];
            const mdTaskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
            totalTasks += xmlTaskMatches.length || mdTaskMatches.length;
          }
        } catch { /* intentionally empty */ }
      }
    }
  } catch { /* intentionally empty */ }

  const archived = {
    mission: archivePlainDocument(projectDoc.mission, path.join(archiveDir, `${version}-MISSION.md`)),
    huntmap: archivePlainDocument(roadmapDoc.huntmap, path.join(archiveDir, `${version}-HUNTMAP.md`)),
    hypotheses: archivePlainDocument(paths.hypotheses, path.join(archiveDir, `${version}-HYPOTHESES.md`)),
    success_criteria: archivePlainDocument(paths.successCriteria, path.join(archiveDir, `${version}-SUCCESS_CRITERIA.md`)),
    evidence_review: archivePlainDocument(paths.evidenceReview, path.join(archiveDir, `${version}-EVIDENCE_REVIEW.md`)),
    findings: archivePlainDocument(paths.findings, path.join(archiveDir, `${version}-FINDINGS.md`)),
    audit: false,
    phases: false,
  };

  if (fs.existsSync(paths.hypotheses)) {
    const reqContent = fs.readFileSync(paths.hypotheses, 'utf-8');
    const archiveHeader = `# Hypotheses Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\nFor current hunt hypotheses, see \`.planning/HYPOTHESES.md\`.\n\n---\n\n`;
    fs.writeFileSync(path.join(archiveDir, `${version}-HYPOTHESES.md`), archiveHeader + reqContent, 'utf-8');
  }

  // Archive audit file if exists
  const auditFile = path.join(cwd, PLANNING_DIR_NAME, `${version}-MILESTONE-AUDIT.md`);
  if (fs.existsSync(auditFile)) {
    fs.renameSync(auditFile, path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`));
    archived.audit = true;
  }

  // Create/append MILESTONES.md entry
  const accomplishmentsList = accomplishments.map(a => `- ${a}`).join('\n');
  const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Phases completed:** ${phaseCount} phases, ${totalPlans} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;

  if (fs.existsSync(milestonesPath)) {
    const existing = fs.readFileSync(milestonesPath, 'utf-8');
    if (!existing.trim()) {
      // Empty file — treat like new
      fs.writeFileSync(milestonesPath, normalizeMd(`# Milestones\n\n${milestoneEntry}`), 'utf-8');
    } else {
      // Insert after the header line(s) for reverse chronological order (newest first)
      const headerMatch = existing.match(/^(#{1,3}\s+[^\n]*\n\n?)/);
      if (headerMatch) {
        const header = headerMatch[1];
        const rest = existing.slice(header.length);
        fs.writeFileSync(milestonesPath, normalizeMd(header + milestoneEntry + rest), 'utf-8');
      } else {
        // No recognizable header — prepend the entry
        fs.writeFileSync(milestonesPath, normalizeMd(milestoneEntry + existing), 'utf-8');
      }
    }
  } else {
    fs.writeFileSync(milestonesPath, normalizeMd(`# Milestones\n\n${milestoneEntry}`), 'utf-8');
  }

  // Update STATE.md — use shared helpers that handle both **bold:** and plain Field: formats
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');

    stateContent = stateReplaceFieldWithFallback(stateContent, 'Status', null, `${version} milestone complete`);
    stateContent = stateReplaceFieldWithFallback(stateContent, 'Last Activity', 'Last activity', today);
    stateContent = stateReplaceFieldWithFallback(stateContent, 'Last Activity Description', null,
      `${version} milestone completed and archived`);

    writeStateMd(statePath, stateContent, cwd);
  }

  // Archive phase directories if requested
  if (options.archivePhases) {
    try {
      const phaseArchiveDir = path.join(archiveDir, `${version}-phases`);
      fs.mkdirSync(phaseArchiveDir, { recursive: true });

      const phaseEntries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const phaseDirNames = phaseEntries.filter(e => e.isDirectory()).map(e => e.name);
      let archivedCount = 0;
      for (const dir of phaseDirNames) {
        if (!isDirInMilestone(dir)) continue;
        fs.renameSync(path.join(phasesDir, dir), path.join(phaseArchiveDir, dir));
        archivedCount++;
      }
      archived.phases = archivedCount > 0;
    } catch { /* intentionally empty */ }
  }

  const result = {
    version,
    name: milestoneName,
    date: today,
    phases: phaseCount,
    plans: totalPlans,
    tasks: totalTasks,
    accomplishments,
    archived,
    milestones_updated: true,
    state_updated: fs.existsSync(statePath),
  };

  output(result, raw);
}

module.exports = {
  cmdHypothesesMarkComplete,
  cmdMilestoneComplete,
};
