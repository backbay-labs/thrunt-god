# Referência de Recursos do THRUNT

Visão em Português dos recursos centrais do THRUNT.  
Para catálogo completo e detalhamento exaustivo, consulte [FEATURES.md em inglês](../FEATURES.md).

---

## Recursos principais

- **Desenvolvimento orientado por fases** com artefatos de planejamento versionados
- **Engenharia de contexto** para reduzir degradação de qualidade em sessões longas
- **Planejamento em tarefas atômicas** para execução mais previsível
- **Execução em ondas paralelas** com controle por dependências
- **Commits atômicos por tarefa** para rastreabilidade e rollback
- **Verificação pós-execução** com foco em objetivos da fase
- **Evidence Review guiado** via `/hunt:validate-findings`
- **Suporte brownfield** com `/hunt:map-environment`
- **Workstreams** para trilhas paralelas sem colisão de estado
- **Backlog, seeds e threads** para memória de médio/longo prazo

## Qualidade e segurança

- **Plan-check** antes de executar
- **Nyquist validation** para mapear requisito -> validação automatizada
- **Detecção de prompt injection** em entradas do usuário
- **Prevenção de path traversal** em caminhos fornecidos
- **Hooks de proteção** para alterações fora de contexto de workflow

## UX de frontend

- **`/thrunt:ui-phase`**: contrato visual antes da execução
- **`/thrunt:ui-review`**: auditoria visual em 6 pilares
- **UI safety gate** para uso de registries de terceiros

## Operação e manutenção

- **Perfis de modelo** (`quality`, `balanced`, `budget`, `inherit`)
- **Ajuste por toggles** para custo/qualidade/velocidade
- **Diagnóstico forense** com `/thrunt:forensics`
- **Relatório de sessão** com `/thrunt:session-report`

---

## Atalhos recomendados por cenário

| Cenário | Comandos |
|--------|----------|
| Projeto novo | `/hunt:new-program` -> `/hunt:shape-hypothesis` -> `/hunt:plan` -> `/hunt:run` |
| Correção rápida | `/thrunt:quick` |
| Código existente | `/hunt:map-environment` -> `/hunt:new-program` |
| Fechamento de release | `/thrunt:audit-milestone` -> `/thrunt:complete-milestone` |

---

> [!NOTE]
> Este arquivo é uma versão de referência rápida em Português para facilitar uso diário. Para detalhes de baixo nível, requisitos formais e comportamento completo de cada recurso, use o documento original em inglês.
