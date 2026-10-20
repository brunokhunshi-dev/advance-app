# INF-08 — Obrigatoriedade de relatórios e validação no servidor

**Data:** 19/10/2026  
**Status da auditoria estática:** **CONCLUÍDA, com falha de garantia server-side CONFIRMADA pela configuração de regras informada. Validação de servidor NÃO HOMOLOGADA e NÃO IMPLEMENTADA.**  
**Ambiente:** Advance Check v0.1 em produção, PR #26 candidata v0.1.1; **Advance Admin descontinuado**.  
**Regra Firestore atual informada pelo responsável:** `allow read, write: if request.auth != null;` em `/{document=**}`. O responsável optou por manter temporariamente essa regra, conforme aceite operacional INF-04. **Não houve publicação nem teste ofensivo contra o banco de produção.**

## 1. Resposta à pergunta central

**É possível uma conta autenticada no projeto escrever `atividades/{id}.status = 'Concluída'` sem relatório e sem passar pelo checkout do aplicativo?**

**SIM, conforme as regras Firestore fornecidas.** A condição de acesso verifica apenas a presença de autenticação. Não exige:
- existência de `relatorioId` ou `relatorioColecao`;
- documento de relatório correspondente, integridade de vínculo `atividadeId` ↔ `ptvId`;
- módulos obrigatórios preenchidos;
- transição permitida `Em andamento` → `Concluída`;
- propriedade da atividade ou papel do usuário;
- dados de checkout ou validação de local.

Esse comportamento **não exige explorar vulnerabilidade do Worker** nem usar a interface: é consequência direta da política de escrita de documentos Firestore. **O problema precede a PR #26**; a PR não introduziu a regra. Não foi executada gravação de prova no banco produtivo.

**Importante:** chamar `runTransaction(db,...)` no frontend **não transforma a validação dentro do callback em validação executada pelo servidor**. O servidor Firestore confirma a atomicidade da transação e verifica as Security Rules, mas as validações de módulos/relatório (`modulosComerciaisPendentes`, etc.) são código JavaScript executado pelo navegador.

## 2. Matriz por tipo de visita, fluxo normal do App

| Tipo | Exigências checadas no cliente | Conferência dentro de transação do SDK | Garantia via Rules/servidor |
| --- | --- | --- | --- |
| Comercial modular v1 | `relatorioId`, vínculo e módulos `Contato na loja`, `Disponibilidade dos produtos`, `Exposição e materiais` conforme respostas; outras condições no checkout | `tx.get(atividade)` + `tx.get(relatorio)`, vínculo, versão, módulo, comparação com relatório aberto e atualização de ambos os docs na TX | **NÃO**; qualquer conta autenticada pode escrever diretamente |
| Comercial legado | `relatorioId`, texto não vazio/compatibilidade e opções de checkout | Validação de status, vínculo, documento e campos obrigatórios específicos antes do `tx.update` | **NÃO** |
| Treinamento modular v1 | `Planejamento`, `Treinamento` e `Feedbacks`; módulo livre opcional | Revalidação do relatório atual, `modulosTreinamentoPendentes` e comparação dos módulos ao concluir | **NÃO** |
| Assistência técnica | `Produto`, `Queixa`, `Constatações`, além de campos de encerramento (ações, conclusão e resultado) | Releitura de atividade/relatório e validação de campos; TX atualiza ambos | **NÃO** |
| Fechamento manual | Motivo, relatório salvo/vinculado, relatório válido e módulos obrigatórios por tipo | `runTransaction` valida status/relatório e grava atividade + relatório juntos | **NÃO** |

**Nota:** `relatorioValidoParaCheckout` retorna `true` para relatório modular comercial/treinamento com `versao===1`, **mesmo que parcialmente preenchido**. Isso é intencional para permitir salvamento de rascunho; o checkout impede conclusão **com verificações adicionais de módulos** no mesmo fluxo normal. Não remover essas verificações e não confundir “relatório salvo” com “relatório completo”.

### Evidência do código candidato

- `script.js:2223–2267` — abertura de checkout: status, vínculo e relatório.
- `script.js:2715–2784` — checkout normal: módulos por tipo e revalidação com `tx.get`.
- `script.js:2843–2845` — atualização da atividade e relatório na mesma TX.
- `script.js:2513–2565` — fechamento manual, inclusive `modulosComerciaisPendentes`, `modulosTreinamentoPendentes` e `camposAssistenciaPendentes`.
- `src/domain/reports.js:99–141` — regras de preenchimento e `relatorioValidoParaCheckout`.
- `src/domain/training.js:11–26` — regras por módulo de treinamento.
- `tests/commercial-transactions.test.mjs:59–80,116–139` — testes com `vm` e mock de transação (não emulador ou servidor).
- `tests/commercial-persistence.test.mjs:59–68` — regras de validação modular; descrição “server checkout validation” no teste **não comprova execução no backend**.

### Componentes que NÃO impõem a integridade da conclusão

- **Cloudflare Worker:** no código fornecido, autoriza fotos e interage com Firestore REST, mas **não é o único ponto de escrita** de atividades e não fornece endpoint obrigatório de conclusão.
- **Firebase Firestore Rules:** globais `request.auth != null`, sem validação de propriedade, transição, relatórios ou `getAfter()`. A política versionada do Advance Admin descontinuado não substitui as regras fornecidas.
- **Cloud Functions externas:** não foram comprovadas como publicadas e vinculadas a este fluxo; a árvore do repositório App não contém implementação de API/callable para checkout obrigatório. Portanto **não afirmar** que exista proteção de servidor suplementar.

## 3. Severidade e efeito no deploy planejado

**F08-01 — Falta de garantia server-side para conclusão obrigatória.** **Severidade técnica: ALTA (P1) como falha de integridade/autorização, PREEXISTENTE e ACEITA temporariamente no INF-04 para o piloto.** Impacto possível: qualquer conta autenticada no mesmo projeto pode alterar diretamente registros de outros usuários, marcar visitas concluídas sem documento de relatório ou adulterar dados de saída. O comportamento do app normal não é evidência de abuso real.

**Decisão do responsável já documentada:** manter as regras atuais por enquanto. Isso **não autoriza afirmar “validado no servidor”** nem implica que a alteração deve ser feita às pressas horas antes do deploy. **A escolha de prosseguir com o release assumindo este risco deve ser explícita**, com monitoramento e plano de reversão; o aceite de INF-04 para o piloto não transforma a solução em tecnicamente homologada.

**F08-02 — Confusão entre validação de cliente e servidor.** **P2/documental:** testes unitários e transações realizadas no cliente protegem o fluxo padrão e alterações concorrentes dentro da transação, mas não protegem o banco de escritas de terceiros autenticados. Documentar corretamente nas revisões de segurança.

## 4. Para garantir isso no backend em evolução futura

Opções a avaliar após estabilização (não implementar sem plano e compatibilidade):

1. **Regras Firestore por papel e propriedade + transição de status**, com validação de existência e vínculo do relatório e, quando viável, documentos da mesma transação com `getAfter()`. Não presumir que Rules consigam substituir facilmente todas as validações condicionais dos módulos, e considerar limites de access calls.
2. **Endpoint confiável de conclusão (Cloud Functions/serviço server-side)** que valida módulo/relatório/owner/status, executa a TX e só então marca `Concluída`; regras Firestore proibiriam a escrita direta desse status pelo cliente. Esse é o desenho preferível se a lógica completa de relatório for complexa e evoluir.
3. **Migração em homologação isolada** com casos de comercial/treinamento/assistência, legado e fechamento manual. Não publicar apenas `advance-admin/firestore.rules`, pois poderia bloquear fluxo do app.

## 5. Testes de aceite não realizados

- [x] Inspeção estática do checkout por tipo e de ambos os fechamentos.
- [x] Confirmação lógica de que a política fornecida não restringe `status='Concluída'`.
- [x] Verificação de que o Worker fornecido não intercepta todas as gravações em atividades.
- [x] Distinção entre teste de cliente/mocks e validação server-side.
- [ ] Em projeto isolado: autenticar conta fictícia e tentar transição direta sem relatório; **esperado com regras atuais: permitida**, o que confirma a falha.
- [ ] Em regras/serviço futuros: exigir que a mesma tentativa seja negada; testar proprietário/perfil desativado, legado e módulos incompletos.
- [ ] Validar com teste E2E os checkouts normais e manual sob nova proteção; **não quebrar o fluxo do piloto**.
- [ ] Verificar integrações externas (Functions eventualmente implantadas) se futuramente adicionadas ao caminho de conclusão.
- [ ] Homologação de servidor pendente.

**Conclusão INF-08:** **ANÁLISE ESTÁTICA CONCLUÍDA; INTEGRIDADE DE RELATÓRIOS NO SERVIDOR NÃO ATENDIDA.** Risco técnico P1 preexistente, mantido por decisão anterior de não alterar Rules nesta fase. Não declarar conforme/homologado nem realizar mudanças de produção. **Próximo item em sequência: INF-09 — Service Worker e atualização PWA**, quando autorizado.