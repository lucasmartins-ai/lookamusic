# TDR-12 — Decisão sobre Formatos Adicionais de Exportação (MP3, Stems, MusicXML)

Date: 2026-09-10. Status: accepted.

## Contexto
A Fase 12 implementa com sucesso o núcleo de exportação universal do LookaMusic:
- **JSON (v1)**: Schema versionado com migração e validação estrita.
- **MIDI (SMF 1.0 Formato 1)**: Multitrack com trilhas isoladas para Conductor, Melodia e Acordes.
- **WAV**: Renderização offline (PCM 16-bit estéreo 44.1kHz) com cabeçalho RIFF canônico.
- **WebM**: Áudio comprimido Opus nativo via MediaRecorder no navegador.

O prompt da Fase 12 e a especificação (§40) solicitam a avaliação de três formatos/modalidades complementares: **MP3**, **Stems** e **MusicXML**.

## Avaliação e Decisões

### 1. MP3 — Adiado para Fase 14/15
- **Motivo**: Os navegadores web não oferecem encoder MP3 nativo no `OfflineAudioContext` ou `MediaRecorder`. Incluir bibliotecas de terceiros como `lamejs` ou compilações WebAssembly adiciona de 150 KB a 2 MB ao bundle do cliente, contrariando o princípio de zero dependências externas pesadas (§2, §42).
- **Substituto entregue**: O WAV fornece áudio com fidelidade total (lossless) aceito por 100% dos DAWs e reprodutores. Para áudio comprimido de compartilhamento rápido, o WebM (codec Opus) já é gerado nativamente pelo navegador sem qualquer peso adicional no bundle.
- **Decisão**: Adiar MP3 para a fase de empacotamento/hardening (Fase 14/15) como plugin opcional em WebAssembly se houver demanda justificada.

### 2. Stems — Parcialmente entregue no MIDI; WAV multitrack planejado para Fase 14
- **Status atual**: O arquivo MIDI exportado pela Fase 12 já é estruturado em Formato 1 multitrack com stems isolados: Trilha 1 (Melodia vocal) e Trilha 2 (Harmonia/Acordes). Ao importar em qualquer DAW (GarageBand, Logic, Ableton, Reaper), cada instrumento abre em sua própria pista independente.
- **Para áudio WAV**: A arquitetura do `renderToWav` já suporta o solo de instrumentos individuais através do `comp.instruments`. O empacotamento de múltiplos arquivos WAV em um arquivo `.zip` exige biblioteca de compactação adicional no navegador.
- **Decisão**: Stems MIDI entregues na Fase 12. Exportação de pacote ZIP de stems WAV programada para a Fase 14.

### 3. MusicXML — Adiado para a Fase 13 (Modo Educacional)
- **Motivo**: O padrão MusicXML exige regras de notação tradicional de partitura (claves de sol/fá, armaduras de clave com sustenidos/bemóis enarmônicos, distribuição polifônica de vozes e compassos de compasso). Essas definições pertencem diretamente ao escopo da **Fase 13 (Modo Educacional & Teoria)**, onde o motor de visualização de partituras e grafia musical será construído.
- **Decisão**: Adiar a implementação do MusicXML para a Fase 13, integrando-o ao motor de notação musical sem retrabalho prematuro.

## Trade-offs
- Mantém o codebase leve, sem dependências de terceiros, 100% em TypeScript puro e Web Audio nativo.
- Cumpre integralmente os requisitos de intercâmbio musical da Fase 12 com DAWs e editores profissionais (GarageBand, Ableton, MuseScore, Logic).
