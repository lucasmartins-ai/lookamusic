# Educational Layer Specification (Phase 13, §4)

> **Documento normativo da camada educacional do LookaMusic.**
> O LookaMusic é um instrumento musical em tempo real que também ensina.
> Regra de ouro: o padrão é intuitivo e musical, nunca acadêmico ou cansativo.

---

## 1. Princípios Arquiteturais

1. **Representação Estruturada Pura**:
   O motor educacional (`src/features/learn/explain.ts`) nunca analisa amostras de áudio bruto, PCM ou buffers de onda. Ele consome exclusivamente o `MusicalState` central (`NoteEvent`, `Chord`, `KeyEstimate`, `Cadence`, `IntervalInfo`, `TempoState`, `TimeSignature`).
2. **Zero Peso Acadêmico por Padrão**:
   O modo educacional possui um *toggle global* (`enabled: boolean`). Quando desligado (`false`), o instrumento não renderiza nenhum card acadêmico ou elemento invasivo. O usuário faz música livremente.
3. **Escopo Progressivo (9 Níveis Destraváveis)**:
   A trilha de aprendizado é organizada em 9 níveis conceituais graduais, sem jargões forçados:
   - **Nível 1 — Notas**: altura fundamental, identificação com cifra e solfejo (ex.: *C (Dó)*, *G (Sol)*), relação com a tônica.
   - **Nível 2 — Intervalos**: distância semitonal entre notas consecutivas, direção melódica, sonoridade característica (uníssono, segunda menor, terça maior, quinta justa, oitava, etc.).
   - **Nível 3 — Escalas**: universo diatônico da música, intervalos da escala maior e menor natural, sensação de claridade/introspecção.
   - **Nível 4 — Acordes**: tríades e tétrades formadas ou arpejadas pela voz (aceite canônico: cantar `C–E–G` gera `"tríade de C maior"`).
   - **Nível 5 — Funções Harmônicas**: papel de cada acorde no campo harmônico (Tônica I = repouso; Subdominante IV = afastamento; Dominante V = tensão/atração).
   - **Nível 6 — Progressões**: encadeamento e análise em graus romanos ao longo do tempo (aceite canônico: `G–D–Em–C` no tom de G gera `"funções I–V–vi–IV em G"`).
   - **Nível 7 — Cadências**: pontuação e respiração de final de frase (`authentic` V→I, `plagal` IV→I, `deceptive` V→vi, `half` →V).
   - **Nível 8 — Condução de Vozes**: suavidade melódica entre acordes sucessivos, notas em comum mantidas e movimentos por graus conjuntos.
   - **Nível 9 — Modulação**: transição de centros tonais e mudanças de energia harmônica.
4. **Resiliência a Ruído e Atonalidade**:
   Entradas microtonais, ruídos de respiração, notas atonais ou acordes desconhecidos recebem explicações acolhedoras de música contemporânea/livre. A camada educacional nunca lança erros ou quebra a interface.

---

## 2. API do Motor (`src/features/learn/explain.ts`)

```typescript
// Funções puras por domínio
explainNote(note: NoteEvent | number, key?: KeyEstimate): EducationalSnippet;
explainInterval(first: NoteEvent | number, second: NoteEvent | number): EducationalSnippet;
explainScale(key: KeyEstimate, scale?: Scale): EducationalSnippet;
explainChord(chord: Chord, key?: KeyEstimate): EducationalSnippet;
explainMelodyPcs(pcs: readonly number[], key?: KeyEstimate): EducationalSnippet;
explainFunctions(chord: Chord, key: KeyEstimate): EducationalSnippet;
explainProgression(chords: readonly Chord[], key: KeyEstimate): EducationalSnippet;
explainCadence(cadence: Cadence | { type: CadenceType; from: Chord; to: Chord }, key?: KeyEstimate): EducationalSnippet;
explainVoiceLeading(from: Chord, to: Chord, reasons?: readonly HarmonyReason[]): EducationalSnippet;
explainModulation(fromKey: KeyEstimate, toKey: KeyEstimate): EducationalSnippet;
explainRhythm(tempo: TempoState, meter: TimeSignature): EducationalSnippet;

// Agregador central sobre o MusicalState
explainState(state: MusicalState, targetLevel?: LearnLevel): MusicalExplanation;
```

---

## 3. Superfícies de Apresentação

1. **Painel Contextual na Sessão (`LearnPanel.tsx`)**:
   - Título: *"O QUE ACABOU DE ACONTECER?"*.
   - Seletor de níveis progressivos em abas/pills com destaque visual.
   - Card primário com título do conceito, explicação acessível em português e metadados técnicos resumidos.
   - Cards secundários com notas de apoio (tonalidade, ritmo e última nota cantada).
   - Botão discreto para desativar ou fechar o painel.
2. **Estúdio Educacional (`/learn`)**:
   - Trilha visual dos 9 níveis com botão para definir o nível ativo.
   - Master switch de ativação do Modo Educativo com persistência em `localStorage`.
   - Laboratório Interativo com botões para testar figuras canônicas em 1 clique:
     - `C–E–G` → Tríade de C maior;
     - `G–D–Em–C` → Progressão I–V–vi–IV em G;
     - Cadências autêntica, plagal, de engano e semicadência;
     - Entrada atonal / cromática demonstrando a robustez do motor.

---

## 4. Conformidade com Critérios de Aceite

| Requisito | Entrada Estruturada | Saída Exata Gerada | Status |
|---|---|---|---|
| Tríade C maior | `pcs = [0, 4, 7]` | Contém `"tríade de C maior"` | ✅ Validado |
| Progressão pop | `G, D, Em, C` em G | Contém `"funções I–V–vi–IV em G"` | ✅ Validado |
| Cadência Autêntica | `V → I` (G → C em C) | Contém `"Cadência autêntica"` e `"resolve na tônica"` | ✅ Validado |
| Cadência Plagal | `IV → I` (F → C em C) | Contém `"Cadência plagal"` e `"IV para o I"` | ✅ Validado |
| Cadência de Engano | `V → vi` (G → Am em C) | Contém `"Cadência de engano"` e `"caiu no vi"` | ✅ Validado |
| Semicadência | `I → V` (C → G em C) | Contém `"Semicadência"` e `"dominante (V)"` | ✅ Validado |
| Entrada Atonal | `pcs = [1, 6, 8, 11]` | Fallback gracioso `"Conjunto melódico livre"` sem throw | ✅ Validado |
| Estado Vazio | `MusicalState` sem notas | Fallback gracioso com orientações sem throw | ✅ Validado |

---

## 5. Resolução dos Riscos Registrados (Hardening & Lançamento)

1. **Risco 1 — Frequência de atualização contextual durante fraseado melódico rápido (< 150 ms)**:
   - **Solução implementada:** `ExplanationStabilizer` e hook `useContextualExplanation` com retenção de frase melódica em tempo real (`config.learn.updateDebounceMs = 250 ms`, `config.learn.rapidNoteThresholdMs = 150 ms`).
   - **Garantia:** Notas sucessivas com intervalo < 150 ms mantêm o card anterior estável, consolidando a nova explicação pedagógica somente quando a frase assenta ou após a expiração do debounce. Ações manuais de usuário (troca de nível ou idioma) atualizam instantaneamente com 0 ms de latência.

2. **Risco 2 — Internacionalização e suporte a múltiplos idiomas (`en-US`)**:
   - **Solução implementada:** Desacoplamento de todas as strings literais em dicionário ultraleve e estritamente tipado (`src/features/learn/i18n.ts`), suportando `pt-BR` e `en-US`.
   - **Nomenclaturas:** Solfejo adaptado (*Do, Re, Mi...* / cifras anglo-saxãs), intervalos (*minor second, major third, perfect fifth, etc.*), qualidades de acorde (*major, minor, diminished, augmented, etc.*), funções harmônicas (*Tonic, Subdominant, Dominant*), cadências (*Authentic, Plagal, Deceptive, Half*) e interface do usuário com seletor instantâneo `PT | EN` no cabeçalho.

3. **Risco 3 — Acessibilidade de leitor de tela com atualizações dinâmicas**:
   - **Solução implementada:** Controle de verbosidade de áudio assistivo com chaveamento entre `aria-live="polite"` e `aria-live="off"` no card primário do `LearnPanel`.
   - **Garantia:** Usuários de leitores de tela contam com controle explícito (botão acessível com `aria-pressed` e tooltip descritivo) e persistência em `localStorage` (`config.learn.screenReaderStorageKey`), prevenindo sobrecarga e poluição auditiva em cantoria contínua.

