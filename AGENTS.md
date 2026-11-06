# Advance Check — instruções do repositório

## Missão
Construir o Advance Check: PWA mobile para promotores registrarem visitas de campo com segurança, rastreabilidade e tolerância a conectividade instável. O painel administrativo é um produto separado; nesta entrega, permanece fora do desenvolvimento conforme o Plano de Desenvolvimento v1.1.

## Fontes de verdade
1. `docs/product/source/plano-desenvolvimento.md`: sequência e limite da entrega atual.
2. `docs/product/source/prd.md`: requisitos funcionais e regras de negócio.
3. `docs/product/source/brd.md`: objetivos e contexto de negócio.
4. `docs/product/source/guia-ux-ui.md`: qualidade de UX e padrões visuais.
5. Decisões registradas em `docs/decisions/`: escolhas técnicas ou de produto tomadas depois dos documentos acima.

Se documentos divergirem, não adivinhe: respeite o plano mais recente para escopo, o PRD para regra funcional e abra uma decisão pendente em `docs/decisions/`. Mudanças de produto exigem registro e atualização dos documentos afetados.

## Limites atuais
- Entrega: app do promotor e backend necessário. Painel administrativo fica fora desta entrega.
- Não introduzir usuários, fluxos ou requisitos de negócio sem registrar hipótese e decisão.
- Não usar dados fictícios como se fossem registros reais.
- Não conectar a serviços pagos ou criar custos sem decisão explícita do responsável pelo produto.

## Regras de implementação
- Inspecione o código e a configuração antes de propor reescrita ou dependências.
- Priorize segurança no servidor, menor privilégio, validação de entrada e trilha de auditoria.
- Nunca exponha segredos no frontend ou no repositório.
- Check-in/check-out exigem internet e confirmação do servidor; nunca simule sucesso offline nem enfileire eventos retroativos.
- Rascunhos offline devem ser isolados por usuário e visita; diferencie salvo localmente de sincronizado.
- Preserve evidências originais (horário, GPS, autor e anexos); correções são eventos auditáveis, não sobrescritas silenciosas.
- Bucket de mídia privado; acessos temporários autorizados pelo backend.
- Nenhum promotor pode aprovar o próprio cadastro. Papéis e autorização devem ser impostos no backend.
- Mantenha componentes acessíveis, foco visível, controles adequados a toque e estados explícitos de carregamento, vazio e erro.
- Erros próximos da ação que falhou; não descarte texto de relatório quando upload falhar.
- Não faça mudanças fora do escopo do ticket. Declare incertezas e impacto antes de mudar contrato de dados.

## Processo de trabalho
1. Leia o ticket e a seção relevante do PRD/plano.
2. Declare entendimento, arquivos afetados e perguntas de produto bloqueantes.
3. Implemente a menor mudança coerente e mantenha os limites entre UI, domínio e infraestrutura.
4. Atualize documentação/decisões quando contrato ou comportamento mudar.
5. Ao concluir, resuma comportamento, arquivos e limitações. Não afirme testes executados se não foram executados.

## Papéis de agente
Veja `docs/agents/` para mandatos especializados. Um agente coordenador integra o trabalho e resolve conflitos; agentes especialistas não alteram requisitos de produto por conta própria.
