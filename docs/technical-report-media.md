# Relatório técnico com mídias — front-end de teste

Branch: `teste/relatorio-tecnico-midias`.

Em uma visita de assistência técnica, abra o relatório, preencha Produto e Queixa e escreva no campo Relatório técnico. Posicione o cursor e use o botão circular + ao lado de Salvar relatório para inserir imagens, vídeos ou áudios. Continue o relato no campo abaixo da mídia. Clique na miniatura para abrir o visualizador, reproduzir áudio/vídeo ou baixar o original. Remover exclui o bloco do documento.

O texto continua no campo histórico `verificacao.constatacoes` do Firestore para manter os relatórios antigos e o checkout compatíveis. Nenhum arquivo ou blob URL é enviado ao Firestore. Os blocos ordenados e os arquivos ficam em IndexedDB no navegador de teste, por usuário e atividade. A leitura e o checkout mostram os mesmos blocos nesse navegador. O PDF continua textual nesta etapa.

Mídias não estão sincronizadas entre navegadores/dispositivos e serão perdidas ao limpar os dados do site. Se o texto remoto mudar, o editor prioriza o texto remoto em vez de exibir uma composição local desatualizada. Esta versão aceita até 20 arquivos e 100 MB por arquivo, sujeita à capacidade local disponível.

## Próxima etapa: R2

`mediaStore.put/get` em `technical-report-editor.js` isola o armazenamento dos arquivos. Substituir o adapter por upload autenticado e leitura do R2, salvar o documento de blocos e identificadores de objetos no servidor, validar regras e limites de upload, tratar miniaturas de vídeo e limpeza de arquivos. Credenciais R2 devem permanecer no servidor.

## Verificação manual

- Inserir imagem no meio de um texto e continuar o relato depois dela.
- Inserir vários arquivos e conferir ordem, miniaturas, abertura, áudio/vídeo e download.
- Salvar, reabrir e conferir persistência no mesmo navegador, leitura e checkout.
- Remover um anexo e verificar o aviso de alterações ao sair sem salvar.
- Confirmar que visitas comerciais e treinamentos mantêm seu editor anterior.
- Abrir relatório antigo e confirmar que seu texto é preservado.
- Conferir em celular que o botão + permanece ao lado de Salvar relatório.
