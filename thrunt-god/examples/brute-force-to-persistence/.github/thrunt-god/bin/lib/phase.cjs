/**
 * Phase — Phase CRUD, query, and lifecycle operations
 */

const fs = require('fs');
const path = require('path');
const { escapeRegex, loadConfig, normalizePhaseName, comparePhaseNum, findPhaseInternal, getArchivedPhaseDirs, generateSlugInternal, getMilestonePhaseFilter, stripShippedMilestones, extractCurrentMilestone, replaceInCurrentMilestone, getHuntmapDocInfo, planningPaths, toPosixPath, planningDir, output, error, readSubdirectories } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { writeStateMd, stateExtractField, stateReplaceField, stateReplaceFieldWithFallback } = require('./state.cjs');

function extractMarkdownListItems(content, heading) {
  const sectionMatch = content.match(new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'));
  if (!sectionMatch) return [];
  return sectionMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^-\s+/.test(line))
    .map(line => line.replace(/^-\s+/, '').trim())
    .filter(Boolean);
}

function markHypothesesSupported(content, hypothesisIds) {
  let nextContent = content;
  let updatedCount = 0;

  for (const hypothesisId of hypothesisIds) {
    const matches = [...nextContent.matchAll(/^###\s+([A-Z0-9-]+):.*$/gm)];
    const match = matches.find(m => m[1].toUpperCase() === hypothesisId.toUpperCase());
    if (!match) continue;

    const start = match.index;
    const currentIndex = matches.findIndex(m => m.index === start);
    const end = currentIndex >= 0 && currentIndex < matches.length - 1
      ? matches[currentIndex + 1].index
      : nextContent.length;
    const section = nextContent.slice(start, end);
    const statusMatch = section.match(/^-+\s*\*\*Status:\*\*\s*(.+)$/mi);
    if (!statusMatch || /^Supported$/i.test(statusMatch[1].trim())) continue;

    const updatedSection = section.replace(/^-+\s*\*\*Status:\*\*\s*.+$/mi, '- **Status:** Supported');
    nextContent = nextContent.slice(0, start) + updatedSection + nextContent.slice(end);
    updatedCount++;
  }

  return { content: nextContent, updatedCount };
}

function markHypothesisEntriesSupported(content, hypothesisIds) {
  let nextContent = content;
  let updatedCount = 0;

  for (const hypothesisId of hypothesisIds) {
    const hypothesisEscaped = escapeRegex(hypothesisId);
    let updated = false;

    const checkboxPattern = new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${hypothesisEscaped}\\*\\*)`, 'gi');
    if (checkboxPattern.test(nextContent)) {
      nextContent = nextContent.replace(checkboxPattern, '$1x$2');
      updated = true;
    }

    const tablePendingPattern = new RegExp(`(\\|\\s*${hypothesisEscaped}\\s*\\|[^|]+\\|)\\s*(?:Pending|In Progress)\\s*(\\|)`, 'gi');
    if (tablePendingPattern.test(nextContent)) {
      nextContent = nextContent.replace(tablePendingPattern, '$1 Complete $2');
      updated = true;
    }

    if (updated) {
      updatedCount++;
    }
  }

  return { content: nextContent, updatedCount };
}

function cmdPhasesList(cwd, options, raw) {
  const phasesDir = path.join(planningDir(cwd), 'phases');
  const { type, phase, includeArchived } = options;

  // If no phases directory, return empty
  if (!fs.existsSync(phasesDir)) {
    if (type) {
      output({ files: [], count: 0 }, raw, '');
    } else {
      output({ directories: [], count: 0 }, raw, '');
    }
    return;
  }

  try {
    // Get all phase directories
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    let dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Include archived phases if requested
    if (includeArchived) {
      const archived = getArchivedPhaseDirs(cwd);
      for (const a of archived) {
        dirs.push(`${a.name} [${a.milestone}]`);
      }
    }

    // Sort numerically (handles integers, decimals, letter-suffix, hybrids)
    dirs.sort((a, b) => comparePhaseNum(a, b));

    // If filtering by phase number
    if (phase) {
      const normalized = normalizePhaseName(phase);
      const match = dirs.find(d => d.startsWith(normalized));
      if (!match) {
        output({ files: [], count: 0, phase_dir: null, error: 'Phase not found' }, raw, '');
        return;
      }
      dirs = [match];
    }

    // If listing files of a specific type
    if (type) {
      const files = [];
      for (const dir of dirs) {
        const dirPath = path.join(phasesDir, dir);
        const dirFiles = fs.readdirSync(dirPath);

        let filtered;
        if (type === 'plans') {
          filtered = dirFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
        } else if (type === 'summaries') {
          filtered = dirFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        } else {
          filtered = dirFiles;
        }

        files.push(...filtered.sort());
      }

      const result = {
        files,
        count: files.length,
        phase_dir: phase ? dirs[0].replace(/^\d+(?:\.\d+)*-?/, '') : null,
      };
      output(result, raw, files.join('\n'));
      return;
    }

    // Default: list directories
    output({ directories: dirs, count: dirs.length }, raw, dirs.join('\n'));
  } catch (e) {
    error('Failed to list phases: ' + e.message);
  }
}

function cmdPhaseNextDecimal(cwd, basePhase, raw) {
  const phasesDir = path.join(planningDir(cwd), 'phases');
  const normalized = normalizePhaseName(basePhase);

  // Check if phases directory exists
  if (!fs.existsSync(phasesDir)) {
    output(
      {
        found: false,
        base_phase: normalized,
        next: `${normalized}.1`,
        existing: [],
      },
      raw,
      `${normalized}.1`
    );
    return;
  }

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Check if base phase exists
    const baseExists = dirs.some(d => d.startsWith(normalized + '-') || d === normalized);

    // Find existing decimal phases for this base
    const decimalPattern = new RegExp(`^${normalized}\\.(\\d+)`);
    const existingDecimals = [];

    for (const dir of dirs) {
      const match = dir.match(decimalPattern);
      if (match) {
        existingDecimals.push(`${normalized}.${match[1]}`);
      }
    }

    // Sort numerically
    existingDecimals.sort((a, b) => comparePhaseNum(a, b));

    // Calculate next decimal
    let nextDecimal;
    if (existingDecimals.length === 0) {
      nextDecimal = `${normalized}.1`;
    } else {
      const lastDecimal = existingDecimals[existingDecimals.length - 1];
      const lastNum = parseInt(lastDecimal.split('.')[1], 10);
      nextDecimal = `${normalized}.${lastNum + 1}`;
    }

    output(
      {
        found: baseExists,
        base_phase: normalized,
        next: nextDecimal,
        existing: existingDecimals,
      },
      raw,
      nextDecimal
    );
  } catch (e) {
    error('Failed to calculate next decimal phase: ' + e.message);
  }
}

function cmdFindPhase(cwd, phase, raw) {
  if (!phase) {
    error('phase identifier required');
  }

  const phasesDir = path.join(planningDir(cwd), 'phases');
  const normalized = normalizePhaseName(phase);

  const notFound = { found: false, directory: null, phase_number: null, phase_name: null, plans: [], summaries: [] };

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));

    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) {
      output(notFound, raw, '');
      return;
    }

    const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;

    const phaseDir = path.join(phasesDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);
    const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();

    const result = {
      found: true,
      directory: toPosixPath(path.join(path.relative(cwd, planningDir(cwd)), 'phases', match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      plans,
      summaries,
    };

    output(result, raw, result.directory);
  } catch {
    output(notFound, raw, '');
  }
}

function extractObjective(content) {
  const m = content.match(/<objective>\s*\n?\s*(.+)/);
  return m ? m[1].trim() : null;
}

function cmdPhasePlanIndex(cwd, phase, raw) {
  if (!phase) {
    error('phase required for phase-plan-index');
  }

  const phasesDir = path.join(planningDir(cwd), 'phases');
  const normalized = normalizePhaseName(phase);

  // Find phase directory
  let phaseDir = null;
  let phaseDirName = null;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));
    const match = dirs.find(d => d.startsWith(normalized));
    if (match) {
      phaseDir = path.join(phasesDir, match);
      phaseDirName = match;
    }
  } catch {
    // phases dir doesn't exist
  }

  if (!phaseDir) {
    output({ phase: normalized, error: 'Phase not found', plans: [], waves: {}, incomplete: [], has_checkpoints: false }, raw);
    return;
  }

  // Get all files in phase directory
  const phaseFiles = fs.readdirSync(phaseDir);
  const planFiles = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
  const summaryFiles = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

  // Build set of plan IDs with summaries
  const completedPlanIds = new Set(
    summaryFiles.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
  );

  const plans = [];
  const waves = {};
  const incomplete = [];
  let hasCheckpoints = false;

  for (const planFile of planFiles) {
    const planId = planFile.replace('-PLAN.md', '').replace('PLAN.md', '');
    const planPath = path.join(phaseDir, planFile);
    const content = fs.readFileSync(planPath, 'utf-8');
    const fm = extractFrontmatter(content);

    // Count tasks: XML <task> tags (canonical) or ## Task N markdown (previous format)
    const xmlTasks = content.match(/<task[\s>]/gi) || [];
    const mdTasks = content.match(/##\s*Task\s*\d+/gi) || [];
    const taskCount = xmlTasks.length || mdTasks.length;

    // Parse wave as integer
    const wave = parseInt(fm.wave, 10) || 1;

    // Parse autonomous (default true if not specified)
    let autonomous = true;
    if (fm.autonomous !== undefined) {
      autonomous = fm.autonomous === 'true' || fm.autonomous === true;
    }

    if (!autonomous) {
      hasCheckpoints = true;
    }

    // Parse files_modified (underscore is canonical; also accept hyphenated for compat)
    let filesModified = [];
    const fmFiles = fm['files_modified'] || fm['files-modified'];
    if (fmFiles) {
      filesModified = Array.isArray(fmFiles) ? fmFiles : [fmFiles];
    }

    const hasSummary = completedPlanIds.has(planId);
    if (!hasSummary) {
      incomplete.push(planId);
    }

    const plan = {
      id: planId,
      wave,
      autonomous,
      objective: extractObjective(content) || fm.objective || null,
      files_modified: filesModified,
      task_count: taskCount,
      has_summary: hasSummary,
    };

    plans.push(plan);

    // Group by wave
    const waveKey = String(wave);
    if (!waves[waveKey]) {
      waves[waveKey] = [];
    }
    waves[waveKey].push(planId);
  }

  const result = {
    phase: normalized,
    plans,
    waves,
    incomplete,
    has_checkpoints: hasCheckpoints,
  };

  output(result, raw);
}

function cmdPhaseAdd(cwd, description, raw, customId) {
  if (!description) {
    error('description required for phase add');
  }

  const config = loadConfig(cwd);
  const huntmapDoc = getHuntmapDocInfo(cwd);
  const huntmapPath = huntmapDoc.path;
  if (!huntmapDoc.exists) {
    error(`${huntmapDoc.source} not found`);
  }

  const rawContent = fs.readFileSync(huntmapPath, 'utf-8');
  const content = extractCurrentMilestone(rawContent, cwd);
  const slug = generateSlugInternal(description);
  const planCommand = '/hunt-plan';

  let newPhaseId;
  let dirName;

  if (customId || config.phase_naming === 'custom') {
    // Custom phase naming: use provided ID or generate from description
    newPhaseId = customId || slug.toUpperCase().replace(/-/g, '-');
    if (!newPhaseId) error('--id required when phase_naming is "custom"');
    dirName = `${newPhaseId}-${slug}`;
  } else {
    // Sequential mode: find highest integer phase number (in current milestone only)
    const phasePattern = /#{2,4}\s*Phase\s+(\d+)[A-Z]?(?:\.\d+)*:/gi;
    let maxPhase = 0;
    let m;
    while ((m = phasePattern.exec(content)) !== null) {
      const num = parseInt(m[1], 10);
      if (num > maxPhase) maxPhase = num;
    }

    newPhaseId = maxPhase + 1;
    const paddedNum = String(newPhaseId).padStart(2, '0');
    dirName = `${paddedNum}-${slug}`;
  }

  const dirPath = path.join(planningDir(cwd), 'phases', dirName);

  // Create directory with .gitkeep so git tracks empty folders
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  // Build phase entry
  const dependsOn = config.phase_naming === 'custom' ? '' : `\n**Depends on:** Phase ${typeof newPhaseId === 'number' ? newPhaseId - 1 : 'TBD'}`;
  const phaseEntry = `\n### Phase ${newPhaseId}: ${description}\n\n**Goal:** [To be planned]\n**Hypotheses**: TBD${dependsOn}\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run ${planCommand} ${newPhaseId} to break down)\n`;

  // Find insertion point: before last "---" or at end
  let updatedContent;
  const lastSeparator = rawContent.lastIndexOf('\n---');
  if (lastSeparator > 0) {
    updatedContent = rawContent.slice(0, lastSeparator) + phaseEntry + rawContent.slice(lastSeparator);
  } else {
    updatedContent = rawContent + phaseEntry;
  }

  fs.writeFileSync(huntmapPath, updatedContent, 'utf-8');

  const result = {
    phase_number: typeof newPhaseId === 'number' ? newPhaseId : String(newPhaseId),
    padded: typeof newPhaseId === 'number' ? String(newPhaseId).padStart(2, '0') : String(newPhaseId),
    name: description,
    slug,
    directory: toPosixPath(path.join(path.relative(cwd, planningDir(cwd)), 'phases', dirName)),
    naming_mode: config.phase_naming,
    huntmap_source: huntmapDoc.source,
  };

  output(result, raw, result.padded);
}

function cmdPhaseInsert(cwd, afterPhase, description, raw) {
  if (!afterPhase || !description) {
    error('after-phase and description required for phase insert');
  }

  const huntmapDoc = getHuntmapDocInfo(cwd);
  const huntmapPath = huntmapDoc.path;
  if (!huntmapDoc.exists) {
    error(`${huntmapDoc.source} not found`);
  }

  const rawContent = fs.readFileSync(huntmapPath, 'utf-8');
  const content = extractCurrentMilestone(rawContent, cwd);
  const slug = generateSlugInternal(description);
  const planCommand = '/hunt-plan';

  // Normalize input then strip leading zeros for flexible matching
  const normalizedAfter = normalizePhaseName(afterPhase);
  const unpadded = normalizedAfter.replace(/^0+/, '');
  const afterPhaseEscaped = unpadded.replace(/\./g, '\\.');
  const targetPattern = new RegExp(`#{2,4}\\s*Phase\\s+0*${afterPhaseEscaped}:`, 'i');
  if (!targetPattern.test(content)) {
    error(`Phase ${afterPhase} not found in ${huntmapDoc.source}`);
  }

  // Calculate next decimal using existing logic
  const phasesDir = path.join(planningDir(cwd), 'phases');
  const normalizedBase = normalizePhaseName(afterPhase);
  let existingDecimals = [];

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    const decimalPattern = new RegExp(`^${normalizedBase}\\.(\\d+)`);
    for (const dir of dirs) {
      const dm = dir.match(decimalPattern);
      if (dm) existingDecimals.push(parseInt(dm[1], 10));
    }
  } catch { /* intentionally empty */ }

  const nextDecimal = existingDecimals.length === 0 ? 1 : Math.max(...existingDecimals) + 1;
  const decimalPhase = `${normalizedBase}.${nextDecimal}`;
  const dirName = `${decimalPhase}-${slug}`;
  const dirPath = path.join(planningDir(cwd), 'phases', dirName);

  // Create directory with .gitkeep so git tracks empty folders
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  // Build phase entry
  const phaseEntry = `\n### Phase ${decimalPhase}: ${description} (INSERTED)\n\n**Goal:** [Urgent work - to be planned]\n**Hypotheses**: TBD\n**Depends on:** Phase ${afterPhase}\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run ${planCommand} ${decimalPhase} to break down)\n`;

  // Insert after the target phase section
  const headerPattern = new RegExp(`(#{2,4}\\s*Phase\\s+0*${afterPhaseEscaped}:[^\\n]*\\n)`, 'i');
  const headerMatch = rawContent.match(headerPattern);
  if (!headerMatch) {
    error(`Could not find Phase ${afterPhase} header`);
  }

  const headerIdx = rawContent.indexOf(headerMatch[0]);
  const afterHeader = rawContent.slice(headerIdx + headerMatch[0].length);
  const nextPhaseMatch = afterHeader.match(/\n#{2,4}\s+Phase\s+\d/i);

  let insertIdx;
  if (nextPhaseMatch) {
    insertIdx = headerIdx + headerMatch[0].length + nextPhaseMatch.index;
  } else {
    insertIdx = rawContent.length;
  }

  const updatedContent = rawContent.slice(0, insertIdx) + phaseEntry + rawContent.slice(insertIdx);
  fs.writeFileSync(huntmapPath, updatedContent, 'utf-8');

  const result = {
    phase_number: decimalPhase,
    after_phase: afterPhase,
    name: description,
    slug,
    directory: toPosixPath(path.join(path.relative(cwd, planningDir(cwd)), 'phases', dirName)),
    huntmap_source: huntmapDoc.source,
  };

  output(result, raw, decimalPhase);
}

/**
 * Renumber sibling decimal phases after a decimal phase is removed.
 * e.g. removing 06.2 → 06.3 becomes 06.2, 06.4 becomes 06.3, etc.
 * Returns { renamedDirs, renamedFiles }.
 */
function renameDecimalPhases(phasesDir, baseInt, removedDecimal) {
  const renamedDirs = [], renamedFiles = [];
  const decPattern = new RegExp(`^${baseInt}\\.(\\d+)-(.+)$`);
  const dirs = readSubdirectories(phasesDir, true);
  const toRename = dirs
    .map(dir => { const m = dir.match(decPattern); return m ? { dir, oldDecimal: parseInt(m[1], 10), slug: m[2] } : null; })
    .filter(item => item && item.oldDecimal > removedDecimal)
    .sort((a, b) => b.oldDecimal - a.oldDecimal); // descending to avoid conflicts

  for (const item of toRename) {
    const newDecimal = item.oldDecimal - 1;
    const oldPhaseId = `${baseInt}.${item.oldDecimal}`;
    const newPhaseId = `${baseInt}.${newDecimal}`;
    const newDirName = `${baseInt}.${newDecimal}-${item.slug}`;
    fs.renameSync(path.join(phasesDir, item.dir), path.join(phasesDir, newDirName));
    renamedDirs.push({ from: item.dir, to: newDirName });
    for (const f of fs.readdirSync(path.join(phasesDir, newDirName))) {
      if (f.includes(oldPhaseId)) {
        const newFileName = f.replace(oldPhaseId, newPhaseId);
        fs.renameSync(path.join(phasesDir, newDirName, f), path.join(phasesDir, newDirName, newFileName));
        renamedFiles.push({ from: f, to: newFileName });
      }
    }
  }
  return { renamedDirs, renamedFiles };
}

/**
 * Renumber all integer phases after removedInt.
 * e.g. removing phase 5 → phase 6 becomes 5, phase 7 becomes 6, etc.
 * Returns { renamedDirs, renamedFiles }.
 */
function renameIntegerPhases(phasesDir, removedInt) {
  const renamedDirs = [], renamedFiles = [];
  const dirs = readSubdirectories(phasesDir, true);
  const toRename = dirs
    .map(dir => {
      const m = dir.match(/^(\d+)([A-Z])?(?:\.(\d+))?-(.+)$/i);
      if (!m) return null;
      const dirInt = parseInt(m[1], 10);
      return dirInt > removedInt ? { dir, oldInt: dirInt, letter: m[2] ? m[2].toUpperCase() : '', decimal: m[3] ? parseInt(m[3], 10) : null, slug: m[4] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.oldInt !== b.oldInt ? b.oldInt - a.oldInt : (b.decimal || 0) - (a.decimal || 0));

  for (const item of toRename) {
    const newInt = item.oldInt - 1;
    const newPadded = String(newInt).padStart(2, '0');
    const oldPadded = String(item.oldInt).padStart(2, '0');
    const letterSuffix = item.letter || '';
    const decimalSuffix = item.decimal !== null ? `.${item.decimal}` : '';
    const oldPrefix = `${oldPadded}${letterSuffix}${decimalSuffix}`;
    const newPrefix = `${newPadded}${letterSuffix}${decimalSuffix}`;
    const newDirName = `${newPrefix}-${item.slug}`;
    fs.renameSync(path.join(phasesDir, item.dir), path.join(phasesDir, newDirName));
    renamedDirs.push({ from: item.dir, to: newDirName });
    for (const f of fs.readdirSync(path.join(phasesDir, newDirName))) {
      if (f.startsWith(oldPrefix)) {
        const newFileName = newPrefix + f.slice(oldPrefix.length);
        fs.renameSync(path.join(phasesDir, newDirName, f), path.join(phasesDir, newDirName, newFileName));
        renamedFiles.push({ from: f, to: newFileName });
      }
    }
  }
  return { renamedDirs, renamedFiles };
}

/**
 * Remove a phase section from the active huntmap doc and renumber all subsequent integer phases.
 */
function updateHuntmapAfterPhaseRemoval(huntmapPath, targetPhase, isDecimal, removedInt) {
  let content = fs.readFileSync(huntmapPath, 'utf-8');
  const escaped = escapeRegex(targetPhase);

  content = content.replace(new RegExp(`\\n?#{2,4}\\s*Phase\\s+${escaped}\\s*:[\\s\\S]*?(?=\\n#{2,4}\\s+Phase\\s+\\d|$)`, 'i'), '');
  content = content.replace(new RegExp(`\\n?-\\s*\\[[ x]\\]\\s*.*Phase\\s+${escaped}[:\\s][^\\n]*`, 'gi'), '');
  content = content.replace(new RegExp(`\\n?\\|\\s*${escaped}\\.?\\s[^|]*\\|[^\\n]*`, 'gi'), '');

  if (!isDecimal) {
    const MAX_PHASE = 99;
    for (let oldNum = MAX_PHASE; oldNum > removedInt; oldNum--) {
      const newNum = oldNum - 1;
      const oldStr = String(oldNum), newStr = String(newNum);
      const oldPad = oldStr.padStart(2, '0'), newPad = newStr.padStart(2, '0');
      content = content.replace(new RegExp(`(#{2,4}\\s*Phase\\s+)${oldStr}(\\s*:)`, 'gi'), `$1${newStr}$2`);
      content = content.replace(new RegExp(`(Phase\\s+)${oldStr}([:\\s])`, 'g'), `$1${newStr}$2`);
      content = content.replace(new RegExp(`${oldPad}-(\\d{2})`, 'g'), `${newPad}-$1`);
      content = content.replace(new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, 'g'), `$1${newStr}. `);
      content = content.replace(new RegExp(`(Depends on:\\*\\*\\s*Phase\\s+)${oldStr}\\b`, 'gi'), `$1${newStr}`);
    }
  }

  fs.writeFileSync(huntmapPath, content, 'utf-8');
}

function cmdPhaseRemove(cwd, targetPhase, options, raw) {
  if (!targetPhase) error('phase number required for phase remove');

  const huntmapDoc = getHuntmapDocInfo(cwd);
  const huntmapPath = huntmapDoc.path;
  const phasesDir = path.join(planningDir(cwd), 'phases');

  if (!huntmapDoc.exists) error(`${huntmapDoc.source} not found`);

  const normalized = normalizePhaseName(targetPhase);
  const isDecimal = targetPhase.includes('.');
  const force = options.force || false;

  // Find target directory
  const targetDir = readSubdirectories(phasesDir, true)
    .find(d => d.startsWith(normalized + '-') || d === normalized) || null;

  // Guard against removing executed work
  if (targetDir && !force) {
    const files = fs.readdirSync(path.join(phasesDir, targetDir));
    const summaries = files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    if (summaries.length > 0) {
      error(`Phase ${targetPhase} has ${summaries.length} executed plan(s). Use --force to remove anyway.`);
    }
  }

  if (targetDir) fs.rmSync(path.join(phasesDir, targetDir), { recursive: true, force: true });

  // Renumber subsequent phases on disk
  let renamedDirs = [], renamedFiles = [];
  try {
    const renamed = isDecimal
      ? renameDecimalPhases(phasesDir, normalized.split('.')[0], parseInt(normalized.split('.')[1], 10))
      : renameIntegerPhases(phasesDir, parseInt(normalized, 10));
    renamedDirs = renamed.renamedDirs;
    renamedFiles = renamed.renamedFiles;
  } catch { /* intentionally empty */ }

  // Update HUNTMAP.md
  updateHuntmapAfterPhaseRemoval(huntmapPath, targetPhase, isDecimal, parseInt(normalized, 10));

  // Update STATE.md phase count
  const statePath = path.join(planningDir(cwd), 'STATE.md');
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');
    const totalRaw = stateExtractField(stateContent, 'Total Phases');
    if (totalRaw) {
      stateContent = stateReplaceField(stateContent, 'Total Phases', String(parseInt(totalRaw, 10) - 1)) || stateContent;
    }
    const ofMatch = stateContent.match(/(\bof\s+)(\d+)(\s*(?:\(|phases?))/i);
    if (ofMatch) {
      stateContent = stateContent.replace(/(\bof\s+)(\d+)(\s*(?:\(|phases?))/i, `$1${parseInt(ofMatch[2], 10) - 1}$3`);
    }
    writeStateMd(statePath, stateContent, cwd);
  }

  output({
    removed: targetPhase,
    directory_deleted: targetDir,
    renamed_directories: renamedDirs,
    renamed_files: renamedFiles,
    huntmap_updated: true,
    huntmap_source: huntmapDoc.source,
    state_updated: fs.existsSync(statePath),
  }, raw);
}

function cmdPhaseComplete(cwd, phaseNum, raw) {
  if (!phaseNum) {
    error('phase number required for phase complete');
  }

  const paths = planningPaths(cwd);
  const huntmapDoc = getHuntmapDocInfo(cwd);
  const huntmapPath = huntmapDoc.path;
  const statePath = paths.state;
  const phasesDir = paths.phases;
  const today = new Date().toISOString().split('T')[0];

  // Verify phase info
  const phaseInfo = findPhaseInternal(cwd, phaseNum);
  if (!phaseInfo) {
    error(`Phase ${phaseNum} not found`);
  }

  const planCount = phaseInfo.plans.length;
  const summaryCount = phaseInfo.summaries.length;
  let requirementsUpdated = false;

  // Check for unresolved verification debt (non-blocking warnings)
  const warnings = [];
  try {
    const phaseFullDir = path.join(cwd, phaseInfo.directory);
    const phaseFiles = fs.readdirSync(phaseFullDir);

    for (const file of phaseFiles.filter(f => f.includes('-UAT') && f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(phaseFullDir, file), 'utf-8');
      if (/result: pending/.test(content)) warnings.push(`${file}: has pending tests`);
      if (/result: blocked/.test(content)) warnings.push(`${file}: has blocked tests`);
      if (/status: partial/.test(content)) warnings.push(`${file}: testing incomplete (partial)`);
      if (/status: diagnosed/.test(content)) warnings.push(`${file}: has diagnosed gaps`);
    }

    for (const file of phaseFiles.filter(f => f.includes('-VERIFICATION') && f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(phaseFullDir, file), 'utf-8');
      if (/status: human_needed/.test(content)) warnings.push(`${file}: needs human verification`);
      if (/status: gaps_found/.test(content)) warnings.push(`${file}: has unresolved gaps`);
    }

    for (const file of phaseFiles.filter(f => f.includes('EVIDENCE_REVIEW') && f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(phaseFullDir, file), 'utf-8');
      const verdictMatch = content.match(/##\s*Publishability Verdict\s*\n+([^\n]+)/i);
      if (verdictMatch && !/ready to publish/i.test(verdictMatch[1])) {
        warnings.push(`${file}: publishability verdict is "${verdictMatch[1].trim()}"`);
      }
      const failedChecks = [...content.matchAll(/^\|\s*([^|]+?)\s*\|\s*Fail\s*\|/gmi)];
      if (failedChecks.length > 0) {
        warnings.push(`${file}: ${failedChecks.length} evidence quality check(s) failed`);
      }
      const followUpItems = extractMarkdownListItems(content, 'Follow-Up Needed');
      if (followUpItems.length > 0) {
        warnings.push(`${file}: ${followUpItems.length} follow-up item(s) remain`);
      }
    }

    for (const file of phaseFiles.filter(f => f.includes('FINDINGS') && f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(phaseFullDir, file), 'utf-8');
      const inconclusiveVerdicts = [...content.matchAll(/^\|\s*([^|]+?)\s*\|\s*Inconclusive\s*\|/gmi)];
      if (inconclusiveVerdicts.length > 0) {
        warnings.push(`${file}: ${inconclusiveVerdicts.length} hypothesis verdict(s) remain inconclusive`);
      }
      const unknowns = extractMarkdownListItems(content, 'What We Do Not Know');
      if (unknowns.length > 0) {
        warnings.push(`${file}: ${unknowns.length} unresolved knowledge gap(s) remain`);
      }
    }
  } catch {}

  // Update HUNTMAP.md: mark phase complete
  if (huntmapDoc.exists) {
    let huntmapContent = fs.readFileSync(huntmapPath, 'utf-8');

    // Checkbox: - [ ] Phase N: → - [x] Phase N: (...completed DATE)
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${escapeRegex(phaseNum)}[:\\s][^\\n]*)`,
      'i'
    );
    huntmapContent = replaceInCurrentMilestone(huntmapContent, checkboxPattern, `$1x$2 (completed ${today})`);

    // Progress table: update Status to Complete, add date (handles 4 or 5 column tables)
    const phaseEscaped = escapeRegex(phaseNum);
    const tableRowPattern = new RegExp(
      `^(\\|\\s*${phaseEscaped}\\.?\\s[^|]*(?:\\|[^\\n]*))$`,
      'im'
    );
    huntmapContent = huntmapContent.replace(tableRowPattern, (fullRow) => {
      const cells = fullRow.split('|').slice(1, -1);
      if (cells.length === 5) {
        // 5-col: Phase | Milestone | Plans | Status | Completed
        cells[3] = ' Complete    ';
        cells[4] = ` ${today} `;
      } else if (cells.length === 4) {
        // 4-col: Phase | Plans | Status | Completed
        cells[2] = ' Complete    ';
        cells[3] = ` ${today} `;
      }
      return '|' + cells.join('|') + '|';
    });

    // Update plan count in phase section
    const planCountPattern = new RegExp(
      `(#{2,4}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
      'i'
    );
    huntmapContent = replaceInCurrentMilestone(
      huntmapContent, planCountPattern,
      `$1${summaryCount}/${planCount} plans complete`
    );

    fs.writeFileSync(huntmapPath, huntmapContent, 'utf-8');

    // Update HYPOTHESES.md traceability for this phase's requirements
    const phaseEsc = escapeRegex(phaseNum);
    const currentMilestoneHuntmap = extractCurrentMilestone(huntmapContent, cwd);
    const phaseSectionMatch = currentMilestoneHuntmap.match(
      new RegExp(`(#{2,4}\\s*Phase\\s+${phaseEsc}[:\\s][\\s\\S]*?)(?=#{2,4}\\s*Phase\\s+|$)`, 'i')
    );

    const sectionText = phaseSectionMatch ? phaseSectionMatch[1] : '';
    const reqMatch = sectionText.match(/\*\*Hypotheses:\*\*\s*([^\n]+)/i);

    if (reqMatch) {
      const reqIds = reqMatch[1].replace(/[\[\]]/g, '').split(/[,\s]+/).map(r => r.trim()).filter(Boolean);

      if (fs.existsSync(paths.hypotheses)) {
        const hypothesesContent = fs.readFileSync(paths.hypotheses, 'utf-8');
        let hypothesisUpdate = markHypothesesSupported(hypothesesContent, reqIds);

        if (hypothesisUpdate.updatedCount === 0) {
          hypothesisUpdate = markHypothesisEntriesSupported(hypothesesContent, reqIds);
        }

        if (hypothesisUpdate.updatedCount > 0) {
          fs.writeFileSync(paths.hypotheses, hypothesisUpdate.content, 'utf-8');
          requirementsUpdated = true;
        }
      }
    }
  }

  // Find next phase — check both filesystem AND huntmap
  // Phases may be defined in HUNTMAP.md but not yet scaffolded to disk,
  // so a filesystem-only scan would incorrectly report is_last_phase:true
  let nextPhaseNum = null;
  let nextPhaseName = null;
  let isLastPhase = true;

  try {
    const isDirInMilestone = getMilestonePhaseFilter(cwd);
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name)
      .filter(isDirInMilestone)
      .sort((a, b) => comparePhaseNum(a, b));

    // Find the next phase directory after current
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
      if (dm) {
        if (comparePhaseNum(dm[1], phaseNum) > 0) {
          nextPhaseNum = dm[1];
          nextPhaseName = dm[2] || null;
          isLastPhase = false;
          break;
        }
      }
    }
  } catch { /* intentionally empty */ }

  // Fallback: if filesystem found no next phase, check HUNTMAP.md
  // for phases that are defined but not yet planned (no directory on disk)
  if (isLastPhase && huntmapDoc.exists) {
    try {
      const huntmapForPhases = extractCurrentMilestone(fs.readFileSync(huntmapPath, 'utf-8'), cwd);
      const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
      let pm;
      while ((pm = phasePattern.exec(huntmapForPhases)) !== null) {
        if (comparePhaseNum(pm[1], phaseNum) > 0) {
          nextPhaseNum = pm[1];
          nextPhaseName = pm[2].replace(/\(INSERTED\)/i, '').trim().toLowerCase().replace(/\s+/g, '-');
          isLastPhase = false;
          break;
        }
      }
    } catch { /* intentionally empty */ }
  }

  // Update STATE.md — use shared helpers that handle both **bold:** and plain Field: formats
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');

    // Update Current Phase — preserve "X of Y (Name)" compound format
    const phaseValue = nextPhaseNum || phaseNum;
    const existingPhaseField = stateExtractField(stateContent, 'Current Phase')
      || stateExtractField(stateContent, 'Phase');
    let newPhaseValue = String(phaseValue);
    if (existingPhaseField) {
      const totalMatch = existingPhaseField.match(/of\s+(\d+)/);
      const nameMatch = existingPhaseField.match(/\(([^)]+)\)/);
      if (totalMatch) {
        const total = totalMatch[1];
        const nameStr = nextPhaseName ? ` (${nextPhaseName.replace(/-/g, ' ')})` : (nameMatch ? ` (${nameMatch[1]})` : '');
        newPhaseValue = `${phaseValue} of ${total}${nameStr}`;
      }
    }
    stateContent = stateReplaceFieldWithFallback(stateContent, 'Current Phase', 'Phase', newPhaseValue);

    // Update Current Phase Name
    if (nextPhaseName) {
      stateContent = stateReplaceFieldWithFallback(stateContent, 'Current Phase Name', null, nextPhaseName.replace(/-/g, ' '));
    }

    // Update Status
    stateContent = stateReplaceFieldWithFallback(stateContent, 'Status', null,
      isLastPhase ? 'Milestone complete' : 'Ready to plan');

    // Update Current Plan
    stateContent = stateReplaceFieldWithFallback(stateContent, 'Current Plan', 'Plan', 'Not started');

    // Update Last Activity
    stateContent = stateReplaceFieldWithFallback(stateContent, 'Last Activity', 'Last activity', today);

    // Update Last Activity Description
    stateContent = stateReplaceFieldWithFallback(stateContent, 'Last Activity Description', null,
      `Phase ${phaseNum} complete${nextPhaseNum ? `, transitioned to Phase ${nextPhaseNum}` : ''}`);

    // Increment Completed Phases counter (#956)
    const completedRaw = stateExtractField(stateContent, 'Completed Phases');
    if (completedRaw) {
      const newCompleted = parseInt(completedRaw, 10) + 1;
      stateContent = stateReplaceField(stateContent, 'Completed Phases', String(newCompleted)) || stateContent;

      // Recalculate percent based on completed / total (#956)
      const totalRaw = stateExtractField(stateContent, 'Total Phases');
      if (totalRaw) {
        const totalPhases = parseInt(totalRaw, 10);
        if (totalPhases > 0) {
          const newPercent = Math.round((newCompleted / totalPhases) * 100);
          stateContent = stateReplaceField(stateContent, 'Progress', `${newPercent}%`) || stateContent;
          // Also update percent field if it exists separately
          stateContent = stateContent.replace(
            /(percent:\s*)\d+/,
            `$1${newPercent}`
          );
        }
      }
    }

    writeStateMd(statePath, stateContent, cwd);
  }

  const result = {
    completed_phase: phaseNum,
    phase_name: phaseInfo.phase_name,
    plans_executed: `${summaryCount}/${planCount}`,
    next_phase: nextPhaseNum,
    next_phase_name: nextPhaseName,
    is_last_phase: isLastPhase,
    date: today,
    huntmap_updated: huntmapDoc.exists,
    huntmap_source: huntmapDoc.source,
    state_updated: fs.existsSync(statePath),
    requirements_updated: requirementsUpdated,
    warnings,
    has_warnings: warnings.length > 0,
  };

  output(result, raw);
}

module.exports = {
  cmdPhasesList,
  cmdPhaseNextDecimal,
  cmdFindPhase,
  cmdPhasePlanIndex,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
};
