# Auditoria estrutural — 19/10/2026

> Atualização posterior: EST-02/04/06 e a concorrência de EST-03 receberam correções locais. Consulte [correções de estado e consultas](correcoes-estado-consultas-2026-10-19.md). O conteúdo abaixo registra a base auditada e os JSONs preservam suas evidências originais. A candidata segue bloqueada.

## Decisão

A revisão estrutural do App e do Worker foi concluída no escopo de código próprio. A candidata **ainda não deve ser liberada**: há oito riscos P1 reproduzidos abaixo. Este commit documenta a auditoria e acrescenta reproduções; não corrige esses riscos nem altera produção. A aprovação dos testes anteriores não cobre os defeitos agora demonstrados.

Base auditada: branch `fix/v0.1.1`, commit remoto `77a951c8c598fbd43d7ebddc8e79d52bbeb5cb52`, árvore `4ff0a1fe2a5e3debf572ebde6d6699ae4f20f30d`. Produção registrada na baseline: `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e`. As regras restritas e o Worker da candidata não foram publicados. As regras amplas fornecidas pelo usuário continuam sendo um P0 de produção até migração e publicação verificadas.

## Método e limites

Inventário sintático dos 39 módulos JavaScript próprios do App/Worker, grafo de imports estáticos e dinâmicos literais, leitura dos fluxos críticos, revisão de listeners/observers/estado e oito reproduções locais. Dependências externas, SDKs, código vendor e o Admin aposentado não tiveram suas implementações internas auditadas. HTML, regras, ferramentas operacionais e configuração foram examinados como pontos de entrada e integração.

O inventário anexo registra arquivos, imports, estado mutável e chamadas relevantes. Não foram encontrados ciclos entre os módulos próprios analisados nem imports sem referência pela análise sintática. Isso não prova ausência de dependências dinâmicas, código morto ou erros de execução. Contagens de chamadas de SDK incluem construtores de referências; **não equivalem a requisições ou leituras faturadas**.

As reproduções EST-01 a EST-06 executam classes/funções reais ou trechos extraídos do controlador com dependências simuladas. EST-07 e EST-08 executam operações equivalentes do protocolo diretamente contra as regras candidatas no emulador Firestore; não são testes de navegador nem execução integral do check-in real. Nenhuma acessa dados de produção. Não houve validação Android, perda real de processo PWA, R2 real, bindings Cloudflare ou métricas históricas nesta etapa.

## Arquitetura e responsabilidades

| Camada | Arquivos | Responsabilidade / acoplamento |
| --- | --- | --- |
| Entrada e navegação | `index.html`, `script.js` | Inicializa Auth, controla telas, guarda seleção/sessão, lê/grava Firestore e monta fluxos. Principal concentração de responsabilidades. |
| Configuração | `firebase-config.js` | Projeto Firebase do navegador. Preview não isola o banco automaticamente. |
| Domínio | `src/domain/{cancellation,contact,formatters,history,identifiers,operation-errors,products,profile,reports,scheduling,training}.js` | Regras e formatação reutilizáveis, em geral sem DOM/banco. |
| Dados | `src/data/{auth-profile,client-repository,cnpj-lookup,product-import,product-repository}.js` | Vínculos por UID, catálogo/clientes, caches e consultas. A extração não abrange todas as consultas do controlador. |
| Serviços | `src/services/{cancellation,commercial-save,location,media-url-cache}.js` | Orquestração, geolocalização e fila/cache de URLs de mídia. |
| Relatórios | `technical-report-editor.js`, `src/ui/{commercial-report,training-report}.js` | Edição, rascunhos, renderização, revisão e preparação de uploads. Treinamento herda o controlador comercial. |
| Demais interfaces | `src/ui/{agenda-calendar,agenda-cards,assistance,change-password,client-options,contact-share,home-map,loading,profile,pwa,visit-view}.js` | Componentes com DOM, mapas, contatos, senha e visualização; recebem parte dos dados por callbacks. |
| Importador legado | `importar-produtos.html`, `src/ui/product-import-page.js` | Página com gravação direta; incompatível com catálogo somente leitura da candidata. CLI separado permanece útil. |
| PWA | `sw.js`, manifesto e `src/ui/pwa.js` | Cache de recursos e atualização. Não há fila persistente de relatórios/fotos para recuperar processo encerrado. |
| API de mídia | `cloudflare/advance-media-api.js` | Auth, perfil, atividade, limites, validação de mídia e assinatura/operações R2. Acesso ao Firestore por REST. |
| Segurança | `firestore.rules`, `firebase.json` | Controle de acesso candidato e ambiente de emuladores. Não é ainda validação completa das regras de negócio. |

Fluxos: check-in lê visitas abertas e atualiza atividade/cliente; relatório mantém rascunho e grava documento com vínculo da atividade; upload passa por Worker e R2 antes dos metadados Firestore; check-out atualiza atividade/relatório em transação e faz confirmação posterior. Ver matriz de autorização em [access-matrix.md](access-matrix.md).

| Arquivo | Tamanho / linhas | Consequência |
| --- | --- | --- |
| `script.js` | 137.647 bytes / 2.972 | 39 bindings mutáveis de módulo, 10 atribuições explícitas em `window`, 45 funções/callbacks async e 62 pontos de chamada SDK incluindo referências. Navegação, estado, banco e mensagens se influenciam. |
| `technical-report-editor.js` | 34.434 / 816 | Editor, transporte de mídia, blobs e diálogos no mesmo módulo. |
| `src/ui/commercial-report.js` | 27.549 / 250 | Linhas extensas de templates escondem volume; acumula renderização, rascunhos, validação e salvamento. |
| `cloudflare/advance-media-api.js` | 26.251 / 1.204 | Handler principal de aproximadamente 487 linhas combina roteamento e políticas. Dividir depois de estabilizar contratos. |
| `src/ui/training-report.js` | 15.813 / 99 | Herança reutiliza também estado, mídia e ciclo de vida comercial. |

## P1 — bloqueios reproduzidos

P1 significa corrigir e homologar antes de liberar esta candidata ao piloto. A ordem abaixo prioriza perda de trabalho, integridade e cota; não exige refatoração ampla.

| ID | Evidência e gatilho | Efeito | Correção pequena e critério de regressão |
| --- | --- | --- | --- |
| EST-01 | `commercial-report.js:20,31,247`, herdado por treinamento. `module-done` apenas muda página e renderiza; reprodução não chama persistência. Maps guardam os rascunhos; não há persistência local durável deles. | “Salvar módulo/relato” pode deixar trabalho só na memória até o botão geral. Encerrar/recarregar o PWA perde trabalho ainda não gravado, inclusive fotos pendentes. Minimizar não implica automaticamente perder processo. | Persistir recuperação por usuário/atividade, incluindo blobs pendentes, ou gravar com segurança nos pontos já chamados de salvar; só limpar após confirmação. Testar recarga/encerramento antes e depois do salvamento e falha de upload. |
| EST-02 | `script.js:2393–2455,2584–2734`. Transação termina e `getDoc` de confirmação falha. Reprodução deixa banco `Concluída` e interface “Erro ao concluir visita”. | Usuário acredita que precisa repetir uma operação já gravada. | Separar sucesso da gravação de falha de confirmação/renderização. Testar commit bem-sucedido seguido de erro de leitura, rede e histórico. |
| EST-03 | `script.js:796–914,947,1131,1637`. Sequências rejeitam respostas antigas, mas não impedem consultas já iniciadas. Seis chamadas simultâneas iniciam seis `getDocs`. Autocomplete só marca carregado ao terminar. | Navegação/ações repetidas amplificam leituras mesmo com uma única pessoa. Isso demonstra um mecanismo, não a origem histórica do pico. | Compartilhar promessa em andamento por sessão/consulta, cache curto invalidado por escrita e controle de repetição após quota. Testar seis entradas concorrentes com uma execução e atualização após escrita. |
| EST-04 | `script.js:2274–2364`. Callback valida sessão, mas usa `atividadeSelecionadaId` mutável depois de aguardar leitura. A resposta A chega após seleção B: objeto A e editor hidratado com chave B. Visualizador `1404–1449` apresenta risco semelhante por inspeção. | Mistura de contexto entre visitas da mesma sessão; rascunho errado ou conflito indevido. Não demonstra acesso a outro usuário. | Capturar ID/contexto antes de await e rejeitar resposta se seleção/tela/geração mudou; aplicar ao visualizador. Testar navegação A→B com resposta A atrasada. |
| EST-05 | `technical-report-editor.js:16–54`, `media-url-cache.js`. Transporte sem prazo/cancelamento; `clear()` invalida estado, mas `flushing` ainda aguarda requisição antiga. | Uma autorização pendurada da sessão anterior impede o lote novo de iniciar até o transporte terminar. | AbortController e prazo nas requisições; isolar geração da fila para que transporte velho não bloqueie a nova sessão. Testar logout/login durante requisição pendente e timeout de PUT. Worker também precisa de prazos explícitos de upstream. |
| EST-06 | `src/data/cnpj-lookup.js:9–27`. Erro na primeira variante seguido de duas respostas vazias retorna “não encontrado”. Reprodução: quota excedida, três consultas, resultado vazio. | Indisponibilidade vira ausência; tentativas desnecessárias e cadastro baseado em informação inconclusiva. Proteção por ID canônico não cobre toda compatibilidade legada. | Falhar imediatamente em quota/permissão; nunca concluir ausência quando parte necessária da busca falhou. Testar erros parciais e busca legada válida. |
| EST-07 | Pré-consulta de visitas abertas em `processarCheckin`, fora da transação; transação não disputa registro único por usuário. Regras candidatas não impõem esse invariante. Emulador: ambas sessões veem zero e iniciam atividades distintas; resultado duas abertas. | Segunda sessão pode violar a regra de uma visita ativa. | Registro de visita ativa por usuário, protegido e alterado atomicamente com a atividade, incluindo liberação nos encerramentos/cancelamentos. Testar corrida real e rejeição nas regras. |
| EST-08 | `firestore.rules` valida vínculo, dono, campos/status, mas não todos os módulos obrigatórios. Emulador aceita conclusão comercial com três módulos que o domínio considera pendentes. | Um cliente autorizado que ignore a UI pode concluir relatório incompleto; não é invasão entre usuários. | Validar completude também na fronteira confiável, com contrato para tipos/legados. Testar escrita direta inválida, conclusão válida e compatibilidade antes de endurecer. |

Asserções do diagnóstico descrevem defeitos observados: saída zero significa **reprodução confirmada**, não sistema correto. Não adicionar esses casos como aprovação da versão; substituir cada um por teste de comportamento corrigido quando tratado.

## P2 — contenção e manutenção após os bloqueios

| Ponto | Evidência | Encaminhamento |
| --- | --- | --- |
| Consultas sem limite efetivo | Perfil em `script.js:2954` carrega atividades e filtra ano localmente. Fallback do histórico em `1159` retira filtros/ordenação/limite do servidor quando falta índice e corta 100 depois. | Criar/verificar índices e paginação, aplicar intervalo no servidor; não esconder falha de índice com leitura total. |
| Upload R2 e metadados não atômicos | Editor faz upload antes de persistir metadados. Rollback usa `allSettled`; falhas de remoção não garantem limpeza. Worker exige atividade aberta para remover. | Rastrear objetos pendentes para recuperação/limpeza autorizada. Corrida com fechamento em outra sessão é hipótese por código, ainda requer reprodução integrada. |
| Página importadora incompatível | `product-import-page.js` grava catálogo pelo SDK; regras candidatas o tornam somente leitura. | Retirar entrada antiga de distribuição ou orientar para CLI autorizada; não abrir regras para manter página provisória. |
| Exportador pode gastar leituras | `tools/export-firestore.mjs --structure-only` ainda percorre documentos; apenas omite dados no resultado. | Dar orçamento/paginação/contadores e esclarecer custo. Ferramenta não foi executada contra produção nesta auditoria. |
| Observers no retorno do navegador | ResizeObservers dos relatórios são desconectados no caminho explícito de fechar/recriar, mas o caminho popstate precisa limpeza equivalente. | Padronizar encerramento de tela e verificar referências a host antigo. Nenhuma consulta Firestore decorre diretamente deles. |
| Miniaturas legadas | Worker mantém leitura de variante antiga; exclusão atual trata original. Comentário do editor sobre limpeza de legados excede implementação. | Inventariar objetos antigos antes de remover suporte ou implementar limpeza. Não há nova geração automática de miniaturas demonstrada. |

## Estado, listeners e operações assíncronas — cobertura

| Grupo | O que foi conferido | Resultado |
| --- | --- | --- |
| Inicialização/Auth | DOMContentLoaded com once / alternativa de documento pronto, callback de Auth e troca de sessão | Inicialização única no fluxo normal; listener Auth permanece pela vida do app. Vínculo candidato e checagens de sessão reduzem respostas de usuário antigo; não resolvem seleção de visita na mesma sessão (EST-04). |
| Navegação/consultas | Início, agenda, histórico, perfil, autocomplete e seleção | Gerações evitam parte da UI obsoleta, sem deduplicação de transporte (EST-03); consultas históricas/perfil descritas em P2. |
| Clientes/produtos/Auth | Repositórios, CNPJ e resolvedor de perfil | Caches dos repositórios compartilham trabalho; CNPJ tem falha EST-06. Resolvedor usa vínculo UID e perfil ativo; sem varredura de coleções por e-mail. |
| Relatórios/editor | Maps, herança, revisão, staging de fotos, beforeunload, diálogos e blobs | EST-01/04/05. Dois controladores criam listeners beforeunload de duração do app; não foi demonstrado crescimento infinito. Diálogo de fonte usa instância atual. URLs locais e bitmaps têm caminhos de liberação. |
| Mídia/DOM | MutationObserver global, cache/batch e abertura de imagem | Observer acompanha childList/subtree, não atributos; marca elemento preparado. Hidratação prepara botão; leitura assinada ocorre no clique. Não encontrada realimentação infinita causada pela própria marcação. Cache possui EST-05. |
| Mapas/contatos/localização | HomeMap, ProfileView, ContactShare e geocodificação | Há invalidação por versão, remoção de mapas/diálogos e prazos de GPS/geocodificação. Não demonstrado loop Firestore. |
| Agenda/cards/loading/assistance/senha/PWA | Componentes menores, handlers e fluxos auxiliares | Nenhum defeito bloqueador adicional demonstrado nesta revisão; isso não substitui teste real de câmera/GPS/atualização. |
| Domínio/serviços | Cancelamento, contato, datas, histórico, identificadores, produtos, perfil, relatórios, agendamento, treinamento, gravação comercial | Camada separada existe e é testável; parte da validação ainda duplicada na UI. Salvamento comercial centraliza transação, mas callback posterior pode falhar após commit; EST-02 deve cobrir a distinção geral. |
| Worker | Cache de chaves, permissões, limitadores, lote, Firestore REST e R2 | Candidata limita pedidos e reutiliza perfil dentro da requisição; não mantém cache entre pedidos de permissão. Sem prazo explícito de upstream; não resolve leituras diretas do App. Limites aproximados por localização não garantem cota global. |
| Service worker | Cache de assets e atualização | Não é mecanismo de recuperação dos rascunhos. Versão candidata 73; atualizar recursos não demonstra homologação da instalação Android. |

Não foram encontrados `setInterval`, `onSnapshot` ou atualização de rede por `visibilitychange` no código próprio analisado. Minimizar o app com fotos não foi demonstrado como gerador periódico de consultas. SDKs podem ter tráfego interno; apenas logs/métricas correlacionados à versão e operação permitiriam atribuir o incidente anterior. Não há prova de que o promotor causou o pico por uma ação específica.

## Duplicação, obsolescência e acoplamento

- A completude comercial aparece em `CommercialReport.complete` e `domain/reports.modulosComerciaisPendentes`, com critérios diferentes: UI aceita alguns valores pela presença, domínio restringe opções e produtos. Centralizar no domínio após regressões; treinamento já reaproveita parte dessa camada.
- Formatadores de escape/resumos e geração de templates repetem lógica entre editor, relatórios, visualização e PDF. Uma callback de revisão é idêntica em comercial/treinamento. Unificar pequenos auxiliares, sem reconstruir a UI agora.
- `TrainingReport extends CommercialReport` herda staging, cache, edição, listeners e política de salvamento. `visit-view` importa resumo de treinamento do módulo de UI, trazendo sua família de edição. Extrair apresentação pura depois dos P1.
- `perfilUsuarioLogado`, `dataCheckinAtual` e `cnpjNovoCliente` em `script.js` têm apenas atribuições no código próprio examinado, sem leitura encontrada. Candidatas P3 à remoção; não removidas neste commit.
- `garantirCatalogoAdvance` está sem consumidor de runtime na candidata, mas continua coberta/usada em testes. `importarCatalogo` serve ferramentas; não excluir o módulo inteiro.
- `commercial-preview.html` é protótipo separado com fallback em memória, diferente do deploy preview Vercel. Não tratá-lo como fluxo persistente de homologação.
- Áudio/vídeo e miniaturas podem atender documentos antigos. Sem inventário dos dados não é seguro classificá-los como mortos.
- Documentação Cloudflare tem referências antigas de branch/miniaturas; nomes de querystrings de assets e versão SW não estão uniformes. P3 de rastreabilidade, sem prova isolada de cache quebrado.

Não se recomenda framework novo, reescrita do controlador inteiro ou reconstrução do Admin nesta correção. Separar gradualmente controlador de visitas, carregadores de consultas e persistência de relatório quando os contratos críticos estiverem protegidos.

## Execução e próximos passos

1. Corrigir EST-02/04/06 com commits pequenos e regressões de erro/concorrência.
2. Corrigir EST-03/05 para conter pedidos e impedir transporte antigo de bloquear sessão nova.
3. Resolver recuperação dos rascunhos/fotos (EST-01), sem alterar silenciosamente a semântica de relatório publicado.
4. Implementar invariantes de sessão/relatório EST-07/08 com regras e testes; revisar migração e documentos legados.
5. Executar suítes e homologar em Firebase/R2/Worker isolados e Android. Só então concluir vínculo dos usuários, implantação coordenada e observação.

Comandos do diagnóstico, a partir da raiz do repositório:

```sh
node tools/audit/reproduce-structure.mjs
./node_modules/.bin/firebase emulators:exec --project demo-advance-v011 --only firestore 'node tools/audit/reproduce-structure.mjs --firestore'
```

O segundo comando exige emulador local em `127.0.0.1:8080`; o script recusa outro host e usa somente projeto demo. Ele limpa o banco demo antes das reproduções. Requer dependências dev instaladas e Java. Evidências anexas: [audit-observations.json](audit-observations.json) e [structural-inventory.json](structural-inventory.json).

Validação deste commit: `npm run check` aprovado (78 arquivos); `npm test` aprovado (162 testes). As oito reproduções, incluindo as duas com Firestore local, completaram com os defeitos esperados. As 23 verificações de regras e sete integrações da entrega anterior não foram reexecutadas nesta etapa: não houve mudança de runtime ou regras.
