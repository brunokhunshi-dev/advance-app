# Checklist oficial de estabilização — Advance Check v0.1.1

> **Correção de REV-01 — 20/10/2026:** implementado arquivamento atômico de texto e Blobs em conflito, separado do backup ativo no mesmo IndexedDB, para comercial, treinamento e assistência. Novos backups e limpeza após salvar não apagam os arquivos de conflito. Falha ao ler/arquivar interrompe abertura do editor, preservando o original. Regressões adicionadas; CI desta correção ainda pendente neste registro. INF-10 permanece sem homologação em navegador/celular real; publicação não autorizada. Os registros anteriores de bloqueio abaixo descrevem o diagnóstico antes deste patch.


> **Atualização de 20/10/2026 — DEPLOY BLOQUEADO (REV-01).** Revisão reproduziu sobrescrita do backup conflitante no próximo backup automático. A afirmação anterior de preservação permanente está corrigida por este registro. INF-10 reaberto; aceites de infraestrutura permanecem. Check e 161 testes passaram, CI e Preview READY confirmados em `6ad0b1e`, mas não cobriam este defeito. Ver [parecer e critérios de liberação](revisao-rc-v011-20261020.md). Registros de 19/10 abaixo são históricos e não constituem liberação atual.


**Atualizado em:** 20/10/2026  
**Branch de trabalho:** `fix/stability-state-queries-20261019` — PR #26 (draft)  
**Produção:** nenhuma correção desta PR foi mesclada/publicada.  
**Etapa atual:** **v0.1.1 em Release Candidate, sem deploy**. Auditoria INF-01…INF-11 documentada com INF-07 não homologado, INF-08 sem garantia server-side (risco aceito), INF-09 adiado e INF-10 somente revisão rápida. **GitHub Actions verde no commit funcional `2181d6e`: 161/161 testes e `npm run check` aprovados; Preview Vercel correspondente `READY`.** Responsável adiou publicação para amanhã. Último gate: validação manual, checagem de HEAD/CI do commit final e aprovação. Plano em `docs/release-candidate-v011-20261019.md`.

**Legenda:** [x] feito/registrado ou **encerrado por aceite** quando explicitamente indicado; [ ] não concluído; `PARCIAL` = houve trabalho sem evidência suficiente para encerramento técnico. **Aceite de risco para piloto não equivale a teste ou correção comprovada.**  
**Importante:** implementação na branch e aceite administrativo das etapas não significam teste aprovado, homologação nem deploy. **Decisão de 19/10/2026:** não publicar novas regras Firestore nem Worker na Cloudflare enquanto a auditoria e homologação não forem concluídas; exceção somente para hotfix crítico comprovado, isolado e com rollback.

## 1. Preparação e preservação

- [x] Registrar o deployment/commit efetivamente publicado no Vercel: produção `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e`, deployment `dpl_8WPq6oNVxToLWDySozZ9x91gi89m` (`READY`, `2026-10-16`).
- [ ] Registrar versão, hash/código e configurações não secretas do Worker efetivamente publicado na Cloudflare.
- [x] Criar branch isolada de auditoria/correções e manter PR como draft.
- [x] Preservar a `main` sem merge da PR #26 até a revisão.
- [ ] Documentar e testar rollback do Vercel **e** do Worker (incluindo dependência das regras Firestore).
- [ ] Formalizar congelamento de funcionalidades novas e mudanças diretas na `main`.

## 2. Auditoria estrutural — análise estática concluída

- [x] Mapear os componentes e contratos principais entre App, Admin, Firebase, Functions, Worker e R2 no código versionado.
- [x] Localizar arquivos grandes e responsabilidades misturadas (`script.js`, `technical-report-editor.js`, Worker, `visits.js`, `team.js`, `clients.js`).
- [x] Identificar duplicações de lógica e implementação (cadastro de equipe via browser versus Cloud Function; utilitários iguais nos dois repositórios).
- [x] Inspecionar grafo de dependências dos 34 módulos principais; **nenhum ciclo encontrado nessa amostra**, sem extrapolar para todo o sistema.
- [x] Identificar acoplamento entre interface, estado e Firestore, sobretudo em `script.js` e páginas do Admin.
- [x] Revisar estaticamente estado global, geração de requisições, versionamento de sessão e operações assíncronas.
- [x] Inspecionar registros de listeners e observers no código; **vazamento em tempo de execução não comprovado**.
- [x] Catalogar fallbacks de compatibilidade e páginas de preview/simulação; **nenhum arquivo classificado como morto sem prova de uso**.
- [x] Registrar gravidade, causa, evidência e arquitetura-alvo incremental em `docs/auditoria-estrutural-v011-20261019.md`.
- [ ] Confirmar dinamicamente número de listeners/observers após repetidas navegações e novas sessões (passa para homologação).
- [ ] Fazer verificação automatizada exaustiva dos entrypoints/imports dinâmicos e identificar símbolos sem uso (não coberto totalmente pela revisão estática).

**Decisão:** não reescrever a aplicação. Refatorar gradualmente e somente após garantir os testes de regressão necessários.

## 3. Auditoria de integridade e infraestrutura — triagem encerrada para a janela v0.1.1

- [x] **INF-01 — Baseline operacional (com ressalvas):** Vercel produção confirmado; regras fornecidas e mantidas por decisão do responsável; Worker anexado e comparado; ID Cloudflare `72ad09f0-08c5-43da-a6bd-e67180fb9599` (17/10/2026) e CORS R2 informados; erro `Failed to fetch` informado resolvido (`|` → `/`). Nome do bucket e vínculo do código com deployment não verificados de modo independente; registrados para futura validação. **Admin descontinuado.** Evidências em `docs/infra-inf01-baseline-20261019.md`. Preview continua conectado ao backend produtivo.
- [x] **INF-02 — Matriz Firestore ESTÁTICA CONCLUÍDA:** matriz por tela, ação, perfil, coleções e operações SDK/TX/REST do Worker recebido; caminhos de R2, caches, importação/CLI e comparação `main` × branch. **Functions externas não comprovadas como ativas**; custo real, regras avaliadas e índices publicados ficam para INF-03/INF-04. Evidências: `docs/infra-inf02-matriz-firestore-20261019.md`.
- [x] **INF-03 — Consumo/limites (ENCERRADO POR ACEITE PARA PILOTO):** matriz analítica, riscos e guardrails registrados. Evidências fornecidas: **744 leituras Firestore, 108 avaliações de permissões, 1 exclusão; 24 invocações Worker, 60 subrequests (52 Firestore, sendo 24 HTTP 4xx), 0 erros de execução reportados**; 3 promotores e cerca de 20 clientes. **Índices informados desativados; não se comprovou qual índice.** O responsável aceitou manter como está; medições por ação, orçamento definitivo, índices e diagnóstico de 4xx continuam **não realizados**, sem travar o piloto. `docs/infra-inf03-consumo-limites-20261019.md`.
- [x] **INF-04 — Autenticação/permissões (ENCERRADO POR ACEITE PARA PILOTO):** regras fornecidas `allow read, write: if request.auth != null` permitem leitura/escrita global a **qualquer conta autenticada no projeto**, sem segregação de perfil/propriedade. Responsável aceitou manter as regras atuais; **não é validação de segurança** nem prova independente da versão publicada. Validação de relatórios e acesso direto permanece no INF-08/homologação. Nunca publicar `advance-admin/firestore.rules` isoladamente. `docs/infra-inf04-inf06-aceite-piloto-20261019.md`.
- [x] **INF-05 — Worker/Auth (ENCERRADO POR ACEITE PARA PILOTO):** código do Worker fornecido comparado ao GitHub (**diferença de miniaturas**); identificador de versão `72ad09f0-...` corroborado no painel com 100% do tráfego, 24 invocações e zero erros de execução. **24 de 52 subrequests Firestore deram HTTP 4xx**, sem status detalhado; perfis, exceção de gestão e binding publicado não foram integralmente homologados. Responsável aceita manter o Worker, **sem publicar substituição**. `docs/infra-inf04-inf06-aceite-piloto-20261019.md`.
- [x] **INF-06 — CORS/uploads (ENCERRADO POR ACEITE PARA PILOTO):** CORS R2 enviado é compatível estaticamente com `POST Worker → PUT R2 → commit Firestore`; responsável confirmou que o incidente `Failed to fetch` foi corrigido (separador `|` → `/`). **Não houve reprodução independente nem teste de rede instável;** integridade/compensação de fotos continua no INF-07/homologação. **CORS mantido inalterado.** `docs/infra-inf04-inf06-aceite-piloto-20261019.md`.
- [ ] **INF-07 — NÃO HOMOLOGADO; REVISÃO ESTÁTICA CONCLUÍDA, RISCOS ARQUIVADOS:** transações Firestore atômicas verificadas por código; R2 PUT/DELETE é externo e best-effort. Aguardar ambiente isolado para testes T07-01…T07-10; **não apresentar testes como aprovados**. Alterações pós-commit existem apenas na PR. Referências: `docs/infra-inf07-integridade-transacoes-r2-20261019.md` e `docs/backlog-riscos-aceitos-pos-v011-20261019.md`.
- [x] **INF-08 — ANÁLISE ESTÁTICA CONCLUÍDA, SERVIDOR NÃO CONFORME (RISCO P1 PREEXISTENTE ACEITO PARA PILOTO):** checkout comercial, treinamento, assistência e fechamento manual validam campos e documentos dentro do JS cliente; regras atuais `request.auth != null` **não impedem escrita direta para `Concluída` sem relatório**. Não homologado server-side nem corrigido; **não publicar regras novas nesta janela**. Evidências: `docs/infra-inf08-relatorios-validacao-servidor-20261019.md` e backlog.
- [ ] **INF-09 — ADIADO PARA VERSÃO FUTURA POR DECISÃO DO RESPONSÁVEL:** revisão do Service Worker, cache, atualização da instalação/offline e alternância de conta não homologadas nesta janela. Não classificar como concluído; registrar em `docs/backlog-riscos-aceitos-pos-v011-20261019.md` (FUT-PWA01).
- [ ] **INF-10 — REABERTO EM 20/10, REV-01 P1 REPRODUZIDO:** verificados por código: rascunhos separados por UID/visita/tipo, Blobs no IndexedDB, assinatura-base anti-conflito, restauração de fotos, mensagens quando arquivo falta, leitura sob demanda. **Não testados** fechamento abrupto, falta de espaço, evicção, conflito interabas, device PWA real; riscos FUT-DR01…06 arquivados para versão futura. Evidência: `docs/infra-inf10-revisao-rapida-rascunhos-fotos-20261019.md`.
- [x] **INF-11 — CONSOLIDAÇÃO DOCUMENTAL CONCLUÍDA:** evidências e ressalvas INF-01…INF-10 registradas nos relatórios, com índice central de riscos técnicos e decisões de aceite em `docs/backlog-riscos-aceitos-pos-v011-20261019.md`. **Não são cenários de homologação executados; registros de CI/QA/deploy da v0.1.1 continuam pendentes.**

**Fora do escopo bloqueador:** trava transacional de dois check-ins simultâneos do mesmo promotor. Mantém-se validação atual no fluxo normal; reavaliar somente se surgir requisito/evidência operacional.

## 4. Relatório de problemas e arquitetura-alvo

- [x] Registrar 14 achados estruturais com causa, arquivo, gravidade e recomendação.
- [x] Distinguir dívida estrutural de bugs específicos e de riscos ainda não comprovados no deploy.
- [x] Propor arquitetura-alvo incremental para App, Admin, Worker e schemas.
- [x] Registrar e vincular no checklist o baseline INF-01 e a matriz estática INF-02 com evidências e pendências separadas. O relatório de auditoria estrutural original permanece preservado.
- [x] Definir bloqueador confirmado REV-01 e critérios objetivos de liberação no parecer de 20/10.
- [x] Priorizar correção mínima de REV-01 antes do smoke e nova avaliação de deploy.

## 5. Correções prioritárias — implementadas na branch, NÃO homologadas

- [x] Implementar escopo/versionamento de requisições para evitar mistura entre visitas.
- [x] Implementar repositório de atividades com consultas compartilhadas e deduplicação.
- [x] Implementar cache curto, invalidação após mutações e cooldown após `resource-exhausted`.
- [x] Remover leituras pós-commit que podiam transformar gravação confirmada em falso erro.
- [x] Ajustar estado de sucesso quando relatório é persistido, mas callback da interface falha.
- [x] Implementar backups locais de relatórios comerciais, treinamento e editor técnico, incluindo arquivos comprimidos via IndexedDB.
- [x] Acrescentar validação de módulos obrigatórios no fechamento manual do treinamento.
- [x] Revisar o diff funcional da PR #26 contra main; parecer de 20/10 registrado.
- [ ] Corrigir REV-01: backup conflitante pode ser sobrescrito; acrescentar regressão e revalidar candidata.
- [ ] Garantir interface recuperável para backup local cujo relatório remoto mudou.
- [ ] Validar no servidor as condições para marcar atividade concluída.
- [ ] Preparar patches de Firestore Rules e Worker **na branch**, quando justificados por evidências; executar testes e revisão antes de qualquer publicação.
- [ ] Corrigir achados de infraestrutura que se comprovem bloqueadores.
- [ ] **Não** fazer refatoração arquitetural ampla na v0.1.1 sem teste/regressão que a sustente.

## 6. Testes automatizados e homologação

- [x] Adicionar testes para cache/consultas, escopos assíncronos, IndexedDB e sucesso de persistência com falha de interface.
- [x] Atualizar testes existentes de transações para novos módulos.
- [x] **19/10:** `npm run check` aprovado no commit funcional `2181d6eb25a93b436a40fd84ca469fdf5ecc1448`.
- [x] **19/10:** `npm test` aprovado no commit funcional `2181d6eb`: **161/161 testes, zero falhas**.
- [x] **19/10:** GitHub Actions [run 39302253709](https://github.com/brunokhunshi-dev/advance-app/actions/runs/39302253709) com CI verde; teste de assistência corrigido no mock (timers/backup) sem alteração na lógica do app.
- [ ] **Pré-merge:** reverificar que `npm run check` e `npm test` permanecem verdes na HEAD **final** da PR, inclusive commits documentais posteriores.
- [x] **Advance Admin descontinuado:** checks adicionais do repositório Admin não são requisito de deploy desta release do App.
- [ ] Preparar Firebase e R2 de homologação separados, incluindo configuração/rota de Worker de teste e contas fictícias; **não** testar cenários destrutivos no Preview conectado à produção.
- [ ] Homologar no celular login, agenda, check-in/out, três relatórios, fotos e recuperação de rascunhos.
- [ ] Simular rede instável, perda de sessão, fechamento forçado, falha de upload e escrita parcial.
- [ ] Testar autorizações, escrita direta inválida, revogação de acesso e casos de quota.
- [ ] Comparar consumo real de leituras e chamadas ao Worker antes/depois.
- [ ] Homologar coerência dos relatórios entre App, Firestore e Worker; painel Advance Admin descontinuado fica fora do escopo operacional.
- [ ] Confirmar atualização do PWA instalado e estratégia de rollback no momento do release. **Auditoria aprofundada INF-09 do Service Worker adiada para release futura por decisão do responsável; não confundir com teste de instalação básico.**

## Política aprovada para Firebase Rules e Cloudflare Worker

- [x] **Decisão de publicação registrada:** adiar mudanças em produção até concluir auditoria, preparar patches e homologar num ambiente isolado.
- [x] **Exceção registrada:** apenas correção urgente para falha crítica comprovada, com escopo mínimo, testes direcionados e rollback validado, poderá seguir em hotfix separado.
- [ ] Exportar/copiar de modo seguro a versão **ativa** das regras Firestore e do Worker antes de propor qualquer substituição (sem compartilhar segredos).
- [ ] Fazer comparação **diff** entre versões publicadas e versionadas; registrar mudanças operacionais, permissões e dependências.
- [ ] Obter aprovação da sequência de implantação e da janela de mudanças antes de publicar.
- [ ] Confirmar, após futura publicação, os hashes/versões implantados, o funcionamento do PWA existente e as métricas de erros/requisições.

**Não há publicação autorizada no momento. Auditoria e leitura de configurações podem continuar normalmente.**

## 7. Publicação v0.1.1 — bloqueada por REV-01

- [x] Congelar escopo funcional e registrar versão candidata, GitHub Actions e Preview em `docs/release-candidate-v011-20261019.md`.
- [x] Registrar riscos aceitos e adiados no backlog, com INF-07 não homologado e INF-08 server-side não atendido.
- [x] Confirmar baseline de rollback da produção: deployment `dpl_8WPq6oNVxToLWDySozZ9x91gi89m`, SHA `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e` (**rollback não testado**).
- [ ] Conferir CI verde na HEAD **final** da PR e Preview `READY` no **mesmo SHA**; após documentar, não publicar nenhuma mudança não verificada.
- [ ] Executar smoke manual mínimo sem gravar dados reais pelo Preview (compartilha backend PROD), e registrar testes que não puderem ser realizados sem staging.
- [ ] Conferir atualização do PWA instalado; INF-09 continua adiado, sem alegar homologação.
- [ ] Reconfirmar aceitação explícita dos riscos técnicos preexistentes e liberar por decisão do responsável.
- [ ] Somente com aprovação, mesclar PR #26 em `main` para deploy automático Vercel; **não atualizar Firestore Rules, Worker nem CORS nesta release**.
- [ ] Verificar SHA e domínio da produção e monitorar login, relatório/fotos, reads, quotas e Worker após publicação.
- [ ] Se necessário, usar rollback do frontend para último deploy PROD estável e confirmar aliases; **não reverter dados Firestore automaticamente**.

**Regra de mudança:** nada será publicado automaticamente. Se qualquer teste/CI falhar ou houver indicação de perda de dados, manter a v0.1 em produção até diagnóstico.

## Referências

- [Auditoria estrutural — evidências e decisões](auditoria-estrutural-v011-20261019.md)
- [INF-01 — baseline operacional: Vercel, Firebase, Worker e R2](infra-inf01-baseline-20261019.md)
- [INF-02 — matriz Firestore por tela/ação, transações e Worker REST](infra-inf02-matriz-firestore-20261019.md)
- [INF-03 — diagnóstico de consumo, métricas fornecidas e aceite para piloto](infra-inf03-consumo-limites-20261019.md)
- [INF-07 — auditoria estática de transações Firestore, R2, concorrência e compensação](infra-inf07-integridade-transacoes-r2-20261019.md)
- [INF-08 — ausência de validação no servidor, risco aceito temporariamente](infra-inf08-relatorios-validacao-servidor-20261019.md)
- [INF-10 — revisão rápida de rascunhos, fotos e IndexedDB](infra-inf10-revisao-rapida-rascunhos-fotos-20261019.md)
- [Backlog pós-v0.1.1 — riscos conhecidos arquivados (inclui INF-09 adiado)](backlog-riscos-aceitos-pos-v011-20261019.md)
- [Release Candidate v0.1.1 — versão candidata, CI, Preview e passos de deploy/rollback](release-candidate-v011-20261019.md)
- [INF-04 a INF-06 — registro de aceite e riscos conhecidos](infra-inf04-inf06-aceite-piloto-20261019.md)
- [Estabilização — código implementado, riscos e roteiro de teste](stabilizacao-v01-20261019.md)
- PR de trabalho: https://github.com/brunokhunshi-dev/advance-app/pull/26

**Ponto de retomada (amanhã):** abrir `docs/release-candidate-v011-20261019.md` e PR #26; confirmar **CI verde e Preview READY no commit final da PR**, realizar smoke não destrutivo e discutir testes não homologados. Somente então solicitar autorização para merge/publicação. **Produção v0.1 intacta; Firebase Rules, Worker e R2 inalterados**. INF-09 será revisitado em versão futura.
