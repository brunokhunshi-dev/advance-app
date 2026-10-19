# Estabilização v0.1 — 19/10/2026

**Estado:** alterações experimentais na branch `fix/stability-state-queries-20261019`; **não publicar sem homologação**.

## Entregas incluídas

1. **Estado assíncrono:** requisições de abertura de relatório e de visualização passam a ter escopo por atividade e geração. Mudanças de tela/sessão invalidam respostas antigas. Abertura de relatório carrega atividade, relatório e cliente em variáveis locais antes de publicar o estado global.
2. **Consultas:** tela inicial e agenda usam uma consulta compartilhada de atividades (mesma conta). Há deduplicação em voo, cache de cinco segundos, invalidação após agendamento, edição, cancelamento, check-in e checkout e bloqueio de novas leituras por um minuto após `resource-exhausted`. Não há retry automático.
3. **Rascunhos:** comerciais, treinamentos e editor técnico passam a usar IndexedDB por UID, atividade e tipo. Metadados e arquivos comprimidos ficam locais; backup é atualizado após interação e ao ocultar a página. Rascunhos são restaurados somente quando a assinatura da versão-base coincide com a do relatório do servidor. Uma divergência mantém o backup, sem mesclagem silenciosa.
4. **Integridade:** transações de checkout já relêem atividade e relatório; foi incluída a validação de módulos obrigatórios de treinamento também no fechamento manual. Foram retiradas leituras redundantes após commits confirmados. **Ainda não existe garantia de exclusividade entre dispositivos no servidor**: o check-in ainda consulta outras visitas abertas fora da transação.
5. **Testes:** testes automatizados de consultas, requisições e IndexedDB adicionados; a homologação real (Firestore + R2 + dispositivos) permanece pendente.

## Bloqueadores antes da produção

- [ ] **P0: exclusividade do check-in por profissional.** Criar documento de trava por profissional (ex.: `visitas_ativas/{ptvId}`) atualizado atomicamente com a atividade na mesma transação; rejeitar se apontar para outra visita aberta. O backend e as regras precisam impedir que um cliente atualize atividades ignorando a trava. Reconciliar travas órfãs/cancelamentos e migração de visitas já em andamento. Validar as **regras realmente publicadas** antes de escolher callable Firebase ou regras com `getAfter()`. **Não presumir que a cópia `advance-admin/firestore.rules` é a regra do app em produção.**
- [ ] **P0: validação no servidor da conclusão.** Restringir a transição para `Concluída` a uma operação autenticada/atômica que valide propriedade, status, existência e vínculo do relatório, módulos obrigatórios e fechamento manual. Negar escritas diretas que contornem a validação; manter um caminho específico para gestor aprovar fechamento fora do local. Revisar relatórios legados e índices necessários.
- [ ] **P0: recuperação de conflito de rascunho.** Hoje o backup com assinatura-base divergente é preservado, mas não há interface de escolha/mesclagem. Testar recuperação do mesmo dispositivo após fechamento brusco e depois de salvar em outro dispositivo.
- [ ] **P0: homologação de fotos.** Testar em Android/iOS PWA a sobrevivência de Blobs do IndexedDB; avaliar quota local (navegador pode remover dados sob pressão). Não prometer garantia contra limpeza de dados do navegador/desinstalação.
- [ ] Validar `npm run check` e `npm test` e conferir que ambos estão verdes no CI da PR.
- [ ] Validar versão do service worker atualizada, incluindo nova instalação e atualização do PWA já instalado.

## Roteiro de homologação manual (ambiente isolado)

1. Usar contas de dois promotores de teste e um gestor, em dois aparelhos distintos, com base Firebase e R2 **de homologação**. Não testar em clientes de produção.
2. Abrir visita A, retornar rapidamente e abrir B durante carregamento lento do Firestore. A deve ser descartada e B não deve herdar cliente/foto/relatório da A.
3. Abrir início e agenda sucessivas vezes, e conferir chamadas no console de rede e métricas do Firestore. Confirmar uma única leitura em voo por chave e redução de repetições por TTL. Simular quota e verificar ausência de retry automático.
4. Em cada tipo — visita comercial, treinamento e assistência técnica — digitar, adicionar fotos, forçar fechamento do PWA, reabrir e confirmar dados e arquivos. Salvar e reabrir. Repetir com rede intermitente, imagem grande e quota de armazenamento.
5. Fazer duas tentativas simultâneas de check-in, em dispositivos distintos, para o mesmo profissional. **Não aprovar** até o servidor rejeitar uma delas.
6. Tentar concluir relatório parcial, sem módulos obrigatórios, usando UI e escrita direta REST autenticada. **Não aprovar** até ambas falharem no servidor sem escrita parcial.
7. Testar check-out dentro e fora do raio, aprovação do gestor, cancelamento de visita aberta, histórico e exportação PDF. Verificar estado do Firestore, links R2 e ausência de dados duplicados.
8. Testar atualização de PWA já instalado e troca de usuário, confirmando que rascunhos não são apresentados a outra conta.

## Publicação

A PR deve permanecer **draft**, sem merge automático e sem deploy de produção. Só publicar após validação de servidor, CI e homologação ponta a ponta. O app usa somente o Firebase de produção no momento; uma branch de preview **não cria** outro projeto Firebase por conta própria.
