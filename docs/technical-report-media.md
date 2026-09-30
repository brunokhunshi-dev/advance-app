# Relatórios com mídias — front-end de teste

Branch: `teste/relatorio-tecnico-midias`.

Visitas comerciais, treinamentos e assistência técnica usam a mesma seção aberta de escrita. O relatório técnico aparece depois das informações específicas da assistência, fora dos cards de formulário. Escreva, posicione o cursor e use o botão circular + ao lado de Salvar relatório para inserir imagens, vídeos ou áudios e continuar o texto abaixo.

As mídias aparecem em quadrados de 96 × 96 px, com X no canto superior direito para remover. Arquivos adicionados juntos ficam lado a lado quando há espaço. Para imagens e vídeos compatíveis, o navegador cria uma miniatura JPEG de 96 × 96 px com qualidade 0,25, armazenada separadamente. O original só é carregado no visualizador quando o usuário clica. Áudio e formatos sem prévia decodificável usam um ícone. O visualizador permite reprodução e download do original.

O texto técnico continua em `verificacao.constatacoes`; os demais relatórios usam `textoAtual`. Nenhum arquivo ou blob URL é enviado ao Firestore. Os blocos ordenados e os arquivos ficam em IndexedDB no navegador de teste, separados por usuário e atividade. A leitura e o checkout exibem os blocos nos três tipos de visita. PDFs continuam textuais nesta etapa.

Mídias não estão sincronizadas entre navegadores/dispositivos e serão perdidas ao limpar os dados do site. Se o texto remoto mudar, o editor prioriza o texto remoto em vez de exibir uma composição local desatualizada. Limites da versão de teste: 20 arquivos e 100 MB por arquivo, sujeitos à capacidade local disponível.

## Próxima etapa: R2

`mediaStore` em `technical-report-editor.js` isola originais e miniaturas. Substituir o adapter por upload autenticado e leitura do R2, salvar blocos e identificadores de objetos no servidor, validar permissões e limites de upload e implementar limpeza de arquivos. Credenciais R2 devem permanecer no servidor.

## Validação

Testado em Chromium com viewport de 390 × 844 e uma simulação local do Firebase, sem acessar dados reais: nos três tipos de visita, inserção no cursor, dimensões e espaçamento, miniatura comprimida, abertura do original, salvamento e reabertura, leitura, checkout, remoção e detecção de alterações. Também conferidos digitação multilinha, miniatura de vídeo, reprodução de áudio/vídeo, anexos lado a lado e rejeição de arquivos incompatíveis. Sintaxe JS e `git diff --check` validados. O backend real e o R2 não fazem parte destes testes.
