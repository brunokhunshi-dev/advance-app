# Checklist oficial de estabilização — Advance Check v0.1.1

**Atualizado em:** 19/10/2026  
**Branch de trabalho:** `fix/stability-state-queries-20261019` — PR #26 (draft)  
**Produção:** nenhuma correção desta PR foi mesclada/publicada.  
**Etapa atual:** auditoria estrutural **estática concluída**; **próxima: auditoria de integridade e infraestrutura**.

**Legenda:** [x] feito/registrado; [ ] não concluído; `PARCIAL` = houve trabalho, mas não existe evidência suficiente para encerrar o item.  
**Importante:** implementação na branch não significa teste aprovado, homologação nem deploy.

## 1. Preparação e preservação

- [ ] Registrar o deployment/commit efetivamente publicado no Vercel.
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

## 3. Auditoria de integridade e infraestrutura — PRÓXIMA ETAPA

- [ ] **INF-01 — Baseline real:** confrontar Vercel, Worker, Firebase e regras publicados com os commits/configurações versionados. Preview do Vercel **não** cria Firebase/R2 de teste.
- [ ] **INF-02 — Matriz Firestore:** inventariar TODAS as consultas/escritas por tela, ação, usuário e componente (App, Admin, Worker, Functions); distinguir leituras de SDK, chamadas REST do Worker e avaliações das regras.
- [ ] **INF-03 — Custo/limites:** definir leitura esperada por login, abrir Início, Agenda, Histórico, relatório, fotos, check-in/out e telas Admin; revisar frequência, `getDocs` não limitado, deduplicação, retries e quota.
- [ ] **INF-04 — Permissões reais:** inspecionar regras **efetivamente publicadas** e testar leitura/escrita por promotor, assistente, gestor e conta desativada. `advance-admin/firestore.rules` não substitui prova das regras de produção.
- [ ] **INF-05 — Worker/Auth:** conferir código publicado, perfis ativos, autorização por atividade, tratamento de quotas, lote de mídias e a exceção de gestão associada a e-mail fixo vista no código versionado.
- [ ] **INF-06 — CORS e upload:** confirmar origem/métodos/headers e o caminho `POST upload-url → PUT R2 → commit Firestore`; reproduzir `Failed to fetch`.
- [ ] **INF-07 — Consistência e rollback:** inspecionar todas as transações, estados intermediários, arquivos órfãos, exclusões, concorrência, falha antes/depois do commit e tratamento de erro após sucesso.
- [ ] **INF-08 — Relatórios obrigatórios:** testar se escrita direta autenticada pode concluir atividade sem relatório válido ou vínculo correto; bloquear via regras/serviço caso possível.
- [ ] **INF-09 — Cache/PWA:** testar atualização do SW, invalidação, reinstalação, alternância de contas e compatibilidade de versões.
- [ ] **INF-10 — Rascunhos e retenção:** validar isolamento por UID, dados e Blobs no IndexedDB, falta de espaço, fechamento abrupto e resolução de conflitos.
- [ ] **INF-11 — Evidências:** registrar resultados com local do código, regra/deploy consultado, cenário reproduzido, impacto, custo provável e teste necessário.

**Fora do escopo bloqueador:** trava transacional de dois check-ins simultâneos do mesmo promotor. Mantém-se validação atual no fluxo normal; reavaliar somente se surgir requisito/evidência operacional.

## 4. Relatório de problemas e arquitetura-alvo

- [x] Registrar 14 achados estruturais com causa, arquivo, gravidade e recomendação.
- [x] Distinguir dívida estrutural de bugs específicos e de riscos ainda não comprovados no deploy.
- [x] Propor arquitetura-alvo incremental para App, Admin, Worker e schemas.
- [ ] Anexar à auditoria estrutural os resultados comprovados da infraestrutura e a matriz completa Firestore.
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
- [ ] Corrigir achados de infraestrutura que se comprovem bloqueadores.
- [ ] **Não** fazer refatoração arquitetural ampla na v0.1.1 sem teste/regressão que a sustente.

## 6. Testes automatizados e homologação

- [x] Adicionar testes para cache/consultas, escopos assíncronos, IndexedDB e sucesso de persistência com falha de interface.
- [x] Atualizar testes existentes de transações para novos módulos.
- [ ] Confirmar `npm run check` aprovado no commit candidato.
- [ ] Confirmar `npm test` aprovado no commit candidato.
- [ ] Confirmar GitHub Actions verde no commit candidato (**sem aprovação confirmada até aqui**).
- [ ] Ampliar checks do Admin (hoje `npm run check` não cobre todos os arquivos centrais).
- [ ] Preparar Firebase e R2 de homologação separados e contas fictícias; **não** testar cenários destrutivos em produção.
- [ ] Homologar no celular login, agenda, check-in/out, três relatórios, fotos e recuperação de rascunhos.
- [ ] Simular rede instável, perda de sessão, fechamento forçado, falha de upload e escrita parcial.
- [ ] Testar autorizações, escrita direta inválida, revogação de acesso e casos de quota.
- [ ] Comparar consumo real de leituras e chamadas ao Worker antes/depois.
- [ ] Homologar Admin e coerência dos relatórios com App/Worker.
- [ ] Homologar atualização de PWA instalado, Service Worker e rollback.

## 7. Publicação v0.1.1

- [ ] Aprovar os bloqueadores com evidência e testes.
- [ ] Aprovar CI em App e Admin.
- [ ] Validar releases e regras reais em ambiente de homologação.
- [ ] Confirmar plano de rollback e observabilidade.
- [ ] Publicar/mesclar somente após homologação.
- [ ] Monitorar erros, consumo do Firestore, uploads e integridade após lançamento.

## Referências

- [Auditoria estrutural — evidências e decisões](auditoria-estrutural-v011-20261019.md)
- [Estabilização — código implementado, riscos e roteiro de teste](stabilizacao-v01-20261019.md)
- PR de trabalho: https://github.com/brunokhunshi-dev/advance-app/pull/26

**Ponto de retomada:** seção **3 — INF-01** (verificar versões implantadas), seguida da matriz de consultas **INF-02**, permissões **INF-04** e rotas de upload **INF-06**. Registrar achados antes de alterar código.
