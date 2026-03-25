# THRUNT ユーザーガイド

ワークフロー、トラブルシューティング、設定の詳細なリファレンスです。クイックスタートの設定については、[README](../README.md) をご覧ください。

---

## 目次

- [ワークフロー図](#ワークフロー図)
- [UI デザインコントラクト](#ui-デザインコントラクト)
- [バックログとスレッド](#バックログとスレッド)
- [ワークストリーム](#ワークストリーム)
- [セキュリティ](#セキュリティ)
- [コマンドリファレンス](#コマンドリファレンス)
- [設定リファレンス](#設定リファレンス)
- [使用例](#使用例)
- [トラブルシューティング](#トラブルシューティング)
- [リカバリークイックリファレンス](#リカバリークイックリファレンス)

---

## ワークフロー図

### プロジェクト全体のライフサイクル

```
  ┌──────────────────────────────────────────────────┐
  │                   NEW PROJECT                    │
  │  /hunt:new-program                                │
  │  Questions -> Research -> Hypotheses -> Huntmap│
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      FOR EACH PHASE:       │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /hunt:shape-hypothesis │    │  <- Lock in preferences
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /thrunt:ui-phase      │    │  <- Design contract (frontend)
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /hunt:plan    │    │  <- Research + Plan + Verify
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /hunt:run │    │  <- Parallel execution
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /hunt:validate-findings   │    │  <- Manual Evidence Review
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /hunt:publish          │    │  <- Create PR (optional)
             │  └──────────┬─────────┘    │
             │             │              │
             │     Next Phase?────────────┘
             │             │ No
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /thrunt:audit-milestone        │
            │  /thrunt:complete-milestone     │
            └───────────────┬──────────────┘
                            │
                   Another milestone?
                       │          │
                      Yes         No -> Done!
                       │
               ┌───────▼──────────────┐
               │  /hunt:new-program  │
               └──────────────────────┘
```

### プランニングエージェントの連携

```
  /hunt:plan N
         │
         ├── Phase Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads MISSION.md, HYPOTHESES.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ PLAN files │
         │                        └────────────┘
         └── Done
```

### バリデーションアーキテクチャ（Nyquist レイヤー）

hunt-plan のリサーチ時に、THRUNT はコードが書かれる前に各フェーズ要件に対する自動テストカバレッジをマッピングします。これにより、Claude のエグゼキューターがタスクをコミットした際に、数秒以内で検証できるフィードバックメカニズムが既に存在することが保証されます。

リサーチャーは既存のテストインフラを検出し、各要件を特定のテストコマンドにマッピングし、実装開始前に作成が必要なテストスキャフォールディングを特定します（Wave 0 タスク）。

プランチェッカーはこれを8番目の検証次元として強制します：自動検証コマンドが不足しているタスクを含むプランは承認されません。

**出力：** `{phase}-VALIDATION.md` -- フェーズのフィードバックコントラクト。

**無効化：** テストインフラが重視されないラピッドプロトタイピングフェーズでは、`/thrunt:settings` で `workflow.nyquist_validation: false` を設定してください。

### 遡及バリデーション (`/thrunt:validate-phase`)

Nyquist バリデーションが存在する前に実行されたフェーズ、または従来のテストスイートのみを持つ既存コードベースに対して、遡及的に監査しカバレッジのギャップを埋めます：

```
  /thrunt:validate-phase N
         |
         +-- Detect state (VALIDATION.md exists? SUMMARY.md exists?)
         |
         +-- Discover: scan implementation, map requirements to tests
         |
         +-- Analyze gaps: which requirements lack automated validation?
         |
         +-- Present gap plan for approval
         |
         +-- Spawn auditor: generate tests, run, debug (max 3 attempts)
         |
         +-- Update VALIDATION.md
               |
               +-- COMPLIANT -> all requirements have automated checks
               +-- PARTIAL -> some gaps escalated to manual-only
```

オーディターは実装コードを変更しません — テストファイルと VALIDATION.md のみを変更します。テストが実装のバグを発見した場合、対処が必要なエスカレーションとしてフラグが立てられます。

**使用タイミング：** Nyquist が有効化される前にプランニングされたフェーズを実行した後、または `/thrunt:audit-milestone` が Nyquist コンプライアンスのギャップを検出した後。

### 前提確認ディスカッションモード

デフォルトでは、`/hunt:shape-hypothesis` は実装の好みについてオープンエンドな質問を行います。前提確認モードではこれを反転させます：THRUNT がまずコードベースを読み込み、フェーズの構築方法に関する構造化された前提を提示し、修正が必要な箇所のみを確認します。

**有効化：** `/thrunt:settings` で `workflow.discuss_mode` を `'assumptions'` に設定します。

**動作の仕組み：**
1. MISSION.md、コードベースマッピング、既存の規約を読み込む
2. 前提の構造化リストを生成（技術選定、パターン、ファイル配置）
3. 前提を提示し、確認・修正・補足を求める
4. 確認された前提から CONTEXT.md を作成

**使用タイミング：**
- コードベースを熟知している経験豊富な開発者
- オープンエンドな質問が作業を遅らせる高速イテレーション
- パターンが確立されていて予測可能なプロジェクト

ディスカッションモードの完全なリファレンスは [docs/workflow-discuss-mode.md](../workflow-discuss-mode.md) をご覧ください。

---

## UI デザインコントラクト

### 背景

AI 生成のフロントエンドの見た目が一貫しないのは、Claude Code の UI 能力が低いからではなく、実行前にデザインコントラクトが存在しなかったためです。共通のスペーシングスケール、カラーコントラクト、コピーライティング基準なしに構築された5つのコンポーネントは、5つのわずかに異なるビジュアル上の判断を生み出します。

`/thrunt:ui-phase` はプランニング前にデザインコントラクトを確定させます。`/thrunt:ui-review` は実行後に結果を監査します。

### コマンド

| コマンド | 説明 |
|---------|-------------|
| `/thrunt:ui-phase [N]` | フロントエンドフェーズ用の UI-SPEC.md デザインコントラクトを生成 |
| `/thrunt:ui-review [N]` | 実装済み UI の遡及的6ピラービジュアル監査 |

### ワークフロー：`/thrunt:ui-phase`

**実行タイミング：** `/hunt:shape-hypothesis` の後、`/hunt:plan` の前 — フロントエンド/UI 作業を含むフェーズで使用。

**フロー：**
1. CONTEXT.md、RESEARCH.md、HYPOTHESES.md を読み込んで既存の決定事項を確認
2. デザインシステムの状態を検出（shadcn components.json、Tailwind 設定、既存トークン）
3. shadcn 初期化ゲート — React/Next.js/Vite プロジェクトで未設定の場合、初期化を提案
4. 未回答のデザインコントラクト質問のみを確認（スペーシング、タイポグラフィ、カラー、コピーライティング、レジストリの安全性）
5. `{phase}-UI-SPEC.md` をフェーズディレクトリに書き出す
6. 6つの次元で検証（コピーライティング、ビジュアル、カラー、タイポグラフィ、スペーシング、レジストリの安全性）
7. BLOCKED の場合はリビジョンループ（最大2回）

**出力：** `.planning/phases/{phase-dir}/` 内の `{padded_phase}-UI-SPEC.md`

### ワークフロー：`/thrunt:ui-review`

**実行タイミング：** `/hunt:run` または `/hunt:validate-findings` の後 — フロントエンドコードを含むプロジェクトで使用。

**スタンドアロン：** THRUNT 管理プロジェクトに限らず、あらゆるプロジェクトで動作します。UI-SPEC.md が存在しない場合は、抽象的な6ピラー基準に基づいて監査します。

**6ピラー（各1-4点）：**
1. コピーライティング — CTA ラベル、空状態、エラー状態
2. ビジュアル — フォーカルポイント、ビジュアルヒエラルキー、アイコンのアクセシビリティ
3. カラー — アクセントカラーの使用規律、60/30/10 準拠
4. タイポグラフィ — フォントサイズ/ウェイト制約の遵守
5. スペーシング — グリッド整列、トークンの一貫性
6. エクスペリエンスデザイン — ローディング/エラー/空状態のカバレッジ

**出力：** フェーズディレクトリ内の `{padded_phase}-UI-REVIEW.md`（スコアと優先度の高い修正点トップ3）。

### 設定

| 設定 | デフォルト | 説明 |
|---------|---------|-------------|
| `workflow.ui_phase` | `true` | フロントエンドフェーズ用の UI デザインコントラクトを生成 |
| `workflow.ui_safety_gate` | `true` | hunt-plan 時にフロントエンドフェーズで /thrunt:ui-phase の実行を促す |

どちらも「未設定＝有効」パターンに従います。`/thrunt:settings` から無効化できます。

### shadcn の初期化

React/Next.js/Vite プロジェクトの場合、UI リサーチャーは `components.json` が見つからない場合に shadcn の初期化を提案します。フローは以下の通りです：

1. `ui.shadcn.com/create` にアクセスしてプリセットを設定
2. プリセット文字列をコピー
3. `npx shadcn init --preset {paste}` を実行
4. プリセットはデザインシステム全体をエンコード — カラー、ボーダーラディウス、フォント

プリセット文字列は THRUNT の第一級プランニングアーティファクトとなり、フェーズやマイルストーンをまたいで再現可能です。

### レジストリの安全性ゲート

サードパーティの shadcn レジストリは任意のコードを注入できます。安全性ゲートでは以下が必要です：
- `npx shadcn view {component}` — インストール前に確認
- `npx shadcn diff {component}` — 公式との比較

`workflow.ui_safety_gate` 設定トグルで制御します。

### スクリーンショットの保存

`/thrunt:ui-review` は Playwright CLI を使用してスクリーンショットを `.planning/ui-reviews/` にキャプチャします。バイナリファイルが git に含まれないよう、`.gitignore` が自動的に作成されます。スクリーンショットは `/thrunt:complete-milestone` 時にクリーンアップされます。

---

## バックログとスレッド

### バックログパーキングロット

アクティブなプランニングの準備ができていないアイデアは、999.x 番号を使用してバックログに格納され、アクティブなフェーズシーケンスの外に保持されます。

```
/thrunt:add-backlog "GraphQL API layer"     # Creates 999.1-graphql-api-layer/
/thrunt:add-backlog "Mobile responsive"     # Creates 999.2-mobile-responsive/
```

バックログアイテムは完全なフェーズディレクトリを取得するため、`/hunt:shape-hypothesis 999.1` でアイデアをさらに探索したり、準備が整ったら `/hunt:plan 999.1` を使用できます。

**レビューとプロモーション** は `/thrunt:review-backlog` で行います — すべてのバックログアイテムを表示し、プロモーション（アクティブシーケンスへの移動）、保持（バックログに残す）、または削除を選択できます。

### シード

シードは、トリガー条件を持つ将来を見据えたアイデアです。バックログアイテムとは異なり、適切なマイルストーンが到来すると自動的に表面化されます。

```
/thrunt:plant-seed "Add real-time collab when WebSocket infra is in place"
```

シードは完全な WHY と表面化タイミングを保持します。`/hunt:new-program` はすべてのシードをスキャンし、一致するものを提示します。

**保存場所：** `.planning/seeds/SEED-NNN-slug.md`

### 永続コンテキストスレッド

スレッドは、複数のセッションにまたがるが特定のフェーズに属さない作業のための、軽量なクロスセッション知識ストアです。

```
/thrunt:thread                              # List all threads
/thrunt:thread fix-deploy-key-auth          # Resume existing thread
/thrunt:thread "Investigate TCP timeout"    # Create new thread
```

スレッドは `/thrunt:pause-work` より軽量です — フェーズ状態やプランコンテキストはありません。各スレッドファイルには Goal、Context、References、Next Steps セクションが含まれます。

スレッドは成熟した段階でフェーズ (`/thrunt:add-phase`) やバックログアイテム (`/thrunt:add-backlog`) にプロモーションできます。

**保存場所：** `.planning/threads/{slug}.md`

---

## ワークストリーム

ワークストリームを使うと、状態の衝突なしに複数のマイルストーン領域で並行作業できます。各ワークストリームは独立した `.planning/` 状態を持つため、切り替え時に進捗が上書きされることはありません。

**使用タイミング：** 異なる関心領域にまたがるマイルストーン機能（例：バックエンド API とフロントエンドダッシュボード）に取り組んでいて、コンテキストの混在なしに独立してプランニング・実行・ディスカッションしたい場合。

### コマンド

| コマンド | 用途 |
|---------|---------|
| `/thrunt:workstreams create <name>` | 独立したプランニング状態を持つ新しいワークストリームを作成 |
| `/thrunt:workstreams switch <name>` | アクティブコンテキストを別のワークストリームに切り替え |
| `/thrunt:workstreams list` | すべてのワークストリームとアクティブなものを表示 |
| `/thrunt:workstreams complete <name>` | ワークストリームを完了としてマークし、状態をアーカイブ |

### 動作の仕組み

各ワークストリームは独自の `.planning/` ディレクトリサブツリーを維持します。ワークストリームを切り替えると、THRUNT はアクティブなプランニングコンテキストを入れ替え、`/thrunt:progress`、`/hunt:shape-hypothesis`、`/hunt:plan` などのコマンドがそのワークストリームの状態に対して動作するようにします。

これは `/thrunt:new-workspace`（別のリポジトリワークツリーを作成）より軽量です。ワークストリームは同じコードベースと git 履歴を共有しつつ、プランニングアーティファクトを分離します。

---

## セキュリティ

### 多層防御（v1.27）

THRUNT はマークダウンファイルを生成し、それが LLM のシステムプロンプトとなります。これは、プランニングアーティファクトに流入するユーザー制御テキストが、潜在的な間接プロンプトインジェクションベクターであることを意味します。v1.27 では集中型セキュリティ強化が導入されました：

**パストラバーサル防止：**
すべてのユーザー提供ファイルパス（`--text-file`、`--prd`）は、プロジェクトディレクトリ内に解決されることが検証されます。macOS の `/var` → `/private/var` シンボリックリンク解決にも対応しています。

**プロンプトインジェクション検出：**
`security.cjs` モジュールは、ユーザー提供テキストがプランニングアーティファクトに入る前に、既知のインジェクションパターン（ロールオーバーライド、インストラクションバイパス、system タグインジェクション）をスキャンします。

**ランタイムフック：**
- `thrunt-prompt-guard.js` — `.planning/` への Write/Edit 呼び出しをインジェクションパターンでスキャン（常時有効、アドバイザリーのみ）
- `thrunt-workflow-guard.js` — THRUNT ワークフローコンテキスト外でのファイル編集を警告（`hooks.workflow_guard` でオプトイン）

**CI スキャナー：**
`prompt-injection-scan.test.cjs` は、すべてのエージェント、ワークフロー、コマンドファイルに埋め込まれたインジェクションベクターをスキャンします。テストスイートの一部として実行されます。

---

### 実行ウェーブの調整

```
  /hunt:run N
         │
         ├── Analyze plan dependencies
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh 200K context) -> commit
         │     └── Executor B (fresh 200K context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh 200K context) -> commit
         │
         └── Verifier
               └── Check codebase against phase goals
                     │
                     ├── PASS -> FINDINGS.md (success)
                     └── FAIL -> Issues logged for /hunt:validate-findings
```

### ブラウンフィールドワークフロー（既存コードベース）

```
  /hunt:map-environment
         │
         ├── Stack Mapper     -> codebase/STACK.md
         ├── Arch Mapper      -> codebase/ARCHITECTURE.md
         ├── Convention Mapper -> codebase/CONVENTIONS.md
         └── Concern Mapper   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /hunt:new-program │  <- Questions focus on what you're ADDING
        └──────────────────┘
```

---

## コマンドリファレンス

### コアワークフロー

| コマンド | 用途 | 使用タイミング |
|---------|---------|-------------|
| `/hunt:new-program` | フルプロジェクト初期化：質問、リサーチ、要件定義、ロードマップ | 新規プロジェクトの開始時 |
| `/hunt:new-program --auto @idea.md` | ドキュメントからの自動初期化 | PRD やアイデアドキュメントが準備済みの場合 |
| `/hunt:shape-hypothesis [N]` | 実装上の決定事項を記録 | プランニング前に、構築方法を決定するため |
| `/thrunt:ui-phase [N]` | UI デザインコントラクトを生成 | shape-hypothesis の後、hunt-plan の前（フロントエンドフェーズ） |
| `/hunt:plan [N]` | リサーチ + プランニング + 検証 | フェーズ実行前 |
| `/hunt:run <N>` | すべてのプランを並列ウェーブで実行 | プランニング完了後 |
| `/hunt:validate-findings [N]` | 自動診断付き手動 Evidence Review | 実行完了後 |
| `/hunt:publish [N]` | 検証済みの作業から PR を作成 | 検証合格後 |
| `/thrunt:fast <text>` | インラインの軽微なタスク — プランニングを完全にスキップ | タイプミス修正、設定変更、小規模リファクタリング |
| `/thrunt:next` | 状態を自動検出して次のステップを実行 | いつでも — 「次に何をすべき？」 |
| `/thrunt:ui-review [N]` | 遡及的6ピラービジュアル監査 | 実行後または validate-findings 後（フロントエンドプロジェクト） |
| `/thrunt:audit-milestone` | マイルストーンの完了定義を満たしているか検証 | マイルストーン完了前 |
| `/thrunt:complete-milestone` | マイルストーンをアーカイブし、リリースタグを作成 | 全フェーズの検証完了後 |
| `/hunt:new-program [name]` | 次のバージョンサイクルを開始 | マイルストーン完了後 |

### ナビゲーション

| コマンド | 用途 | 使用タイミング |
|---------|---------|-------------|
| `/thrunt:progress` | 状態と次のステップを表示 | いつでも -- 「今どこにいる？」 |
| `/thrunt:resume-work` | 前回のセッションからフルコンテキストを復元 | 新しいセッションの開始時 |
| `/thrunt:pause-work` | 構造化されたハンドオフを保存（HANDOFF.json + continue-here.md） | フェーズの途中で作業を中断する時 |
| `/thrunt:session-report` | 作業内容と成果を含むセッションサマリーを生成 | セッション終了時、ステークホルダーへの共有時 |
| `/thrunt:help` | すべてのコマンドを表示 | クイックリファレンス |
| `/thrunt:update` | 変更履歴プレビュー付きで THRUNT を更新 | 新バージョンの確認時 |
| `/thrunt:join-discord` | Discord コミュニティの招待リンクを開く | 質問やコミュニティ参加時 |

### フェーズ管理

| コマンド | 用途 | 使用タイミング |
|---------|---------|-------------|
| `/thrunt:add-phase` | ロードマップに新しいフェーズを追加 | 初期プランニング後にスコープが拡大した場合 |
| `/thrunt:insert-phase [N]` | 緊急作業を挿入（小数番号） | マイルストーン中の緊急修正 |
| `/thrunt:remove-phase [N]` | 将来のフェーズを削除して番号を振り直す | 機能のスコープ縮小 |
| `/thrunt:list-phase-assumptions [N]` | Claude の意図するアプローチをプレビュー | プランニング前に方向性を確認 |
| `/thrunt:plan-milestone-gaps` | 監査ギャップに対するフェーズを作成 | 監査で不足項目が見つかった後 |
| `/hunt:shape-hypothesis [N]` | エコシステムの深いリサーチのみ | 複雑または不慣れなドメイン |

### ブラウンフィールドとユーティリティ

| コマンド | 用途 | 使用タイミング |
|---------|---------|-------------|
| `/hunt:map-environment` | 既存コードベースを分析 | 既存コードに対する `/hunt:new-program` の前 |
| `/thrunt:quick` | THRUNT 保証付きのアドホックタスク | バグ修正、小機能、設定変更 |
| `/thrunt:debug [desc]` | 永続状態を持つ体系的デバッグ | 何かが壊れた時 |
| `/thrunt:forensics` | ワークフロー障害の診断レポート | 状態、アーティファクト、git 履歴が破損していると思われる場合 |
| `/thrunt:add-todo [desc]` | 後でやるアイデアを記録 | セッション中にアイデアが浮かんだ時 |
| `/thrunt:check-todos` | 保留中の TODO を一覧表示 | 記録したアイデアのレビュー |
| `/thrunt:settings` | ワークフロートグルとモデルプロファイルを設定 | モデル変更、エージェントのトグル |
| `/thrunt:set-profile <profile>` | クイックプロファイル切り替え | コスト/品質トレードオフの変更 |
| `/thrunt:reapply-patches` | アップデート後にローカル変更を復元 | ローカル編集がある場合の `/thrunt:update` 後 |

### コード品質とレビュー

| コマンド | 用途 | 使用タイミング |
|---------|---------|-------------|
| `/thrunt:review --phase N` | 外部 CLI からのクロス AI ピアレビュー | 実行前にプランを検証 |
| `/thrunt:pr-branch` | `.planning/` コミットをフィルタリングしたクリーンな PR ブランチ | プランニングフリーの diff で PR を作成する前 |
| `/thrunt:audit-evidence` | 全フェーズの検証負債を監査 | マイルストーン完了前 |

### バックログとスレッド

| コマンド | 用途 | 使用タイミング |
|---------|---------|-------------|
| `/thrunt:add-backlog <desc>` | バックログパーキングロットにアイデアを追加（999.x） | アクティブなプランニングの準備ができていないアイデア |
| `/thrunt:review-backlog` | バックログアイテムのプロモーション/保持/削除 | 新マイルストーン前の優先順位付け |
| `/thrunt:plant-seed <idea>` | トリガー条件付きの将来を見据えたアイデア | 将来のマイルストーンで表面化すべきアイデア |
| `/thrunt:thread [name]` | 永続コンテキストスレッド | フェーズ構造外のクロスセッション作業 |

---

## 設定リファレンス

THRUNT はプロジェクト設定を `.planning/config.json` に保存します。`/hunt:new-program` 時に設定するか、後から `/thrunt:settings` で更新できます。

### 完全な config.json スキーマ

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "model_profile": "balanced",
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "validator": true,
    "nyquist_validation": true,
    "ui_phase": true,
    "ui_safety_gate": true,
    "research_before_questions": false,
    "discuss_mode": "discuss",
    "skip_discuss": false
  },
  "resolve_model_ids": false,
  "hooks": {
    "context_warnings": true,
    "workflow_guard": false
  },
  "git": {
    "branching_strategy": "none",
    "phase_branch_template": "thrunt/phase-{phase}-{slug}",
    "milestone_branch_template": "thrunt/{milestone}-{slug}",
    "quick_branch_template": null
  }
}
```

### コア設定

| 設定 | オプション | デフォルト | 制御内容 |
|---------|---------|---------|------------------|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` は決定を自動承認、`interactive` は各ステップで確認 |
| `granularity` | `coarse`, `standard`, `fine` | `standard` | フェーズの粒度：スコープの分割の細かさ（3-5、5-8、または 8-12 フェーズ） |
| `model_profile` | `quality`, `balanced`, `budget`, `inherit` | `balanced` | 各エージェントのモデルティア（下表を参照） |

### プランニング設定

| 設定 | オプション | デフォルト | 制御内容 |
|---------|---------|---------|------------------|
| `planning.commit_docs` | `true`, `false` | `true` | `.planning/` ファイルを git にコミットするかどうか |
| `planning.search_gitignored` | `true`, `false` | `false` | `.planning/` を含めるためにブロード検索に `--no-ignore` を追加 |

> **注：** `.planning/` が `.gitignore` に含まれている場合、設定値に関係なく `commit_docs` は自動的に `false` になります。

### ワークフロートグル

| 設定 | オプション | デフォルト | 制御内容 |
|---------|---------|---------|------------------|
| `workflow.research` | `true`, `false` | `true` | プランニング前のドメイン調査 |
| `workflow.plan_check` | `true`, `false` | `true` | プラン検証ループ（最大3回） |
| `workflow.validator` | `true`, `false` | `true` | 実行後のフェーズ目標に対する検証 |
| `workflow.nyquist_validation` | `true`, `false` | `true` | hunt-plan 時のバリデーションアーキテクチャリサーチ、8番目の plan-check 次元 |
| `workflow.ui_phase` | `true`, `false` | `true` | フロントエンドフェーズ用の UI デザインコントラクトを生成 |
| `workflow.ui_safety_gate` | `true`, `false` | `true` | hunt-plan 時にフロントエンドフェーズで /thrunt:ui-phase の実行を促す |
| `workflow.research_before_questions` | `true`, `false` | `false` | ディスカッション質問の後ではなく前にリサーチを実行 |
| `workflow.discuss_mode` | `discuss`, `assumptions` | `discuss` | ディスカッションスタイル：1つずつの質問 vs. コードベース駆動の前提確認 |
| `workflow.skip_discuss` | `true`, `false` | `false` | 自律モードで shape-hypothesis を完全にスキップ、HUNTMAP のフェーズ目標から最小限の CONTEXT.md を作成 |

### フック設定

| 設定 | オプション | デフォルト | 制御内容 |
|---------|---------|---------|------------------|
| `hooks.context_warnings` | `true`, `false` | `true` | コンテキストウィンドウ使用量の警告 |
| `hooks.workflow_guard` | `true`, `false` | `false` | THRUNT ワークフローコンテキスト外でのファイル編集の警告 |

慣れたドメインやトークン節約時に、ワークフロートグルを無効にしてフェーズを高速化できます。

### Git ブランチ戦略

| 設定 | オプション | デフォルト | 制御内容 |
|---------|---------|---------|------------------|
| `git.branching_strategy` | `none`, `phase`, `milestone` | `none` | ブランチ作成のタイミングと方法 |
| `git.phase_branch_template` | テンプレート文字列 | `thrunt/phase-{phase}-{slug}` | phase 戦略のブランチ名 |
| `git.milestone_branch_template` | テンプレート文字列 | `thrunt/{milestone}-{slug}` | milestone 戦略のブランチ名 |
| `git.quick_branch_template` | テンプレート文字列 または `null` | `null` | `/thrunt:quick` タスク用のオプションブランチ名 |

**ブランチ戦略の説明：**

| 戦略 | ブランチ作成 | スコープ | 最適な用途 |
|----------|---------------|-------|----------|
| `none` | なし | N/A | ソロ開発、シンプルなプロジェクト |
| `phase` | 各 `hunt-run` 時 | フェーズごとに1ブランチ | フェーズごとのコードレビュー、粒度の細かいロールバック |
| `milestone` | 最初の `hunt-run` 時 | 全フェーズで1ブランチを共有 | リリースブランチ、バージョンごとの PR |

**テンプレート変数：** `{phase}` = ゼロパディングされた番号（例："03"）、`{slug}` = 小文字ハイフン区切りの名前、`{milestone}` = バージョン（例："v1.0"）、`{num}` / `{quick}` = quick タスク ID（例："260317-abc"）。

quick タスクのブランチ設定例：

```json
"git": {
  "quick_branch_template": "thrunt/quick-{num}-{slug}"
}
```

### モデルプロファイル（エージェント別の内訳）

| エージェント | `quality` | `balanced` | `budget` | `inherit` |
|-------|-----------|------------|----------|-----------|
| thrunt-hunt-planner | Opus | Opus | Sonnet | Inherit |
| thrunt-huntmap-builder | Opus | Sonnet | Sonnet | Inherit |
| thrunt-telemetry-executor | Opus | Sonnet | Sonnet | Inherit |
| thrunt-query-writer | Opus | Sonnet | Haiku | Inherit |
| thrunt-signal-triager | Opus | Sonnet | Haiku | Inherit |
| thrunt-intel-synthesizer | Sonnet | Sonnet | Haiku | Inherit |
| thrunt-incident-debugger | Opus | Sonnet | Sonnet | Inherit |
| thrunt-environment-mapper | Sonnet | Haiku | Haiku | Inherit |
| thrunt-findings-validator | Sonnet | Sonnet | Haiku | Inherit |
| thrunt-hunt-checker | Sonnet | Sonnet | Haiku | Inherit |
| thrunt-evidence-correlator | Sonnet | Sonnet | Haiku | Inherit |

**プロファイルの方針：**
- **quality** -- すべての意思決定エージェントに Opus、読み取り専用の検証に Sonnet。クォータに余裕があり、重要な作業に使用。
- **balanced** -- プランニング（アーキテクチャの決定が行われる場所）にのみ Opus、それ以外は Sonnet。正当な理由があるデフォルト。
- **budget** -- コードを書くものには Sonnet、リサーチと検証には Haiku。大量作業や重要度の低いフェーズに使用。
- **inherit** -- すべてのエージェントが現在のセッションモデルを使用。モデルを動的に切り替える場合（例：OpenCode の `/model`）や、Claude Code を非 Anthropic プロバイダー（OpenRouter、ローカルモデル）で使用する場合に最適で、予期しない API コストを回避できます。非 Claude ランタイム（Codex、OpenCode、Gemini CLI）では、インストーラーが自動的に `resolve_model_ids: "omit"` を設定します -- [非 Claude ランタイムの使用](#非-claude-ランタイムの使用codexopencodegemini-cli)を参照。

---

## 使用例

### 新規プロジェクト（フルサイクル）

```bash
claude --dangerously-skip-permissions
/hunt:new-program            # 質問に回答、設定、ロードマップを承認
/clear
/hunt:shape-hypothesis 1        # 好みを確定
/thrunt:ui-phase 1             # デザインコントラクト（フロントエンドフェーズ）
/hunt:plan 1           # リサーチ + プラン + 検証
/hunt:run 1        # 並列実行
/hunt:validate-findings 1          # 手動 Evidence Review
/hunt:publish 1                 # 検証済み作業から PR を作成
/thrunt:ui-review 1            # ビジュアル監査（フロントエンドフェーズ）
/clear
/thrunt:next                   # 自動検出して次のステップを実行
...
/thrunt:audit-milestone        # すべて出荷されたか確認
/thrunt:complete-milestone     # アーカイブ、タグ付け、完了
/thrunt:session-report         # セッションサマリーを生成
```

### 既存ドキュメントからの新規プロジェクト

```bash
/hunt:new-program --auto @prd.md   # ドキュメントからリサーチ/要件/ロードマップを自動実行
/clear
/hunt:shape-hypothesis 1               # ここから通常のフロー
```

### 既存コードベース

```bash
/hunt:map-environment           # 既存のコードを分析（並列エージェント）
/hunt:new-program            # 追加する内容に焦点を当てた質問
# （ここから通常のフェーズワークフロー）
```

### クイックバグ修正

```bash
/thrunt:quick
> "Fix the login button not responding on mobile Safari"
```

### 休憩後の再開

```bash
/thrunt:progress               # 前回の続きと次のステップを確認
# または
/thrunt:resume-work            # 前回のセッションからフルコンテキストを復元
```

### リリース準備

```bash
/thrunt:audit-milestone        # 要件カバレッジを確認、スタブを検出
/thrunt:plan-milestone-gaps    # 監査でギャップが見つかった場合、フェーズを作成して埋める
/thrunt:complete-milestone     # アーカイブ、タグ付け、完了
```

### スピード vs 品質プリセット

| シナリオ | モード | 粒度 | プロファイル | リサーチ | プランチェック | ベリファイア |
|----------|------|-------|---------|----------|------------|----------|
| プロトタイピング | `yolo` | `coarse` | `budget` | オフ | オフ | オフ |
| 通常開発 | `interactive` | `standard` | `balanced` | オン | オン | オン |
| プロダクション | `interactive` | `fine` | `quality` | オン | オン | オン |

**自律モードでの shape-hypothesis スキップ：** `yolo` モードで実行中に、MISSION.md に既に十分な設定が記録されている場合は、`/thrunt:settings` で `workflow.skip_discuss: true` を設定してください。これにより shape-hypothesis を完全にバイパスし、HUNTMAP のフェーズ目標から最小限の CONTEXT.md を作成します。MISSION.md と規約がディスカッションで新しい情報を追加しないほど包括的な場合に有用です。

### マイルストーン中のスコープ変更

```bash
/thrunt:add-phase              # ロードマップに新しいフェーズを追加
# または
/thrunt:insert-phase 3         # フェーズ 3 と 4 の間に緊急作業を挿入
# または
/thrunt:remove-phase 7         # フェーズ 7 をスコープ外にして番号を振り直す
```

### マルチプロジェクトワークスペース

独立した THRUNT 状態を持つ複数のリポジトリや機能で並行作業できます。

```bash
# モノレポからリポジトリを含むワークスペースを作成
/thrunt:new-workspace --name feature-b --repos hr-ui,ZeymoAPI

# フィーチャーブランチの分離 — 独自の .planning/ を持つ現在のリポジトリのワークツリー
/thrunt:new-workspace --name feature-b --repos .

# ワークスペースに移動して THRUNT を初期化
cd ~/thrunt-workspaces/feature-b
/hunt:new-program

# ワークスペースの一覧と管理
/thrunt:list-workspaces
/thrunt:remove-workspace feature-b
```

各ワークスペースには以下が含まれます：
- 独自の `.planning/` ディレクトリ（ソースリポジトリから完全に独立）
- 指定されたリポジトリの Git ワークツリー（デフォルト）またはクローン
- メンバーリポジトリを追跡する `WORKSPACE.md` マニフェスト

---

## トラブルシューティング

### 「Project already initialized」

`/hunt:new-program` を実行したが、`.planning/MISSION.md` が既に存在しています。これは安全チェックです。やり直したい場合は、まず `.planning/` ディレクトリを削除してください。

### 長時間セッションでのコンテキスト劣化

主要なコマンド間でコンテキストウィンドウをクリアしてください：Claude Code では `/clear` を使用します。THRUNT はフレッシュなコンテキストを前提に設計されています — すべてのサブエージェントはクリーンな 200K ウィンドウを取得します。メインセッションで品質が低下している場合は、クリアして `/thrunt:resume-work` または `/thrunt:progress` で状態を復元してください。

### プランが誤っている、または方向性がずれている

プランニング前に `/hunt:shape-hypothesis [N]` を実行してください。プランの品質問題のほとんどは、CONTEXT.md があれば防げたはずの前提を Claude が置いてしまうことに起因します。`/thrunt:list-phase-assumptions [N]` を使用して、プランにコミットする前に Claude の意図を確認することもできます。

### 実行が失敗する、またはスタブが生成される

プランが野心的すぎなかったか確認してください。プランは最大2-3タスクにすべきです。タスクが大きすぎると、単一のコンテキストウィンドウで確実に生成できる範囲を超えてしまいます。より小さなスコープで再プランニングしてください。

### 現在地がわからなくなった

`/thrunt:progress` を実行してください。すべての状態ファイルを読み込み、現在地と次にやるべきことを正確に教えてくれます。

### 実行後に変更が必要

`/hunt:run` を再実行しないでください。ターゲットを絞った修正には `/thrunt:quick` を使用するか、`/hunt:validate-findings` で体系的に問題を特定し Evidence Review を通じて修正してください。

### モデルのコストが高すぎる

budget プロファイルに切り替えてください：`/thrunt:set-profile budget`。ドメインに慣れている場合（またはClaude が慣れている場合）は、`/thrunt:settings` でリサーチエージェントと plan-check エージェントを無効にしてください。

### 非 Claude ランタイムの使用（Codex、OpenCode、Gemini CLI）

非 Claude ランタイム用に THRUNT をインストールした場合、インストーラーがモデル解決を設定済みのため、すべてのエージェントがランタイムのデフォルトモデルを使用します。手動設定は不要です。具体的には、インストーラーが設定に `resolve_model_ids: "omit"` を設定し、THRUNT に Anthropic モデル ID の解決をスキップしてランタイム独自のデフォルトモデルを使用するよう指示します。

非 Claude ランタイムで異なるエージェントに異なるモデルを割り当てるには、ランタイムが認識する完全修飾モデル ID を使用して `.planning/config.json` に `model_overrides` を追加します：

```json
{
  "resolve_model_ids": "omit",
  "model_overrides": {
    "thrunt-hunt-planner": "o3",
    "thrunt-telemetry-executor": "o4-mini",
    "thrunt-incident-debugger": "o3"
  }
}
```

インストーラーは Gemini CLI、OpenCode、Codex 用に `resolve_model_ids: "omit"` を自動設定します。非 Claude ランタイムを手動で設定する場合は、`.planning/config.json` に自分で追加してください。

完全な説明は[設定リファレンス](../CONFIGURATION.md#non-claude-runtimes-codex-opencode-gemini-cli)をご覧ください。

### 非 Anthropic プロバイダーでの Claude Code の使用（OpenRouter、ローカル）

THRUNT サブエージェントが Anthropic モデルを呼び出し、OpenRouter やローカルプロバイダーを通じて支払っている場合は、`inherit` プロファイルに切り替えてください：`/thrunt:set-profile inherit`。これにより、すべてのエージェントが特定の Anthropic モデルの代わりに現在のセッションモデルを使用します。`/thrunt:settings` → モデルプロファイル → Inherit も参照してください。

### 機密/プライベートプロジェクトでの作業

`/hunt:new-program` 時または `/thrunt:settings` で `commit_docs: false` を設定してください。`.planning/` を `.gitignore` に追加してください。プランニングアーティファクトはローカルに保持され、git に含まれません。

### THRUNT アップデートがローカル変更を上書きした

v1.17 以降、インストーラーはローカルで変更されたファイルを `thrunt-local-patches/` にバックアップします。`/thrunt:reapply-patches` を実行して変更をマージし直してください。

### ワークフロー診断 (`/thrunt:forensics`)

ワークフローが明確でない形で失敗した場合 -- プランが存在しないファイルを参照する、実行が予期しない結果を生成する、状態が破損しているように見える -- `/thrunt:forensics` を実行して診断レポートを生成してください。

**チェック内容：**
- Git 履歴の異常（孤立コミット、予期しないブランチ状態、rebase アーティファクト）
- アーティファクトの整合性（欠落または不正なプランニングファイル、壊れた相互参照）
- 状態の不整合（HUNTMAP のステータスと実際のファイル存在の不一致、設定のドリフト）

**出力：** `.planning/forensics/` に書き出される診断レポート。検出事項と推奨される修復手順が含まれます。

### サブエージェントが失敗したように見えるが作業は完了している

Claude Code の分類バグに対する既知の回避策があります。THRUNT のオーケストレーター（hunt-run、quick）は、失敗を報告する前に実際の出力をスポットチェックします。失敗メッセージが表示されてもコミットが作成されている場合は、`git log` を確認してください -- 作業は成功している可能性があります。

### 並列実行によるビルドロックエラー

並列ウェーブ実行中に pre-commit フックの失敗、cargo ロックの競合、30分以上の実行時間が発生した場合、これは複数のエージェントが同時にビルドツールをトリガーすることが原因です。THRUNT は v1.26 以降これを自動的に処理します — 並列エージェントはコミット時に `--no-verify` を使用し、オーケストレーターが各ウェーブ後にフックを1回実行します。古いバージョンを使用している場合は、プロジェクトの `CLAUDE.md` に以下を追加してください：

```markdown
## Git Commit Rules for Agents
All subagent/executor commits MUST use `--no-verify`.
```

並列実行を完全に無効にするには：`/thrunt:settings` → `parallelization.enabled` を `false` に設定。

### Windows：保護されたディレクトリでインストールがクラッシュする

Windows でインストーラーが `EPERM: operation not permitted, scandir` でクラッシュした場合、これは OS で保護されたディレクトリ（例：Chromium ブラウザプロファイル）が原因です。v1.24 以降修正済み — 最新バージョンに更新してください。回避策として、インストーラー実行前に問題のあるディレクトリを一時的にリネームしてください。

---

## リカバリークイックリファレンス

| 問題 | 解決策 |
|---------|----------|
| コンテキストの喪失 / 新セッション | `/thrunt:resume-work` または `/thrunt:progress` |
| フェーズが失敗した | フェーズのコミットを `git revert` して再プランニング |
| スコープ変更が必要 | `/thrunt:add-phase`、`/thrunt:insert-phase`、または `/thrunt:remove-phase` |
| マイルストーン監査でギャップを発見 | `/thrunt:plan-milestone-gaps` |
| 何かが壊れた | `/thrunt:debug "description"` |
| ワークフロー状態が破損している可能性 | `/thrunt:forensics` |
| ターゲットを絞った修正 | `/thrunt:quick` |
| プランがビジョンに合わない | `/hunt:shape-hypothesis [N]` で再プランニング |
| コストが高い | `/thrunt:set-profile budget` と `/thrunt:settings` でエージェントをオフ |
| アップデートがローカル変更を壊した | `/thrunt:reapply-patches` |
| ステークホルダー向けセッションサマリーが欲しい | `/thrunt:session-report` |
| 次のステップがわからない | `/thrunt:next` |
| 並列実行でビルドエラー | THRUNT を更新するか `parallelization.enabled: false` を設定 |

---

## プロジェクトファイル構造

参考として、THRUNT がプロジェクトに作成するファイル構造を示します：

```
.planning/
  MISSION.md              # プロジェクトのビジョンとコンテキスト（常に読み込まれる）
  HYPOTHESES.md         # スコープ付き v1/v2 要件（ID 付き）
  HUNTMAP.md              # ステータス追跡付きフェーズ分割
  STATE.md                # 決定事項、ブロッカー、セッションメモリ
  config.json             # ワークフロー設定
  MILESTONES.md           # 完了したマイルストーンのアーカイブ
  HANDOFF.json            # 構造化セッション引き継ぎ（/thrunt:pause-work から）
  research/               # /hunt:new-program からのドメインリサーチ
  reports/                # セッションレポート（/thrunt:session-report から）
  todos/
    pending/              # 作業待ちのキャプチャされたアイデア
    done/                 # 完了した TODO
  debug/                  # アクティブなデバッグセッション
    resolved/             # アーカイブされたデバッグセッション
  codebase/               # ブラウンフィールドコードベースマッピング（/hunt:map-environment から）
  phases/
    XX-phase-name/
      XX-YY-PLAN.md       # アトミック実行プラン
      XX-YY-SUMMARY.md    # 実行結果と決定事項
      CONTEXT.md          # 実装の好み
      RESEARCH.md         # エコシステムリサーチの成果
      FINDINGS.md     # 実行後の検証結果
      XX-UI-SPEC.md       # UI デザインコントラクト（/thrunt:ui-phase から）
      XX-UI-REVIEW.md     # ビジュアル監査スコア（/thrunt:ui-review から）
  ui-reviews/             # /thrunt:ui-review からのスクリーンショット（gitignore 対象）
```
