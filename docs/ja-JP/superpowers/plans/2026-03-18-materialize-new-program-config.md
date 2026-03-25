# 初期化時に new-program の設定を完全展開する

> **エージェント型ワーカー向け:** 必須サブスキル: superpowers:subagent-driven-development（推奨）または superpowers:executing-plans を使用して、このプランをタスクごとに実装してください。各ステップはチェックボックス（`- [ ]`）構文で進捗を追跡します。

**目標:** `/hunt:new-program` が `.planning/config.json` を作成する際、ユーザーが選択した6つのキーだけでなく、すべての有効なデフォルト値を含むファイルを生成する。これにより、開発者はソースコードを読まなくてもすべての設定を確認できるようになる。

**アーキテクチャ:** `config.cjs` に単一の JS 関数 `buildNewProgramConfig(cwd, userChoices)` を追加し、新規プロジェクトの完全な設定の唯一の信頼できる情報源とする。これを CLI コマンド `config-new-program` として公開する。`hunt-bootstrap.md` ワークフローを更新し、部分的な JSON をインラインで書き込む代わりにこのコマンドを呼び出すようにする。

**技術スタック:** Node.js/CommonJS、既存の thrunt-tools CLI、テストには `node:test` を使用。

---

## 背景: 現在の状態

`hunt-bootstrap.md` のステップ 5 では、以下の部分的な設定を書き込む（AI がテンプレートを埋める）:

```json
{
  "mode": "...", "granularity": "...", "parallelization": "...",
  "commit_docs": "...", "model_profile": "...",
  "workflow": { "research", "plan_check", "validator", "nyquist_validation" }
}
```

欠落しているキーは実行時に `loadConfig()` が暗黙的に解決する:

- `search_gitignored: false`
- `brave_search: false`（または環境検出による `true`）
- `git.branching_strategy: "none"`
- `git.phase_branch_template: "thrunt/phase-{phase}-{slug}"`
- `git.milestone_branch_template: "thrunt/{milestone}-{slug}"`

最初から存在すべき完全な設定:

```json
{
  "mode": "yolo|interactive",
  "granularity": "coarse|standard|fine",
  "model_profile": "balanced",
  "commit_docs": true,
  "parallelization": true,
  "search_gitignored": false,
  "brave_search": false,
  "git": {
    "branching_strategy": "none",
    "phase_branch_template": "thrunt/phase-{phase}-{slug}",
    "milestone_branch_template": "thrunt/{milestone}-{slug}"
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "validator": true,
    "nyquist_validation": true
  }
}
```

---

## ファイルマップ

| ファイル | 操作 | 目的 |
|------|--------|---------|
| `thrunt-god/bin/lib/config.cjs` | 変更 | `buildNewProgramConfig()` + `cmdConfigNewProgram()` を追加 |
| `thrunt-god/bin/thrunt-tools.cjs` | 変更 | `config-new-program` の case を登録 + usage 文字列を更新 |
| `thrunt-god/workflows/hunt-bootstrap.md` | 変更 | ステップ 2a + 5: インライン JSON 書き込みを CLI 呼び出しに置換 |
| `tests/config.test.cjs` | 変更 | `config-new-program` テストスイートを追加 |

---

## タスク 1: `buildNewProgramConfig` と `cmdConfigNewProgram` を config.cjs に追加

**ファイル:**

- 変更: `thrunt-god/bin/lib/config.cjs`

- [ ] **ステップ 1.1: まず失敗するテストを書く**

`tests/config.test.cjs` に追加する（`config-get` スイートの後、`module.exports` の前）:

```js
// ─── config-new-program ──────────────────────────────────────────────────────

describe('config-new-program command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates full config with all expected top-level and nested keys', () => {
    const choices = JSON.stringify({
      mode: 'interactive',
      granularity: 'standard',
      parallelization: true,
      commit_docs: true,
      model_profile: 'balanced',
      workflow: { research: true, plan_check: true, validator: true, nyquist_validation: true },
    });
    const result = runThruntTools(['config-new-program', choices], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);

    // ユーザーの選択が反映されている
    assert.strictEqual(config.mode, 'interactive');
    assert.strictEqual(config.granularity, 'standard');
    assert.strictEqual(config.parallelization, true);
    assert.strictEqual(config.commit_docs, true);
    assert.strictEqual(config.model_profile, 'balanced');

    // デフォルト値が展開されている
    assert.strictEqual(typeof config.search_gitignored, 'boolean');
    assert.strictEqual(typeof config.brave_search, 'boolean');

    // git セクションが3つのキーすべてを持つ
    assert.ok(config.git && typeof config.git === 'object', 'git section should exist');
    assert.strictEqual(config.git.branching_strategy, 'none');
    assert.strictEqual(config.git.phase_branch_template, 'thrunt/phase-{phase}-{slug}');
    assert.strictEqual(config.git.milestone_branch_template, 'thrunt/{milestone}-{slug}');

    // workflow セクションが4つのキーすべてを持つ
    assert.ok(config.workflow && typeof config.workflow === 'object', 'workflow section should exist');
    assert.strictEqual(config.workflow.research, true);
    assert.strictEqual(config.workflow.plan_check, true);
    assert.strictEqual(config.workflow.validator, true);
    assert.strictEqual(config.workflow.nyquist_validation, true);
  });

  test('user choices override defaults', () => {
    const choices = JSON.stringify({
      mode: 'yolo',
      granularity: 'coarse',
      parallelization: false,
      commit_docs: false,
      model_profile: 'quality',
      workflow: { research: false, plan_check: false, validator: true, nyquist_validation: false },
    });
    const result = runThruntTools(['config-new-program', choices], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.mode, 'yolo');
    assert.strictEqual(config.granularity, 'coarse');
    assert.strictEqual(config.parallelization, false);
    assert.strictEqual(config.commit_docs, false);
    assert.strictEqual(config.model_profile, 'quality');
    assert.strictEqual(config.workflow.research, false);
    assert.strictEqual(config.workflow.plan_check, false);
    assert.strictEqual(config.workflow.validator, true);
    assert.strictEqual(config.workflow.nyquist_validation, false);
    // 未選択のキーにもデフォルト値が設定されている
    assert.strictEqual(config.git.branching_strategy, 'none');
    assert.strictEqual(typeof config.search_gitignored, 'boolean');
  });

  test('works with empty choices — all defaults materialized', () => {
    const result = runThruntTools(['config-new-program', '{}'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'balanced');
    assert.strictEqual(config.commit_docs, true);
    assert.strictEqual(config.parallelization, true);
    assert.strictEqual(config.search_gitignored, false);
    assert.ok(config.git && typeof config.git === 'object');
    assert.strictEqual(config.git.branching_strategy, 'none');
    assert.ok(config.workflow && typeof config.workflow === 'object');
    assert.strictEqual(config.workflow.nyquist_validation, true);
  });

  test('is idempotent — returns already_exists if config exists', () => {
    // 1回目の呼び出し: 作成
    const choices = JSON.stringify({ mode: 'yolo', granularity: 'fine' });
    const first = runThruntTools(['config-new-program', choices], tmpDir);
    assert.ok(first.success, `First call failed: ${first.error}`);
    const firstOut = JSON.parse(first.output);
    assert.strictEqual(firstOut.created, true);

    // 2回目の呼び出し: 冪等性の確認
    const second = runThruntTools(['config-new-program', choices], tmpDir);
    assert.ok(second.success, `Second call failed: ${second.error}`);
    const secondOut = JSON.parse(second.output);
    assert.strictEqual(secondOut.created, false);
    assert.strictEqual(secondOut.reason, 'already_exists');

    // 設定が変更されていない
    const config = readConfig(tmpDir);
    assert.strictEqual(config.mode, 'yolo');
    assert.strictEqual(config.granularity, 'fine');
  });

  test('auto_advance in workflow choices is preserved', () => {
    const choices = JSON.stringify({
      mode: 'yolo',
      granularity: 'standard',
      workflow: { research: true, plan_check: true, validator: true, nyquist_validation: true, auto_advance: true },
    });
    const result = runThruntTools(['config-new-program', choices], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.workflow.auto_advance, true);
  });

  test('rejects invalid JSON choices', () => {
    const result = runThruntTools(['config-new-program', '{not-json}'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Invalid JSON'), `Expected "Invalid JSON" in: ${result.error}`);
  });

  test('output JSON has created:true on success', () => {
    const choices = JSON.stringify({ mode: 'interactive', granularity: 'standard' });
    const result = runThruntTools(['config-new-program', choices], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.created, true);
    assert.strictEqual(out.path, '.planning/config.json');
  });
});
```

- [ ] **ステップ 1.2: 失敗するテストを実行して失敗を確認する**

```bash
cd /Users/diego/Dev/thrunt-god
node --test tests/config.test.cjs 2>&1 | grep -E "config-new-program|FAIL|Error"
```

期待結果: すべての `config-new-program` テストが "config-new-program is not a valid command" などのエラーで失敗する。

- [ ] **ステップ 1.3: config.cjs に `buildNewProgramConfig` と `cmdConfigNewProgram` を実装する**

`thrunt-god/bin/lib/config.cjs` の `validateKnownConfigKeyPath` 関数の後（35行目付近）、`ensureConfigFile` の前に以下を追加する:

```js
/**
 * 新規プロジェクト用の完全展開された設定を構築する。
 *
 * 以下の優先順位（昇順）でマージする:
 *   1. ハードコードされたデフォルト値
 *   2. ~/.thrunt/defaults.json のユーザーレベルデフォルト（存在する場合）
 *   3. userChoices（new-program 時にユーザーが明示的に選択した設定）
 *
 * プレーンオブジェクトを返す — ファイルの書き込みは行わない。
 */
function buildNewProgramConfig(cwd, userChoices) {
  const choices = userChoices || {};
  const homedir = require('os').homedir();

  // Brave Search API キーの利用可能性を検出
  const braveKeyFile = path.join(homedir, '.thrunt', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // ~/.thrunt/defaults.json からユーザーレベルのデフォルトを読み込む（存在する場合）
  const globalDefaultsPath = path.join(homedir, '.thrunt', 'defaults.json');
  let userDefaults = {};
  try {
    if (fs.existsSync(globalDefaultsPath)) {
      userDefaults = JSON.parse(fs.readFileSync(globalDefaultsPath, 'utf-8'));
      // 非推奨の "depth" キーを "granularity" に移行
      if ('depth' in userDefaults && !('granularity' in userDefaults)) {
        const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };
        userDefaults.granularity = depthToGranularity[userDefaults.depth] || userDefaults.depth;
        delete userDefaults.depth;
        try {
          fs.writeFileSync(globalDefaultsPath, JSON.stringify(userDefaults, null, 2), 'utf-8');
        } catch {}
      }
    }
  } catch {
    // 不正なグローバルデフォルトは無視
  }

  const hardcoded = {
    model_profile: 'balanced',
    commit_docs: true,
    parallelization: true,
    search_gitignored: false,
    brave_search: hasBraveSearch,
    git: {
      branching_strategy: 'none',
      phase_branch_template: 'thrunt/phase-{phase}-{slug}',
      milestone_branch_template: 'thrunt/{milestone}-{slug}',
    },
    workflow: {
      research: true,
      plan_check: true,
      validator: true,
      nyquist_validation: true,
    },
  };

  // 3段階マージ: hardcoded <- userDefaults <- choices
  return {
    ...hardcoded,
    ...userDefaults,
    ...choices,
    git: {
      ...hardcoded.git,
      ...(userDefaults.git || {}),
      ...(choices.git || {}),
    },
    workflow: {
      ...hardcoded.workflow,
      ...(userDefaults.workflow || {}),
      ...(choices.workflow || {}),
    },
  };
}

/**
 * コマンド: 新規プロジェクト用の完全展開された .planning/config.json を作成する。
 *
 * ユーザーが選択した設定を JSON 文字列として受け取る（/hunt:new-program 時に
 * ユーザーが明示的に設定したキー）。残りのキーはハードコードされたデフォルトと
 * オプションの ~/.thrunt/defaults.json から補完される。
 *
 * 冪等: config.json が既に存在する場合は { created: false } を返す。
 */
function cmdConfigNewProgram(cwd, choicesJson, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const planningDir = path.join(cwd, '.planning');

  // 冪等: 既存の設定を上書きしない
  if (fs.existsSync(configPath)) {
    output({ created: false, reason: 'already_exists' }, raw, 'exists');
    return;
  }

  // ユーザーの選択をパース
  let userChoices = {};
  if (choicesJson && choicesJson.trim() !== '') {
    try {
      userChoices = JSON.parse(choicesJson);
    } catch (err) {
      error('Invalid JSON for config-new-program: ' + err.message);
    }
  }

  // .planning ディレクトリが存在することを確認
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  const config = buildNewProgramConfig(cwd, userChoices);

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    output({ created: true, path: '.planning/config.json' }, raw, 'created');
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}
```

また、`config.cjs` の末尾にある `module.exports` に `cmdConfigNewProgram` を追加する。

- [ ] **ステップ 1.4: テストを実行してパスすることを確認する**

```bash
cd /Users/diego/Dev/thrunt-god
node --test tests/config.test.cjs 2>&1 | tail -20
```

期待結果: すべての `config-new-program` テストがパスする。既存テストも引き続きパスする。

- [ ] **ステップ 1.5: コミット**

```bash
cd /Users/diego/Dev/thrunt-god
git add thrunt-god/bin/lib/config.cjs tests/config.test.cjs
git commit -m "feat: add config-new-program command for full config materialization"
```

---

## タスク 2: thrunt-tools.cjs に `config-new-program` を登録する

**ファイル:**

- 変更: `thrunt-god/bin/thrunt-tools.cjs`

- [ ] **ステップ 2.1: thrunt-tools.cjs の switch 文に case を追加する**

`config-get` の case の後（401行目付近）に以下を追加する:

```js
    case 'config-new-program': {
      config.cmdConfigNewProgram(cwd, args[1], raw);
      break;
    }
```

また、178行目の usage 文字列を更新して `config-new-program` を含める:

変更前: `...config-ensure-section, init`
変更後: `...config-ensure-section, config-new-program, init`

- [ ] **ステップ 2.2: CLI 登録のスモークテスト**

```bash
cd /Users/diego/Dev/thrunt-god
node thrunt-god/bin/thrunt-tools.cjs config-new-program '{"mode":"interactive","granularity":"standard"}' --cwd /tmp/thrunt-smoke-$(date +%s)
```

期待結果: `{"created":true,"path":".planning/config.json"}` （または類似の出力）が表示される。

クリーンアップ: `rm -rf /tmp/thrunt-smoke-*`

- [ ] **ステップ 2.3: フルテストスイートを実行する**

```bash
cd /Users/diego/Dev/thrunt-god
node --test tests/config.test.cjs 2>&1 | tail -10
```

期待結果: すべてパスする。

- [ ] **ステップ 2.4: コミット**

```bash
cd /Users/diego/Dev/thrunt-god
git add thrunt-god/bin/thrunt-tools.cjs
git commit -m "feat: register config-new-program in thrunt-tools CLI router"
```

---

## タスク 3: hunt-bootstrap.md ワークフローを config-new-program を使うように更新する

**ファイル:**

- 変更: `thrunt-god/workflows/hunt-bootstrap.md`

これが中心となる変更。2箇所を更新する必要がある:

- **ステップ 2a**（自動モードでの設定作成、168〜195行目付近）
- **ステップ 5**（対話モードでの設定作成、470〜498行目付近）

- [ ] **ステップ 3.1: ステップ 2a（自動モード）を更新する**

ステップ 2a で config.json を作成しているブロックを探す:

```markdown
Create `.planning/config.json` with mode set to "yolo":

```json
{
  "mode": "yolo",
  "granularity": "[selected]",
  ...
}
```

```

インライン JSON 書き込みの指示を以下に置き換える:

```markdown
Create `.planning/config.json` using the CLI (fills in all defaults automatically):

```bash
mkdir -p .planning
node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" config-new-program "$(cat <<'CHOICES'
{
  "mode": "yolo",
  "granularity": "[selected: coarse|standard|fine]",
  "parallelization": [true|false],
  "commit_docs": [true|false],
  "model_profile": "[selected: quality|balanced|budget|inherit]",
  "workflow": {
    "research": [true|false],
    "plan_check": [true|false],
    "validator": [true|false],
    "nyquist_validation": [true|false],
    "auto_advance": true
  }
}
CHOICES
)"
```

このコマンドはユーザーの選択をすべてのランタイムデフォルト（`search_gitignored`、`brave_search`、`git` セクション）とマージし、完全に展開された設定を生成する。

```

- [ ] **ステップ 3.2: ステップ 5（対話モード）を更新する**

ステップ 5 で config.json を作成しているブロックを探す:

```markdown
Create `.planning/config.json` with all settings:

```json
{
  "mode": "yolo|interactive",
  ...
}
```

```

以下に置き換える:

```markdown
Create `.planning/config.json` using the CLI (fills in all defaults automatically):

```bash
mkdir -p .planning
node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" config-new-program "$(cat <<'CHOICES'
{
  "mode": "[selected: yolo|interactive]",
  "granularity": "[selected: coarse|standard|fine]",
  "parallelization": [true|false],
  "commit_docs": [true|false],
  "model_profile": "[selected: quality|balanced|budget|inherit]",
  "workflow": {
    "research": [true|false],
    "plan_check": [true|false],
    "validator": [true|false],
    "nyquist_validation": [true|false]
  }
}
CHOICES
)"
```

このコマンドはユーザーの選択をすべてのランタイムデフォルト（`search_gitignored`、`brave_search`、`git` セクション）とマージし、完全に展開された設定を生成する。

```

- [ ] **ステップ 3.3: ワークフローファイルが正しく読めることを確認する**

```bash
cd /Users/diego/Dev/thrunt-god
grep -n "config-new-program\|config\.json\|CHOICES" thrunt-god/workflows/hunt-bootstrap.md
```

期待結果: `config-new-program` が2箇所（各ステップに1つ）で出現し、設定作成用のインライン JSON テンプレートがなくなっている。

- [ ] **ステップ 3.4: コミット**

```bash
cd /Users/diego/Dev/thrunt-god
git add thrunt-god/workflows/hunt-bootstrap.md
git commit -m "feat: use config-new-program in new-program workflow for full config materialization"
```

---

## タスク 4: 検証

- [ ] **ステップ 4.1: フルテストスイートを実行する**

```bash
cd /Users/diego/Dev/thrunt-god
node --test tests/ 2>&1 | tail -30
```

期待結果: すべてのテストがパスする（リグレッションなし）。

- [ ] **ステップ 4.2: 手動のエンドツーエンド検証**

`hunt-bootstrap.md` が新規プロジェクトに対して行う処理をシミュレートする:

```bash
# 新しいプロジェクトディレクトリを作成
TMP=$(mktemp -d)
cd "$TMP"

# ステップ 1 のシミュレーション: init new-program の実行結果
node /Users/diego/Dev/thrunt-god/thrunt-god/bin/thrunt-tools.cjs init new-program --cwd "$TMP"

# ステップ 5 のシミュレーション: 完全な設定を作成
node /Users/diego/Dev/thrunt-god/thrunt-god/bin/thrunt-tools.cjs config-new-program '{
  "mode": "interactive",
  "granularity": "standard",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "balanced",
  "workflow": {
    "research": true,
    "plan_check": true,
    "validator": true,
    "nyquist_validation": true
  }
}' --cwd "$TMP"

# ファイルに期待される12個のキーがすべて含まれていることを確認
echo "=== Generated config.json ==="
cat "$TMP/.planning/config.json"

# クリーンアップ
rm -rf "$TMP"
```

期待される出力: `mode`、`granularity`、`model_profile`、`commit_docs`、`parallelization`、`search_gitignored`、`brave_search`、`git`（サブキー3つ）、`workflow`（サブキー4つ）を含む config.json — トップレベルキーは合計12個（`git` と `workflow` を単一キーとして数える場合は10個）。

- [ ] **ステップ 4.3: 冪等性の確認**

```bash
TMP=$(mktemp -d)
CHOICES='{"mode":"yolo","granularity":"coarse"}'

node /Users/diego/Dev/thrunt-god/thrunt-god/bin/thrunt-tools.cjs config-new-program "$CHOICES" --cwd "$TMP"
FIRST=$(cat "$TMP/.planning/config.json")

# 2回目の呼び出しは何も変更しないはず
node /Users/diego/Dev/thrunt-god/thrunt-god/bin/thrunt-tools.cjs config-new-program "$CHOICES" --cwd "$TMP"
SECOND=$(cat "$TMP/.planning/config.json")

[ "$FIRST" = "$SECOND" ] && echo "IDEMPOTENT: OK" || echo "IDEMPOTENT: FAIL"
rm -rf "$TMP"
```

期待結果: `IDEMPOTENT: OK`

- [ ] **ステップ 4.4: loadConfig が新しいフォーマットを正しく読み込めることを確認する**

```bash
TMP=$(mktemp -d)
node /Users/diego/Dev/thrunt-god/thrunt-god/bin/thrunt-tools.cjs config-new-program '{
  "mode":"yolo","granularity":"standard","parallelization":true,"commit_docs":true,
  "model_profile":"balanced",
  "workflow":{"research":true,"plan_check":false,"validator":true,"nyquist_validation":true}
}' --cwd "$TMP"

# loadConfig が正しく plan_check（workflow.plan_check としてネスト）を読み取るか
node /Users/diego/Dev/thrunt-god/thrunt-god/bin/thrunt-tools.cjs config-get workflow.plan_check --cwd "$TMP"
# 期待値: false

node /Users/diego/Dev/thrunt-god/thrunt-god/bin/thrunt-tools.cjs config-get git.branching_strategy --cwd "$TMP"
# 期待値: "none"

rm -rf "$TMP"
```

- [ ] **ステップ 4.5: 最終フルテストスイート + コミット**

```bash
cd /Users/diego/Dev/thrunt-god
node --test tests/ 2>&1 | grep -E "pass|fail|error" | tail -5
```

期待結果: すべてパス、失敗0件。

---

## 付録: アップストリーム向け PR 説明文

```
feat: materialize all config defaults at new-program initialization

**問題:**
`/hunt:new-program` はオンボーディング時にユーザーが明示的に選択した6つのキーのみで
`.planning/config.json` を作成する。5つの追加キー
（`search_gitignored`、`brave_search`、`git.branching_strategy`、
`git.phase_branch_template`、`git.milestone_branch_template`）は実行時に
`loadConfig()` が暗黙的に解決するが、ディスクには書き込まれない。

これにより2つの問題が生じる:
1. **発見可能性**: ユーザーがソースコードを読まない限り `git.branching_strategy` を
   確認・理解できない — 設定ファイルに表示されない。
2. **暗黙的な拡張**: `/thrunt:settings` や `config-set` が初めて設定に書き込む際にも、
   これらのキーは追加されない。設定ファイルは実効設定のごく一部しか反映しない。

**解決策:**
`thrunt-tools.cjs` に `config-new-program` CLI コマンドを追加する。このコマンドは:
- ユーザーが選択した値を JSON として受け取る
- すべてのランタイムデフォルト（環境検出される `brave_search` を含む）とマージする
- 完全に展開された設定を一度に書き込む

`hunt-bootstrap.md` ワークフロー（ステップ 2a と 5）を更新し、ハードコードされた部分的な
JSON テンプレートの書き込みの代わりにこのコマンドを呼び出すようにする。デフォルト値は
`config.cjs` の `buildNewProgramConfig()` という一箇所だけで管理される。

**保守的なアプローチである理由:**
- `loadConfig()`、`ensureConfigFile()`、その他の読み取りパスに変更なし
- 新しい設定キーの導入なし
- セマンティクスの変更なし — システムが既に暗黙的に解決していたのと同じ値
- 完全な後方互換性: `loadConfig()` は古い部分的フォーマット（既存プロジェクト）と
  新しい完全フォーマットの両方を引き続き処理可能
- 冪等: `config-new-program` を2回呼んでも安全
- 新しいユーザー向けフラグなし

**発見可能性が向上する理由:**
初めて `.planning/config.json` を開いた開発者が `git.branching_strategy: "none"` を
見て、THRUNT のソースコードを読まなくてもブランチ戦略機能が利用可能で設定変更できることを
即座に理解できるようになる。
```
