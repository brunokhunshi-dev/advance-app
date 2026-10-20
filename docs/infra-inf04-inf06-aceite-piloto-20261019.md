# INF-04 a INF-06 — Registro de aceite do responsável para o piloto v0.1

**Data:** 19/10/2026  
**Status das três etapas:** **ENCERRADAS POR ACEITE DO RESPONSÁVEL PARA O PILOTO**, **não equivalem a auditoria de segurança completa nem a homologação funcional**.  
**Escopo:** aplicativo de campo Advance Check, 3 promotores, aproximadamente 20 clientes. O antigo Advance Admin está descontinuado.  
**Decisão do responsável:** manter regras, Worker e CORS atualmente utilizados, considerar o incidente `Failed to fetch` solucionado e prosseguir com a sequência INF-07 → INF-11. **Não publicar configurações novas nem efetuar deploy por causa deste aceite.**

## INF-04 — Autenticação, permissões e regras Firestore

**Evidências recebidas:**
- Firebase Auth utilizado para login. O App consulta `assistencia` ou `promotores` por e-mail, confere `ativo` e `permissoes.acessoApp` no frontend.
- Regra fornecida pelo responsável em 19/10/2026: `match /{document=**} { allow read, write: if request.auth != null; }`.
- Consequência objetiva: **qualquer conta autenticada no projeto Firebase pode ler e escrever em qualquer documento abrangido**, independentemente de promotor, assistente, propriedade da atividade, cargo ou estado ativo — o filtro de perfil no frontend **não é controle de autorização do banco**.
- A versão/data de publicação das regras não foi conferida diretamente em acesso autenticado ao console, mas o responsável as apresentou como regras atuais.

**Decisão:** o responsável **aceita o risco para esta fase de piloto** e não quer alterar as regras agora. Encerramento administrativo, **sem atestado de segurança**. Validações críticas de conclusão por acesso direto permanecem no escopo INF-08 e dos testes de homologação.

## INF-05 — Worker, autenticação e autorização de mídias

**Evidências recebidas:**
- Identificador informado: `72ad09f0-08c5-43da-a6bd-e67180fb9599`, publicado em 17/10/2026; o painel Metrics mostra versão ativa pelo prefixo `72ad09f0`, 100% do tráfego.
- Arquivo JavaScript do Worker recebido do responsável e comparado com a versão `cloudflare/advance-media-api.js` do GitHub. **Divergem**: Worker recebido manipula variante `original`, versão GitHub ainda inclui miniaturas.
- O Worker autentica Firebase ID token via Identity Toolkit, localiza perfil em Firestore REST e lê a atividade para decidir autorização de mídia.
- Métricas fornecidas em ~24h: 24 invocações, 60 subrequests (52 Firestore, 8 Identity Toolkit), **0 erros de execução**. Das 52 respostas Firestore, **28 HTTP 2xx e 24 HTTP 4xx**; status 4xx exatos desconhecidos. Buscas por UID inexistente são uma hipótese de 404, **não um diagnóstico fechado**.
- O código versionado inclui via excepcional de privilégio administrativo baseada em e-mail; não foi comprovado se essa exceção está ativa no script publicado.
- Associação do código anexado com o deployment exato e binding do bucket R2 não foram demonstrados por verificação independente.

**Decisão:** manter o Worker durante o piloto; encerramento administrativo do INF-05 **com ressalvas**, sem afirmar autorização segura de todas as rotas. Investigar 4xx, exceção administrativa, chamadas repetidas e autenticação nos testes posteriores de backend, conforme priorização.

## INF-06 — CORS, uploads R2 e `Failed to fetch`

**Evidências recebidas:**
- Política CORS R2 enviada: origens `*`, métodos `GET, HEAD, PUT, DELETE`, headers `Content-Type`, exposição `ETag`, `MaxAgeSeconds: 3600`.
- O App faz `POST /v1/media/upload-url` ao Worker, recebe URL assinada, envia `PUT` com `Content-Type` direto ao R2 e persiste o relatório no Firestore. O CORS enviado é **estaticamente compatível** com o PUT ao R2. CORS do Worker rege o POST separado.
- O responsável declarou que `Failed to fetch` **já foi resolvido** ao trocar um separador `|` por `/`. A correção não foi reproduzida independentemente nem testada em todos os dispositivos e condições de rede.

**Decisão:** incidente operacional considerado resolvido pelo responsável; **não alterar CORS** nesta fase. Encerramento administrativo do INF-06, com necessidade de testar retentativas, falhas parciais e integridade de mídia em INF-07 e homologação.

## Critério de encerramento e limites

| Etapa | Status no checklist | Tipo de conclusão | O que permanece verdadeiro |
| --- | --- | --- | --- |
| INF-04 | **[x] Encerrado por aceite para piloto** | Aceite de risco explícito | Regras abrangentes; autorização por perfil não é aplicada pelo Firestore |
| INF-05 | **[x] Encerrado por aceite para piloto** | Aceite operacional com evidência de métricas | Worker ativo identificado; 4xx não diagnosticados individualmente; código ativo não conferido independentemente |
| INF-06 | **[x] Encerrado por aceite para piloto** | Incidente declarado corrigido | CORS compatível estaticamente; fluxo fim a fim não homologado |

**Não marcado como comprovado:** testes de invasão, revisão de todas as rotas e perfis, leitura do Worker efetivamente implantado, mitigação de exceção de gestão, resolução detalhada dos 4xx, teste de upload em rede instável, proteção das writes diretas, testes em ambiente isolado e release seguro.

**Próxima etapa:** **INF-07 — integridade de transações, commits parciais, concorrência, arquivos órfãos e compensações**. Nenhum código funcional/infraestrutura foi modificado neste registro.
