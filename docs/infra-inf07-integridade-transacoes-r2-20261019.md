# INF-07 — Integridade das transações, concorrência e compensação Firestore × R2

**Data da auditoria estática:** 19/10/2026  
**Status:** **EM ANDAMENTO — inspeção estática iniciada, com achados e matriz de falhas; testes de falha/concorrência em ambiente isolado pendentes.**  
**Escopo:** Advance Check em produção (`main`, commit `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e`) versus branch candidata `fix/stability-state-queries-20261019` (PR #26); Worker **anexado pelo responsável** `worker;(1).js` (Cloudflare versão indicada `72ad09f0-08c5-43da-a6bd-e67180fb9599`). O arquivo `cloudflare/advance-media-api.js` do GitHub **não é idêntico ao Worker anexado**; a lógica de remoção efetiva foi conferida no anexo.  
**Fonte:** inspeção somente leitura de `script.js`, `technical-report-editor.js`, `src/services/commercial-save.js`, `src/services/cancellation.js`, `src/services/report-drafts.js`, `src/data/activity-repository.js`, `src/ui/commercial-report.js` e testes `tests/commercial-persistence.test.mjs`, `tests/commercial-transactions.test.mjs`, `tests/report-drafts.test.mjs`, `tests/save-success-state.test.mjs`.  
**Segurança operacional:** nenhuma gravação, exclusão, alteração de código funcional, emulação de falhas contra PROD, alteração no Worker ou deploy realizada. Preview atual compartilha infraestrutura com PROD e **não é ambiente seguro para testes destrutivos**.

## 1. Princípios verificados no código

1. **Firestore transactions** agrupam as alterações de documentos **dentro da mesma transação**: ao salvar um relatório, `tx.set(relatorio)` e `tx.update(atividade)` integram o mesmo commit. Ao concluir uma visita, `tx.update(atividade)` e `tx.update(relatorio)` também integram o mesmo commit. Isso **protege a consistência entre esses documentos durante falha do commit Firestore**, não garante integridade de arquivos externos nem impede escritas diretas fora do app.
2. **R2 não participa da transação Firestore:** o aplicativo recebe uma URL assinada, envia o objeto e **depois** grava seu registro de referência no Firestore. A exclusão de objetos antigos acontece **após** a transação, como efeito colateral compensatório.
3. **Concorrência entre sessões:** fluxos de relatórios verificam estado/relatório atual com `tx.get` e recusam edições conflitantes; a validação de cliente, responsável e status é feita no código cliente e transação. **As regras Firestore fornecidas autorizam qualquer conta autenticada**, portanto essas verificações **não são invariantes de servidor contra clientes externos** (assunto aprofundado no INF-08).
4. **O código de produção possui duas leituras extras de confirmação após commit** de fechamento manual/checkout (cerca de `script.js:2474–2475` e `2751–2754` na `main`); a branch candidata remove essas leituras (`script.js:2565–2574,2843–2855`). Isso reduz o caso de *commit bem-sucedido, releitura falha, UI informa erro*; mitigação **ainda não homologada em produção**.
5. **Trava de UI `operacaoEmCurso` é local à aba, não ao usuário em múltiplos dispositivos.** A exclusividade cross-device de dois check-ins simultâneos já está documentada como *fora do escopo bloqueador* do piloto no checklist, sem declarar garantia de exclusividade.
6. **Recuperação de rascunhos:** a branch adiciona IndexedDB com chave usuário/tipo/atividade para relatórios (caminho modular e técnico); protege parte das edições **do lado cliente**, mas não constitui registro transacional de uploads no R2 nem rollback após fechamento abrupto. Auditoria profunda do IndexedDB pertence ao INF-10.

## 2. Matriz de operações de dados — estado e garantias

| Fluxo | Leituras para validação | Escritas Firestore / efeitos R2 | Atomicidade efetiva | Risco restante |
| --- | --- | --- | --- | --- |
| Criar visita | Cliente por ID (cache possível) | `setDoc(atividades/{id})` | **Uma escrita**; não envolve R2 | Falha de rede/confirm. e reenvio; ID previamente gerado no clique |
| Editar visita pendente | `tx.get(atividade)`, status e responsável | `tx.update(atividade)` | **1 doc, transação** | Sem controle de revisão de campos quando duas edições válidas concorrentes; última transação pode prevalecer |
| Cancelar atividade | `tx.get(atividade)`, regra de transição por função de domínio | `tx.update(atividade)` com motivo | **1 doc, transação** | Falhas de pós-commit/UI; testes de estados concurrentes necessários |
| Criar cliente real | Consulta CNPJ + `tx.get(clientes/id determinístico)` | `tx.set(cliente)` se novo | Unicidade do **ID determinístico** dentro da TX | Consultas prévias de CNPJ legado não impõem unicidade global entre documentos com IDs diferentes |
| Criar cliente provisório | Dados localizados externamente; TX sem read | `tx.set(clientes/id gerado)` | **1 doc em transação** | Sem detecção de duplicata sem CNPJ; comportamento deliberado |
| Check-in | Query de atividades em andamento + `tx.get(atividade)`, `tx.get(cliente)` | `tx.update(atividade)`; opcionalmente `tx.update(cliente.centroCidade)` | **TX atômica do par** quando cliente também é atualizado | Query anterior à TX não é trava de exclusividade entre dispositivos; risco conhecido fora do escopo bloqueador |
| Salvar relatório comercial | `tx.get(atividade)` + `tx.get(relatorio)`; compara baseline | **Uploads primeiro**; depois `tx.set(relatorio)` + `tx.update(atividade)` | **Firestore atômico; R2 não atômico** | Upload órfão ou exclusão frustrada; rollback é *best effort* |
| Salvar treinamento | Mesmo mecanismo comercial, coleção de treinamento | Mesmo fluxo comercial | **Firestore atômico; R2 não atômico** | Idem |
| Salvar assistência/livre | `tx.get(atividade)` + `tx.get(relatorio)`; compara histórico/blocos | `technicalEditor.prepareSave()` no R2; depois `tx.set(relatorio)` + `tx.update(atividade)`; `commitSave()` remove antigos | **Firestore atômico; R2 não atômico** | `pendingDeletes` pode ser perdido após falha de DELETE; detalhes F07-02 |
| Check-out convencional | `tx.get(atividade)` + `tx.get(relatorio)` + validação de módulos | `tx.update(atividade.status='Concluída')` + `tx.update(relatorio)` | **Dois documentos, uma TX Firestore** | Não confirma backend por Rule; falta teste de concorrência real com upload |
| Fechamento manual | `tx.get(atividade)` + `tx.get(relatorio)` + campos obrigatórios | `tx.update(atividade)` + `tx.update(relatorio)` | **Dois documentos, uma TX Firestore** | Backend sem invariantes; erro pós-commit na versão produtiva |

### Sequência real de persistência das fotos

```text
Rascunho local (foto em memória / IndexedDB)
  ↓
POST Worker /v1/media/upload-url (Firebase Auth + REST de perfil/atividade)
  ↓
PUT R2 com URL assinada /v1/activities/{atividade}/media/{midia}/original
  ↓
Firestore runTransaction: atualizar relatório + associar em atividades
  ├─ erro antes do commit → tentar DELETE das mídias recém-carregadas
  └─ commit concluído → limpar foto local, tentar DELETE das mídias antigas
```

Nenhum passo externo ao Firestore é revertido atomicamente se o navegador/Worker falhar após o PUT.

## 3. Achados priorizados (não são incidentes reproduzidos)

### F07-01 — Upload confirmado no R2, commit Firestore não executado [P1/P2 — risco potencial de órfãos]

**Evidência:**
- `src/services/commercial-save.js:8–27`: envia cada mídia, só depois executa `commit(prepared)`; na exceção, chama `media.delete` e usa `Promise.allSettled`.
- `technical-report-editor.js:735–787`: `prepareSave` envia mídias e `rollbackSave` tenta apagar o que já foi enviado; nenhuma operação externa persistida como *upload-intent* transacional.
- `script.js:2593–2619,2939–3052`: grava metadados do relatório e vínculo somente após upload.

**Condição de risco:** fechar a aba, perder energia ou derrubar processo entre o PUT R2 e o commit Firestore **impede a compensação JS de rodar**. Em sessão ativa, falhas de `media.delete` também podem deixar objeto órfão.

**Impacto possível:** objetos sem referência no Firestore e custo de armazenamento; não é evidência de relatório parcialmente gravado. A gravidade operacional depende de frequência e volume. **Não houve comprovação de órfãos existentes.**

**Proposta para futura correção:** registrar intenção de upload/estado `staged → attached` com prazo; job de reconciliação conservador que confira **todas as referências atuais e versões** antes de excluir; nunca deletar objetos automaticamente só por idade, sem vínculo verificado. Alternativa para baixo volume: auditoria manual de chaves R2 versus metadados, sem excluir dados até homologação.

### F07-02 — Exclusão de mídia falha e lista de pendências é descartada [P2 — achado confirmado no código]

**Evidência:** `technical-report-editor.js:790–809`: `const deleting = [...this.pendingDeletes]; this.pendingDeletes.clear();` ocorre **antes** de `Promise.allSettled(deleting.map(...))`; se um DELETE falhar, `pendingDeletes` já está vazio. O chamador `script.js:3061–3065` avisa “relatório salvo”, mas não restitui a fila.

**Impacto possível:** arquivo removido do relatório Firestore continua armazenado no R2, sem mecanismo local permanente de retry. Na função comercial (`src/services/commercial-save.js:22–24`), `cleanupFailed` avisa, mas também **não existe fila persistente de exclusões para retry**.

**Proposta para futura correção:** preservar IDs das exclusões com falha e adicioná-los a uma fila durável de limpeza; não excluir referência a objeto enquanto outra edição puder retomá-lo. Não executar exclusão automática em PROD nesta auditoria.

### F07-03 — Compensação por DELETE pode ficar proibida depois que visita muda para Concluída [P2 — janela de corrida cross-service]

**Evidência:** Worker **anexado**: `POST /v1/media/delete` chama `authorizeActivity(env,user,activityId,true)`. O método `authorizeActivity` exige `status === 'Em andamento'` para perfis que não são gestão. `upload-url` aplica a mesma exigência, mas o PUT R2 já assinado não consulta de novo o Firestore. Frontend pode ter enviado um objeto enquanto outro dispositivo fecha a visita.

**Cenário:** A começa upload, B conclui visita, A tenta TX; status inválido, A tenta DELETE como compensação, Worker responde conflito (como 409 para status) e objeto pode ficar sem referência.

**Impacto possível:** impossibilidade de limpar mídia órfã por usuário de campo depois do checkout; não se deve simplesmente afrouxar autorização da rota DELETE, pois isso pode apagar arquivo legítimo.

**Proposta para futura correção:** exclusão compensatória de mídias comprovadamente não anexadas por serviço autorizado com ownership e identidade da tentativa, após checagem de referência e versão; testar race antes de escolher mecanismo.

### F07-04 — Pós-commit com releitura em produção poderia mostrar falha após sucesso [Mitigado na branch; homologação pendente]

**Evidência `main`:** `script.js:2474–2475` e `2751–2754` fazem `getDoc` depois de `runTransaction`; se essa leitura falha por indisponibilidade/permissões, UI pode mostrar erro apesar do commit realizado.

**Branch candidata:** `script.js:2565–2574,2843–2855` remove as releituras e usa o sucesso da promessa de transação como confirmação. Para edição de relatório comercial, `src/ui/commercial-report.js:59–95` diferencia commit de erro na navegação; `tests/save-success-state.test.mjs` cobre esse caso.

**Status:** correção implementada no código candidato **não implantada**. Em sessão troca/logout no meio da operação, a interface ainda pode não refletir um commit remoto até reabrir atividade; tratar separadamente de erro Firestore.

### F07-05 — Dependências de sessão/caches e concorrência exigem teste com duas abas [P2 — validação pendente]

**Evidência:** 
- Check-in consulta `atividades` em andamento **antes** da transação (`script.js:2164–2172`) e a TX verifica apenas a atividade selecionada e o cliente (`2182–2206`). A condição “apenas uma visita em andamento por usuário” **não é bloqueada atomicamente em Firestore**; risco já aceito fora do escopo bloqueador.
- Edição de agendamento verifica status/autor na TX (`1692–1705`) mas não compara uma revisão explícita para mudanças concorrentes igualmente válidas na mesma visita. Em concorrência, última transação que reler/atualizar pode prevalecer.
- A função `salvarRelatorioComercial` (`script.js:2620–2626`) chama `exigirSessao(sessao)` **após** completar persistência. Mudança de sessão após commit, antes do retorno, pode propagar erro ao controlador apesar do banco já confirmado. O controlador modular tem melhor distinção pós-commit **quando a função retorna com sucesso**, não quando a função rejeita depois do commit.

**Proposta:** testes em duas sessões com versões e mudanças conflitantes; separar o estágio “commit remoto confirmado” de “sessão/UI ainda válida”; evitar induzir usuários a reenviar operação já confirmada.

### F07-06 — Cadastro e CNPJ têm idempotência parcial [P2/baixo no piloto]

**Evidência:** cadastro com CNPJ real consulta compatibilidade por campos legados antes de usar ID determinístico + `tx.get` (`script.js:1952–1989`), o que garante idempotência **pelo ID gerado**, mas não impõe unicidade para dados legados com ID arbitrário. Cadastro provisório usa ID gerado sem CNPJ (`1990–2005`).

**Proposta:** preservar semântica atual durante piloto; testar dois cadastros concorrentes com mesmo CNPJ real e casos legados antes de adotar índice/coleção de unicidade. Não é prova de duplicação real.

## 4. Cenários que já contam com proteção

| Proteção no código | Evidência |
| --- | --- |
| Vínculo atividade ↔ relatório gravados juntos | `script.js:2616–2619,3042–3049` |
| Status de atividade e checkout gravados junto com resultado do relatório | `script.js:2843–2845,2563–2565` |
| Exclusão de mídias antigas **após** commit comercial | `src/services/commercial-save.js:18–24` |
| Reversão de uploads novos **quando há exceção com app ativo** | `src/services/commercial-save.js:25–27`; `technical-report-editor.js:768–787` |
| Baseline de relatório comparado dentro da transação | `script.js:2605–2609,2956–2972,2992–2995` |
| Botões bloqueados durante operação por aba | `script.js` usa `operacaoEmCurso`; `src/ui/commercial-report.js:59–65` usa `saving` |
| Cache de atividades invalidado após alterações na branch | `script.js:1455,1650,1707,2209,2568,2848` |
| Testes existentes para conflito/rollback sem simulação de queda do processo | `tests/commercial-persistence.test.mjs:33–52`; `tests/commercial-transactions.test.mjs:34–79` |
| Teste existente para sucesso remoto com falha de navegação | `tests/save-success-state.test.mjs` |

**Restrições do teste unitário existente:** em geral usam mocks/VM e não reproduzem a fronteira real Firestore REST/SDK ↔ R2 ↔ Worker ↔ queda de processo. A existência de arquivo de teste **não prova que o CI rodou e aprovou o commit atual**.

## 5. Plano objetivo de testes para encerrar INF-07

Usar **Firestore/Auth/Worker/R2 de homologação isolados** com contas e atividades fictícias. Observar documentos e objetos e gravar trace de operação; não executar contra Preview atual porque compartilha a produção.

| Cenário | Injeção de falha / concorrência | Invariante a demonstrar | Resultado/aceite |
| --- | --- | --- | --- |
| T07-01 | Transação de relatório falha por permissão/conflito **depois** do PUT R2 | Atividade e relatório não são parcialmente gravados; foto nova ou é apagada ou fica rastreada para limpeza | Dados Firestore coerentes; mídia compensável |
| T07-02 | Fechar aba após PUT R2 e antes de TX | Não há link Firestore para a foto não confirmada; mecanismo detecta objeto órfão sem apagar fotos legítimas | Órfão identificado/recuperável, sem perda de referência |
| T07-03 | DELETE de mídia antiga retorna 403/409/500 | Relatório já salvo continua válido; exclusão é recuperável sem retry agressivo | Sem retratar commit como falha; pendência conservada |
| T07-04 | Dois dispositivos: A inicia foto, B finaliza visita, A tenta TX/rollback | Nenhum relatório tardio sobrescreve encerramento; compensação não depende de DELETE autorizado após fechamento | Sem mídia inacessível e sem corrupção |
| T07-05 | Duas abas salvam alterações diferentes no mesmo relatório | Rejeitar baseline obsoleto; preservar edição já confirmada; manter rascunho da sessão rejeitada | Sem perda silenciosa de conteúdo |
| T07-06 | Rede perde conexão **após** commit de checkout/manual, antes de atualização visual | UI não declara falha de escrita quando commit já foi confirmado; recuperação ao reabrir | Resultado remoto coincide com status |
| T07-07 | Dois cliques rápidos e troca de usuário durante upload/save | Uma intenção gravada; nenhum dado exibido na conta errada; rascunhos preservados | Sem duplicação e vazamento |
| T07-08 | Duas abas tentam iniciar visitas diferentes | Registrar comportamento atual; exclusividade cross-device somente se o requisito for reaberto | Risco conhecido, não travar sem decisão do responsável |
| T07-09 | CNPJ real criado simultaneamente, e registro legado já existente | Sem sobrescrever registro incorreto; novos IDs determinísticos consistentes | Sem duplicidade silenciosa onde existe chave |
| T07-10 | R2 objeto presente sem referência e objeto ainda válido | Processo de reconciliação **não apaga** válido por engano | Critério para limpeza manual/automática segura |

### Sequência de tratamento recomendada após a auditoria

1. **Não mudar a lógica em produção durante o INF-07.** Executar testes T07-01 a T07-07 em ambiente isolado, priorizando as fronteiras de upload.
2. Para F07-02, preparar mecanismo persistente de retry/compensação e teste de idempotência; não apagar mídia “órfã” automaticamente antes de verificar referências.
3. Manter a proteção de transação (save, checkout e manual) e o tratamento de pós-commit da branch; revisar F07-05.
4. Definir necessidade de reconciliação de mídias órfãs no R2 por volume e custo **medidos**, sem afirmar necessidade operacional imediata para 3 usuários.
5. Retomar INF-08 depois de registrar resultados ou bloqueadores do INF-07; aceites anteriores de INF-04/05/06 **não substituem** testes de integridade.

## 6. Aceite e limitações

- [x] Inventariados fluxos de criação/edição/cancelamento, check-in, relatórios, checkout e fechamento manual.
- [x] Identificada a fronteira atômica Firestore versus uploads/DELETE R2.
- [x] Comparada produção com a branch e localizadas correções de pós-commit não implantadas.
- [x] Identificados pontos onde compensação/cleanup pode falhar e hipóteses de concorrência.
- [x] Revisada cobertura dos testes existentes **por leitura do código**, sem execução.
- [ ] Executar matriz T07-01…T07-10 com falhas induzidas em ambiente isolado.
- [ ] Registrar resultado real por caso, evidências de commits/objetos e eventuais correções.
- [ ] Revisar o tratamento F07-02 e F07-03 caso seja considerado bloqueador da v0.1.1.
- [ ] Encerrar apenas após homologação dos casos de integridade essenciais ou aceite explícito dos riscos remanescentes pelo responsável.

**Status final deste documento:** INF-07 **INICIADO / PARCIAL (auditoria estática documentada)**; nenhuma correção proposta foi aplicada. **INF-08 permanece pendente.**
