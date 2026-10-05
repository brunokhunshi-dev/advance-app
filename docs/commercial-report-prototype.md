# Visita comercial: módulos integrados

Branch: `fix/auditoria-otimizacao-app`.

O relatório apresenta contato na loja, disponibilidade dos produtos, exposição e materiais e relato livre. Salvar relatório permite preenchimento parcial, retorna ao início e atualiza a timeline existente. Salvar módulo retorna à lista; a gravação no banco acontece ao tocar em Salvar relatório.

## Persistência

A gravação usa a infraestrutura Firebase existente. Uma transação valida o usuário responsável, a visita em andamento e a versão aberta antes de gravar o relatório e seu vínculo na atividade. Novos relatórios usam `relatorios_comerciais`; documentos antigos continuam em sua coleção original.

`dadosComerciais` contém `versao: 1`, os campos dos módulos, produtos selecionados, metadados das fotografias, feedback e pendência. `textoAtual` e `conteudoRelatorio.blocos` mantêm o formato do editor existente. O histórico registra o horário e o texto de cada gravação. O app recupera os módulos do relatório vinculado à atividade após recarregar a página, sem depender de armazenamento local.

Fotos de exposição e relato usam a mesma compressão, miniaturas, mediaStore e API R2 autenticada dos outros relatórios. Apenas metadados são gravados no Firestore, sem URLs temporárias. Uploads precedem a transação; falhas desfazem os novos uploads e mantêm o rascunho para tentar novamente. Exclusões acontecem após confirmação no banco.

## Check-out

O encerramento usa o fluxo existente de localização, precisão, distância da loja e transação de conclusão. A obrigatoriedade dos três módulos é validada na conclusão sobre o documento lido pela transação. O fechamento manual também valida os módulos. Relato livre é opcional. Feedback e pendência são gravados ao concluir; relatórios antigos continuam compatíveis.

Contato exige nome, cargo e objetivo. Cada resposta Sim em disponibilidade exige um produto. A disponibilidade consulta a coleção `produtos` do Firestore e filtra por nome, sem diferenciar acentos ou maiúsculas. Os itens selecionados guardam ID e nome; relatórios antigos com nomes em texto continuam legíveis. Exposição organizada permite fotos opcionais; Não foi verificado exige ausência de fotos; as outras opções exigem uma a seis. Outro material exige descrição.

`commercial-preview.html` permanece uma demonstração local sem login nem persistência. Os testes usam Firebase/transações e armazenamento simulados; não gravam dados de produção.
