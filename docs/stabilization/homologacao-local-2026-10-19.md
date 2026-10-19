# Homologação local integrada — 19/10/2026

Resultado: aprovada para os cenários locais descritos abaixo. Lançamento em produção ainda bloqueado por homologação Cloudflare/Firebase em nuvem e Android real.

## Ambiente e limites da evidência

- Projeto fictício `demo-advance-v011`, Auth emulator em 127.0.0.1:9099 e Firestore emulator em 127.0.0.1:8080.
- Contas e documentos sintéticos. Nenhum dado real, credencial administrativa de produção ou chamada de teste à produção.
- Auth emite o token; o Worker consulta o endpoint de autenticação real do emulador. Seu código de autorização consulta o Firestore emulado com esse token e as regras candidatas.
- O código real de `mediaStore`, `persistCommercialMedia` e `resolveFieldProfile` participa dos testes. A interface do PWA, GPS/câmera e os formulários completos não são executados nessa suíte.
- O Worker roda em contexto JavaScript isolado. As chamadas externas são roteadas exclusivamente aos emuladores locais. Os bindings de limite são simulados, não a implementação nativa Cloudflare.
- R2 é representado por servidor HTTP local com PUT/GET/DELETE. Isso verifica transporte e limpeza do serviço, mas não assinatura AWS, CORS real, credenciais R2 ou disponibilidade Cloudflare.

## Cenários executados

| Cenário | Resultado |
|---|---|
| Token Auth → vínculo UID → perfil → check-in → upload → relatório → check-out → histórico → URL de leitura | Aprovado |
| Falha real de permissão no Firestore depois do upload | Objeto removido no armazenamento simulado; foto local preservada para repetir |
| Falha de transporte durante upload | Nenhum relatório publicado; foto local preservada |
| Segunda conta autenticada tenta acessar mídia de outro responsável e alterar seu vínculo | Negado |
| Revogação de perfil e esgotamento do limite simulado | Nova autorização negada; requisição limitada não consulta Firestore |
| Lote de vinte mídias de uma atividade | Três chamadas explícitas Worker → Firestore; consultas auxiliares das regras não incluídas nesse número |
| Migração CLI com Auth/Firestore emulados | Diagnóstico sem gravações; criação de vínculo ausente; segunda execução sem duplicar nem sobrescrever |

Na mesma imagem, vinte leituras repetidas pelo cache não emitiram nova chamada ao Worker/Firestore. Isso valida o cache sob o cenário testado; não comprova ausência de toda chamada repetida em uma instalação real do PWA.

## Reprodução

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run test:rules
npm run test:integration
```

`test:integration` inicia Auth e Firestore localmente e só usa o projeto fictício. A execução real do CLI da migração nesse teste também herda os endereços dos emuladores. Os testes recusam tokens de outro projeto e URLs externas no transporte do Worker.

Resultados: 162 testes App/Worker; 23 testes de regras; 7 cenários integrados. Os dois primeiros grupos já passaram também no CI do PR #25 antes desta ampliação. A suíte integrada foi acrescentada ao mesmo fluxo de CI.

## Pendências para homologação em nuvem

1. Projeto Firebase exclusivo de teste com Auth por e-mail/senha e Firestore. Informar o project ID e a configuração pública do aplicativo web; manter credenciais administrativas no ambiente autorizado.
2. Bucket R2 e Worker exclusivos de teste, com token R2 restrito ao bucket de homologação, variáveis Firebase do projeto de teste e os bindings de limite.
3. Preview do frontend configurado para esses serviços, sem apontar para o Firebase/bucket de produção.
4. Testar assinatura e CORS reais, limites nativos, três tipos de relatório completos, recuperação após perda de rede, segunda sessão, fechamento/reabertura, atualização do service worker e câmera/GPS em Android.
5. Revisar vínculos e permissões dos três promotores reais antes de executar o plano de produção.

O projeto Firebase e a Cloudflare não estão conectados nesta sessão. Não foi provisionado recurso em nuvem. Os testes locais não substituem as pendências acima, nem autorizam mesclar/publicar o PR.
