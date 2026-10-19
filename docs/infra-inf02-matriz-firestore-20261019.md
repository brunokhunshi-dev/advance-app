# INF-02 — Matriz completa de leituras, gravações e dependências Firestore

**Referência:** 19/10/2026 · Advance Check v0.1 / candidata v0.1.1 · **Status: inventário estático CONCLUÍDO**.  
**Base de produção:** Vercel `main`, commit `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e`.  
**Base de estabilização:** `fix/stability-state-queries-20261019`, PR #26, sem merge/deploy.  
**Worker:** código `worker;(1).js` fornecido pelo responsável e identificado por ele como Worker ativo, versão Cloudflare `72ad09f0-08c5-43da-a6bd-e67180fb9599` (17/10/2026). **O hash não foi comprovado diretamente no painel Cloudflare**. Sua cópia versionada no GitHub NÃO coincide com o anexo (miniaturas).  
**Permissões:** Rules informadas pelo responsável: `allow read, write: if request.auth != null` para todos os documentos. Aceitas para esta fase, sem alteração de infraestrutura.  
**Admin:** Advance Admin descontinuado; fora dos fluxos operacionais ativos.  
**Incidente de fotos:** `Failed to fetch` declarado corrigido pelo responsável (separador `|` substituído por `/`); não é pendência ativa deste inventário.  
**Sem alteração de código funcional, regras ou dados.**

## 1. Critério de exaustividade e legenda

Inspecionados os arquivos JavaScript de execução do `advance-app` (principal, editor de mídia, camadas `src/data`, `src/domain`, `src/services`, `src/ui`), o HTML de entrada, a ferramenta standalone de importação, os scripts de manutenção e o Worker recebido. Distinção entre fonte produtiva e candidata preservada. Os módulos auxiliares de domínio/interface delegam a persistência para os adaptadores injetados; **não contêm SDK Firestore próprio**, exceto `src/ui/product-import-page.js`. Não se identificou uso de `onSnapshot` Firestore no frontend inspecionado; `onAuthStateChanged` é evento **do Firebase Auth**, não listener de documentos.

**Convenções:**
- **SDK-R** = leitura Firestore cliente (`getDoc`/`getDocFromServer`/`getDocs`); **SDK-W** = escrita cliente (`setDoc`/`writeBatch`).
- **TX-R/TX-W** = leitura/escrita dentro de transação (`runTransaction`, `tx.get`/`tx.set`/`tx.update`). Transações podem ser repetidas automaticamente, portanto não equivalem a contagem fixa faturada.
- **REST-R** = acesso Firestore REST pelo Worker autenticado com Firebase ID token (`GET /documents/...` ou `POST :runQuery`). **O Worker anexado não grava documentos Firestore.**
- **R2** = leitura/PUT/DELETE de objeto; **não é leitura/gravação Firestore**, embora obter a URL assinada exija autorização via Worker/Firestore.
- **Cache** = pode evitar request, mas `getDoc` e consultas podem se comportar diferentemente conforme cache do SDK, conectividade, invalidação e tentativas. **Nenhum número desta matriz equivale a fatura medida.**
- **Perfil** = promotor ou assistência autenticado no App; diferentes perfis podem ter caminhos de relatório diferentes. A autorização efetiva nas regras fornecidas depende apenas de autenticação, não da propriedade da visita.
- **Freq.** = quando a ação ocorre; não significa intervalo automático.

## 2. Matriz A — leituras de telas e navegação

| ID | Tela/ação / usuário | SDK / origem e consulta | Coleção/escopo | Frequência e cache | Código da branch |
| --- | --- | --- | --- | --- | --- |
| A01 | Login, promotor/assistente | SDK-R `getDocs(where('email','==',email))`, percorre `assistencia` e depois `promotores` até encontrar | `assistencia`, `promotores` | Até 2 queries por autenticação; sem `limit(1)` explícito; não é listener | `script.js:482-575`, esp. 539-562 |
| A02 | Início, cartão/agenda resumida | SDK-R `getDocs(ptvId == usuário AND status in [Pendente, Em andamento])` via repositório | `atividades` | Ao entrar; na branch compartilha leitura com Agenda, dedup de inflight e TTL 5 s; na `main` consulta independente | `script.js:158-161,885-915`; `src/data/activity-repository.js` |
| A03 | Agenda, calendário/lista | Mesma query SDK-R do A02 | `atividades` | Na branch usa o **mesmo** repositório de A02; `main` possui segunda query; sem `limit` para visitas ativas | `script.js:1027-1050` |
| A04 | Início, clientes da visita principal e secundárias | SDK-R `getDoc(clienteId)` pelo repositório; chamadas em paralelo para secundárias | `clientes/{id}` | Até clientes distintos não presentes no cache (TTL 5 min, por sessão); concorrência deduplicada | `script.js:153-157,931-952`; `src/data/client-repository.js` |
| A05 | Início, visita em andamento com relatório | SDK-R `getDoc` documento de relatório referenciado | `relatorios` (legado) ou `relatorios_comerciais` / `relatorios_treinamentos` / `relatorios_assistencia_tecnica` | Condicional a `relatorioId`; sem cache próprio de relatórios | `script.js:266-276,937-946`; `src/domain/reports.js:1-25` |
| A06 | Histórico, lista principal | SDK-R `getDocs(ptvId == usuário AND status in [Concluída, Cancelada] ORDER BY data DESC LIMIT 100)` | `atividades` | Cada carregamento da tela, com ordenação/filtro local | `script.js:1215-1235` |
| A07 | Histórico, fallback sem índice | SDK-R `getDocs(ptvId == usuário)`, depois filtra status e limita **somente em memória** | `atividades` | Apenas quando A06 falha por `failed-precondition`; **sem limite no servidor** | `script.js:1236-1252` |
| A08 | Histórico, enriquecimento | SDK-R `getDoc(clienteId)` para cada cliente distinto ainda não cacheado | `clientes/{id}` | Após A06/A07; `Promise.all` sobre até 100 visitas, com cache/dedup por ID | `script.js:1259-1275` |
| A09 | Histórico, abrir visualizador | SDK-R `getDoc(atividadeId)` | `atividades/{id}` | Por abertura de visita | `script.js:1483-1504` |
| A10 | Histórico, abrir visualizador: cliente e relatório | SDK-R `getDoc(clienteId)` + `getDoc(relatorioId)` quando vinculados | `clientes/{id}`, coleção tipada de relatório ou `relatorios` legado | Em paralelo; cliente pode estar cacheado | `script.js:1505-1515` |
| A11 | Visita atual, abrir/editar relatório | SDK-R **servidor forçado** `getDocFromServer(atividadeId)` e `getDocFromServer(relatorioId)` (se existir), mais cliente via repositório | `atividades/{id}`, relatório e `clientes/{id}` | Por abertura do editor; proteção contra tela/sessão obsoleta na branch | `script.js:2362-2387` |
| A12 | Check-out, iniciar confirmação | SDK-R `getDoc(atividadeId)` + `getDoc` de relatório e possível `getDoc` cliente | `atividades/{id}`, relatório, `clientes/{id}` | Por tentativa; cliente pode vir do cache | `script.js:2223-2267` |
| A13 | Perfil, estatísticas | SDK-R `getDocs(ptvId == usuário)` **sem limite/status/data**; filtra concluídas do último ano no cliente | `atividades` | Ao abrir Perfil; alternar 30/90/365 dias usa memória após carregamento | `script.js:3095-3100`; `src/ui/profile.js` |
| A14 | Perfil, enriquecer mapa/ranking | SDK-R `getDoc` por cliente distinto das visitas filtradas | `clientes/{id}` | `Promise.all`, cache TTL 5 min; pode gerar várias leituras | `script.js:3100-3104` |
| A15 | Perfil, compartilhar contato | SDK-R `getDoc` do perfil corrente | `assistencia/{id}` ou `promotores/{id}` | Ao escolher compartilhar | `script.js:3085-3094` |
| A16 | Agendamento, abrir campo de cliente | SDK-R `getDocs(status in [Ativo, Provisorio])`, **sem limite** | `clientes` | Uma carga por sessão do frontend, reinicializada após logout; filtra texto localmente | `script.js:1724-1751`; `src/ui/client-options.js` |
| A17 | Cadastro cliente com CNPJ, duplicidade | SDK-R até **3 consultas sequenciais**, pelos campos `codigoCnpj` real, `cnpj` real e `codigoCnpj` legado; retorna no primeiro resultado | `clientes` | Por validação de CNPJ, queries sem `limit(1)` | `script.js:660-662`; `src/data/cnpj-lookup.js` |
| A18 | Agendamento de visita, cliente selecionado | SDK-R `getDoc(clienteId)` via cache | `clientes/{id}` | Antes de criar atividade; pode ser cache hit | `script.js:1438-1448` |
| A19 | Relatório comercial ou treinamento, seletor de produtos | SDK-R `getDocFromServer(catalogos_produtos/advance)`; com catálogo válido, `getDocs(collection('produtos'))` | `catalogos_produtos/advance` + `produtos` | Primeira carga por sessão após abrir módulos que pedem produtos; cache de lista 10 min + dedup | `script.js:34-54,2645-2669`; `src/data/product-repository.js` |
| A20 | Fotos de perfil/relatório exibidas | **NÃO é SDK-R diretamente**: frontend pede URL ao Worker, que faz REST-R para validar usuário/atividade; imagem GET na URL do R2 | `assistencia`/`promotores` e `atividades` via Worker | Por foto/abertura; batch de até 30 itens, URL cache máx. ~270 s, limite cliente 60 requests/min | `technical-report-editor.js:16-44,56-103`; `src/services/media-url-cache.js` |

**Navegação sem leitura Firestore adicional:** mudança local de filtros do Histórico quando `historicoCarregado` já existe; troca do mês/dia da Agenda quando `listaAtividadesAgenda` está carregada; alternância 30/90/365 dias do Perfil depois do `load()`; renderização de mapas em si. Dependências externas de geocodificação/mapas não são Firestore.

## 3. Matriz B — operações de escrita e transações do App

| ID | Ação | SDK / leituras antes ou dentro da operação | Gravação por operação | Notas/retries | Evidência |
| --- | --- | --- | --- | --- | --- |
| B01 | Agendar nova visita | A18 (cliente) | SDK-W `setDoc` → `atividades/{novoId}` | 1 documento, invalida cache atividades | `script.js:1412-1472` |
| B02 | Editar detalhes de agendamento | TX-R `tx.get(atividade)` | TX-W `tx.update(atividade)` | 1 doc lido/atualizado; status pendente | `script.js:1668-1712` |
| B03 | Cancelar agendamento/visita | TX-R `tx.get(atividade)` | TX-W `tx.update(atividade)` | Mantém motivo/status no histórico; adapter específico | `script.js:1635-1658`; `src/services/cancellation.js` |
| B04 | Cadastrar cliente com CNPJ novo | A17, depois TX-R `tx.get(clienteId determinístico)` | TX-W `tx.set(clientes/{id})` se não existir | Se CNPJ legado já existente, sem escrita; após criar executa A20? **Não**: leitura direta de cliente de novo (B06) | `script.js:1952-1989` |
| B05 | Cadastrar cliente provisório | Não há TX-R; localização é fonte externa | TX-W `tx.set(clientes/{id})` | Documento com ID novo, transação sem leitura | `script.js:1990-2005` |
| B06 | Pós-cadastro de cliente | SDK-R `getDoc(clienteId)` com `refresh:true` | Sem escrita | Consulta adicional mesmo após commit; atualiza cache/local | `script.js:2007-2014` |
| B07 | Check-in | SDK-R query de `atividades` em andamento do PTV + SDK-R cliente `refresh:true`; TX-R `tx.get(atividade)` e `tx.get(cliente)` | TX-W `tx.update(atividade)`; às vezes `tx.update(cliente.centroCidade)` | Valida localização; uma query adicional por check-in (não é trava servidor global); transação pode repetir | `script.js:2158-2209` |
| B08 | Salvar relatório comercial | Uploads R2 por mídia nova; TX-R `tx.get(atividade)` + `tx.get(relatorio novo/existente)` | TX-W `tx.set(relatorio comercial)` + `tx.update(atividade.relatorioId/Colecao)` | Commit atômico dos metadados Firestore após mídia; remoção posterior de objetos R2 não é Firestore | `script.js:2583-2629`; `src/services/commercial-save.js` |
| B09 | Salvar relatório treinamento | Mesmo padrão B08, trocando campo/coleção | TX-W `tx.set(relatorios_treinamentos/{id})` + `tx.update(atividade)` | Mesma função parametrizada por tipo | `script.js:2583-2629,2661-2669` |
| B10 | Salvar relatório livre ou assistência técnica | Prepara mídia no R2; TX-R `tx.get(atividade)` + `tx.get(relatorio)` | TX-W `tx.set(relatorio tipado/legado)` + `tx.update(atividade)` | Mantém revisões e valida concorrência local; rollback R2 em falha antes de commit | `script.js:2900-3052`; `technical-report-editor.js` |
| B11 | Check-out padrão | Na preparação: A12; na conclusão TX-R `tx.get(atividade)` + `tx.get(relatorio)` | TX-W `tx.update(atividade.status='Concluída')` + `tx.update(relatorio)` | Ao concluir, consulta Histórico; na branch **sem getDoc extra de confirmação pós-commit** | `script.js:2715-2854` |
| B12 | Fechamento manual | TX-R `tx.get(atividade)` + `tx.get(relatorio)` | TX-W `tx.update(atividade)` + `tx.update(relatorio)` | Marca “pendente de análise”, atualiza Histórico; sem consulta pós-commit na branch | `script.js:2513-2574` |
| B13 | Importação automática de produtos quando catálogo inválido | SDK-R 1 metadata, depois upload JSON HTTP estático | SDK-W `writeBatch`: 102 `produtos` + 1 `catalogos_produtos/advance` = **103 gravações** | Executa só quando metadata não corresponde; após commit faz **102 getDocFromServer** de verificação e depois a listagem A19. **Risco de pico** se metadado estiver ausente/desatualizado | `script.js:34-54`; `src/data/product-import.js` |

**Fluxos pós-mudança:** editar/cancelar/agendar/check-in/salvar relatório/checkout invalidam o `activityRepository` na branch. Isso não elimina necessariamente nova consulta: busca atualizada após mutação é legítima. O tratamento de arquivos físicos no R2 **não integra transação Firestore**; falhas/órfãos serão auditados no INF-07.

### Pontos de leitura dentro das transações — inventário fechado

- `tx.get(atividade)`: edição agendamento, cancelamento, check-in, salvar relatório comercial/treinamento, relatório técnico/livre, checkout padrão e fechamento manual.
- `tx.get(cliente)`: check-in; criação por CNPJ com documento determinístico (nessa segunda hipótese é `tx.get(clienteId)`).
- `tx.get(relatorio)`: salvamentos de relatório, checkout padrão e fechamento manual.
- Há `tx.set` e `tx.update` em atividades, clientes e coleções de relatório. **Nenhum `deleteDoc` direto foi encontrado no frontend operacional inspecionado**. A exclusão de mídia é chamada R2 via Worker.

## 4. Matriz C — Firestore REST via Cloudflare Worker fornecido

O Worker usa `authenticate(request, env)` com `Identity Toolkit accounts:lookup` (**não é leitura Firestore**); em seguida utiliza `firestoreFetch` com **ID token do usuário**, sujeito às regras Firestore do projeto. `findProfileInCollection` tenta leitura de documento `{colecao}/{uid}` por REST; se não retorna perfil elegível e houver e-mail, tenta `POST :runQuery` por `email == user.email` com `limit:1`. `getAdvanceProfile` examina nesta ordem `administradores`, `gestores`, `assistencia`, `promotores` — a descontinuação da interface Admin **não remove essas consultas do Worker**.

| ID | Rota / gatilho | Firestore REST-R causado pela requisição | Firestore REST-W | Demais ações |
| --- | --- | --- | --- | --- |
| W01 | `GET /health` | Nenhuma | Nenhuma | Resposta estática de saúde |
| W02 | `POST /v1/profile/photo-url` / abrir perfil | Perfil em `assistencia` e depois `promotores`: `GET {colecao}/{uid}` e eventual `:runQuery(email,limit 1)`, até encontrar perfil | Nenhuma | Devolve URL GET assinada da foto; GET do browser vai ao R2 |
| W03 | `POST /v1/media/upload-url` / enviar foto | `getAdvanceProfile`: perfis na ordem acima + `GET atividades/{activityId}` para validar propriedade e status | Nenhuma | Devolve URL PUT assinada; browser executa PUT no R2 e **App** faz commit Firestore do relatório |
| W04 | `POST /v1/media/read-url` / exibir foto isolada | Busca de perfil + `GET atividades/{activityId}` | Nenhuma | Devolve URL GET assinada (variante `original` no Worker anexado) |
| W05 | `POST /v1/media/read-urls` / lote | Busca de perfil **uma vez** + `GET atividades/{id}` **uma vez por atividade distinta do lote** | Nenhuma | Devolve até 30 URLs; não consulta Firestore por fotografia quando várias fotos pertencem à mesma atividade |
| W06 | `POST /v1/media/delete` / apagar foto | Busca de perfil + `GET atividades/{activityId}` | Nenhuma | DELETE remoto no R2; sem exclusão de documento Firestore pelo Worker |
| W07 | `POST /v1/media/storage-stats` / gestão | Busca de perfil para checar permissão de gestão | Nenhuma | Lista objetos no R2; cache de estatísticas ~900 s; a listagem R2 não é Firestore |
| W08 | `OPTIONS` / CORS preflight | Nenhuma | Nenhuma | Preflight CORS, sem autenticação/leitura FS |
| W09 | Rotas desconhecidas | Nenhuma | Nenhuma | HTTP 404 |

**Formula de acessos de rede, não de faturamento:** para cada rota protegida W03/W04/W06, `P + 1`, em que `P` = tentativas de perfil (até 4 coleções × `GET uid` e `runQuery` = **até 8 requests REST** quando o usuário tem e-mail; em vários cenários para antes). Em W05, `P + A`, sendo `A` o número de **atividades distintas** na lista, não o número de fotos. Em W02, busca só duas coleções (`P_campo ≤ 4`). Em W07, `P` e listagem R2 separada. Esse é um limite de chamadas do código, não prova de leituras faturadas: erros, perfis vazios, cache do serviço e avaliações de regras mudam o resultado.

**Diferença de versões relevante:** arquivo **anexado** assina apenas `original`; a cópia `cloudflare/advance-media-api.js` da `main` tem lógica de `thumbnail.jpg`. A matriz W02–W07 usa o **anexo fornecido pelo responsável**, não presume que substituir o Worker pela cópia GitHub seja seguro. A cópia também contém uma exceção de gestão por e-mail fixo; auditoria de autorização fica em INF-05.

## 5. Caminho exato de uma fotografia

1. Arquivo selecionado/comprimido fica em memória/IndexedDB local (**zero leitura Firestore**).
2. App faz `POST Worker /v1/media/upload-url` com Firebase ID token.
3. Worker autentica pelo Identity Toolkit, localiza perfil via Firestore REST e lê `atividades/{id}` para validar status/propriedade (W03).
4. Worker devolve URL temporária assinada; navegador faz `PUT` no **R2** com `Content-Type` (**zero Firestore nesse PUT**).
5. App faz transação Firestore (B08/B09/B10) para salvar metadados do relatório e vínculo com atividade; aqui surgem **TX-R e TX-W**.
6. Exibição pede URL temporária via Worker (W04 ou W05), novamente com consulta de perfil/atividade; binário é obtido do R2 por GET.
7. Exclusão ou compensação usa Worker `/v1/media/delete` e R2 DELETE, sem escrita Firestore pelo Worker.

**Incidente informado resolvido:** `Failed to fetch` era separador `|` onde deveria haver `/`; correção confirmada pelo responsável em 19/10/2026, não reproduzida pela auditoria. Política CORS fornecida permite `GET/HEAD/PUT/DELETE` com `Content-Type`, compatível com PUT direto ao R2; o Worker possui política CORS própria para POST/Authorization.

## 6. Matriz D — caminhos auxiliares e administrativos NÃO pertencentes ao fluxo comum

| ID | Executor | Leituras | Gravações | Classificação |
| --- | --- | --- | --- | --- |
| D01 | Página `importar-produtos.html` → `src/ui/product-import-page.js` | Ao clicar importar: 102 leituras servidor `produtos/{id}` para verificar conteúdo | 103 gravações por batch em `produtos`/`catalogos_produtos` | **Ferramenta standalone** hospedável no mesmo frontend; não faz parte da navegação normal, mas é acessível via URL e usa Firebase cliente |
| D02 | `tools/import-products.mjs` executado por CLI | 102 leituras via **Firebase Admin SDK** depois do batch | 103 escritas via Admin SDK | **Ferramenta operacional CLI, não chamada por navegação do PWA**; credenciais de servidor, não sujeita às mesmas Rules do cliente |
| D03 | `tools/export-firestore.mjs` executado por CLI | `listCollections` e `collection.get()` de todas as coleções selecionadas; `listCollections` por documento e recursão de subcoleções | Nenhuma no Firestore | **Exportador de manutenção**, pode provocar grandes volumes de leitura **se executado**, não roda automaticamente no app |
| D04 | `brunokhunshi-dev/advance-admin` | Operações históricas **fora desta matriz operacional** por estar descontinuado | Idem | Não presumir tráfego recorrente. **Cloud Functions antigas não verificadas como implantadas ou desimplantadas**; validar se sua existência operacional for confirmada |

A página standalone de importação usa Firebase cliente, autenticação e `getDocFromServer`; o CLI de manutenção usa Admin SDK. A coleção `catalogos_produtos` é consultada também pelo fluxo normal de carregamento de produtos.

## 7. Inventário completo por coleção e componente

| Coleção | Leitores operacionais | Escritores operacionais |
| --- | --- | --- |
| `assistencia` | Login SDK (A01), perfil/contato SDK (A15), Worker REST (W02–W07 quando consultada) | Nenhuma gravação identificada no App/Worker atual |
| `promotores` | Login SDK (A01), perfil/contato SDK (A15), Worker REST (W02–W07 quando consultada) | Nenhuma gravação identificada no App/Worker atual |
| `administradores` / `gestores` | **Worker REST** via `getAdvanceProfile` em rotas protegidas; apesar do Admin descontinuado | Nenhuma gravação identificada no App/Worker atual |
| `clientes` | Início, Agenda, Histórico, Perfil, check-in/out, visualizador, cadastro, agendamento (A04/A08/A10/A12/A14/A16–A18, B04/B07) | Cadastro real/provisório (B04/B05), atualização opcional do centro da cidade no check-in (B07) |
| `atividades` | Início, Agenda, Histórico, Perfil, check-in/out, visualizador, relatórios; Worker REST para autorização (A02/A03/A06/A07/A09/A11/A13, B02/B03/B07–B12, W03–W06) | Agendar, editar, cancelar, check-in/out e vínculo com relatórios (B01–B03/B07–B12) |
| `relatorios` (legado) | Carregamento/visualização e TX de alterações em atividades antigas | Atualizações dos relatórios antigos vinculados, se editáveis |
| `relatorios_comerciais` | Carregamento e TX das visitas comerciais | TX de salvamento/checkout |
| `relatorios_treinamentos` | Carregamento e TX do treinamento | TX de salvamento/checkout |
| `relatorios_assistencia_tecnica` | Carregamento e TX de assistência | TX de salvamento/checkout |
| `produtos` | Lista de produtos (A19); conferência após importação (B13/D01/D02) | Importação automática de catálogo quando necessário (B13) e ferramentas standalone (D01/D02) |
| `catalogos_produtos` | Metadata antes da lista de produtos (A19) | Importação automática/standalone (B13/D01/D02) |

Não foram identificadas consultas no App ativo a `atividades_excluidas`, `usuarios_excluidos` ou `exclusoes_usuario`; coleções do antigo Admin não integram navegação. **Não significa que coleções não existam ou não sejam usadas por processos externos**.

## 8. Comparativo produção versus branch v0.1.1

| Caso | Produção `main` | Branch candidata v0.1.1 |
| --- | --- | --- |
| Início + Agenda | `getDocs` de atividades ativas realizado separadamente em cada tela (`script.js` main ~859 e ~994–996) | Fonte única `activityRepository.listActive` (`script.js:159,911,1043`), com cache 5 s e dedup de promessas |
| Cliente por ID | Leitura SDK sem repositório dedicado equivalente | Repositório cache 5 min + dedup; `refresh:true` quando necessário |
| Após completar check-out/fechamento manual | Há `getDoc(atividade)` adicional para confirmação em caminhos de pós-commit (main ~2474 e ~2751) | Consultas extras removidas após transação concluída; ainda pode carregar Histórico legitimamente |
| Histórico | Principal `limit(100)`; fallback sem limite se faltar índice | Mesmo comportamento e mesmo fallback |
| Perfil | Todas atividades por `ptvId`, filtra ano no navegador | Mesmo comportamento |
| Autocomplete cliente | Todos ativos/provisórios em uma consulta sem `limit` | Mesmo comportamento |
| Catálogo produtos | Leitura metadata + produtos; potencial importação e verificação se metadata divergir | Mesmo mecanismo |
| Mídia | Serviço Worker e cache de URLs temporárias | Backend Worker compartilhado; cache/batch permanece parte importante da contenção |

**Nota:** a matriz é de **operações presentes no código**; cache Firestore e tempos de execução afetam quantas leituras são realmente debitadas. Não declarar sucesso da melhoria antes de medir.

## 9. Achados e pontos que INF-03 precisa medir (sem correção nesta etapa)

| Código | Achado fundamentado | Impacto plausível | Prioridade de investigação |
| --- | --- | --- | --- |
| F02-01 | `clientes` ativa/provisória carregada integralmente no autocomplete sem `limit` | Leitura de toda base quando abre agendamento em sessão nova | Alta, depende do tamanho atual da base |
| F02-02 | Perfil carrega **todas** as atividades de um usuário e filtra últimos 365 dias localmente | Crescimento de consultas ao longo do uso | Alta |
| F02-03 | Histórico tem fallback sem limite se índice não estiver disponível | Leitura elevada em caso de `failed-precondition`; máscara de índice ausente | Alta, verificar índices publicados |
| F02-04 | Worker refaz busca do perfil autenticado a cada URL de mídia, inclusive consultas a coleções de gestão | Possível principal multiplicador de requests REST Firestore em telas com fotos | Alta; medir chamadas e leituras **separadamente** |
| F02-05 | Cada entrada de relatório pode forçar atividade + documento de relatório do servidor | Custo adicional de edição/alternância entre telas | Média, necessário para evitar dados obsoletos |
| F02-06 | Busca de CNPJ até três queries; sem `limit(1)` | Consultas repetidas quando não encontra correspondência | Média |
| F02-07 | Catálogo de produtos pode executar batch de 103 escritas + 102 verificações + listagem completa se metadata estiver diferente | Pico ocasional sem relação aparente com tela de produtos | Alta se o metadata estiver incorreto; validar idempotência |
| F02-08 | Login consulta duas coleções por e-mail e o Worker possui sua própria busca de perfil | Repetição de localização de perfil entre frontend e Worker | Média |
| F02-09 | Check-in consulta atividades em andamento, relê cliente e usa TX de 2 docs | Custo esperado, mas pode ser redundante em alguns cenários; verificar sem enfraquecer validações | Média |
| F02-10 | Reabertura de navegação pode disparar consultas adicionais; caches têm TTL distintos | Uso variável por rotina de navegação | Média, perfilamento prático |

## 10. Entrega, limites e critério de aceite

- [x] Identificados pontos diretos de SDK Firestore do frontend (`script.js` e importador standalone) e os adaptadores indiretos.
- [x] Mapeadas leituras e gravações de todas as telas e ações principais, com coleção, tipo de operação e evidência.
- [x] Mapeadas leituras transacionais, escritas atômicas, atualização após mutação e salvamento de mídia via R2.
- [x] Mapeados os caminhos REST de Firestore do Worker **recebido**; distinguidos Firebase Auth, Firestore, R2, cache e Rules.
- [x] Considerados os importadores/exports de manutenção e descontinuação do Advance Admin.
- [x] Comparadas produção e branch candidata para identificar duplicações corrigidas e consultas ainda amplas.
- [x] Registrados gargalos possíveis e decisões para o INF-03.

**O que NÃO foi medido, e não faz parte da conclusão estática do INF-02:** número real de documentos retornados, leituras faturadas, quantidade de avaliações de Rules, número de invocações concorrentes do Worker, índices efetivamente publicados, custo por sessão, erros de quota e comportamento com rede instável. Essas tarefas pertencem ao **INF-03**, com traces/telemetria ou contas de homologação. Também não é possível garantir inexistência de Cloud Functions externas ainda publicadas com base exclusivamente no repositório App; tal ausência não foi afirmada.

**Conclusão:** `INF-02 concluído como inventário estático, com matriz de leitura/gravação dos caminhos versionados e do Worker fornecido`. Nenhuma correção implantada. **Próxima etapa em ordem: INF-03 — limites esperados e medição de consumo por operação.**
