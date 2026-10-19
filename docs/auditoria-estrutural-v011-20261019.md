# Auditoria estrutural — Advance Check / Advance Admin / Worker

**Data:** 19/10/2026  
**Tipo:** análise estática de arquitetura e manutenção, sem mudanças de comportamento.  
**Base App:** commit cc2387e171af227e0246d4599145509fbf0af6ee, branch fix/stability-state-queries-20261019 (PR #26, draft).  
**Base Admin:** commit c525432113a514b19281513b189c45028cd70d52, main.  
**Worker analisado:** cópia versionada em cloudflare/advance-media-api.js, NÃO o deploy efetivamente publicado.

## 1. Escopo, método e ressalvas

Lidos os pontos de entrada, módulos de domínio/dados/UI relevantes, autenticação, relatórios, fluxo de mídia, cache, Service Worker, arquivos de configuração, Functions administrativas, regras versionadas, documentação e testes. Inspecionado o grafo de imports de 34 módulos principais do App e os pontos de entrada do Admin, a distribuição de operações Firestore e os registros de listeners no código.

**Não foram executados** testes de navegador, Firestore Emulator, dispositivos, Worker/R2 ou inspeções das regras e deployments efetivamente publicados. A ausência de falha observada na leitura do código não representa validação de produção. As referências a linhas são das revisões fixadas acima.

## 2. Arquitetura encontrada

- **Advance Check PWA:** index.html + script.js coordenam Firebase Auth, Firestore, navegação, edição de visitas, check-in/check-out, rascunhos e chamadas de módulos. src/domain concentra regras independentes; src/data abstrai alguns reads/cache; src/ui concentra componentes; technical-report-editor.js centraliza preparação/compressão/upload de arquivos. sw.js mantém shell estático offline, não sincronização offline de transações.
- **Advance Admin:** páginas dashboard.js, team.js, clients.js, visits.js importam core.js. O core faz Auth/Firestore/checagem administrativa e oferece um cache de snapshots de coleções por usuário/aba (collection-cache.js, TTL 120 s); páginas ainda consultam bases completas. functions/index.js fornece operações administrativas com Firebase Admin SDK.
- **Firebase:** projeto compartilhado por App/Admin. Entidades centrais: administradores, gestores, promotores, assistencia, clientes, atividades, produtos, relatorios legados e relatorios_comerciais / relatorios_treinamentos / relatorios_assistencia_tecnica.
- **Cloudflare:** Worker separado autentica via Firebase ID token, consulta perfis/atividades por Firestore REST e emite URLs assinadas para R2 (upload, leitura, exclusão; também foto de perfil e métricas de armazenamento). Deploy do Worker é manual/independente do Vercel.
- **Regras:** advance-admin/firestore.rules é uma cópia versionada voltada ao acesso administrativo e não comprova as regras efetivamente publicadas para o App. O próprio README informa que GitHub não publica essas regras automaticamente.

## 3. Inventário de concentração de responsabilidades

| Arquivo | Tamanho aproximado | Diagnóstico |
| --- | ---: | --- |
| App script.js | 3.112 linhas / 146 KB | Coordenador excessivo: autenticação, navegação, estado global, Firestore, formulários e persistência |
| App technical-report-editor.js | 816 linhas / 34 KB | Interface de blocos + preview + compressão + upload/R2 no mesmo módulo |
| App src/ui/commercial-report.js | 314 linhas / 31 KB | UI, regras de formulário, fotos, versionamento, backup e save no mesmo componente |
| App cloudflare/advance-media-api.js | 1.485 linhas / 29 KB | Autenticação, consulta Firestore, autorização, assinatura S3, rotas e métricas |
| Admin visits.js | 836 linhas / 42 KB | Busca, joins, métricas, 3 modelos de relatório, imagem, impressão e interação |
| Admin team.js | 332 linhas / 29 KB | Gestão, mapa, indicadores, perfis e criação de conta |
| Admin clients.js | 151 linhas / 27 KB | Lógica densamente comprimida, misturando formulário, geocodificação e persistência |
| Admin functions/index.js | 20 linhas / 8,5 KB | Linhas extremamente longas; operações sensíveis difíceis de inspecionar e testar isoladamente |

A separação por camadas foi iniciada e está funcionando como direção arquitetural; uma reescrita total não se justifica para a v0.1.1.

## 4. Achados classificados

### EST-01 — P1 | script.js como concentrador e estado global mutável
**Evidência:** App script.js, linhas 120–206 (IDs selecionados, atividade, relatório, flags de operação, navegação, versões), 423–593 (Auth e boot), 664–884 (navegação), 2158–2628 (transações e fechamento), 2632–3112 (eventos e salvamento). Há 10 funções atribuídas a window.*, cerca de 75 ocorrências de registro/controle de eventos e 53 referências a operacaoEmCurso.  
**Causa:** coordenação de múltiplos fluxos feita pelo mesmo módulo, com estado partilhado entre navegação, UI e banco.  
**Risco:** alterações locais afetam outros fluxos; manutenção/regressão difíceis; contextos assíncronos podem se misturar.  
**Ação:** refatoração incremental em controladores de sessão/navegação/agenda/visita/checkout, com injeção de dependências Firestore. **Não** mover todas as funções antes de homologar as correções atuais.

### EST-02 — P1 | coexistência de proteções assíncronas diferentes
**Evidência:** App script.js, linhas 187–206 (versaoSessao, sequencias, scopes, flags); linhas 482–590 (troca de usuário); 664–884 (invalidadores de navegação); módulos src/domain/request-scope.js e src/data/activity-repository.js.  
**Causa:** cada fluxo protege leituras com um mecanismo diferente; os novos scopes cobrem abertura de relatório/visualizador, mas não são um padrão único para todo o ciclo de vida.  
**Risco:** novos handlers podem atualizar estado de uma tela depois de usuário/tela/visita mudar.  
**Ação:** documentar contrato de contexto (uid + activityId + geração + abort quando possível), auditar cada await que atualiza UI e cobrir com testes de troca de visita/sessão. Proteções já implementadas na PR são **provisórias até testes**, não inválidas por si só.

### EST-03 — P1 | cadastro de profissionais implementado por dois caminhos
**Evidência:** Admin team.js, linhas 137–251, cria conta via Identity Toolkit no navegador, depois escreve perfil via setDoc e tenta excluir conta em caso de falha; Admin functions/index.js, linha 17, já expõe createTeamMember com Firebase Admin e limpeza compensatória. O frontend não chama essa função para criação.  
**Causa:** duas implementações da mesma regra.  
**Risco:** validações e rollback diferentes; contas sem perfil em falhas/concorrência; aumento de manutenção. A exclusão compensatória pelo navegador é best effort e ignora a resposta de sucesso do DELETE.  
**Ação:** escolher **uma** operação administrativa de criação, preferindo a Callable autenticada existente após testes com Emulator; remover o fluxo duplicado somente após migração validada.

### EST-04 — P1 alto, dependente de deploy | autorização excepcional por e-mail no Worker
**Evidência:** App cloudflare/advance-media-api.js, linhas 468–482 (isManagementProfile), 533–572 (getAdvanceProfile). Um e-mail específico recebe privilégio de gestão e pode receber um perfil de gestão de fallback quando nenhum perfil ativo é encontrado.  
**Causa:** permissão codificada em identidade textual, fora do sistema normal de perfis revogáveis.  
**Risco:** revogar/desativar o perfil Firestore não necessariamente revoga a condição de gestão no Worker enquanto a conta Auth continuar válida; autorização inconsistente com o Admin.  
**Ação:** remover ambas as exceções após homologar perfis autorizados; usar UID/claims/perfil ativo de gestão verificado, cobrindo revogação. **Checar se este código está de fato publicado antes de classificar como incidente em produção.** Evitar divulgar dados pessoais na documentação operacional.

### EST-05 — P1 | Admin depende de leituras integrais de coleções
**Evidência:** Admin dashboard.js, linhas 25–31, carrega atividades/clientes/equipe; visits.js, linhas 793–812, carrega atividades/clientes/equipe e 4 coleções completas de relatórios; team.js linha 54; clients.js linha 64. O cache em core.js/collection-cache.js elimina leituras repetidas por ~120 s, mas a primeira leitura continua integral.  
**Causa:** métricas, filtros e joins calculados inteiramente no frontend.  
**Risco:** crescimento linear de leituras, transferência, memória e tempo de carregamento; maior probabilidade de atingir cotas.  
**Ação:** para a v0.1.1, medir e limitar recarregamentos involuntários sem truncar dados de indicadores. Para evolução, paginar tabelas e projetar agregações/materializações para KPIs; definir contrato para dados resumidos.

### EST-06 — P1 | leitura ampla de clientes no autocompletar de campo
**Evidência:** App script.js linhas 1724–1751: getDocs(clientes WHERE status IN [Ativo, Provisorio]) sem limit/paginação; cache em memória apenas depois do carregamento.  
**Risco:** custo e latência crescentes na primeira abertura do cadastro de visita por sessão.  
**Ação:** não refatorar cegamente para limit(N) porque pesquisa deixaria de encontrar clientes. Projetar busca indexada/servidor por prefixo ou escopo e medir baseline antes.

### EST-07 — P1 | falhas de leitura de relatórios podem parecer ausência legítima
**Evidência:** Admin visits.js, linhas 784–790: safeCollection captura qualquer erro e devolve []; loadData monta mapas de relatórios com esses arrays (793–812).  
**Risco:** permissões/indisponibilidade/quota de uma coleção podem mostrar visitas aparentemente sem relatório, sem feedback visível de carregamento parcial.  
**Ação:** distinguir vazio real de erro parcial, preservar erro por coleção e exibir aviso de dados incompletos; não mascarar todas as falhas em [].

### EST-08 — P1 | lacunas de verificação automática no Admin
**Evidência:** advance-admin/package.json: npm run check avalia só visits.js, media-url-cache.js, operation-errors.js e sw.js; workflow validate-media.yml roda esse check e npm test. Arquivos team.js, clients.js, dashboard.js, core.js e functions/index.js não têm verificação sintática explícita nesse comando.  
**Risco:** alterações centrais sem cobertura mínima de CI; a pasta tests/link-modules.mjs também não aparece nos scripts de validação.  
**Ação:** expandir check para todo o JS executável e adicionar testes de contrato entre páginas, Functions e regras; confirmar no CI.

### EST-09 — P1 | backup local assíncrono ainda exige prova de recuperação
**Evidência:** App src/ui/commercial-report.js linhas 92–148 (debounce de 350 ms e flush no pagehide/visibilitychange); src/services/report-drafts.js (serialização de escrita IndexedDB); App script.js linhas 60–90 (editor técnico); src/ui/commercial-report.js, restoreBackup com retorno 'conflict' sem interface própria de resolução.  
**Risco:** último trecho digitado ou mídia recém-inserida podem não ser persistidos antes de encerramento brusco do processo, apesar dos eventos de página; conflitos entre base remota e rascunho preservado precisam de recuperação explícita.  
**Ação:** testar reinicialização real, quota/evicção, conflito entre dispositivos e logs de falha, sem prometer garantia de armazenamento local absoluto.

### EST-10 — P2 | código compartilhado duplicado entre repositórios
**Evidência:** App src/services/media-url-cache.js = Admin media-url-cache.js (conteúdo idêntico); App src/domain/operation-errors.js = Admin operation-errors.js (conteúdo idêntico).  
**Risco:** correção em um cliente e esquecimento no outro.  
**Ação:** manter cópia deliberada por ora (deploys independentes), documentar sincronização/contrato e testes idênticos; estudar pacote comum depois, sem impor acoplamento novo à v0.1.1.

### EST-11 — P2 | regras de negócio e formatos espalhados entre camadas
**Evidência:** App src/domain/reports.js + training.js, script.js transações; Admin visits.js possui formatos de relatório/legacy e Admin clients.js replica normalização de CNPJ que também existe no App; Worker tem suas próprias verificações de titularidade/gestão.  
**Risco:** mudanças de schema, status e tipos divergem entre App, Admin, Functions e Worker.  
**Ação:** estabelecer documentação de schemas e invariantes de cada coleção e testes de contrato. Preservar fallbacks legados até medir dados existentes.

### EST-12 — P2 | arquivos de protótipo e simulação fora do fluxo principal
**Evidência:** App commercial-preview.html é uma demonstração da UI comercial; Admin simulacao/README.md declara dados fictícios e nenhuma conexão Firebase.  
**Conclusão:** não são funções mortas comprovadas: são ambientes de demonstração. Verificar se deveriam fazer parte do artefato de produção; não remover sem checar uso e URLs.

### EST-13 — P2 | complexidade concentrada em edição de mídia e Worker
**Evidência:** App technical-report-editor.js linhas 1–106 (rede e mídia), 264+ (compressão) e 421–816 (UI/editor); Worker único arquivo 1.485 linhas com autenticação (214+), Firestore (292+), autorização (468+), assinatura R2 (64+) e roteador (946+).  
**Risco:** mudanças em upload/autorização/editor sem isolamento; manutenção difícil.  
**Ação:** gradualmente separar adaptador R2, autenticação/autorização, roteamento e editor, com testes de contrato de URL, vínculo e rollback.

### EST-14 — P1 de governança | código versionado difere potencialmente do que está publicado
**Evidência:** Admin README.md e App cloudflare/README.md explicam que Firestore rules e Cloudflare Worker não são implantados automaticamente com merge do repositório. Admin firestore.rules, além disso, é admin-only e negaria gravações de atividade se usada isoladamente para todo o projeto.  
**Risco:** auditoria do GitHub não prova a segurança da produção; deploy de preview não cria Firebase separado.  
**Ação:** obter hash/versão efetiva de Vercel, Worker e regras Firestore antes de homologar; versionar/exportar configuração real sem segredos e criar ambientes isolados.

## 5. O que NÃO foi confirmado como problema

- **Ciclos de imports:** nenhum ciclo identificado no conjunto de 34 módulos principais do App inspecionados; não é prova formal sobre imports dinâmicos e toda a árvore.
- **Listeners multiplicados por navegação:** vários são instalados na inicialização/constructor, não a cada visita. Não há evidência estática suficiente para declarar vazamento de listeners em produção; testar montagem/desmontagem e observadores.
- **Check-in duplicado entre dispositivos:** continua condição de corrida teórica conhecida, **não é bloqueador da v0.1.1** por decisão de produto. A verificação normal no cliente permanece.
- **Protetores do cache e checks de sessão:** já existem deduplicação, invalidação e isolamento em partes importantes. Não remover como “código provisório” sem testes equivalentes.
- **Violação ativa de autorização ou perda de dados:** nenhum teste real de permissões, PWA ou R2 foi executado nesta etapa. EST-04 é um caminho permissivo no código versionado, com deploy desconhecido.

## 6. Arquitetura-alvo incremental

1. **App:** script.js fica como bootstrap mínimo; SessionController mantém uid/perfil/geração; NavigationController controla telas e cancelamento; VisitService reúne check-in/check-out/validações; ReportService coordena transação + preparação/rollback de mídia; repositórios isolam Firestore; DraftStore permanece IndexedDB; componentes de UI recebem callbacks.
2. **Admin:** core/Auth separado do cache; repositórios de dados entregam consultas/contratos; páginas só apresentam e filtram; TeamService chama Functions para mutações sensíveis; agregações futuras seguem definição aprovada do dashboard.
3. **Worker:** auth Firebase + perfil/roles verificadas, ActivityPolicy, R2Signer e rotas separados; autorização centralizada, nenhum papel administrativo baseado em e-mail fixo.
4. **Schema:** documento único de entidades e estados permitidos; contrato de compatibilidade para relatórios legados; regressão cruzada App/Admin/Worker.
5. **Infraestrutura:** ambientes separados de homologação, configuração de regras versionada/deployada com aprovação, releases do Worker e frontend rastreáveis.

## 7. Ordem de trabalho sugerida

**Antes da v0.1.1 (escopo controlado):**
1. Confirmar os deploys e regras efetivas; verificar e eliminar exceção fixa do Worker se publicada, com testes de revogação.
2. Revisar a PR #26 e validar o CI; expandir checks sintáticos do Admin.
3. Corrigir apresentação silenciosa de relatórios ausentes por falha de leitura.
4. Confirmar invariantes de gravação de relatórios contra as regras reais; testar interrupção do upload e recuperação dos rascunhos.
5. Medir consultas Firestore e homologar PWA, Admin, Worker e rollback em ambiente de teste.

**Após estabilizar a v0.1.1 (refatoração guiada por evidência):**
1. Extrair Session/Navigation/Visit/Report do script.js, um fluxo e testes por PR.
2. Unificar cadastro de equipe na Function já existente.
3. Introduzir paginação/consultas e agregações para o Admin sem comprometer KPIs.
4. Redesenhar busca de clientes e modularizar Worker/editor técnico.
5. Avaliar pacote compartilhado, limpeza de previews e antigas compatibilidades com dados reais.

## 8. Testes de regressão correspondentes

- Troca rápida A → B durante leituras lentas; logout no meio de consulta; navegação Voltar; salvar com commit confirmado e callback de UI falhando.
- Abrir agenda e início repetidamente; medir chamadas em voo, pós-invalidação, erro resource-exhausted e ausência de retry em loop.
- Relatórios comercial, treinamento e assistência: mídia, queda de conexão antes/depois do Firestore, PWA fechado abruptamente, alteração concorrente, recuperação do IndexedDB e conflito versionado.
- Admin: uma coleção de relatório retorna PERMISSION_DENIED, outra retorna vazia; UI deve diferenciar dados parciais de vazio legítimo.
- Admin: criar profissional por uma operação única; falhas no Auth e Firestore, e-mail existente e compensação; nunca deixar contas órfãs em testes.
- Worker: promotor acessa apenas sua atividade; gestor ativo acessa o permitido; revogação de perfil remove privilégio; nenhuma exceção fixa concede acesso.
- Service Worker: instalação nova, atualização de versão, shell coerente e ausência de cache de APIs ou mídias privadas.
- CI: sintaxe e imports de todos os entrypoints relevantes, testes de domínio, serviços, funções e contratos de autorização.

## 9. Resultado e fronteira de confiança

**Auditoria estrutural estática concluída para os principais fluxos e integrações versionados.** Há pontos concretos de risco de manutenção, segurança de autorização e escalabilidade, mas não há evidência para exigir reescrita geral.

**Não aprovado para publicação por esta auditoria isoladamente.** Próximas portas: confirmar regras/deploy efetivos, ajustar problemas de maior severidade, aprovar CI e homologar em ambiente real de teste. Nenhuma alteração funcional ou deploy foi realizado por esta auditoria.
