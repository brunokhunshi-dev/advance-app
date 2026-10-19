# Checklist oficial de estabilização — Advance Check v0.1.1

**Atualizado em:** 19/10/2026  
**Branch de trabalho:** `fix/stability-state-queries-20261019` — PR #26 (draft)  
**Produção:** nenhuma correção desta PR foi mesclada/publicada.  
**Etapa atual:** INF-01 **encerrado como baseline operacional com ressalvas documentadas**; **INF-02 concluído como inventário estático** (App, Worker fornecido, telas e ferramentas auxiliares). **Próximo: INF-03 — métricas, limites e consumo por operação**. O inventário estático não comprova custos reais nem deployments não inspecionados diretamente.

**Legenda:** [x] feito/registrado; [ ] não concluído; `PARCIAL` = houve trabalho, mas não existe evidência suficiente para encerrar o item.  
**Importante:** implementação na branch não significa teste aprovado, homologação nem deploy. **Decisão de 19/10/2026:** não publicar novas regras Firestore nem Worker na Cloudflare enquanto a auditoria e homologação não forem concluídas; exceção somente para hotfix crítico comprovado, isolado e com rollback.

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

## 3. Auditoria de integridade e infraestrutura — PRÓXIMA ETAPA

- [x] **INF-01 — Baseline operacional (com ressalvas):** Vercel produção confirmado; regras fornecidas e mantidas por decisão do responsável; Worker anexado e comparado; ID Cloudflare `72ad09f0-08c5-43da-a6bd-e67180fb9599` (17/10/2026) e CORS R2 informados; erro `Failed to fetch` informado resolvido (`|` → `/`). Nome do bucket e vínculo do código com deployment não verificados de modo independente; registrados para futura validação. **Admin descontinuado.** Evidências em `docs/infra-inf01-baseline-20261019.md`. Preview continua conectado ao backend produtivo.
- [x] **INF-02 — Matriz Firestore ESTÁTICA CONCLUÍDA:** matriz por tela, ação, perfil, coleções e operações SDK/TX/REST do Worker recebido; caminhos de R2, caches, importação/CLI e comparação `main` × branch. **Functions externas não comprovadas como ativas**; custo real, regras avaliadas e índices publicados ficam para INF-03/INF-04. Evidências: `docs/infra-inf02-matriz-firestore-20261019.md`.
- [ ] **INF-03 — Custo/limites (PRÓXIMA):** quantificar leituras e avaliações de regras por login, Início, Agenda, Histórico, Perfil, relatórios, fotos, check-in/out e fluxos auxiliares ativos; revisar frequência, `getDocs` sem limite, duplicação, retries e quota. Separar Firestore SDK, REST Worker, Auth e R2. Admin descontinuado fora do tráfego normal.
- [ ] **INF-04 — Permissões reais:** regras **informadas pelo usuário** permitem `read, write` em qualquer documento para qualquer conta autenticada no projeto Firebase, sem restrição por perfil/propriedade. **Decisão do responsável: não alterar agora**. Registrar como risco conhecido/aceito, sem considerá-lo segurança validada. Auditoria pode confirmar comportamentos sem deploy; qualquer regra futura terá de preservar os fluxos de campo. **Nunca publicar `advance-admin/firestore.rules` isoladamente.**
- [ ] **INF-05 — Worker/Auth:** arquivo fornecido pelo responsável já foi comparado à cópia do GitHub; **não são iguais** (Worker fornecido usa só `original`, GitHub mantém miniaturas). Falta confirmar ID/data do deployment ativo no painel Cloudflare; examinar perfil, autorização, quota, lote e exceção de gestão. **Não substituir o Worker ainda.**
- [ ] **INF-06 — CORS e upload:** confirmar origem/métodos/headers e o caminho `POST upload-url → PUT R2 → commit Firestore`; reproduzir `Failed to fetch`.
- [ ] **INF-07 — Consistência e rollback:** inspecionar todas as transações, estados intermediários, arquivos órfãos, exclusões, concorrência, falha antes/depois do commit e tratamento de erro após sucesso.
- [ ] **INF-08 — Relatórios obrigatórios:** documentar e testar se escrita autenticada pode concluir atividade sem relatório válido/vinculado. Com a regra atual informada, **não há validação no Firestore Rules** para essa transição; manter a decisão de não mudar as regras agora, sem afirmar que o backend valida a integridade.
- [ ] **INF-09 — Cache/PWA:** testar atualização do SW, invalidação, reinstalação, alternância de contas e compatibilidade de versões.
- [ ] **INF-10 — Rascunhos e retenção:** validar isolamento por UID, dados e Blobs no IndexedDB, falta de espaço, fechamento abrupto e resolução de conflitos.
- [ ] **INF-11 — Evidências:** registrar resultados com local do código, regra/deploy consultado, cenário reproduzido, impacto, custo provável e teste necessário.

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
- [Estabilização — código implementado, riscos e roteiro de teste](stabilizacao-v01-20261019.md)
- PR de trabalho: https://github.com/brunokhunshi-dev/advance-app/pull/26

**Ponto de retomada:** **INF-03** — medir/estimar o custo real das operações inventariadas no INF-02 e comparar a produção com a branch. O nome/binding R2 e a confirmação Cloudflare independente permanecem como ressalvas do INF-01. Avançar depois em ordem INF-04…INF-11. Não publicar Rules/Worker nesta fase, salvo hotfix crítico isolado.
