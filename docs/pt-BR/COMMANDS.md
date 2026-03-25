# Referência de Comandos do THRUNT

Este documento descreve os comandos principais do THRUNT em Português.  
Para detalhes completos de flags avançadas e mudanças recentes, consulte também a [versão em inglês](../COMMANDS.md).

---

## Fluxo Principal

| Comando | Finalidade | Quando usar |
|---------|------------|-------------|
| `/hunt:new-program` | Inicialização completa: perguntas, pesquisa, requisitos e huntmap | Início de projeto |
| `/hunt:shape-hypothesis [N]` | Captura decisões de implementação | Antes do planejamento |
| `/thrunt:ui-phase [N]` | Gera contrato de UI (`UI-SPEC.md`) | Fases com frontend |
| `/hunt:plan [N]` | Pesquisa + planejamento + verificação | Antes de executar uma fase |
| `/hunt:run <N>` | Executa planos em ondas paralelas | Após planejamento aprovado |
| `/hunt:validate-findings [N]` | Evidence Review manual com diagnóstico automático | Após execução |
| `/hunt:publish [N]` | Cria PR da fase validada | Ao concluir a fase |
| `/thrunt:next` | Detecta e executa o próximo passo lógico | Qualquer momento |
| `/thrunt:fast <texto>` | Tarefa curta sem planejamento completo | Ajustes triviais |

## Navegação e Sessão

| Comando | Finalidade |
|---------|------------|
| `/thrunt:progress` | Mostra status atual e próximos passos |
| `/thrunt:resume-work` | Retoma contexto da sessão anterior |
| `/thrunt:pause-work` | Salva handoff estruturado |
| `/thrunt:session-report` | Gera resumo da sessão |
| `/thrunt:help` | Lista comandos e uso |
| `/thrunt:update` | Atualiza o THRUNT |

## Gestão de Fases

| Comando | Finalidade |
|---------|------------|
| `/thrunt:add-phase` | Adiciona fase no huntmap |
| `/thrunt:insert-phase [N]` | Insere trabalho urgente entre fases |
| `/thrunt:remove-phase [N]` | Remove fase futura e reenumera |
| `/thrunt:list-phase-assumptions [N]` | Mostra abordagem assumida pelo Claude |
| `/thrunt:plan-milestone-gaps` | Cria fases para fechar lacunas de auditoria |

## Brownfield e Utilidades

| Comando | Finalidade |
|---------|------------|
| `/hunt:map-environment` | Mapeia base existente antes de novo projeto |
| `/thrunt:quick` | Tarefas ad-hoc com garantias do THRUNT |
| `/thrunt:debug [desc]` | Debug sistemático com estado persistente |
| `/thrunt:forensics` | Diagnóstico de falhas no workflow |
| `/thrunt:settings` | Configuração de agentes, perfil e toggles |
| `/thrunt:set-profile <perfil>` | Troca rápida de perfil de modelo |

## Qualidade de Código

| Comando | Finalidade |
|---------|------------|
| `/thrunt:review` | Peer review com múltiplas IAs |
| `/thrunt:pr-branch` | Cria branch limpa sem commits de planejamento |
| `/thrunt:audit-evidence` | Audita dívida de validação/Evidence Review |

## Backlog e Threads

| Comando | Finalidade |
|---------|------------|
| `/thrunt:add-backlog <desc>` | Adiciona item no backlog (999.x) |
| `/thrunt:review-backlog` | Promove, mantém ou remove itens |
| `/thrunt:plant-seed <ideia>` | Registra ideia com gatilho futuro |
| `/thrunt:thread [nome]` | Gerencia threads persistentes |

---

## Exemplo rápido

```bash
/hunt:new-program
/hunt:shape-hypothesis 1
/hunt:plan 1
/hunt:run 1
/hunt:validate-findings 1
/hunt:publish 1
```
