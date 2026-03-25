# Guia do Usuário do THRUNT

Referência detalhada de workflows, troubleshooting e configuração. Para setup rápido, veja o [README](../../README.pt-BR.md).

---

## Sumário

- [Fluxo de trabalho](#fluxo-de-trabalho)
- [Contrato de UI](#contrato-de-ui)
- [Backlog e Threads](#backlog-e-threads)
- [Workstreams](#workstreams)
- [Segurança](#segurança)
- [Referência de comandos](#referência-de-comandos)
- [Configuração](#configuração)
- [Exemplos de uso](#exemplos-de-uso)
- [Troubleshooting](#troubleshooting)
- [Recuperação rápida](#recuperação-rápida)

---

## Fluxo de trabalho

Fluxo recomendado por fase:

1. `/hunt:shape-hypothesis [N]` — trava preferências de implementação
2. `/thrunt:ui-phase [N]` — contrato visual para fases frontend
3. `/hunt:plan [N]` — pesquisa + plano + validação
4. `/hunt:run [N]` — execução em ondas paralelas
5. `/hunt:validate-findings [N]` — Evidence Review manual com diagnóstico
6. `/hunt:publish [N]` — cria PR (opcional)

Para iniciar projeto novo:

```bash
/hunt:new-program
```

Para seguir automaticamente o próximo passo:

```bash
/thrunt:next
```

### Nyquist Validation

Durante `hunt-plan`, o THRUNT pode mapear requisitos para comandos de teste automáticos antes da implementação. Isso gera `{phase}-VALIDATION.md` e aumenta a confiabilidade de verificação pós-execução.

Desativar:

```json
{
  "workflow": {
    "nyquist_validation": false
  }
}
```

### Modo de discussão por suposições

Com `workflow.discuss_mode: "assumptions"`, o THRUNT analisa o código antes de perguntar, apresenta suposições estruturadas e pede apenas correções.

---

## Contrato de UI

### Comandos

| Comando | Descrição |
|---------|-----------|
| `/thrunt:ui-phase [N]` | Gera contrato de design `UI-SPEC.md` para a fase |
| `/thrunt:ui-review [N]` | Auditoria visual retroativa em 6 pilares |

### Quando usar

- Rode `/thrunt:ui-phase` depois de `/hunt:shape-hypothesis` e antes de `/hunt:plan`.
- Rode `/thrunt:ui-review` após execução/validação para avaliar qualidade visual e consistência.

### Configurações relacionadas

| Setting | Padrão | O que controla |
|---------|--------|----------------|
| `workflow.ui_phase` | `true` | Gera contratos de UI para fases frontend |
| `workflow.ui_safety_gate` | `true` | Ativa gate de segurança para componentes de registry |

---

## Backlog e Threads

### Backlog (999.x)

Ideias fora da sequência ativa vão para backlog:

```bash
/thrunt:add-backlog "Camada GraphQL"
/thrunt:add-backlog "Responsividade mobile"
```

Promover/revisar:

```bash
/thrunt:review-backlog
```

### Seeds

Seeds guardam ideias futuras com condição de gatilho:

```bash
/thrunt:plant-seed "Adicionar colaboração real-time quando infra de WebSocket estiver pronta"
```

### Threads persistentes

Threads são contexto leve entre sessões:

```bash
/thrunt:thread
/thrunt:thread fix-deploy-key-auth
/thrunt:thread "Investigar timeout TCP"
```

---

## Workstreams

Workstreams permitem trabalho paralelo sem colisão de estado de planejamento.

| Comando | Função |
|---------|--------|
| `/thrunt:workstreams create <name>` | Cria workstream isolado |
| `/thrunt:workstreams switch <name>` | Troca workstream ativo |
| `/thrunt:workstreams list` | Lista workstreams |
| `/thrunt:workstreams complete <name>` | Finaliza e arquiva workstream |

`workstreams` compartilham o mesmo código/git, mas isolam artefatos de `.planning/`.

---

## Segurança

O THRUNT aplica defesa em profundidade:

- prevenção de path traversal em entradas de arquivo
- detecção de prompt injection em texto do usuário
- hooks de proteção para escrita em `.planning/`
- scanner CI para padrões de injeção em agentes/workflows/comandos

Para arquivos sensíveis, use deny list no Claude Code.

---

## Referência de comandos

### Fluxo principal

| Comando | Quando usar |
|---------|-------------|
| `/hunt:new-program` | Início de projeto |
| `/hunt:shape-hypothesis [N]` | Definir preferências antes do plano |
| `/hunt:plan [N]` | Criar e validar planos |
| `/hunt:run [N]` | Executar planos em ondas |
| `/hunt:validate-findings [N]` | Evidence Review manual |
| `/hunt:publish [N]` | Gerar PR da fase |
| `/thrunt:next` | Próximo passo automático |

### Gestão e utilidades

| Comando | Quando usar |
|---------|-------------|
| `/thrunt:progress` | Ver status atual |
| `/thrunt:resume-work` | Retomar sessão |
| `/thrunt:pause-work` | Pausar com handoff |
| `/thrunt:session-report` | Resumo da sessão |
| `/thrunt:quick` | Tarefa ad-hoc com garantias THRUNT |
| `/thrunt:debug [desc]` | Debug sistemático |
| `/thrunt:forensics` | Diagnóstico de workflow quebrado |
| `/thrunt:settings` | Ajustar workflow/modelos |
| `/thrunt:set-profile <profile>` | Troca rápida de perfil |

Para lista completa e flags avançadas, consulte [Command Reference](../COMMANDS.md).

---

## Configuração

Arquivo de configuração: `.planning/config.json`

### Núcleo

| Setting | Opções | Padrão |
|---------|--------|--------|
| `mode` | `interactive`, `yolo` | `interactive` |
| `granularity` | `coarse`, `standard`, `fine` | `standard` |
| `model_profile` | `quality`, `balanced`, `budget`, `inherit` | `balanced` |

### Workflow

| Setting | Padrão |
|---------|--------|
| `workflow.research` | `true` |
| `workflow.plan_check` | `true` |
| `workflow.validator` | `true` |
| `workflow.nyquist_validation` | `true` |
| `workflow.ui_phase` | `true` |
| `workflow.ui_safety_gate` | `true` |

### Perfis de modelo

| Perfil | Uso recomendado |
|--------|------------------|
| `quality` | trabalho crítico, maior qualidade |
| `balanced` | padrão recomendado |
| `budget` | reduzir custo de tokens |
| `inherit` | seguir modelo da sessão/runtime |

Detalhes completos: [Configuration Reference](../CONFIGURATION.md).

---

## Exemplos de uso

### Projeto novo

```bash
claude --dangerously-skip-permissions
/hunt:new-program
/hunt:shape-hypothesis 1
/thrunt:ui-phase 1
/hunt:plan 1
/hunt:run 1
/hunt:validate-findings 1
/hunt:publish 1
```

### Código já existente

```bash
/hunt:map-environment
/hunt:new-program
```

### Correção rápida

```bash
/thrunt:quick
> "Corrigir botão de login no mobile Safari"
```

### Preparação para release

```bash
/thrunt:audit-milestone
/thrunt:plan-milestone-gaps
/thrunt:complete-milestone
```

---

## Troubleshooting

### "Project already initialized"

`.planning/MISSION.md` já existe. Apague `.planning/` se quiser reiniciar do zero.

### Sessão longa degradando contexto

Use `/clear` entre etapas grandes e retome com `/thrunt:resume-work` ou `/thrunt:progress`.

### Plano desalinhado

Rode `/hunt:shape-hypothesis [N]` antes do plano e valide suposições com `/thrunt:list-phase-assumptions [N]`.

### Execução falhou ou saiu com stubs

Replaneje com escopo menor (tarefas menores por plano).

### Custo alto

Use perfil budget:

```bash
/thrunt:set-profile budget
```

### Runtime não-Claude (Codex/OpenCode/Gemini)

Use `resolve_model_ids: "omit"` para deixar o runtime resolver modelos padrão.

---

## Recuperação rápida

| Problema | Solução |
|---------|---------|
| Perdeu contexto | `/thrunt:resume-work` ou `/thrunt:progress` |
| Fase deu errado | `git revert` + replanejar |
| Precisa alterar escopo | `/thrunt:add-phase`, `/thrunt:insert-phase`, `/thrunt:remove-phase` |
| Bug em workflow | `/thrunt:forensics` |
| Correção pontual | `/thrunt:quick` |
| Custo alto | `/thrunt:set-profile budget` |
| Não sabe próximo passo | `/thrunt:next` |

---

## Estrutura de arquivos do projeto

```text
.planning/
  MISSION.md
  HYPOTHESES.md
  HUNTMAP.md
  STATE.md
  config.json
  MILESTONES.md
  HANDOFF.json
  research/
  reports/
  todos/
  debug/
  codebase/
  phases/
    XX-phase-name/
      XX-YY-PLAN.md
      XX-YY-SUMMARY.md
      CONTEXT.md
      RESEARCH.md
      FINDINGS.md
      XX-UI-SPEC.md
      XX-UI-REVIEW.md
  ui-reviews/
```

> [!NOTE]
> Esta é a versão pt-BR do guia para uso diário. Para detalhes técnicos exatos e cobertura completa de parâmetros avançados, consulte também o [guia original em inglês](../USER-GUIDE.md).
