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

## Contenção de leituras — 16/10/2026

O app reutiliza URLs assinadas em memória por até 270 segundos, agrupa até 30 imagens e carrega miniaturas remotas quando entram na área visível. A sessão é isolada; sair ou trocar de conta limpa as URLs. Não há cache de permissões no Worker entre requisições.

A rota `/v1/media/read-urls` agora permite perfis de campo, verifica o perfil uma vez e valida a propriedade de cada atividade antes de assinar qualquer imagem. Para 20 fotos de uma mesma atividade de promotor com busca por e-mail: 9 acessos ao Firestore no teste, contra 180 no fluxo individual (sem contar leituras de regras). Cada lote novo revalida as permissões.

**Publicação necessária:** atualizar o Worker `advance-media-api` com `cloudflare/advance-media-api.js`. O deploy do GitHub/Vercel não atualiza o Worker. Até isso ocorrer, o app reconhece a restrição do Worker anterior e usa o endpoint individual, mantendo cache e limite de concorrência.

Estas correções não renovam a cota diária já consumida. Após renovar/liberar a cota, comparar as leituras e os pedidos ao Worker nos horários de uso para medir o resultado real.
