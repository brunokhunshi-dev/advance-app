# INF-01 — Linha de base dos ambientes e deployments

**Data da verificação:** 19/10/2026  
**Tipo:** inspeção somente leitura das integrações Vercel/GitHub e configuração versionada.  
**Estado:** PARCIAL — produção Vercel comprovada; Worker, regras Firebase e implantação do Admin ainda sem verificação autenticada. Nenhum deploy, alteração de infraestrutura, regra ou dado foi executado.

## 1. Produção Vercel — comprovada

| Campo | Valor / evidência |
| --- | --- |
| Equipe Vercel | `khunshiiiis-projects` (`team_6F8AmJh9nFaVXuqgrxVjlnod`) |
| Projeto | `advance-app` (`prj_48hacYFKZtSKOOzmgy22jrmXkwLZ`) |
| GitHub | `brunokhunshi-dev/advance-app` |
| Branch do release | `main` |
| Commit deployado | `1d32689dd44ce3d3ffa6e602017fe0cf1918a55e` |
| Deployment | `dpl_8WPq6oNVxToLWDySozZ9x91gi89m` |
| Data de criação | `2026-10-16T20:06:30.834Z` |
| Estado/ambiente | `READY` / `production` |
| URL imutável | https://advance-j056px9jy-khunshiiiis-projects.vercel.app |
| Domínio principal | https://advance-app-one.vercel.app |
| Outros aliases verificados | `advance-app-khunshiiiis-projects.vercel.app` e `advance-app-git-main-khunshiiiis-projects.vercel.app` |
| Evidência | https://vercel.com/khunshiiiis-projects/advance-app/8WPq6oNVxToLWDySozZ9x91gi89m |

Os três aliases foram consultados individualmente: todos apontam para o mesmo deployment de produção.

Existe deployment anterior `dpl_AJtkLsAFYmAHgEmncWGmsTcWaTr1`, com commit `85b388f88f433500f11e02703605e44dee1ec9be`, identificado como candidato de rollback pelo Vercel. **Rollback não foi executado/testado**; candidatos não equivalem a procedimento de recuperação homologado.

### Preview da estabilização — comprovado

A branch `fix/stability-state-queries-20261019` gera deployments próprios com `target: null` (Preview) e `READY`. Exemplo verificado:

- Deployment: `dpl_GRynoLGg8ZpPP9E5TeUxNeFct3Q8`
- Commit: `3087df0927ad7fc604d93cb105bc0ac2b7b536bf` (checklist)
- Criado em: `2026-10-19T16:49:09.782Z`
- URL: https://advance-gel1wkwj3-khunshiiiis-projects.vercel.app
- **Não é o release de produção**, não altera automaticamente `main`.

O estado `READY` do Vercel só confirma o deploy da aplicação, não a correção do fluxo Firebase/R2.

## 2. Configuração Firebase — identidade comprovada, implantação das regras não

`advance-app/firebase-config.js` é idêntico entre `main` e branch de estabilização (blob SHA `3551dfb103cd2e88ccc668de7d0def597b875ccb`). `advance-admin/firebase-config.js` aponta para o **mesmo** projeto:

- Firebase projectId: `banco-de-dados-monitor`
- Firebase Auth domain: `banco-de-dados-monitor.firebaseapp.com`
- `advance-admin/.firebaserc`: projeto default `banco-de-dados-monitor`
- `advance-admin/firebase.json` referencia `firestore.rules` e Functions Node 20.

**Achado de alto impacto de homologação:** o Preview de estabilização usa as credenciais públicas/configuração do **mesmo Firebase de produção**. Uma nova URL de Preview do Vercel não cria banco/sessões/dados separados. Enquanto não for criado e validado um ambiente Firebase de homologação, não executar testes destrutivos nem simulações que gerem registros reais.

A cópia `advance-admin/firestore.rules` (blob SHA `1e0881c1ba2169c722252e1c35fa87ba5b3b51de`) **não prova** que essas regras estejam publicadas. Seu conteúdo só permite leitura administrativa de `atividades`, e nega escrita direta em `atividades`; isoladamente, não representa o conjunto de permissões necessário ao PWA de promotores. **Versão, data de publicação, regras em vigor, índices e Functions efetivamente publicados: NÃO VERIFICADOS**.

## 3. Cloudflare Worker / R2 — versão versionada comprovada, produção não verificada

O endpoint de mídia configurado em `technical-report-editor.js` é idêntico na `main` e na branch:

- `https://advance-media-api.brunokhunshi.workers.dev`
- Cópia versionada do Worker: `cloudflare/advance-media-api.js` (blob SHA `38c1dfc660841a5c26e4c6619095d7c536e6e749` nas duas branches).

`cloudflare/README.md` afirma expressamente que atualizar o GitHub/Vercel **não publica o Worker**. Portanto o SHA acima **NÃO** é o hash ativo do script executado pela Cloudflare.

- Deploy ativo / ID da versão Cloudflare: **não verificado**.
- Data e histórico de publicação do Worker: **não verificados**.
- Binding/bucket real de R2 e política CORS efetiva: **não verificados**.
- Endpoint `/health`: inspeção pública foi tentada, mas o acesso externo retornou indisponível no ambiente de auditoria; portanto não foi considerado evidência positiva/negativa de disponibilidade do serviço.
- Exceção de gestão baseada em e-mail específico existe na cópia versionada; **não afirmar que está ativa** sem conferir a versão efetivamente publicada.

**Risco de homologação:** os Previews usam o **mesmo URL de Worker** do aplicativo produtivo. Sem Worker/R2 separados, uploads e exclusões em Preview podem atingir o serviço/bucket real se as demais permissões permitirem.

## 4. Service Worker / instalação PWA

- `sw.js` na `main`: `CACHE_NAME = 'advance-pwa-profile-v72'` (blob SHA `a32b331a1552c3028f2d1235c6e8b4e0b8779135`).
- `sw.js` na branch: `CACHE_NAME = 'advance-pwa-stability-v73'` (blob SHA `dcc48e39b1fb7666d412a6a9d068686196618f31`).
- A correspondência com a versão efetivamente instalada no aparelho não foi testada. O commit de produção é a referência versionada, não uma leitura do cache de cada PWA.

## 5. Advance Admin — implantação ainda não identificada

O repositório `brunokhunshi-dev/advance-admin` foi consultado na auditoria estrutural. A equipe Vercel autenticada `khunshiiiis-projects` apresentou **somente** o projeto `advance-app`. Isso **não prova** que o Admin não esteja hospedado; pode usar outro time/conta/provedor, inclusive Firebase Hosting. URL e commit efetivamente servidos: não verificados.

## 6. Itens encerrados e pendências exatas

### Encerrados nesta etapa
- [x] Identificar owner, projeto, deployment ativo, commit `main`, URL imutável e três aliases de produção Vercel.
- [x] Identificar Preview e demonstrar que não substitui a produção.
- [x] Identificar configuração Firebase comum entre App/Admin e Preview/prod.
- [x] Identificar endpoint Worker compartilhado entre Preview e produção no código.
- [x] Registrar cache SW versionado e candidato de rollback Vercel (sem executar rollback).

### Ainda pendentes para fechar INF-01
- [ ] Confirmar no painel Cloudflare o Worker `advance-media-api`: deployment ativo (versão, data, script/hash), rotas, env/bindings sem expor secrets, bucket R2 e configuração de CORS efetiva.
- [ ] Confirmar no console Firebase a versão/data/conteúdo das **regras Firestore publicadas**, índices relevantes e Functions publicadas. Evitar assumir equivalência com `advance-admin/firestore.rules`.
- [ ] Identificar a hospedagem/commit do Advance Admin.
- [ ] Registrar e testar rollback **operacional** em ambiente de homologação, inclusive compatibilidade entre Vercel, Worker e regras.
- [ ] Garantir projetos Firebase/Worker/R2 distintos para testes de escrita, upload, check-in/out e falhas.

## 7. Decisão / próximo passo

**INF-01 permanece PARCIAL.** A linha de base Vercel está identificada com evidência autenticada; Cloudflare e regras Firestore precisam de acesso de leitura/inspeção ou registros oficiais para conclusão, sem solicitar tokens ou segredos em chat.

Enquanto isso, **INF-02 pode iniciar como matriz estática de consultas e gravações**, mas nenhuma validação de segurança real ou consumo de infraestrutura deve ser declarada concluída sem a configuração efetivamente publicada.

**Nenhum arquivo de aplicação, deploy, bucket, regra ou dado foi alterado nesta inspeção.**
