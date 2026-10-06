# Worker de mídia do Advance

`advance-media-api.js` é o código completo do Worker enviado pelo usuário, com o Markdown normalizado para JavaScript e a nova leitura autenticada da foto de perfil.

Para publicar, substitua o conteúdo do Worker `advance-media-api` em Cloudflare → Workers & Pages → Edit code pelo arquivo e pressione Deploy. Mantenha as variáveis e secrets atuais. Não é necessário adicionar bindings, novas chaves ou abrir o bucket.

## Fotos enviadas manualmente

- Promotores: `v1/perfis/promotores/{id-do-documento}.png`
- Assistentes: `v1/perfis/assistencia/{id-do-documento}.png`

Use o ID do documento do Firestore. O exemplo enviado é `v1/perfis/promotores/ptv_01.png`. Envie PNG real, com o Content-Type `image/png`; para manter o recorte do design, use fundo transparente.

O app faz `POST /v1/profile/photo-url` com o Firebase ID Token existente. O Worker identifica o perfil ativo em `assistencia` ou `promotores`, deriva a chave e devolve uma URL assinada de GET válida por cinco minutos. O corpo não permite escolher outro ID ou caminho. Essa rota não altera arquivos no R2 nem documentos no Firebase.

Se não houver imagem, se o Worker ainda não estiver publicado ou se a consulta da foto falhar, o perfil continua disponível, usando a URL de foto cadastrada quando existir e as iniciais como última alternativa. Para trocar a foto, substitua o objeto mantendo o mesmo caminho.

O frontend permanece na branch `test/perfil-figma` (PR #22). A alteração só chega à produção após o merge. A publicação do Worker é uma etapa manual, separada do deploy do app.
