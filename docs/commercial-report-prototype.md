# Visita comercial: protótipo de módulos

Branch: `fix/auditoria-otimizacao-app`.

Ao abrir o relatório de uma visita comercial, o front-end mostra quatro módulos:
contato na loja (todos os campos obrigatórios), disponibilidade dos produtos
(obrigatória), exposição e materiais, e relatório livre (opcional). O preenchimento indica o estado de cada módulo.

Cargo e objetivo usam as opções fornecidas pelo usuário, com seleção única
obrigatória. Os produtos são digitados e adicionados
como chips; ainda não existe consulta de catálogo. Cada Sim oferece também
um botão para selecionar Produto de exemplo (placeholder). Para respostas Sim, exige-se
pelo menos um produto. Material Outro exige descrição.

O relatório livre reutiliza TechnicalReportEditor e as classes existentes em styles.css.
Texto e imagens permanecem em blocos intercalados, com seleção no cursor, compressão,
miniaturas de 96 px, abertura do original e remoção. Nenhum upload é realizado.
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

Na exposição, a organização deve ser selecionada. Organizada e visível permite
fotos opcionais; Não foi verificado oculta o seletor e remove as fotos dessa seção.
Necessidade de organização e Ausência de exposição exigem de uma a seis fotos.
A seção limita todas as opções a seis fotos e usa compressImage e createThumbnail,
os mesmos métodos do editor existente, antes de criar prévias locais.

Fotos de exposição reutilizam também mediaStore, reportMarkup e o visualizador
compartilhado, com abrir/baixar original local. Upload R2 permanece desconectado.

Check-out comercial: chegada/saída e duração mantêm a tela existente. Abaixo,
mostra os três módulos para consulta somente leitura, relato resumido com Ver mais,
quatro checkboxes de feedback e seletor de pendências. O X fixo no canto superior
direito fecha a consulta e retorna ao check-out. A exposição também recebe o
indicador Obrigatório. O encerramento permanece sem integração de backend.

Salvar relatório e Salvar módulo aceitam preenchimento parcial, sem validar
obrigatoriedades. O relatório pode ser reaberto para continuar na mesma sessão.
Ao concluir o check-out, os módulos obrigatórios são validados sobre o último
relatório salvo. Campos preenchidos mas ainda não salvos não liberam a conclusão.
Relatório livre continua opcional. O envio ao backend permanece desconectado.
