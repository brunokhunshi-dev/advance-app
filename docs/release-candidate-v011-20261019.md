# Release Candidate — Advance Check v0.1.1 (para homologação e deploy posterior)

> **Correção de REV-01 — 20/10/2026:** implementado arquivamento atômico de texto e Blobs em conflito, separado do backup ativo no mesmo IndexedDB, para comercial, treinamento e assistência. Novos backups e limpeza após salvar não apagam os arquivos de conflito. Falha ao ler/arquivar interrompe abertura do editor, preservando o original. Regressões adicionadas; CI desta correção ainda pendente neste registro. INF-10 permanece sem homologação em navegador/celular real; publicação não autorizada. Os registros anteriores de bloqueio abaixo descrevem o diagnóstico antes deste patch.


> **Atualização de 20/10/2026 — DEPLOY BLOQUEADO (REV-01).** Revisão reproduziu sobrescrita do backup conflitante no próximo backup automático. A afirmação anterior de preservação permanente está corrigida por este registro. INF-10 reaberto; aceites de infraestrutura permanecem. Check e 161 testes passaram, CI e Preview READY confirmados em `6ad0b1e`, mas não cobriam este defeito. Ver [parecer e critérios de liberação](revisao-rc-v011-20261020.md). Registros de 19/10 abaixo são históricos e não constituem liberação atual.


**Preparado em:** 19/10/2026  
**Projeto:** Advance Check / Advance App (somente PWA)  
**PR:** [#26 — fix(v0.1): estabilizar estado, consultas e backup de relatórios](https://github.com/brunokhunshi-dev/advance-app/pull/26)  
**Branch:** `fix/stability-state-queries-20261019`  
**Commit funcional validado no CI:** `2181d6eb25a93b436a40fd84ca469fdf5ecc1448` (correção do mock de teste da assistência). **Haverá commits documentais posteriores a este hash:** no dia do release, usar o SHA da HEAD da PR e exigir CI verde nesse SHA final.  
**Baseline da produção (19/10/2026):** Vercel `dpl_8WPq6oNVxToLWDySozZ9x91gi89m`, commit `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e`, `READY`.  
**Preview da versão funcional testada:** `dpl_6Wrb7WkrTTammjgQyLn4JSFxSrkc` (Vercel `READY` para `2181d6e`); URL `https://advance-a67o4452m-khunshiiiis-projects.vercel.app` (pode exigir autenticação de Vercel).  
**GitHub Actions:** [Validate app, run 39302253709](https://github.com/brunokhunshi-dev/advance-app/actions/runs/39302253709) — `npm run check` e `npm test` aprovados; **161 testes / 161 aprovados / 0 falhas**.  
**Estado:** **CÓDIGO CANDIDATO PREPARADO; DEPLOY ADIADO PELO RESPONSÁVEL. Aguardando homologação manual mínima e aprovação antes de merge.**  
**PROIBIDO até autorização explícita:** merge da PR, deploy em produção, atualização Firebase Rules, Worker Cloudflare ou buckets R2.

## 1. Mudanças incluídas — pacote de correção v0.1.1

| Correção incluída | Módulos | Prova disponível | Lacuna |
| --- | --- | --- | --- |
| Isolamento de respostas assíncronas por sessão/visita para evitar estado de uma visita invadir outra | `script.js`, `src/domain/request-scope.js` | Testes `request-scope` + CI | Multiaba e navegação real em PWA sem homologação |
| Consultas compartilhadas Início/Agenda + cache 5 s e dedup de chamadas em curso; pausa de quota | `src/data/activity-repository.js`, `script.js` | Testes `activity-repository` + CI | Medição de leituras reais com promotores |
| Remoção de releituras de confirmação após sucesso do commit Firestore | `script.js` | Testes de checkout/estado e CI | Rede interrompida em dispositivo real |
| Sucesso do salvamento comercial não revertido para erro se navegação falhar | `src/ui/commercial-report.js` | Teste `save-success-state` + CI | PWA real |
| Recuperação de rascunhos e fotos locais por UID/tipo/atividade, preservação de conflito | `src/services/report-drafts.js`, `script.js`, `src/ui/commercial-report.js` | Testes `report-drafts`, `commercial-persistence` e CI | Evicção IndexedDB, fechamento abrupto |
| Bloqueio de fechamento manual para módulos obrigatórios de treinamento ausentes | `script.js` | Testes `commercial-transactions` e CI | Não há enforcement server-side |
| SW cache versionado para incluir módulos novos (`v73`) | `sw.js` | Teste `service-worker` e CI | **INF-09 adiado**; atualização real de instalação não homologada |
| Ajuste no mock de assistência técnica para `clearTimeout` e `reportDraftStore.remove` | `tests/assistance-draft.test.mjs` | Corrigiu único teste que falhava; run 39302253709 verde | Apenas teste, sem alteração de comportamento no navegador |

**Não inclui:** migração de banco, alteração em `firestore.rules`, deploy de Worker, mudança de CORS, refatoração da busca indexada, manutenção do Admin descontinuado ou limpeza automática de objetos R2.

## 2. Decisões de risco explicitamente aceitas (não homologadas)

Índice central: [`backlog-riscos-aceitos-pos-v011-20261019.md`](backlog-riscos-aceitos-pos-v011-20261019.md).

- **Segurança P1 preexistente:** Rules globais `request.auth != null` permitem leitura/escrita de documentos por qualquer conta autenticada no projeto; conclusão direta sem relatório não é impedida por servidor (INF-04/08). Aceito temporariamente para o piloto, **não declarado seguro**.
- **Worker:** exceção de gestão e HTTP 4xx em subrequests Firestore requerem auditoria adicional, sem substituição neste release.
- **R2:** uploads e exclusões são separados do commit Firestore; órfãos/retries e concorrência entre dispositivos não homologados (INF-07).
- **INF-09:** Service Worker não homologado dinamicamente; avaliação adiada expressamente para release futura.
- **INF-10:** revisão estática de IndexedDB/fotos positiva para fluxo normal, mas quota, encerramento abrupto e PWA mobile não homologados.
- **Consultas:** índice do Histórico informado desativado; o fallback sem limite e leituras amplas de Perfil/clientes continuam riscos conhecidos, monitorar.
- **Preview:** versão da PR compartilha projeto Firebase PROD e Worker/R2 PROD. **Não testar ações destrutivas, uploads ou escritas reais nesse Preview com contas/lojas reais**; revisar apenas telas/código/fluxos não mutantes até haver ambiente isolado.

## 3. Gate de validação no dia do deploy

**Impedir merge/publicação se alguma condição obrigatória não estiver satisfeita.**

- [x] [19/10] `npm run check` passou no Actions para `2181d6eb`.
- [x] [19/10] `npm test` passou com 161/161 testes para `2181d6eb`.
- [x] [19/10] Vercel Preview para `2181d6eb` está `READY`.
- [x] [19/10] Código candidato não inclui deployment automático de Worker/Rules; mudanças de backend fora do escopo.
- [x] [19/10] Base produção e restauração potencial registradas.
- [ ] **Amanhã:** confirmar que SHA atual da PR coincide com o deploy Preview que será avaliado e que GitHub Actions está verde no SHA final.
- [ ] **Amanhã:** teste manual não destrutivo de login/logout e alternância entre Início, Agenda, Histórico e Perfil; observar se visitas de outra sessão aparecem indevidamente.
- [ ] **Amanhã:** smoke de abertura de relatório já salvo e exibição de arquivo existente, **somente leitura**, sem forçar gravações em produção via Preview.
- [ ] **Amanhã:** teste completo de rascunho → foto → salvar relatório → check-out em **ambiente realmente isolado**. Se o isolamento não existir, registrar a **ausência de homologação** e obter decisão explícita de assumir esse risco, sem simular teste em produção.
- [ ] **Amanhã:** conferir a versão instalada no PWA, especialmente se navegador mantém asset antigo/SW antigo, antes de autorizar os três promotores a atualizar.
- [ ] **Amanhã:** confirmar que a versão atual do Worker usa **somente original**, como no arquivo enviado, e que não há necessidade de publicá-lo.
- [ ] **Amanhã:** autorizar expressamente merge/deploy da PR #26 depois de revisar riscos; **não automaticamente**.

## 4. Sequência de publicação prevista (somente após autorização)

1. **Freeze:** confirmar branch, HEAD SHA, checks GitHub e Preview `READY`. Não fazer commits adicionais entre esse instante e publicação.
2. **Backup/rollback:** registrar `main` e deployment PROD imediatamente anterior à publicação. Baseline atual (19/10) `1d32689... / dpl_8WPq6oNVxToLWDySozZ9x91gi89m`; **rollback ainda NÃO testado**. Restore deve envolver apenas frontend, pois nenhum backend foi alterado por esta RC.
3. **Merge após aprovação:** mesclar PR #26 em `main` pelo fluxo GitHub; Vercel faz deploy automático da branch `main`. Não publicar manualmente Cloudflare Worker, Rules ou dados do Firebase.
4. **Confirmar produção:** novo deployment `READY`, SHA esperado e URLs `advance-app-one.vercel.app` / `advance-app-khunshiiiis-projects.vercel.app` servindo versão nova. Registrar a versão e o horário.
5. **Pós-deploy controlado:** testar login, navegação e abertura de relatório sem alterações indevidas; acompanhar Firestore (reads, quota, permission errors), Worker (invocations/4xx/5xx), erros JS, mídia e relatos dos 3 promotores; não confundir UI cache antiga com deploy falho.
6. **Rollback se regressão confirmada:** usar mecanismo de rollback/restauração do último deployment PROD estável no Vercel, verificar aliases e versão servida; **não desfazer dados Firestore automaticamente**. Como SW é cacheado, pode exigir reload ou atualização de versão do PWA; registrar evidências.

## 5. Critérios de parada e pendências futuras

**Não liberar se:** CI falhar, Preview/HEAD divergirem, alguém detectar tela de outra conta/visita, dados salvos aparecerem como não salvos, o upload em teste isolado falhar, ou houver evidência de corrupção/indisponibilidade. A ausência de ambiente de staging impossibilita dizer “homologado integralmente”; pode-se somente registrar uma decisão consciente de release com validações limitadas.

**Pendências deliberadamente fora desta RC:** INF-07 não homologado; integridade server-side ausente (INF-08), INF-09 adiado; bateria de dispositivos de INF-10; rastreio de 4xx Worker; melhorias de custo e índices. Preservadas no backlog, não consideradas encerradas tecnicamente.

**Resumo da entrega:** código candidato de estabilização com CI verde e Preview `READY`. **Sem deploy/merge em produção.** O último gate é humano e envolve a validação possível sem afetar dados reais, seguida de aprovação formal para lançar com os riscos aceitos.