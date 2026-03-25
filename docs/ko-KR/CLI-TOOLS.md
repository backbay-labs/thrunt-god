# THRUNT CLI 도구 레퍼런스

> `thrunt-tools.cjs`에 대한 프로그래밍 방식 API 레퍼런스입니다. 워크플로우와 에이전트가 내부적으로 사용합니다. 사용자 대면 명령어는 [Command Reference](COMMANDS.md)를 참조하세요.

---

## 개요

`thrunt-tools.cjs`는 THRUNT의 약 50개 명령어, 워크플로우, 에이전트 파일에서 반복되는 인라인 bash 패턴을 대체하는 Node.js CLI 유틸리티입니다. config 파싱, 모델 해석, 단계 조회, git 커밋, 요약 검증, 상태 관리, 템플릿 작업을 중앙화합니다.

**위치:** `thrunt-god/bin/thrunt-tools.cjs`
**모듈:** `thrunt-god/bin/lib/`의 15개 도메인 모듈

**사용법:**
```bash
node thrunt-tools.cjs <command> [args] [--raw] [--cwd <path>]
```

**전역 플래그.**
| 플래그 | 설명 |
|------|-------------|
| `--raw` | 기계 가독형 출력 (JSON 또는 일반 텍스트, 포매팅 없음) |
| `--cwd <path>` | 작업 디렉터리 재정의 (샌드박스 서브에이전트용) |

---

## State 명령어

`.planning/STATE.md`를 관리합니다 — 헌트 워크스페이스의 살아있는 메모리입니다.

```bash
# 워크스페이스 전체 config + state를 JSON으로 로드
node thrunt-tools.cjs state load

# STATE.md 전문을 JSON으로 출력
node thrunt-tools.cjs state json

# 단일 필드 업데이트
node thrunt-tools.cjs state update <field> <value>

# STATE.md 내용 또는 특정 섹션 가져오기
node thrunt-tools.cjs state get [section]

# 여러 필드를 일괄 업데이트
node thrunt-tools.cjs state patch --field1 val1 --field2 val2

# 계획 카운터 증가
node thrunt-tools.cjs state advance-plan

# 실행 메트릭 기록
node thrunt-tools.cjs state record-metric --phase N --plan M --duration Xmin [--tasks N] [--files N]

# 진행률 바 재계산
node thrunt-tools.cjs state update-progress

# 결정 추가
node thrunt-tools.cjs state add-decision --summary "..." [--phase N] [--rationale "..."]
# 또는 파일에서:
node thrunt-tools.cjs state add-decision --summary-file path [--rationale-file path]

# 차단 항목 추가/해결
node thrunt-tools.cjs state add-blocker --text "..."
node thrunt-tools.cjs state resolve-blocker --text "..."

# 세션 연속성 기록
node thrunt-tools.cjs state record-session --stopped-at "..." [--resume-file path]
```

### State Snapshot

전체 STATE.md의 구조화된 파싱 결과입니다.

```bash
node thrunt-tools.cjs state-snapshot
```

현재 위치, 단계, 계획, 상태, 결정, 차단, 메트릭, 최근 활동을 포함한 JSON을 반환합니다.

---

## Phase 명령어

단계를 관리합니다 — 디렉터리, 번호 매기기, 로드맵 동기화.

```bash
# 번호로 단계 디렉터리 찾기
node thrunt-tools.cjs find-phase <phase>

# 삽입을 위한 다음 소수 단계 번호 계산
node thrunt-tools.cjs phase next-decimal <phase>

# 로드맵에 새 단계 추가 + 디렉터리 생성
node thrunt-tools.cjs phase add <description>

# 기존 단계 이후에 소수 단계 삽입
node thrunt-tools.cjs phase insert <after> <description>

# 단계 제거, 이후 단계 재번호 매기기
node thrunt-tools.cjs phase remove <phase> [--force]

# 단계 완료 표시, state + huntmap 업데이트
node thrunt-tools.cjs phase complete <phase>

# 웨이브와 상태를 포함한 계획 인덱싱
node thrunt-tools.cjs phase-plan-index <phase>

# 필터링을 포함한 단계 목록
node thrunt-tools.cjs phases list [--type planned|executed|all] [--phase N] [--include-archived]
```

---

## Huntmap 명령어

`HUNTMAP.md`를 파싱하고 업데이트합니다.

```bash
# HUNTMAP.md에서 단계 섹션 추출
node thrunt-tools.cjs huntmap get-phase <phase>

# 디스크 상태를 포함한 전체 로드맵 파싱
node thrunt-tools.cjs huntmap analyze

# 디스크에서 진행률 표 행 업데이트
node thrunt-tools.cjs huntmap update-plan-progress <N>
```

---

## Config 명령어

`.planning/config.json`을 읽고 씁니다.

```bash
# config.json을 기본값으로 초기화
node thrunt-tools.cjs config-ensure-section

# config 값 설정 (점 표기법)
node thrunt-tools.cjs config-set <key> <value>

# config 값 가져오기
node thrunt-tools.cjs config-get <key>

# 모델 프로필 설정
node thrunt-tools.cjs config-set-model-profile <profile>
```

---

## 모델 해석

```bash
# 현재 프로필 기반으로 에이전트 모델 가져오기
node thrunt-tools.cjs resolve-model <agent-name>
# 반환값: opus | sonnet | haiku | inherit
```

에이전트 이름: `thrunt-hunt-planner`, `thrunt-telemetry-executor`, `thrunt-query-writer`, `thrunt-signal-triager`, `thrunt-intel-synthesizer`, `thrunt-findings-validator`, `thrunt-hunt-checker`, `thrunt-evidence-correlator`, `thrunt-huntmap-builder`, `thrunt-incident-debugger`, `thrunt-environment-mapper`, `thrunt-false-positive-auditor`

---

## Verification 명령어

계획, 단계, 참조, 커밋을 검증합니다.

```bash
# SUMMARY.md 파일 검증
node thrunt-tools.cjs validate-summary <path> [--check-count N]

# PLAN.md 구조 + 작업 확인
node thrunt-tools.cjs validate plan-structure <file>

# 모든 계획에 요약이 있는지 확인
node thrunt-tools.cjs validate phase-completeness <phase>

# @-참조 + 경로 해석 확인
node thrunt-tools.cjs validate references <file>

# 커밋 해시 일괄 검증
node thrunt-tools.cjs validate commits <hash1> [hash2] ...

# must_haves.artifacts 확인
node thrunt-tools.cjs validate artifacts <plan-file>

# must_haves.key_links 확인
node thrunt-tools.cjs validate key-links <plan-file>
```

---

## Validation 명령어

헌트 워크스페이스 무결성을 확인합니다.

```bash
# 단계 번호 매기기, 디스크/로드맵 동기화 확인
node thrunt-tools.cjs validate consistency

# .planning/ 무결성 확인, 선택적으로 복구
node thrunt-tools.cjs validate health [--repair]
```

---

## Template 명령어

템플릿 선택 및 채우기입니다.

```bash
# 세분화에 따른 요약 템플릿 선택
node thrunt-tools.cjs template select <type>

# 변수로 템플릿 채우기
node thrunt-tools.cjs template fill <type> --phase N [--plan M] [--name "..."] [--type execute|tdd] [--wave N] [--fields '{json}']
```

`fill`의 템플릿 유형: `summary`, `plan`, `evidence-review`, `findings`

---

## Frontmatter 명령어

모든 Markdown 파일에 대한 YAML 전문 CRUD 작업입니다.

```bash
# 전문을 JSON으로 추출
node thrunt-tools.cjs frontmatter get <file> [--field key]

# 단일 필드 업데이트
node thrunt-tools.cjs frontmatter set <file> --field key --value jsonVal

# JSON을 전문에 병합
node thrunt-tools.cjs frontmatter merge <file> --data '{json}'

# 필수 필드 검증
node thrunt-tools.cjs frontmatter validate <file> --schema plan|summary|findings
```

---

## Scaffold 명령어

사전 구조화된 파일과 디렉터리를 생성합니다.

```bash
# CONTEXT.md 템플릿 생성
node thrunt-tools.cjs scaffold context --phase N

# EVIDENCE_REVIEW.md 템플릿 생성
node thrunt-tools.cjs scaffold evidence-review --phase N

# FINDINGS.md 템플릿 생성
node thrunt-tools.cjs scaffold findings --phase N

# 단계 디렉터리 생성
node thrunt-tools.cjs scaffold phase-dir --phase N --name "phase name"
```

---

## Init 명령어 (복합 컨텍스트 로드)

특정 워크플로우에 필요한 모든 컨텍스트를 단일 호출로 로드합니다. 미션/워크스페이스 정보, config, state, 워크플로우별 데이터를 포함한 JSON을 반환합니다.

```bash
node thrunt-tools.cjs init run <phase>
node thrunt-tools.cjs init plan <phase>
node thrunt-tools.cjs init new-program
node thrunt-tools.cjs init new-milestone
node thrunt-tools.cjs init quick <description>
node thrunt-tools.cjs init resume
node thrunt-tools.cjs init validate-findings <phase>
node thrunt-tools.cjs init phase-op <phase>
node thrunt-tools.cjs init todos [area]
node thrunt-tools.cjs init milestone-op
node thrunt-tools.cjs init map-environment
node thrunt-tools.cjs init progress
```

**대용량 페이로드 처리:** 출력이 약 50KB를 초과하면 CLI가 임시 파일에 쓰고 `@file:/tmp/thrunt-init-XXXXX.json`을 반환합니다. 워크플로우는 `@file:` 접두사를 확인하고 디스크에서 읽습니다.

```bash
INIT=$(node thrunt-tools.cjs init run "1")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

---

## Milestone 명령어

```bash
# 마일스톤 보관
node thrunt-tools.cjs milestone complete <version> [--name <name>] [--archive-phases]

# 요구 사항을 완료로 표시
node thrunt-tools.cjs hypotheses mark-complete <ids>
# 허용 형식: HYP-01,HYP-02 또는 HYP-01 HYP-02 또는 [HYP-01, HYP-02]
```

---

## 유틸리티 명령어

```bash
# 텍스트를 URL 안전 슬러그로 변환
node thrunt-tools.cjs generate-slug "Some Text Here"
# → some-text-here

# 타임스탬프 가져오기
node thrunt-tools.cjs current-timestamp [full|date|filename]

# 대기 중인 할 일 개수 및 목록
node thrunt-tools.cjs list-todos [area]

# 파일/디렉터리 존재 확인
node thrunt-tools.cjs check-path-exists <path>

# 모든 SUMMARY.md 데이터 집계
node thrunt-tools.cjs history-digest

# SUMMARY.md에서 구조화된 데이터 추출
node thrunt-tools.cjs summary-extract <path> [--fields field1,field2]

# 헌트 통계
node thrunt-tools.cjs stats [json|table]

# 진행률 렌더링
node thrunt-tools.cjs progress [json|table|bar]

# 할 일 완료 처리
node thrunt-tools.cjs todo complete <filename>

# Evidence Review 감사 — 모든 단계에서 미해결 항목 스캔
node thrunt-tools.cjs audit-evidence

# config 확인을 포함한 git 커밋
node thrunt-tools.cjs commit <message> [--files f1 f2] [--amend] [--no-verify]
```

> **`--no-verify`**: 사전 커밋 훅을 건너뜁니다. 빌드 잠금 경쟁을 피하기 위해 웨이브 기반 실행 중 병렬 executor 에이전트가 사용합니다 (예: Rust 프로젝트의 cargo lock 충돌). 오케스트레이터는 각 웨이브 완료 후 훅을 한 번 실행합니다. 순차 실행 중에는 `--no-verify`를 사용하지 마세요 — 훅이 정상적으로 실행되어야 합니다.

```bash
# 웹 검색 (Brave API 키 필요)
node thrunt-tools.cjs websearch <query> [--limit N] [--freshness day|week|month]
```

---

## 모듈 아키텍처

| 모듈 | 파일 | 내보내기 |
|--------|------|---------|
| Core | `lib/core.cjs` | `error()`, `output()`, `parseArgs()`, 공유 유틸리티 |
| State | `lib/state.cjs` | 모든 `state` 하위 명령어, `state-snapshot` |
| Phase | `lib/phase.cjs` | Phase CRUD, `find-phase`, `phase-plan-index`, `phases list` |
| Huntmap | `lib/huntmap.cjs` | 로드맵 파싱, 단계 추출, 진행률 업데이트 |
| Config | `lib/config.cjs` | Config 읽기/쓰기, 섹션 초기화 |
| Validate | `lib/validate.cjs` | 산출물 검증 및 워크스페이스 상태 점검 명령어 |
| Template | `lib/template.cjs` | 템플릿 선택 및 변수 채우기 |
| Frontmatter | `lib/frontmatter.cjs` | YAML 전문 CRUD |
| Init | `lib/init.cjs` | 모든 워크플로우를 위한 복합 컨텍스트 로드 |
| Milestone | `lib/milestone.cjs` | 마일스톤 보관, 요구 사항 표시 |
| Commands | `lib/commands.cjs` | 기타: slug, timestamp, todos, scaffold, stats, websearch |
| Model Profiles | `lib/model-profiles.cjs` | 프로필 해석 테이블 |
| Evidence Review | `lib/evidence.cjs` | 단계 간 Evidence Review/FINDINGS 감사 |
| Profile Output | `lib/profile-output.cjs` | 개발자 프로필 포매팅 |
| Profile Pipeline | `lib/profile-pipeline.cjs` | 세션 분석 파이프라인 |
