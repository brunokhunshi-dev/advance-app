# Preparação, homologação e publicação — v0.1.1-rc.1

Estado: candidata; não publicada. Não mesclar na main antes de homologar Firebase e Worker em conjunto.

## Bloqueios adicionais encontrados na auditoria

A revisão de 19/10 reproduziu EST-01 a EST-08, incluindo perda de rascunho, erro após commit, consultas concorrentes e invariantes ausentes no servidor. Esses defeitos ainda não foram corrigidos nesta candidata. Resolver e homologar antes do lançamento; ver [auditoria estrutural](auditoria-estrutural-2026-10-19.md). Testes anteriores aprovados não eliminam esses bloqueios.

## Correções

- Vínculo protegido por UID substitui as buscas sequenciais por UID/e-mail em quatro coleções.
- Worker consulta uma vez vínculo e perfil por requisição; um lote valida cada atividade distinta uma vez. No máximo 30 mídias de cinco atividades.
- Para 20 fotos da mesma atividade: três requisições explícitas ao Firestore (vínculo, perfil e atividade), contra nove no caminho anterior do promotor. Regras podem cobrar leituras adicionais de autorização. Não há promessa de três leituras faturadas.
- Perfil não é cacheado entre requisições: revogação é verificada novamente. URLs já assinadas continuam válidas até expirar (até cinco minutos).
- Removidas permissões inferidas de cargo/e-mail. Sem miniaturas novas; mantida leitura de variantes legadas sem carregamento automático.
- Bindings Cloudflare: `AUTH_RATE_LIMITER` com 180/min por IP (proteção anterior à autenticação) e `MEDIA_RATE_LIMITER` com 60/min por UID validado (todas as rotas). Sem binding, resposta 503 antes de consultar Firestore; sem fallback inseguro em memória.
- 429 inclui Retry-After:60. Um esgotamento do Firestore abre pausa de 60s no isolate atual; isso não é um bloqueio global distribuído. Não há repetição automática no Worker.
- Firestore deixa de autorizar todo usuário autenticado a alterar qualquer documento.
- App v73 resolve UID e perfil por dois documentos e consulta catálogo sem importação automática.

## Diagnóstico e vínculos

Usar credencial administrativa diretamente no ambiente controlado; nunca enviar chaves pelo chat ou versioná-las. Nenhum comando abaixo foi executado contra produção nesta entrega.

Primeiro executar no Firebase de homologação:

```bash
mkdir -p exports
node tools/auth-links.mjs --project SEU_PROJETO_HOMOLOGACAO --output exports/vinculos-revisar.json
```

O diagnóstico lê Auth e as duas coleções de campo uma vez, não grava no banco. `--include-management` é opcional e deve ser usado somente se for necessário manter gestão no Worker. A descoberta não infere cargo. Contas com mais de um perfil vão para `conflicts`; não há escolha silenciosa. `unmatched` pode incluir contas de outros aplicativos no mesmo Firebase; não excluir nenhuma conta.

Revisar `entries` e a identidade real dos três promotores, IDs legados, `ativo`, permissões e eventuais conflitos. Como os perfis eram graváveis por qualquer conta autenticada, não tratá-los como prova suficiente de autorização sem revisão do responsável. O plano contém identificadores de usuários e fica fora do git em `exports/`.

A aplicação é separada, exige plano revisado, projeto repetido e credencial Admin SDK:

```bash
node tools/auth-links.mjs --project SEU_PROJETO_HOMOLOGACAO --input exports/vinculos-revisar.json --apply --confirm-project SEU_PROJETO_HOMOLOGACAO
```

Cria somente vínculos inexistentes; não altera usuários, perfis, relatórios ou contas. Um vínculo divergente, UID duplicado, conta desativada ou identidade divergente aborta a transação inteira. Executar de novo é idempotente. O mesmo processo deverá ser feito com o projeto real e os usuários revisados na janela de manutenção; não executar o plano de homologação em produção.

## Homologação obrigatória

1. Firebase de teste com Auth e dados sintéticos; R2 e Worker separados, com segredos e os dois bindings de limite. Não apontar homologação para `advance-app-media` nem para `banco-de-dados-monitor`.
2. Copiar o projeto do App para um preview com configuração Firebase e endpoint do Worker de homologação. O endpoint é configurável via `configureMediaApi`; não mudar credenciais de produção durante teste.
3. Confirmar catálogo já importado, duas contas de campo e uma conta sem vínculo. Criar os vínculos pela migração e publicar as regras candidatas nesse projeto de teste.
4. Executar check-in, salvar parcial comercial/treinamento/assistência com imagens, abrir imagem, finalizar e ler histórico. Incluir cliente sem CNPJ/endereço incerto, relatório legado e campos de permissão desabilitados.
5. Simular falha no upload, falha de metadados, rede indisponível, dupla sessão, recarregamento e minimização. Não considerar fotos em memória como rascunho durável.
6. Revogar perfil e verificar 403 no próximo pedido; a URL R2 já emitida permanece válida até expiração. Testar que uma conta não lê/altera atividade de outra e não modifica permissões.
7. Verificar limite real na Cloudflare: repetição de mídia deve gerar 429 antes de qualquer nova consulta Firestore. O binding é aproximado e por localização; validar parâmetros para o piloto. A pausa de cota por isolate é proteção adicional, não garantia global.
8. Conferir atualização para v73 em Android/PWA e preservar a operação em andamento. Registrar métricas e versões.

## Ordem para produção após aprovação

A troca deve ocorrer com os três promotores avisados e sem operação em andamento. Publicar regras antes de criar vínculos bloqueia temporariamente quem ainda não foi vinculado; essa pausa é deliberada para nunca deixar a coleção nova gravável sob as regras globais antigas.

1. Preservar o deployment Vercel `dpl_8WPq6oNVxToLWDySozZ9x91gi89m`, o Worker original em `docs/baseline-2026-10-19/worker-producao.txt`, regras e CORS fornecidos. Registrar no painel a versão ativa e a compatibility date do Worker (ainda desconhecidas).
2. Fazer diagnóstico e revisão do plano de produção antes da janela; revalidar identidade/permissões na execução. Confirmar catálogo presente.
3. Na pausa, publicar somente `firestore.rules` por console/CLI. Não executar deploy geral de Firebase nem alterar índices existentes sem conferência.
4. Aplicar os vínculos revisados por Admin SDK. Confirmar todos os três perfis antes de prosseguir. Não conceder gestão por cargo/e-mail.
5. Configurar no Worker os bindings de `cloudflare/wrangler.jsonc`, verificando namespace IDs exclusivos na conta. Preservar as variáveis/segredos atuais de R2 e Firebase e a compatibility date validada; o arquivo é referência e não exportação completa da configuração em produção.
6. Publicar o Worker candidato. Confirmar `/health` com `version:0.1.1-rc.1`; testar conta válida e limite de requisições.
7. Publicar o frontend homologado e confirmar v73. O push em branch de correção não é autorização para promover a produção. Não executar testes com dados fictícios no banco real.
8. Liberar o piloto e observar leituras, autorizações, 429/403, falhas de salvamento e tempo de upload.

## Rollback

- Frontend: restaurar o deployment Vercel preservado. A v72 consulta seu próprio e-mail; as regras candidatas incluem essa compatibilidade. Não apagar vínculos.
- Worker: restaurar a versão anterior exportada; preservar segredos e bindings. O fluxo legado de leitura por e-mail deve ser validado em homologação antes de contar com esse rollback.
- Regras: não restaurar automaticamente a regra global aberta. Se houver incompatibilidade, pausar o fluxo afetado e corrigir a regra específica. A cópia anterior existe para diagnóstico, não como recomendação de segurança.
- Não excluir fotos, relatórios, perfis ou contas como parte do rollback.

## Validação automatizada

```bash
npm install
npm run check
npm test
npm run test:rules
npm run test:integration
```

Os testes de regras usam somente o projeto fictício `demo-advance-v011` e emulador local. Firebase CLI 14 usa Java 17; adotar Java 21 na próxima atualização do CLI. Os testes do Worker simulam Auth/Firestore/R2 e bindings; não comprovam configuração real da Cloudflare. Android real e homologação integrada continuam exigidos antes da publicação.

Resultado local em 19/10/2026: `npm run check` aprovado (76 arquivos); `npm test` com 162 testes aprovados; `npm run test:rules` com 23 cenários aprovados no emulador. Nenhum teste executado contra dados reais.

Ampliação: sete cenários integrados de Auth/Firestore/Worker, armazenamento simulado e migração CLI aprovados. Evidência e limitações em [homologação local](homologacao-local-2026-10-19.md).
