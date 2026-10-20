# INF-10 — Revisão rápida de rascunhos e fotografias

> **Atualização de 20/10/2026 — DEPLOY BLOQUEADO (REV-01).** Revisão reproduziu sobrescrita do backup conflitante no próximo backup automático. A afirmação anterior de preservação permanente está corrigida por este registro. INF-10 reaberto; aceites de infraestrutura permanecem. Check e 161 testes passaram, CI e Preview READY confirmados em `6ad0b1e`, mas não cobriam este defeito. Ver [parecer e critérios de liberação](revisao-rc-v011-20261020.md). Registros de 19/10 abaixo são históricos e não constituem liberação atual.


**Data:** 19/10/2026 | **Branch:** `fix/stability-state-queries-20261019` (PR #26, sem deploy)  
**Situação:** **REVISÃO ESTÁTICA REALIZADA; NÃO HOMOLOGADO**. Encerrado **somente no escopo de revisão rápida solicitado** pelo responsável; testes reais de perda de dados permanecem arquivados no backlog futuro.

## 1. Proteções encontradas no código

| Mecanismo | Evidência | Avaliação |
| --- | --- | --- |
| Chave separada por usuário/visita/tipo | `src/services/report-drafts.js:12-18,52-66` | ✅ Evita reutilizar inadvertidamente rascunho de outra conta/tipo ao usar a API normal do app; **não** constitui criptografia/controle de acesso ao IndexedDB para qualquer pessoa com acesso ao dispositivo |
| Armazenamento de fotos como `File/Blob` | `src/services/report-drafts.js:52-55`; `src/ui/commercial-report.js:102-116`; `script.js:68-86` | ✅ Captura mídia comprimida junto do rascunho; o arquivo não é armazenado em `localStorage` |
| Serialização das gravações por chave | `src/services/report-drafts.js:45-65` | ✅ Evita inversão entre backups concorrentes **no mesmo objeto/instância de store**; não é trava entre abas |
| Recuperação modular | `script.js:2409-2440`; `src/ui/commercial-report.js:122-136` | ✅ Reidrata visitas comerciais/treinamentos e detecta `missing-files` e `conflict` |
| Recuperação técnica/assistência | `script.js:2443-2469` | ✅ Recarrega texto/blocos/fotos se `reportSignature` compatível; mantém backup divergente sem sobrescrever servidor |
| Guardrails de foto ausente | `technical-report-editor.js:734-770`; `src/services/commercial-save.js:8-17` | ✅ Impede publicar o relatório com arquivo local obrigatório ausente; erro mostrado ao usuário |
| Fotos existentes abertas sob demanda | `technical-report-editor.js:368-395`; `tests/lazy-media-preview.test.mjs`, `tests/no-thumbnails.test.mjs` | ✅ Não solicita URLs de mídia para cada card ao renderizar; só a foto original ao clicar |
| Tratamento de erro no IndexedDB | `src/services/report-drafts.js:20-43`; `src/ui/commercial-report.js:113-120`; `script.js:85-90` | ✅ Erro propagado, logado e aviso ao usuário; recuperação não é garantida |
| Remoção de backup após commit | `src/ui/commercial-report.js:59-95`; `script.js:3052-3066` | ✅ Só remove backup depois de sucesso remoto reconhecido; na branch o fluxo comercial diferencia commit de falha na navegação |
| Testes versionados | `tests/report-drafts.test.mjs`, `tests/commercial-drafts.test.mjs`, `tests/assistance-draft.test.mjs`, `tests/lazy-media-preview.test.mjs` | ✅ Há testes unitários/mocks para separação de chaves, `Blob`, restauração e limites de UI; **não executados nesta leitura; não substituem teste em PWA real** |

## 2. Limitações observadas — **arquivadas para manutenção futura**

| ID | Cenário | Evidência/razão | Consequência possível |
| --- | --- | --- | --- |
| FUT-DR01 | Página fechada imediatamente após digitar/adicionar foto | Backups por debounce de 350 ms; `pagehide` e `visibilitychange` chamam async IndexedDB sem aguardar término (`src/ui/commercial-report.js:35-39,97-120`; `script.js:60-90,2891-2894`) | Última edição/foto ainda não persistida após encerramento abrupto |
| FUT-DR02 | Quota/limpeza de armazenamento do navegador ou desinstalação | IndexedDB é armazenamento local com limite/evicção; mensagens de erro existem, mas não há garantia de persistência em todos os dispositivos | Perda de rascunho local; exigir teste Android/iOS e política de retenção |
| FUT-DR03 | Conflito de backup com versão nova no servidor | `baseSignature` divergente **preserva** backup sem aplicar; não existe UI de inspeção/mesclagem na rotina analisada | Conteúdo antigo fica inacessível pelo fluxo normal, embora armazenado |
| FUT-DR04 | Duas abas no mesmo dispositivo salvam rascunho da mesma visita | Serialização ocorre em uma instância; cada aba possui sua própria `queues`; gravação interabas sem coordenação | Último `put` pode sobrescrever o anterior; teste/merge pendente |
| FUT-DR05 | Fotos R2 sem referência / falha na exclusão depois do commit | `technical-report-editor.js:790-809` limpa `pendingDeletes` antes de confirmar DELETE; `src/services/commercial-save.js:22-27` faz best effort; ver INF-07 | Objetos órfãos, sem fila durável de limpeza |
| FUT-DR06 | Alterar conta enquanto editor está aberto | Chaves incluem `uid`; handlers verificam contexto, mas testes reais de troca de conta durante upload/backup não realizados | Risco residual de corrida de UI / backup numa sessão inesperada |

**Nota:** o risco mais relevante de integridade de **mídia remota** está detalhado em [INF-07](infra-inf07-integridade-transacoes-r2-20261019.md) e será consolidado no backlog. Não reclassificar como corrigido só porque o envio normal funciona. A assinatura de URLs, o `PUT` R2 e a transação Firestore pertencem a sistemas independentes.

## 3. Decisão de release

**Conforme orientação do responsável:** não abrir uma refatoração de IndexedDB/fotografias antes do deploy apenas para investigar cenários não reproduzidos. **INF-10 encerrado na modalidade “revisão rápida, não homologada”**, sem promessa de recuperação infalível ou garantia no iOS/Android. **Não foram encontradas evidências estáticas de bloqueio imediato do fluxo normal que justifiquem reescrever o sistema nesta etapa.**

Reabrir se surgir relato de perda de foto/rascunho, erro de quota, troca de conta indevida, foto órfã acumulada ou incidente após atualização. Preservar sempre backup dos dados antes de qualquer migração. **Nenhum teste dinâmico ou deploy realizado nesta revisão.**
