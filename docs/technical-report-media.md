# Relatórios com mídias — Cloudflare R2

Implementação: `technical-report-editor.js`. Configuração de instalação: `src/ui/pwa.js`.

## Arquitetura atual

Visitas comerciais, treinamentos e assistência técnica usam o editor em blocos. O texto continua compatível com os campos históricos do Firestore e a ordem completa de texto + mídias passa a ser persistida em `conteudoRelatorio.blocos`.

Os arquivos originais e as miniaturas ficam no bucket privado `advance-app-media` do Cloudflare R2. O navegador nunca recebe as credenciais permanentes do bucket. O Worker `advance-media-api` valida o Firebase ID Token, valida a atividade do usuário e devolve URLs temporárias assinadas.

Estrutura lógica de objetos:

```text
v1/activities/{atividadeId}/media/{mediaId}/original
v1/activities/{atividadeId}/media/{mediaId}/thumbnail.jpg
```

Cada bloco de mídia salvo no Firestore contém apenas metadados e identificadores do objeto, por exemplo `id`, `name`, `type`, `size`, `storage: "r2"`, `key` e `thumbnailKey`. URLs assinadas nunca são persistidas.

## Fluxo de gravação

Ao selecionar um arquivo ele permanece somente em memória no navegador e a miniatura 96 × 96 px é criada localmente. Ao salvar o relatório:

1. o editor pede ao Worker uma URL assinada;
2. original e miniatura são enviados diretamente do navegador ao R2;
3. os blocos são gravados no mesmo documento do relatório no Firestore;
4. após o Firestore confirmar a gravação, arquivos removidos do relatório são apagados do R2.

Se a gravação do Firestore falhar, o editor tenta apagar do R2 os uploads feitos naquela tentativa e mantém os arquivos locais para nova tentativa.

## Leitura

O relatório recupera `conteudoRelatorio.blocos` do Firestore. Para mídias, a miniatura recebe uma URL assinada de leitura. O original só recebe uma URL assinada quando o usuário toca na thumbnail. Visitas concluídas continuam permitindo leitura, enquanto upload e exclusão ficam limitados a visitas em andamento.

## Compatibilidade

- Assistência técnica continua usando `verificacao.constatacoes` como texto técnico.
- Visita comercial e treinamento continuam usando `textoAtual`.
- Relatórios antigos sem `conteudoRelatorio` continuam sendo exibidos apenas como texto.
- PDF continua textual nesta etapa.
- Limite do editor: 20 imagens por relatório; cada imagem original pode ter até 25 MB. O app comprime para um alvo de 200 KB, com máximo de 300 KB na saída, e gera uma thumbnail JPEG de 96 × 96 px. Vídeos e áudios antigos ainda podem ser visualizados, mas não são aceitos na inclusão atual.
