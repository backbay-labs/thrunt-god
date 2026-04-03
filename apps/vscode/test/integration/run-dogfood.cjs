const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_ROOT = path.join(PACKAGE_ROOT, 'test', 'fixtures');

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function prepareWorkspace(scenario) {
  const sourceDir = path.join(FIXTURES_ROOT, scenario);
  await fs.access(sourceDir);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'thrunt-god-dogfood-'));
  const workspaceFolder = path.join(tempRoot, 'workspace');
  const huntDirName = process.env.THRUNT_TEST_HUNT_DIR ?? '.planning';
  const huntFolder = path.join(workspaceFolder, huntDirName);

  await fs.mkdir(huntFolder, { recursive: true });
  await fs.cp(sourceDir, huntFolder, { recursive: true });

  return { tempRoot, workspaceFolder, huntDirName };
}

async function runVSCodeTest(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(getNpmCommand(), ['exec', '--', 'vscode-test'], {
      cwd: PACKAGE_ROOT,
      env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const scenario = process.env.THRUNT_TEST_SCENARIO ?? process.argv[2] ?? 'brute-force-hunt';
  const keepWorkspace = process.env.THRUNT_TEST_KEEP_WORKSPACE === '1';
  const { tempRoot, workspaceFolder, huntDirName } = await prepareWorkspace(scenario);

  console.log(`[dogfood] scenario: ${scenario}`);
  console.log(`[dogfood] workspace: ${workspaceFolder}`);
  console.log(`[dogfood] mounted fixture at: ${huntDirName}`);

  const env = {
    ...process.env,
    THRUNT_E2E: '1',
    THRUNT_TEST_SCENARIO: scenario,
    THRUNT_TEST_WORKSPACE: workspaceFolder,
  };

  let exitCode = 1;

  try {
    exitCode = await runVSCodeTest(env);
  } finally {
    if (keepWorkspace) {
      console.log(`[dogfood] preserved workspace: ${workspaceFolder}`);
    } else {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error('[dogfood] failed to launch harness');
  console.error(error);
  process.exit(1);
});
