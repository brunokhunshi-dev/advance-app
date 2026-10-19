# INF-03 — Consumo Firestore, limites esperados e plano de medição

**Data:** 19/10/2026  
**Status:** **PARCIAL — diagnóstico estático, fórmulas e guardrails propostos; medições reais e metas definitivas pendentes.**  
**Referência:** [INF-02 — matriz de consultas e escritas](infra-inf02-matriz-firestore-20261019.md) (A01–A20, B01–B13, W01–W09, D01–D04).  
**Produção:** Vercel `main`, commit `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e`; **candidata:** PR #26, branch `fix/stability-state-queries-20261019`.  
**Worker:** arquivo `worker;(1).js` fornecido pelo responsável (identificador informado: `72ad09f0-08c5-43da-a6bd-e67180fb9599`); vínculo técnico com versão publicada não verificado de forma independente.  
**Dados de observação anterior, declarados pelo responsável:** cerca de **153 leituras Firestore** e **257 avaliações de regras/permissões** num período de ~60 minutos de navegação individual. Sem registro de ações, janelas de consolidação, outras sessões ou séries históricas, **não se pode atribuir essas leituras a operações específicas**.  
**Limites desta etapa:** sem logs de produção por requisição, sem contagem de documentos por consulta, sem query explain/benchmarks reais, sem mudança no app, Worker, regras ou banco.

## 1. Não confundir unidades

| Métrica | O que mede | Interpretação para o Advance |
| --- | --- | --- |
| `query` / requisição do SDK | Chamada de consulta de documentos (`getDocs`) ou leitura (`getDoc`) | Uma consulta pode retornar 0, 5 ou 300 documentos; não são 1, 5 ou 300 requisições, necessariamente |
| **Leituras de documentos faturáveis** | Resultados/documentos lidos, mínimos de consultas e, quando aplicáveis, entradas de índice | Uma consulta que retorna N documentos custa tipicamente `max(1,N)` leituras **para o lado documentos**, antes de índices/nuances de cache/consulta |
| **Leituras de índice** | Índices percorridos conforme tipo de consulta | Queries com até 1 campo de intervalo estão isentas de cobrança por entradas de índice; verificar casos mais complexos no Query Explain |
| **Avaliações de regras** | Avaliações de Firestore Security Rules | **Não somar** as 257 avaliações aos 153 reads como se cada avaliação cobrasse documento |
| **Leituras auxiliares das regras** | `get()`/`exists()`/`getAfter()` nas regras consultam documentos extras | **Zero por essa causa** nas regras informadas pelo responsável (`request.auth != null`), pois não chamam funções de acesso a documentos |
| **Escritas faturáveis** | Documento criado/atualizado em `set/update` ou batch/transação | Transação de relatório: normalmente 2 documentos escritos; importação: 103 escritos |
| **REST Firestore do Worker** | `GET /documents` e `POST :runQuery` autenticados via ID token | **Contabilizar no Firestore**, não esconder no total de chamadas à Cloudflare; medir sucesso/ausência/erros separadamente |
| **Firebase Auth / Identity Toolkit** | Login e `accounts:lookup` | Não são leituras Firestore, mesmo que acionem o Worker |
| **R2** | PUT/GET/DELETE de objetos, listagem e bytes transferidos | Não são leituras Firestore; upload/visualização geralmente têm uma etapa anterior de autorização no Worker |
| **Transação reexecutada** | Callback `runTransaction` repetido em conflito | Pode refazer leituras antes do commit; **não** assumir custo de exatamente 2 leituras em todos os casos |

**Referências oficiais** (consultadas em 19/10/2026):
- [Firebase — Firestore pricing/billing](https://firebase.google.com/docs/firestore/pricing): cobrança por documento/índice, mínimo de 1 leitura por consulta, exceção de até um campo de intervalo, dependências nas regras e cotas.
- [Firebase — transações e reexecução](https://firebase.google.com/docs/firestore/manage-data/transactions): transações podem repetir o callback em conflito; commits são atômicos dentro do Firestore.
- [Firebase — Query Explain](https://firebase.google.com/docs/firestore/query-explain): métricas `resultsReturned`, `readOperations`, `index_entries_scanned` e detalhes faturáveis; modo `analyze` executa e cobra a consulta.

**Cota gratuita de referência do Firestore Standard:** **50.000 leituras de documentos/dia, 20.000 escritas/dia e 20.000 exclusões/dia**, com aproximadamente 1 GiB de armazenamento gratuito. Não é um limite de segurança ou garantia de continuidade: depende da edição/plano/banco, da região e do uso total do projeto. É cota diária compartilhada com outros consumidores do mesmo banco, não orçamento por promotor. Consulte o plano real antes de projetar custo financeiro.

## 2. Variáveis para projetar sem inventar tamanho da base

| Variável | Significado |
| --- | --- |
| `A` | Atividades pendentes ou em andamento retornadas para um usuário |
| `Uₐ` | Clientes distintos necessários à tela Início/Agenda e ausentes do cache |
| `R` | 0/1 se a visita em andamento precisa ler um relatório vinculado |
| `H` | Atividades concluídas/canceladas retornadas no Histórico (máx. 100 na consulta principal) |
| `Uₕ` | Clientes distintos no Histórico que não estão no cache |
| `T` | **Todas** as atividades do usuário retornadas para o Perfil (sem filtro temporal no servidor) |
| `Uₚ` | Clientes distintos das visitas concluídas do último ano, sem cache |
| `C` | **Todos** os clientes Ativo/Provisorio retornados no autocomplete (sem limite) |
| `P` | **Requisições REST de busca de perfil** realizadas pelo Worker numa chamada (0 a 8 na função `getAdvanceProfile`; depende do caminho de perfil e e-mail) |
| `P_c` | Requisições REST ao perfil de campo (`assistencia`/`promotores`) para a foto de perfil (0 a 4) |
| `M` | Quantidade de fotos solicitadas |
| `G` | Quantidade de lotes de fotos (≤30 por lote) |
| `V` | Atividades **distintas** presentes em um lote de fotos |
| `Q` | Atividades `Em andamento` do usuário retornadas no check-in |

**Aritmética de planejamento:** `q(n)=max(1,n)` para uma consulta de lista realmente enviada ao servidor, aproximando apenas leituras de documentos; `u` para documentos individuais lidos de fato. Para leituras `getDoc` de documentos ausentes, retries, cache do SDK, índices e transações, use faixa/medição real, não um número fixo.

## 3. Orçamento técnico por ação (modelo analítico, não leituras medidas)

| Ação | Chamadas de consulta / acessos esperados | Leituras documentais aproximadas no caminho servidor | Escreve? | Variáveis e condição |
| --- | --- | --- | --- | --- |
| Login (sem contar Início) | 1–2 queries SDK por e-mail | `q(perfis assistência)` +, se necessário, `q(perfis promotores)` | Não | A01; Firebase Auth separado. Normalmente cada perfil ativo retorna até um documento, mas query **não usa limit(1)** |
| Entrar em Início | 1 query ativa SDK + leitura de clientes + relatório se existir | `q(A)+Uₐ+R` | Não | A02/A04/A05; cache de clientes afeta `Uₐ` |
| Abrir Agenda imediatamente depois de Início | **Produção:** 1 query de atividades própria; **branch:** 0 query nova de atividades durante TTL 5 s ou enquanto há chamada pendente; após TTL, 1 | Prod `q(A)+Uₐ`; branch cache hit `Uₐ` e, sem hit, `q(A)+Uₐ` | Não | A03, dados dos clientes podem estar em cache; TTL não assegura cache além de 5 s |
| Abrir Histórico (com índice) | 1 query SDK + clientes distintos | `q(H)+Uₕ`, `H≤100` | Não | A06/A08; query principal limitada |
| Abrir Histórico (fallback por falta de índice) | 1 query falha (`failed-precondition`) + outra sem limite + clientes | `q(T)+Uₕ` para docs retornados no fallback, **T sem limite**; custo do request falhado/índices a verificar | Não | A07; `T` aqui representa todo acervo do PTV, não só 365 dias |
| Abrir visualizador de visita | 1 atividade, cliente 0/1, relatório 0/1 | Em cache frio **até ~3 documentos existentes**; `getDoc` pode usar cache | Não | A09/A10 |
| Abrir editor de relatório | Atividade `getDocFromServer`, relatório `getDocFromServer` se vinculado e cliente por ID | `1 + R + cliente_sem_cache` | Não | A11; duas leituras forçadas úteis para detectar alterações remotas |
| Abrir Perfil | 1 query `ptvId` + clientes distintos | `q(T)+Uₚ` | Não | A13/A14; `T` inclui pendentes, antigas e canceladas; filtro 365 dias no cliente |
| Alternar 30/90/365 dias com Perfil já aberto | 0 nova consulta no fluxo de renderização | 0 | Não | `src/ui/profile.js` reusa `this.data` |
| Abrir busca de cliente/novo agendamento | 1 query de clientes sem limite por sessão frontend | `q(C)` | Não | A16; `C` cresce com número de lojas |
| Pesquisar CNPJ para cadastro | 1–3 queries sequenciais (igualdade); retorna cedo se acha | Soma dos `q(n_i)` para queries executadas | Não | A17; no caso sem correspondência há mínimo de 3 leituras de consultas |
| Agendar visita | Cliente `getDoc` (cache possível) | 0/1 leitura pontual | 1 escrita `atividades` | B01; ao navegar para Agenda, há leitura legítima da lista atualizada |
| Cadastrar cliente real/provisório | Real: até 3 queries CNPJ + `tx.get(cliente)`, + `getDoc refresh`; provisório: `tx.set` + refresh | Variável: CNPJ+~2 docs; provisório refresh ~1 | 1 `clientes` se novo | B04–B06; cache e retries afetam |
| Check-in | 1 query de `Q` visitas abertas + 1 `getDoc` cliente refresh + 2 `tx.get` | `q(Q)+1+2` antes de retries; pode haver leituras posteriores de Início | 1 `atividades` + 0/1 `clientes` | B07; a consulta sobre visitas abertas não pode ser confundida com garantia transacional global |
| Começar check-out | `getDoc` atividade + relatório + cliente eventual | `~2+cliente_sem_cache` no caminho normal | Não | A12, valida geolocalização externamente |
| Confirmar check-out padrão | 2 `tx.get` + carregar Histórico após commit | `~2+q(H)+Uₕ`, sem `getDoc` pós-commit na branch | 2 escritas: `atividades` + relatório | B11; nova consulta de Histórico faz parte do fluxo |
| Fechamento manual | 2 `tx.get` + carregar Histórico após commit | `~2+q(H)+Uₕ` | 2 escritas | B12 |
| Salvar relatório sem fotos novas | 2 `tx.get` | `~2` antes de retries | 2 escritas | B08–B10 |
| Salvar relatório com `M` fotos novas | `M` chamadas W03 (perfil + atividade) + 2 `tx.get` | **Requests REST:** `M×(P+1)`; **docs da TX:** `~2`; não somar REST requests diretamente como leituras faturadas | 2 escritas Firestore + M PUTs R2 | W03/B08–B10; se foto já estiver no R2, não precisa reenviar |
| Visualizar M fotos de uma atividade | No cliente, 1 batch Worker se M≤30 e cache frio; cada batch `P+1` REST requests (`V=1`) | REST **chamadas** = `P+1` para o lote, não `M×(P+1)`; leitura faturada depende de respostas e misses | Não; GET de objetos no R2 | W05, `src/services/media-url-cache.js`; fallback a W04 se lote indisponível |
| Visualizar fotos de várias atividades no lote | `G` batches, cada um com 1 busca de perfil + 1 GET/atividade distinta | `Σ_lote(P_lote+V_lote)` requests REST | Não | W05; até 30 itens/lote |
| Abrir foto do próprio perfil | 1 endpoint Worker + até `P_c` buscas de perfil | 0 a 4 requests REST de perfil (não 0 a 4 **leituras faturadas comprovadas**) | Não | W02; GET de imagem no R2 |
| Abrir módulo de produtos, catálogo válido | `getDocFromServer` metadata + `getDocs` 102 produtos | `~1+q(102)=103` leituras documentais se consulta realmente executada e catálogo possui 102 docs | Não | A19; cache lista 10 min e dedup, mas metadata lida novamente a cada carregamento real |
| Catálogo desatualizado | 1 leitura metadata + 103 batch writes + 102 `getDocFromServer` verificação + 1 listagem completa | `~1+102+q(102)=205` leituras documentais no caminho comum; **103 escritas** | Sim | B13; é um evento de manutenção acionável pela UI se metadata divergir |

**As fórmulas não incluem** índice cobrável quando aplicável, mínimo para leitura de documento ausente, abortos, retry de transação, queries abortadas por autenticação, rede instável ou revalidações do cache. Não representam leituras exatas da fatura.

## 4. Simulação didática: mesma ação, bases maiores

Exemplo **hipotético**, não baseado em dados reais:
- A=6 visitas abertas; Uₐ=3 clientes não cacheados; R=1 relatório em andamento.
- Histórico H=40 atividades concluídas/canceladas e Uₕ=12 clientes fora do cache.
- Perfil T=180 atividades totais e Uₚ=24 clientes anuais fora do cache.
- Autocomplete C=250 clientes disponíveis.
- Catálogo válido com 102 produtos.

| Uma abertura com cache frio | Modelo | Exemplo hipotético de leituras documentais |
| --- | --- | --- |
| Início | `q(6)+3+1` | **10** |
| Histórico | `q(40)+12` | **52** |
| Perfil | `q(180)+24` | **204** |
| Autocomplete | `q(250)` | **250** |
| Produtos | `1+102` | **103** |

Abrir telas com 1 chamada não significa 1 leitura. Assim, 153 leituras em uma hora **podem** ocorrer sem loop infinito; determinar se são justificadas requer observar quais telas foram visitadas, documentos retornados e reloads. O teste anterior com 153 leituras/257 avaliações **não fornece esse detalhamento**.

## 5. Guardrails de qualidade propostos (não são limites do Firebase)

Usar **metas de requisição** antes de metas rígidas de leituras: o custo legítimo de uma tela depende de documentos retornados.

| Ação | Critério de desempenho proposto para validação | Quando abrir incidente |
| --- | --- | --- |
| Login | Até 2 queries de perfil SDK, uma carga de atividades na entrada em Início | Mesmas queries repetidas sem novo login/falha/reload |
| Início + Agenda em ≤5 s, mesma sessão | **1** consulta `atividades ativas` ao todo na branch (a compartilhada) | 2+ consultas idênticas nesse intervalo sem mutação/invalidação |
| Reabrir Agenda após 5 s | Nova query **pode ser esperada** pelo TTL; clientes idealmente cacheados até 5 min | Duplicação simultânea mesmo após dedup, ou explosão por renders |
| Histórico | 1 consulta de lista com `limit(100)`; clientes distintos reaproveitados | Fallback sem `limit` em produção ou várias recargas sem ação |
| Perfil | 1 consulta inicial ao abrir, zero requisições Firestore nos filtros 30/90/365 dias | Reconsulta a cada alternância de intervalo |
| Autocomplete | Carregar base **uma vez por sessão** até migração para pesquisa paginada | Recarregar todos os clientes a cada digitação/entrada sem trocar de sessão |
| CNPJ | No máximo 3 queries sequenciais, aborta no primeiro hit | 4+ por tentativa ou buscas duplicadas |
| Check-in/checkout | Contar uma sequência de validação e **uma** TX por intenção do usuário; retries internos identificados separadamente | Duas gravações de ação por duplo clique; reload infinito |
| Leitura de mídias | Pedir no máximo 30 URLs por lote, cachear até pouco antes de expirar, reutilizar por sessão | Requisitar perfis/atividades repetidamente para **cada foto** de uma mesma visita quando batch deveria ser usado |
| Importação catálogo | Lançar alarme se fluxo normal reexecuta importação 103 writes/102 verificações repetidamente | Dois disparos de importação sem alteração de versão de catálogo |

**Limites locais presentes na branch:** cache de atividades 5 s, cache clientes 5 min, catálogo 10 min; pausa 60 s após `resource-exhausted`; mídia: lote de até 30, máximo preventivo de 60 requests/min, URLs até 300 s com margem de 30 s. Essas proteções **não substituem teto de leituras faturadas** e não estão homologadas em produção.

**Alerta especial:** nenhuma das três consultas de grande crescimento tem teto de documentos no servidor: A16 (`clientes`), A13 (`Perfil/atividades`), A07 (`fallback do Histórico`). **Não** inventar `limit(50)` antes de garantir semântica de busca/histórico; registrar e medir.

## 6. Matriz de risco/hipóteses priorizadas

| ID | Hipótese e evidência estática | Sinal que confirma/refuta |
| --- | --- | --- |
| INF03-H01 | Autocomplete sem limite `getDocs(status in...)`; busca e filtro são locais | Leituras ∝ total de clientes ao abrir cadastro/agendamento |
| INF03-H02 | Perfil `getDocs(ptvId)` sem período/status no Firestore | Leituras ∝ total histórico individual, não apenas últimas 365 dias |
| INF03-H03 | Histórico fallback por `failed-precondition` sem limite | Console/log acusando índice ausente; leituras crescem até total de atividades |
| INF03-H04 | Worker busca perfil e atividade por requisição; foto em lote divide custo | Requisições REST/user/mídia (especialmente múltiplas fotos da mesma visita) |
| INF03-H05 | Importação do catálogo automaticamente quando metadata não coincide | Picos correlacionados à primeira abertura do catálogo/treinamento comercial |
| INF03-H06 | Home + Agenda duplicadas em `main`; compartilhadas na branch | Count de consultas idênticas ao alternar as telas |
| INF03-H07 | Atualizações pós-commit na produção podem reler atividade | Count de `getDoc` após TX no checkout; branch removeu |
| INF03-H08 | Ações com TX podem sofrer retries/duplicação de intenção | Count de callbacks, round-trips e commits nas operações |
| INF03-H09 | Cache do navegador e sessão pode distorcer a amostra | Comparar instalação limpa vs sessão quente vs navegador recarregado |
| INF03-H10 | Outros clientes do banco (usuários, versões antigas, CLI, Worker e Functions publicadas) | Tráfego persistente quando PWA está parado; rastrear sem presumir origem |

## 7. Como produzir a medição válida sem mexer na produção

### Fase 1 — observação passiva (pode começar já)
1. Anotar a **janela exata** (fuso `America/Sao_Paulo`), número de sessões de promotores/assistentes e atividades executadas; não afirmar exclusividade de tráfego apenas por um teste.
2. Consultar o **painel Firebase Firestore → Usage** para leituras, escritas, exclusões, uso e avaliações de Rules antes/depois da janela, respeitando agregação e atraso das métricas.
3. Consultar métricas do **Worker Cloudflare** na mesma janela: requests por rota, erros 401/403/429/5xx, duração. Se o painel disponível não segmentar por rota, assinalar “sem detalhe”, **não inferir** divisão a partir de total.
4. Consultar **R2** separadamente: PUT/GET/DELETE e volume; erro de R2 não deve ser creditado como leitura Firestore.
5. Correlacionar tempos sem divulgar tokens, IDs pessoais, CNPJs, URL assinada ou dados reais de lojas.

### Fase 2 — teste reproduzível sem gravar dados produtivos
1. Criar sessão de homologação com Firebase/Worker/R2 isolados e dados sintéticos: **0, 10, 100, 500** documentos em consultas, incluindo clientes/atividades antigas.
2. Repetir **login → Início → Agenda → Histórico → Perfil → autocomplete → produto → fotos**. Executar uma vez com cache frio, outra com cache quente (<5 s), outra após 5 s, e outra após 5 min. Gerar traces desidentificados.
3. No fluxo de fotos, comparar `1`, `6`, `12` fotos de uma atividade: testar contagem de requests Worker versus quantidade de atividade única e tamanho do lote, sem realizar PUT real no projeto produtivo.
4. Medir check-in, checkout e salvamentos apenas no isolamento, inclusive rede instável, transações repetidas e imagens existentes.
5. Comparar **`main` vs PR #26** sob o mesmo conjunto de dados/ações; executar o Query Explain (`analyze`) apenas com conta IAM autorizada e ciente da cobrança. Versão `default` pode validar índices sem executar a consulta.
6. Registrar: cenário, versão, cache frio/quente, N documentos, **requisições por endpoint/SDK**, `readOperations` quando disponível, writes, avaliações Rules, tempos e sucesso/erro.

### Esquema de log desejável no ambiente de teste

`timestamp | build | uid_anon | sessao_anon | acao | camada (sdk/worker/auth/r2) | operacao | colecao_ou_rota | qtd_documentos | duracao_ms | origem_cache | status | retry | erro`

Não incluir UID/email/token real nos logs exportados; mascarar identificadores. **Instrumentation futura deve permanecer em homologação até revisão**; a auditoria INF-03 não justifica deploy de telemetria em prod. Dados do Console são agregados e não indicam automaticamente quais ações geraram cada leitura.

## 8. O que foi concluído e o que ainda falta

- [x] Definir métricas e diferenciar SDK, REST, Auth, R2, índice e avaliações de Rules.
- [x] Registrar referências oficiais e quota gratuita de referência; **não** confundir quota financeira com limite do aplicativo.
- [x] Criar fórmulas por operação com variáveis e simulação explicitamente hipotética.
- [x] Definir guardrails de **requisições**, baseados no código e nos TTL atuais.
- [x] Identificar dez hipóteses prioritárias e protocolo reprodutível de medição.
- [x] Explicar por que 153 leituras e 257 avaliações num período são evidência insuficiente para concluir “pico anormal”.
- [ ] Obter **tamanho real dos conjuntos** (`A,H,T,C,clientes distintos`), frequência por usuário/tela e regras de faturamento aplicáveis a queries concretas.
- [ ] Confirmar se o índice composto do Histórico está **publicado**; o arquivo `firestore.indexes.json` versionado não prova deployment.
- [ ] Medir chamadas Worker/REST por lote de mídia e reconstruir contribuição real para Firestore.
- [ ] Separar séries de métricas de Firestore e Rules em janela de execução observada.
- [ ] Rodar testes de comparação com cache frio/quente, múltiplos usuários e homologação isolada.
- [ ] Definir SLO/orçamento **numérico definitivo** por cenário com dados do ambiente, sem inventar baseline.

**Decisão:** INF-03 **EM ANDAMENTO / PARCIAL**. A estrutura para medição está pronta, mas **não** marcar “finalizado” antes de evidência de volume e tráfego real. Não realizar otimizações de produção antes de terminar INF-03/INF-11 e priorização, salvo hotfix comprovadamente crítico.
