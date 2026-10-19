# Matriz de acesso — candidata v0.1.1

Base: App `1d32689`, Worker original fornecido em 19/10/2026. Admin antigo desativado pelo responsável e fora desta entrega. Esta matriz descreve a candidata, não a produção ainda aberta.

## Identidade e autoridade

`vinculos_auth/{Firebase UID}` aponta para `{profileCollection, profileId, version:1}`. A coleção deve ser `assistencia`, `promotores`, `administradores` ou `gestores`. Só um processo com Admin SDK/IAM pode criar ou modificar vínculos e perfis. O navegador não pode promover cargo, trocar proprietário, ativar perfil nem alterar permissões.

Campos `ativo:false` ou `permissoes.acessoApp:false` bloqueiam operações. Para perfis de campo, permissões ausentes mantêm o comportamento atual (habilitado); gestão exige `ativo:true`. Cargo, e-mail especial e custom claims de papel não concedem gestão. A presença de um vínculo de gestão só deve ser aprovada por operador responsável.

| Recurso/operação | Promotor/assistente ativo | Gestão explicitamente vinculada | Sem sessão, sem vínculo ou inativo |
|---|---|---|---|
| Vínculo de autenticação | Ler só o próprio UID; nunca gravar/listar | Ler só o próprio UID | Sem leitura operacional; uma conta autenticada pode consultar só seu vínculo |
| Perfil profissional | Ler o próprio; nunca gravar | Ler o próprio; nunca gravar | Perfil próprio pode ser lido para informar desativação |
| Clientes | Consultar; criar com `cadastrarClientes` | Consultar | Negado |
| Editar/inativar/excluir cliente | Negado; exceção: referência de centro de cidade em endereço incerto | Negado pelo navegador nesta versão | Negado |
| Atividades pendentes/em andamento | Consultar apenas as próprias | Consultar todas | Negado |
| Atividades concluídas/canceladas | Consultar próprias com `verHistorico` | Consultar todas | Negado |
| Agendar/editar agenda | Só próprias pendentes, com `agendarVisitas` | Negado pelo navegador | Negado |
| Check-in | Própria atividade pendente, campos restritos | Negado pelo navegador | Negado |
| Cancelar | Própria; `agendarVisitas` se pendente, `finalizarVisitas` se em andamento | Negado pelo navegador | Negado |
| Relatório parcial | Criar/alterar na própria visita em andamento; vínculo gravado atomicamente | Somente leitura | Negado |
| Check-out | Própria visita em andamento, com `finalizarVisitas`; relatório vinculado | Negado pelo navegador | Negado |
| Fechamento manual | Apenas `Pendente de análise`; não pode aprovar a si próprio | Aprovação futura exige backend dedicado | Negado |
| Registros encerrados | Nunca alterar/excluir | Nunca alterar/excluir pelo navegador | Negado |
| Produtos/metadados do catálogo | Somente leitura | Somente leitura pelo navegador | Negado |
| Exclusões, arquivos e coleções desconhecidas | Negado | Negado nesta versão | Negado |
| Fotos de perfil | URL apenas do próprio perfil de campo | Não aplicável | Negado |
| Mídia de relatório | Worker valida perfil e atividade própria; alterações só durante visita | Worker permite acesso de gestão às atividades | Negado |
| Estatísticas R2 | Negado | Permitido pelo Worker | Negado |

Gestão aqui é uma capacidade de leitura/mídia. Não é uma implementação do novo Admin. Operações privilegiadas futuras exigem backend com validação própria; Admin SDK ignora as regras de clientes.

## Compatibilidade

- Relatórios existentes na coleção `relatorios` e atividades sem `relatorioColecao` continuam aceitos.
- `Visita técnica` antiga é normalizada para comercial no relatório/check-out.
- Para instalações v72 ainda ativas, as regras permitem a consulta do próprio perfil por e-mail. Isso é somente leitura, exige vínculo ativo e não procura nem concede gestão. A v73 usa diretamente o UID.
- A criação antiga de cliente com CNPJ pode omitir `criadoPor`; a v73 passa a gravá-lo. Demais campos aceitos são operacionais, sem importância/permissão/papel.
- As novas regras usam `get` de documentos de vínculo/perfil. Esses acessos de autorização podem gerar leituras faturadas: contar apenas chamadas REST do Worker não mede o consumo total do Firestore.
- O catálogo deixa de ser importado automaticamente na abertura do seletor. Deve existir previamente; `tools/import-products.mjs` permanece disponível como operação administrativa.

## O que esta entrega não comprova

Não comprova a causa histórica do pico de 16/10, nem elimina todas as formas de esgotar cota. As regras bloqueiam acessos indevidos; não limitam a frequência das consultas diretas autorizadas do App ao Firestore. O limite do Worker protege as rotas de mídia e é aproximado por localização Cloudflare, não um contador global de cobrança.

A localização GPS e a completude de todos os campos internos dos módulos ainda precisam de homologação de negócio. As regras restringem dono, campos de transição e relações, mas não certificam posição física. A trava de uma única visita em andamento entre dispositivos não foi implementada nesta correção. Persistência durável de fotos ainda não salvas também continua pendente.
