# INF-04, INF-05 e INF-06 — Encerramento por aceite operacional

**Data:** 19/10/2026  
**Projeto:** Advance Check v0.1 / estabilização v0.1.1  
**Classificação de encerramento:** **ACEITE DO RESPONSÁVEL — não equivale a auditoria técnica exaustiva, homologação nem certificação de segurança.**  
**Mudanças em produção:** nenhuma nesta decisão.

O responsável avaliou as configurações existentes e determinou que, **por enquanto, estão de acordo para o piloto**, autorizando o fechamento dos itens INF-04, INF-05 e INF-06 no checklist de auditoria. A decisão também inclui o INF-03 em aceite de consumo; seus números e ressalvas permanecem em [INF-03](infra-inf03-consumo-limites-20261019.md).

## INF-04 — Autenticação, permissões e Firestore Rules

- [x] **Encerrado por aceite do responsável para o cenário atual.**
- Regras fornecidas do Firestore: `allow read, write: if request.auth != null;` sob `/{document=**}`. Esse predicado **não restringe por cargo, status, propriedade, cliente ou estado do relatório**. O comentário da regra não altera essa semântica.
- A tela de login do App realiza validações de perfil/estado do usuário; essas validações de frontend **não substituem restrição no servidor**. Qualquer conta autenticada no mesmo projeto pode acessar os documentos cobertos pela regra atual.
- O responsável decidiu **não alterar as regras agora**. **Risco conhecido/aceito** para esta etapa, não há alegação de que a autorização esteja devidamente segregada.
- Não foram executados testes de acesso indevido nem comprovadas as permissões para cada papel por tentativa autenticada; a versão publicada foi informada pelo responsável, e não atestada de forma independente via Firebase Console.
- **Preservar para INF-08:** possível marcação de atividade como concluída sem relatório por escrita direta; aceite de INF-04 não atesta integridade de negócio no servidor.

## INF-05 — Worker, autorização e comportamento

- [x] **Encerrado por aceite operacional do responsável, com riscos documentados.**
- Worker indicado como ativo: Cloudflare versão `72ad09f0-08c5-43da-a6bd-e67180fb9599`, publicado em 17/10/2026 segundo o responsável; captura da tela Metrics mostra a versão abreviada `72ad09f0` como deployment ativo com 100% do tráfego.
- Foi recebido e analisado o código `worker;(1).js`, **não idêntico** ao `cloudflare/advance-media-api.js` versionado no GitHub; o arquivo fornecido trabalha apenas com `original`, enquanto a versão GitHub contém lógica de miniaturas. Não substituir scripts sem revisão.
- Métricas da janela “Last 24 hours” informadas via print: **24 invocations**, **60 subrequests**, **0 erros do Worker**. Subrequests para `firestore.googleapis.com`: **28 HTTP 2xx** + **24 HTTP 4xx** = **52**; `identitytoolkit.googleapis.com`: **8 HTTP 2xx**. **4xx de subrequest não significa automaticamente 4xx na resposta final do Worker**; causas específicas (por exemplo documento UID ausente/fallback por email) **não foram comprovadas**.
- Fluxos protegidos consultam perfis e a atividade por Firestore REST para validar acesso a mídias; autenticação consulta Firebase Identity Toolkit. Existem exceções e fallbacks associados a perfis de gestão no código fornecido que **não foram auditados dinamicamente**.
- O responsável aprovou o funcionamento atual **sem alteração nem novo deploy**; **aceite não equivale a comprovação de segurança completa**. Pendências de autenticação/autorização end-to-end poderão ser reabertas caso INF-07/INF-08 identifiquem defeito bloqueador ou o risco se materialize.

## INF-06 — CORS, upload e incidente Failed to fetch

- [x] **Encerrado por aceite operacional do responsável; incidente declarado resolvido.**
- CORS R2 fornecido: `AllowedOrigins: ["*"]`, `AllowedMethods: ["GET","HEAD","PUT","DELETE"]`, `AllowedHeaders: ["Content-Type"]`, `ExposeHeaders: ["ETag"]`, `MaxAgeSeconds: 3600`.
- Código do App faz `POST` JSON com Bearer token ao **Worker** para obter URL assinada; usa `PUT` + `Content-Type` diretamente no **R2**, seguido da transação Firestore do relatório. As políticas de CORS **do Worker** e **do R2** são diferentes; os métodos/headers R2 fornecidos são compatíveis estaticamente com o PUT observado.
- O responsável informou que `Failed to fetch` ocorreu por caractere separador `|` no lugar de `/` e **já foi corrigido**. Não foi reexecutado teste automático end-to-end nessa auditoria.
- Não foi executado ensaio de falha de rede/assinatura expirada/rollback real em bucket isolado; esses cenários de consistência/compensação permanecem sob **INF-07**, sem reabrir o incidente já resolvido.

## Ressalvas preservadas após o aceite

1. **Índices:** o responsável informou que os índices estão desativados; não foi comprovada a lista/status dos índices de campo único versus compostos. O Histórico possui fallback sem `limit` quando a query composta falha por `failed-precondition`. A aceitação do consumo no INF-03 não significa que esse comportamento foi corrigido.
2. **Worker REST:** 24 respostas 4xx de subrequests ao Firestore não tiveram seus códigos exatos/rotas identificados; não rotular todos como 404 benignos.
3. **Homologação:** o Preview Vercel usa o mesmo Firebase e endpoint Worker da produção. Não executar testes destrutivos no Preview atual.
4. **Regras:** a restrição ampla do Firestore foi expressamente mantida e aceita para esta fase; não converter isso em afirmação de segurança comprovada.
5. **INF-07 e INF-08 permanecem pendentes** e são independentes deste aceite. Não encerrar auditorias de integridade de transações, mídia órfã, conclusão sem relatório nem escrita direta indevida por consequência automática.
6. Manter PR #26 como rascunho, sem merge ou deploy de Rules/Worker.

**Registro de decisão:** o checklist pode exibir `[x]` em INF-04, INF-05 e INF-06 **somente com o rótulo “encerrado por aceite operacional do responsável”**. Verificações não feitas devem permanecer explícitas, para não produzir evidências falsas de validação. **Próximo item: INF-07 — integridade de transações, gravações parciais, concorrência e rollback.**
