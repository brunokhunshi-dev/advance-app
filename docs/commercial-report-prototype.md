# Visita comercial: protótipo de módulos

Branch: `fix/auditoria-otimizacao-app`.

Ao abrir o relatório de uma visita comercial, o front-end mostra quatro módulos:
contato na loja (obrigatório), disponibilidade dos produtos, exposição e materiais,
e relatório livre. O preenchimento indica o estado de cada módulo.

As opções de cargo, objetivo e pendências são provisórias no front-end, pois as
referências mostram os selects fechados. Os produtos são digitados e adicionados
como chips; ainda não existe consulta de catálogo. Para respostas Sim, exige-se
pelo menos um produto. Material Outro exige descrição.

Imagens são prévias locais com URLs de objeto, removíveis e ampliáveis, sem uploads.
Salvar guarda o rascunho somente em memória nesta aba, por visita. Reabrir mantém
os campos; atualizar/fechar a página perde o protótipo. Logout limpa os rascunhos e
libera as URLs. Não foram adicionados campos ou coleções no Firestore.

Salvar retorna à tela inicial, que passa a exibir a etapa Relatório adicionado e o
botão Ver ou editar relatório, usando a mesma timeline existente. Edições geram
uma etapa Relatório atualizado. O botão de prévia foi removido. Encerrar visita
usa a tela de check-out existente; sua conclusão ainda não grava no backend.
Treinamentos e assistência técnica continuam com o fluxo existente.

Para conferir sem login/Firebase, sirva a raiz do repositório por HTTP e abra
`commercial-preview.html`. Esta página usa somente o componente local e dados de
exemplo; as fontes externas são opcionais e têm fallback sans-serif.
