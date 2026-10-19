# Checklist oficial de estabilização — Advance Check v0.1.1

**Atualizado em:** 19/10/2026  
**Branch de trabalho:** `fix/stability-state-queries-20261019` — PR #26 (draft)  
**Produção:** nenhuma correção desta PR foi mesclada/publicada.  
**Etapa atual:** triagem acelerada de release: INF-07 **analisado, não homologado** e arquivado; INF-08 auditoria estática **concluída, mas garantia server-side ausente e risco aceito temporariamente**; INF-09 **ADIADO** para versão futura; INF-10 **revisão rápida concluída sem homologação**; INF-11 **backlog/evidências consolidados**. Próximo trabalho: **correções da v0.1.1 e validação pré-deploy**, sem alterar Firebase Rules nem Worker.

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
- [x] **INF-10 — REVISÃO RÁPIDA CONCLUÍDA, NÃO HOMOLOGADA:** verificados por código: rascunhos separados por UID/visita/tipo, Blobs no IndexedDB, assinatura-base anti-conflito, restauração de fotos, mensagens quando arquivo falta, leitura sob demanda. **Não testados** fechamento abrupto, falta de espaço, evicção, conflito interabas, device PWA real; riscos FUT-DR01…06 arquivados para versão futura. Evidência: `docs/infra-inf10-revisao-rapida-rascunhos-fotos-20261019.md`.
- [x] **INF-11 — CONSOLIDAÇÃO DOCUMENTAL CONCLUÍDA:** evidências e ressalvas INF-01…INF-10 registradas nos relatórios, com índice central de riscos técnicos e decisões de aceite em `docs/backlog-riscos-aceitos-pos-v011-20261019.md`. **Não são cenários de homologação executados; registros de CI/QA/deploy da v0.1.1 continuam pendentes.**

**Fora do escopo bloqueador:** trava transacional de dois check-ins simultâneos do mesmo promotor. Mantém-se validação atual no fluxo normal; reavaliar somente se surgir requisito/evidência operacional.

## 4. Relatório de problemas e arquitetura-alvo

- [x] Registrar 14 achados estruturais com causa, arquivo, gravidade e recomendação.
- [x] Distinguir dívida estrutural de bugs específicos e de riscos ainda não comprovados no deploy.
- [x] Propor arquitetura-alvo incremental para App, Admin, Worker e schemas.
- [x] Registrar e vincular no checklist o baseline INF-01 e a matriz estática INF-02 com evidências e pendências separadas. O relatório de auditoria estrutural original permanece preservado.
- [ ] Definir lista **final** de bloqueadores v0.1.1 com critério objetivo de aceite e regressão.
- [ ] Priorizar correções sem ampliar desnecessariamente o escopo do release.

## 5. Correções prioritárias — implementadas na branch, NÃO homologadas

- [x] Implementar escopo/versionamento de requisições para evitar mistura entre visitas.
- [x] Implementar repositório de atividades com consultas compartilhadas e deduplicação.
- [x] Implementar cache curto, invalidação após mutações e cooldown após `resource-exhausted`.
- [x] Remover leituras pós-commit que podiam transformar gravação confirmada em falso erro.
- [x] Ajustar estado de sucesso quando relatório é persistido, mas callback da interface falha.
- [x] Implementar backups locais de relatórios comerciais, treinamento e editor técnico, incluindo arquivos comprimidos via IndexedDB.
- [x] Acrescentar validação de módulos obrigatórios no fechamento manual do treinamento.
- [ ] Revisar criticamente o diff completo da PR #26 e corrigir eventuais regressões.
- [ ] Garantir interface recuperável para backup local cujo relatório remoto mudou.
- [ ] Validar no servidor as condições para marcar atividade concluída.
- [ ] Preparar patches de Firestore Rules e Worker **na branch**, quando justificados por evidências; executar testes e revisão antes de qualquer publicação.
- [ ] Corrigir achados de infraestrutura que se comprovem bloqueadores.
- [ ] **Não** fazer refatoração arquitetural ampla na v0.1.1 sem teste/regressão que a sustente.

## 6. Testes automatizados e homologação

- [x] Adicionar testes para cache/consultas, escopos assíncronos, IndexedDB e sucesso de persistência com falha de interface.
- [x] Atualizar testes existentes de transações para novos módulos.
- [ ] Confirmar `npm run check` aprovado no commit candidato.
- [ ] Confirmar `npm test` aprovado no commit candidato.
- [ ] Confirmar GitHub Actions verde no commit candidato (**sem aprovação confirmada até aqui**).
- [ ] Ampliar checks do Admin (hoje `npm run check` não cobre todos os arquivos centrais).
- [ ] Preparar Firebase e R2 de homologação separados, incluindo configuração/rota de Worker de teste e contas fictícias; **não** testar cenários destrutivos no Preview conectado à produção.
- [ ] Homologar no celular login, agenda, check-in/out, três relatórios, fotos e recuperação de rascunhos.
- [ ] Simular rede instável, perda de sessão, fechamento forçado, falha de upload e escrita parcial.
- [ ] Testar autorizações, escrita direta inválida, revogação de acesso e casos de quota.
- [ ] Comparar consumo real de leituras e chamadas ao Worker antes/depois.
- [ ] Homologar coerência dos relatórios entre App, Firestore e Worker; painel Advance Admin descontinuado fica fora do escopo operacional.
- [ ] Homologar atualização de PWA instalado, Service Worker e rollback.

## Política aprovada para Firebase Rules e Cloudflare Worker

- [x] **Decisão de publicação registrada:** adiar mudanças em produção até concluir auditoria, preparar patches e homologar num ambiente isolado.
- [x] **Exceção registrada:** apenas correção urgente para falha crítica comprovada, com escopo mínimo, testes direcionados e rollback validado, poderá seguir em hotfix separado.
- [ ] Exportar/copiar de modo seguro a versão **ativa** das regras Firestore e do Worker antes de propor qualquer substituição (sem compartilhar segredos).
- [ ] Fazer comparação **diff** entre versões publicadas e versionadas; registrar mudanças operacionais, permissões e dependências.
- [ ] Obter aprovação da sequência de implantação e da janela de mudanças antes de publicar.
- [ ] Confirmar, após futura publicação, os hashes/versões implantados, o funcionamento do PWA existente e as métricas de erros/requisições.

**Não há publicação autorizada no momento. Auditoria e leitura de configurações podem continuar normalmente.**

## 7. Publicação v0.1.1

- [ ] Aprovar os bloqueadores com evidência e testes.
- [ ] Aprovar CI em App e Admin.
- [ ] **Se houver proposta futura de alteração** de Firestore Rules, validá-la no Emulator/ambiente isolado para os fluxos de campo; **não está autorizada nem programada alteração de regras nesta fase**. Nunca substituir a regra ativa pelo arquivo do Admin descontinuado.
- [ ] Validar versão proposta do Cloudflare Worker em ambiente de testes, com bucket R2 separado, permissões e fluxo de upload/leitura/exclusão.
- [ ] Comparar as versões ativas dos dois serviços com os patches revisados e planejar implantação compatível com o aplicativo já instalado.
- [ ] Preservar cópias/versionamento das regras Firestore e do Worker **efetivamente em produção** e confirmar o procedimento de rollback para ambos.
- [ ] Confirmar plano de rollback e observabilidade.
- [ ] **Somente após auditoria, testes de regras, Worker e fluxos críticos**, autorizar e publicar as mudanças de infraestrutura na ordem compatível com a v0.1 e a v0.1.1.
- [ ] Publicar/mesclar o frontend v0.1.1 somente após homologação e verificação de compatibilidade com o backend publicado.
- [ ] Monitorar erros, consumo do Firestore, uploads e integridade após lançamento.

## Referências

- [Auditoria estrutural — evidências e decisões](auditoria-estrutural-v011-20261019.md)
- [INF-01 — baseline operacional: Vercel, Firebase, Worker e R2](infra-inf01-baseline-20261019.md)
- [INF-02 — matriz Firestore por tela/ação, transações e Worker REST](infra-inf02-matriz-firestore-20261019.md)
- [INF-03 — diagnóstico de consumo, métricas fornecidas e aceite para piloto](infra-inf03-consumo-limites-20261019.md)
- [INF-07 — auditoria estática de transações Firestore, R2, concorrência e compensação](infra-inf07-integridade-transacoes-r2-20261019.md)
- [INF-08 — ausência de validação no servidor, risco aceito temporariamente](infra-inf08-relatorios-validacao-servidor-20261019.md)
- [INF-10 — revisão rápida de rascunhos, fotos e IndexedDB](infra-inf10-revisao-rapida-rascunhos-fotos-20261019.md)
- [Backlog pós-v0.1.1 — riscos conhecidos arquivados (inclui INF-09 adiado)](backlog-riscos-aceitos-pos-v011-20261019.md)
- [INF-04 a INF-06 — registro de aceite e riscos conhecidos](infra-inf04-inf06-aceite-piloto-20261019.md)
- [Estabilização — código implementado, riscos e roteiro de teste](stabilizacao-v01-20261019.md)
- PR de trabalho: https://github.com/brunokhunshi-dev/advance-app/pull/26

**Ponto de retomada:** **entrar nas correções e validações da PR #26 para a v0.1.1**. A auditoria INF-07 segue não homologada; INF-08 documentou ausência de garantia server-side e manteve aceite do responsável; INF-09 adiado; INF-10 concluído apenas como revisão rápida; INF-11 backlog pronto. Fazer `npm run check`, `npm test` e smoke test de funcionalidades sem alterar dados reais antes de considerar o deploy; manter rollback preparado. **Nenhum merge/deploy de Rules/Worker está autorizado e o Preview usa backend de PROD.**
