# Arquitetura do THRUNT

Visão arquitetural do THRUNT GOD (THRUNT) em Português.  
Para detalhes de implementação linha a linha, consulte [ARCHITECTURE.md em inglês](../ARCHITECTURE.md).

---

## Princípios

- **Orquestração leve** no contexto principal
- **Trabalho pesado em subagentes**
- **Artefatos persistentes** em `.planning/`
- **Validação contínua** por fase
- **Rastreabilidade** por commits atômicos

## Componentes centrais

1. **Camada de comando**  
   Recebe entrada do usuário (`/thrunt:*`) e roteia fluxo.

2. **Camada de orquestração**  
   Coordena pesquisadores, planejadores, executores e verificadores.

3. **Camada de artefatos**  
   Mantém `MISSION.md`, `HYPOTHESES.md`, `HUNTMAP.md`, `STATE.md`, planos e sumários.

4. **Camada de execução**  
   Roda tarefas em ondas, respeitando dependências.

5. **Camada de validação**  
   Compara entrega contra objetivos, testes e critérios de fase.

## Fluxo arquitetural (alto nível)

```text
Entrada (/thrunt:comando)
  -> Orquestrador
  -> Subagentes especializados
  -> Artefatos em .planning/
  -> Execução em ondas
  -> Verificação/Evidence Review
  -> Atualização de estado + commits
```

## Estado e persistência

- `STATE.md`: memória operacional da jornada
- `HUNTMAP.md`: visão de progresso por fase
- `SUMMARY.md`: histórico de decisões e resultados por tarefa
- `VALIDATION.md` (quando aplicável): contrato de feedback automatizado

## Paralelismo

- Planos independentes: mesma onda (execução paralela)
- Planos dependentes: ondas posteriores (execução sequencial)
- Conflitos de arquivo: serialização controlada

## Segurança

- validação de caminhos de arquivo
- detecção de prompt injection
- hooks de guarda para escrita/edição sensível
- scanner CI para padrões de risco

## Extensibilidade

THRUNT suporta evolução por:

- novos comandos
- novos tipos de agente
- novos artefatos por fase
- novos gates de qualidade/segurança

---

> [!NOTE]
> Esta versão foi criada para consulta de arquitetura em Português. A especificação canônica e completa continua no documento em inglês.
