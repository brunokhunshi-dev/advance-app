# Backlog pós-v0.1.1 — riscos conhecidos aceitos e melhorias adiadas

> **Correção de REV-01 — 20/10/2026:** implementado arquivamento atômico de texto e Blobs em conflito, separado do backup ativo no mesmo IndexedDB, para comercial, treinamento e assistência. Novos backups e limpeza após salvar não apagam os arquivos de conflito. Falha ao ler/arquivar interrompe abertura do editor, preservando o original. Regressões adicionadas; CI desta correção ainda pendente neste registro. INF-10 permanece sem homologação em navegador/celular real; publicação não autorizada. Os registros anteriores de bloqueio abaixo descrevem o diagnóstico antes deste patch.


> **Atualização de 20/10/2026 — DEPLOY BLOQUEADO (REV-01).** Revisão reproduziu sobrescrita do backup conflitante no próximo backup automático. A afirmação anterior de preservação permanente está corrigida por este registro. INF-10 reaberto; aceites de infraestrutura permanecem. Check e 161 testes passaram, CI e Preview READY confirmados em `6ad0b1e`, mas não cobriam este defeito. Ver [parecer e critérios de liberação](revisao-rc-v011-20261020.md). Registros de 19/10 abaixo são históricos e não constituem liberação atual.


**Registro:** 19/10/2026 | **Responsável pelo aceite operacional:** proprietário do Advance Check | **Status:** ARQUIVADO PARA FUTURA REVISÃO, NÃO CORRIGIDO  
**Vínculo:** [Checklist v0.1.1](checklist-estabilizacao-v011-20261019.md), [INF-01](infra-inf01-baseline-20261019.md), [INF-02](infra-inf02-matriz-firestore-20261019.md), [INF-03](infra-inf03-consumo-limites-20261019.md), [INF-04–06](infra-inf04-inf06-aceite-piloto-20261019.md), [INF-07](infra-inf07-integridade-transacoes-r2-20261019.md), [INF-08](infra-inf08-relatorios-validacao-servidor-20261019.md), [INF-10](infra-inf10-revisao-rapida-rascunhos-fotos-20261019.md), [auditoria estrutural](auditoria-estrutural-v011-20261019.md).

**Decisão:** manter o piloto com 3 promotores e aproximadamente 20 clientes e priorizar a estabilização de interface/estado atual. **Adiar as mudanças abaixo sem apagar as evidências e sem apresentá-las como bugs resolvidos/homologados.** O grau de severidade técnica é mantido mesmo quando o responsável aceita o risco temporariamente. Aceite **não garante** segurança ou ausência de falha; reabrir imediatamente diante de incidentes.

## A. Segurança e integridade — risco elevado, aceito temporariamente (revisitar prioritariamente)

| ID | Risco conhecido | Origem/evidência | Prioridade futura / gatilho |
| --- | --- | --- | --- |
| FUT-SEC01 | Regras `allow read, write: if request.auth != null` permitem escrita e leitura de qualquer documento por qualquer conta autenticada no mesmo Firebase, sem perfil, propriedade ou desativação | INF-04, INF-08; regras fornecidas | **P1 segurança**. Reabrir antes de aumentar equipe, integrar gestores, expor mais dados ou após acesso indevido |
| FUT-SEC02 | Finalizar atividade sem relatório obrigatório é possível por escrita direta, ignorando as funções de validação do browser | INF-08 F08-01 | **P1 integridade**. Servidor confiável para checkout + regras restritivas, teste com Emulator |
| FUT-SEC03 | Worker contém exceção/fallback de autorização de gestão associada a e-mail específico; potencial persistência de acesso após desativação de perfil | Auditoria estrutural EST-04; INF-05; Worker fornecido | **P1**. Remover bypass após desenhar papéis e testar o Worker realmente implantado |
| FUT-SEC04 | Worker do GitHub difere do implantado informado (miniaturas vs apenas original); versão/binding/bucket e secrets não verificados independentemente em todos os aspectos | INF-01, INF-05 | **P1 de governança**. Criar deploy reproduzível/versionamento Worker sem sobrepor produção |
| FUT-SEC05 | Preview do Vercel compartilha projeto Firebase e Worker/R2 de PROD | INF-01, EST-14 | **P1 de homologação**. Isolar ambiente antes de testes destrutivos ou automações reais |

## B. Transações, relatórios, fotos e recuperação

| ID | Risco / melhoria não feita | Origem | Prioridade futura / gatilho |
| --- | --- | --- | --- |
| FUT-DATA01 | Foto pode ficar órfã se PWA fechar entre PUT R2 e commit Firestore; rollback de upload é somente best effort | INF-07 F07-01 | P1/P2 conforme volume; job de reconciliação conservador com verificação de referências |
| FUT-DATA02 | Fila de exclusões `pendingDeletes` é limpa antes de confirmar DELETE; falha pode deixar objetos sem retry | INF-07 F07-02 | **P2, achado confirmado no código**; adicionar persistência/retentativa segura |
| FUT-DATA03 | DELETE de compensação de mídia pode ser negado após outra sessão concluir visita | INF-07 F07-03 | P2; modelar exclusão idempotente autorizada de objetos não vinculados |
| FUT-DATA04 | Sessões/abas concorrentes podem criar conflito pós-commit e informações obsoletas; check-in único multi-dispositivo não é trava server-side | INF-07 F07-05; EST-02 | P2; testes de corrida e chave transacional por promotor se virar requisito |
| FUT-DATA05 | Cadastro CNPJ é idempotente por ID determinístico, mas a base legada pode conter IDs independentes; cadastro sem CNPJ admite duplicidade | INF-07 F07-06 | P2; testar migração/unicidade legada |
| FUT-DATA06 | Comportamento de `pagehide`/backup assíncrono e último trecho ainda não persistido | INF-10 FUT-DR01, EST-09 | **P1 se houver perda relatada**, testar Android/iOS PWA |
| FUT-DATA07 | IndexedDB sujeito à quota, evicção e limpeza/desinstalação | INF-10 FUT-DR02 | P2; aviso de retenção e testes em dispositivos |
| FUT-DATA08 / REV-01 | **P1 REABERTO:** backup incompatível pode ser substituído no próximo flush; não é só falta de UI | INF-10 FUT-DR03, `stabilizacao-v01-20261019.md` | P2; tela de resolução sem sobrescrever servidor |
| FUT-DATA09 | Duas abas podem sobrescrever backups locais da mesma visita; não há exclusividade cross-tab | INF-10 FUT-DR04 | P2; coordenação por versão/aba e teste |
| FUT-DATA10 | Troca de conta durante foto/upload/backup e limpeza de cache/URLs exigem homologação real | INF-10 FUT-DR06 | P2; testes de isolamento e sessão |

**Corrigido apenas na branch, não publicado:** erro de pós-commit na produção que relê documentos depois de `runTransaction` de checkout/fechamento; branch elimina releituras. **Não classificar como item ainda a corrigir se testes e deploy aprovarem.** Ver INF-07 F07-04.

## C. Desempenho / Firestore — escalabilidade, não bloqueadores atuais aprovados

| ID | Problema ou hipótese | Evidência | Prioridade futura |
| --- | --- | --- | --- |
| FUT-PERF01 | Autocomplete lê todos os clientes ativos/provisórios; indexar busca sem perder texto parcial/cidade/CNPJ | INF-02 F02-01; INF-03 H01 | P2, por crescimento de clientes |
| FUT-PERF02 | Perfil lê todas as atividades do promotor, filtra período localmente | INF-02 F02-02; INF-03 H02 | P2 |
| FUT-PERF03 | Histórico possui fallback sem `limit` se índice composto estiver indisponível; índices foram informados desativados, sem lista/status individual | INF-02 F02-03; INF-03 H03 | P2, reabrir quando registros crescerem |
| FUT-PERF04 | Worker refaz buscas de perfil e atividade por URL; houve 24 respostas HTTP 4xx de subrequests Firestore (status exatos não examinados) | INF-03 H04, print do Worker | P2, investigação antes de escala |
| FUT-PERF05 | Catálogo pode importar automaticamente 102 produtos/103 writes + releituras/verificações se metadata divergir | INF-02 F02-07; INF-03 H05 | P2, checar se ocorrer pico novamente |
| FUT-PERF06 | Login pesquisa perfil por e-mail em até duas coleções e CNPJ usa até três queries | INF-02 F02-06/F02-08 | P3 |
| FUT-PERF07 | Abrir relatório força releitura; check-in consulta atividades abertas + cliente + TX; reentrância/cache TTL pode elevar uso | INF-02 F02-05/F02-09/F02-10 | P3, não remover validações cegamente |
| FUT-PERF08 | Sem medição por ação, não é possível atribuir 744 leituras e 108 avaliações das regras a telas individuais; pico ~9h não diagnosticado | INF-03; screenshots fornecidos | P2, telemetria/análise em homologação |
| FUT-PERF09 | Recurso de cache/dedup Início/Agenda implementado somente em PR #26 e necessita medir depois do deploy | INF-02 F02-08, INF-03 H06 | P2, validação da melhoria; não duplicar implementação |

## D. Infraestrutura, PWA e manutenção — explicitamente adiados

| ID | Item | Evidência/decisão | Gatilho |
| --- | --- | --- | --- |
| FUT-PWA01 | **INF-09 adiado integralmente:** atualização/ativação SW, sincronização de caches, instalações antigas, offline, mudança de conta e fallback | Responsável em 19/10/2026: SW considerado suficiente para o piloto | Após estabilização v0.1.1 ou incidente de versão em cache |
| FUT-INF01 | Backup auditável de regras/Worker ativos e rollback testado; staging independente; rotas/versões Worker verificadas | INF-01/INF-05 | Antes de alterações de backend |
| FUT-INF02 | CORS `AllowedOrigins: ["*"]` no R2 é amplo; compatível estaticamente com uploads atuais, não alterado | INF-06 | Ao restringir origens/domínios e revisão de segurança |
| FUT-ARCH01 | `script.js` concentra estado global, listeners, IO e funções; refatoração por domínios ainda não terminada | EST-01/02/11/13 | Release próprio, com testes |
| FUT-ARCH02 | Código de Admin descontinuado contém fluxos/caches/duplicações; não refatorar sem produto ativo | EST-03/05/07/08/10, Admin descontinuado | Somente se Admin reativado |
| FUT-ARCH03 | Protótipos e módulos auxiliares/duplicados precisam de limpeza de compatibilidade cuidadosa | EST-10/12/13 | Após baseline funcional e métricas |

## E. Condições de reabertura imediata

Reclassificar um item como **correção urgente** se for detectado vazamento/acesso indevido, escrita cruzada entre promotores, conclusão sem relatório, perda de fotos/rascunhos, transações confirmadas exibidas como falha e reenviadas, fotos inacessíveis, erro de quota constante ou PWA preso em versão antiga. **Riscos aceitos não são “sem problema”; apenas não entram no escopo de mudança de hoje.**

## F. Separação de escopo e artefatos

- **v0.1.1 desta janela:** homologar patches já existentes na PR #26, executar validação de sintaxe/testes e smoke tests não destrutivos; corrigir apenas regressões confirmadas relevantes, com reversão preparada. Não substituir Firebase Rules nem Worker. 
- **Versão futura:** itens A–D acima, após priorização e aprovação, com Firebase/Worker/R2 de homologação separados. A severidade técnica P1 de segurança permanece no backlog mesmo sem bloqueio administrativo escolhido para o piloto.
- **INF-11:** evidências históricas preservadas nos relatórios individuais; este arquivo é o **índice central de débitos/riscos conhecidos**, não um certificado de correção ou substituto de logs de deploy.
