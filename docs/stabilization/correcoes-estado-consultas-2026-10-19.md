# Correções de estado e consultas — 19/10/2026

## Resultado e alcance

Primeira rodada após a auditoria estrutural, na branch `fix/v0.1.1`. Sem publicação de frontend, regras ou Worker em produção. Mudanças restritas ao App e testes; sem nova funcionalidade ou refatoração ampla. Cache PWA candidato atualizado para v75 e novos módulos incluídos no app shell.

| Achado | Situação nesta rodada | Evidência |
| --- | --- | --- |
| EST-02 | Corrigido localmente no check-out normal e manual; aguarda homologação | Após a transação confirmada, não há leitura adicional para decidir se houve sucesso. Falha de navegação/histórico informa operação salva e orienta a não repetir. Falha na transação continua sendo erro. |
| EST-04 | Corrigido localmente na abertura do editor e visualizador; aguarda homologação | Dados de atividade, relatório e cliente permanecem locais até todas as leituras terminarem. Resultado precisa pertencer ao pedido mais recente, sessão e seleção atuais. Troca de tela invalida o pedido. Erro de pedido antigo não mostra alerta nem redireciona. |
| EST-03 | Concorrência corrigida nos carregadores listados; contenção geral ainda parcial | Seis entradas concorrentes na tela inicial iniciam uma consulta. Início e agenda compartilham a mesma consulta de atividades abertas. Histórico, fallback, autocomplete, perfil e busca de CNPJ também compartilham suas consultas equivalentes em andamento. |
| EST-06 | Corrigido localmente; aguarda homologação | Cota, permissão, autenticação e indisponibilidade interrompem variantes de CNPJ. Erro parcial seguido de resultados vazios não retorna ausência. Busca legada válida permanece suportada. |

## Decisões de implementação

`src/services/latest-request.js` fornece invalidação de resultados obsoletos. `script.js` invalida na troca de tela, limpeza da visita e troca de autenticação. O editor captura o ID antes de aguardar; o visualizador utiliza o mesmo controle de último pedido. Isso evita aplicação tardia de dados; não cancela uma leitura Firestore que já foi enviada.

`src/services/query-coordinator.js` compartilha promessas em andamento por chave contendo UID, perfil, versão da sessão e consulta. Resultados bem-sucedidos não permanecem em cache: uma consulta posterior busca novamente. Assim não foi introduzida uma janela de dados persistidos desatualizados. Após erro explícito de cota/429, novas consultas coordenadas são pausadas por 60 segundos no navegador. Nova sessão limpa a fila lógica; erro de transporte antigo não bloqueia a sessão nova. Check-out confirmado também limpa o coordenador antes de carregar histórico atualizado.

Esta pausa é local ao coordenador deste navegador. Não é limite distribuído, não impede SDKs de terem política própria de transporte e não bloqueia gravações/leituras pontuais que não usam o coordenador. Ações sequenciais depois de sucesso ainda podem iniciar novas consultas. Paginação, orçamento de consultas e eliminação do fallback amplo do histórico continuam pendentes. Não se promete impossibilidade de esgotar cota.

Check-out usa o reconhecimento da transação Firestore como confirmação da gravação. Uma falha posterior não é apresentada como falha do commit. O histórico propaga a falha quando chamado após conclusão, permitindo a mensagem específica de sucesso com problema de atualização; o carregamento comum mantém sua mensagem de erro normal. Após o carregamento, a sessão é conferida novamente antes de mostrar confirmação.

## Regressões e validação

- `tests/stabilization-state.test.mjs`: resultado atrasado em cada etapa de abertura (atividade, relatório e cliente), duas aberturas concorrentes, navegação, visualizador e descarte de erro obsoleto; check-out normal/manual com sucesso, falha de gravação, falha posterior de interface/histórico e troca de sessão; propagação de erro do histórico.
- `tests/query-coordinator.test.mjs`: seis consumidores compartilham transporte, nova consulta depois de resolver busca dados novos, pausa por quota, recuperação após 60 segundos, isolamento de falha da sessão antiga, liberação após erro comum, CNPJ parcial/cota/permissão e carregador real da tela inicial conectado ao coordenador.
- Testes antigos de transação comercial/treinamento continuam verificando validação de módulos no servidor e gravação atômica, agora com sessão ativa no cenário de erro em vez de simular uma sessão já encerrada.
- Diagnósticos EST-02/03/04/06 retirados de `tools/audit/reproduce-structure.mjs` e substituídos por regressões do comportamento correto. Os JSONs da auditoria permanecem snapshots da base auditada, sem reescrever o histórico.

Validação local: `npm run check`, `npm test`, `npm run test:rules` e `npm run test:integration`. Resultados desta rodada: 188 testes App/Worker, 23 cenários de regras e sete cenários integrados aprovados, total 218. A integração usa Auth/Firestore locais, Worker real em VM e R2/bindings simulados. Não houve homologação em Android ou serviços reais.

## Ainda bloqueia lançamento

EST-01 (recuperação durável de rascunhos/fotos), EST-05 (prazo/cancelamento do transporte de mídia e fila entre sessões), EST-07 (invariante de uma visita ativa) e EST-08 (completude no servidor) continuam abertos. Também permanecem migração/revisão dos vínculos, homologação isolada, configuração de bindings e Android/PWA. O diagnóstico atual continua reproduzindo os defeitos ainda abertos; sua saída zero não representa aprovação de lançamento.
