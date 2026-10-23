# HOTFIX — Check-in/check-out sem bloqueio geográfico e com auditoria

**Data:** 23/10/2026  
**Motivo:** carteira de clientes ainda possui endereços/coordenadas desatualizados; correção será gradual.  
**Escopo:** `script.js`, `src/services/location-audit.js`, `sw.js`; sem mudança de Firebase Rules/Worker/CORS.

## Regra provisória
- Check-in e check-out **não são bloqueados** por distância da loja, centro da cidade, ausência de coordenadas da loja, GPS desligado/negado, baixa precisão do GPS ou falha de geocodificação reversa.
- A obtenção de posição continua sendo **tentada**, com a precisão original informada pelo navegador e tentativa de endereço por coordenadas.
- **Permanecem obrigatórios** login, vínculo/responsabilidade, status correto da visita, proteção contra visita simultânea no fluxo normal e relatório válido para encerrar. Sem rede ou permissão Firestore, não é possível confirmar a operação.
- Em caso de GPS indisponível, gravar `null` para latitude/longitude/distância e o motivo técnico de indisponibilidade; **não inventar** coordenadas.
- A antiga referência geográfica é **somente comparativa**: 1.500 m para loja com coordenada confirmada ou 50.000 m para cadastro de localização incerta que possui centro da cidade conhecido. Ausência dessa referência não bloqueia.

## Armazenamento Firestore
**Registro primário obrigatório:** `atividades/{atividadeId}`, nos campos `auditoriaLocalizacao.checkin` e `auditoriaLocalizacao.checkout`. A captura do registro e a mudança de status são gravadas **na mesma transação**, usando as permissões da coleção `atividades` já utilizada pelo app. Uma falha nessa gravação impede a mudança de status, preservando a consistência.

**Cópia opcional para consultas consolidadas:** `auditoria_localizacao/{atividadeId}_checkin` e `auditoria_localizacao/{atividadeId}_checkout`. Essa cópia é tentada **somente depois** do commit da atividade, sem bloquear a operação se o Firebase negar escrita na coleção adicional ou estiver indisponível. Quando essa cópia falhar, o registro completo continua arquivado na atividade. Até configurar as Rules adequadas para a coleção adicional, o estudo deve considerar `atividades` como fonte canônica. IDs determinísticos evitam cópias múltiplas por evento.

### Campos arquivados (esquema 1)
- `atividadeId`, `clienteId`, `ptvId`, `uid`, `promotorNome`, `evento`, `modo`, `tipoVisita`, `agendadoPara`;
- `registradoEm` (horário do aparelho como timestamp Firestore), `registradoServidorEm` (`serverTimestamp()` confirmado pelo Firestore), `diaLocal`, `horaLocal`, `fusoHorario`;
- `clienteNome`, `clienteEndereco`, `clienteCidade`, `clienteUf`, `statusCadastroLocalizacao`, `precisaoCadastro` (fotografia da referência do cliente na operação);
- `coordenadasCadastro.lat`, `coordenadasCadastro.lng`, `coordenadasCadastro.origem`, `coordenadasCadastro.distanciaMetros` (proximidade da coordenada realmente salva no cliente, inclusive quando a referência de localização incerta é o centro da cidade);
- `gps.lat`, `gps.lng`, `gps.precisaoMetros`, `gps.endereco`, `gps.status`, `gps.erro`, `gps.capturadoEm`;
- `referencia.lat`, `referencia.lng`, `referencia.tipo`, `referencia.raioComparacaoMetros`;
- `distanciaMetros`, `foraRaioDeReferencia` (null se não houver dados para o cálculo), `politica`, `localizacaoNaoBloqueante`, `motivoFechamentoManual` quando aplicável.

O fechamento manual legado grava evento `checkout` em `modo: 'manual'`, sem fabricar GPS. Os campos de GPS legados em `atividades`/`relatorios` são preservados quando a posição é válida e podem ficar `null` quando não for.

## Validação e acompanhamento
1. `npm run check` e `npm test`, incluindo teste de captura opcional, distância, gravação transacional do check-in e checkout, e registro sem GPS.
2. Publicar o `sw.js` com cache incrementado e conferir instalação existente; a atualização do PWA ocorre quando o dispositivo volta a consultar o service worker (não garante atualização instantânea em todas as abas).
3. Em ambiente autorizado, realizar **uma atividade real de teste** com GPS válido longe da coordenada; conferir `atividades/{id}.auditoriaLocalizacao.checkin` com horário, GPS, distância e `foraRaioDeReferencia:true`. A cópia em `auditoria_localizacao/{id}_checkin` é opcional. Fechar e verificar `atividades/{id}.auditoriaLocalizacao.checkout`.
4. Repetir com permissão GPS negada: deve prosseguir, e `gps.status='indisponivel'`, coordenadas/distância nulas.
5. Verificar atomicidade da auditoria primária com a transição de status, e que a falha de permissão em `auditoria_localizacao` não bloqueia check-in/check-out.
6. Verificar Rules **efetivamente publicadas** antes de uso amplo: inventário de 19/10 relatou `allow read, write: if request.auth != null`, **não confirmado no projeto Firebase nesta alteração**. Se a Rule da coleção nova não permitir escrita, apenas a cópia opcional falhará; os logs primários ainda requerem autorização de atualização na coleção `atividades`.

### Privacidade e limitações
Localização precisa e horários são dados pessoais de colaboradores: limitar acesso aos gestores autorizados, estabelecer retenção e transparência interna (finalidade: conciliação de endereços e auditoria operacional). **As Rules reportadas anteriormente são amplas e não garantem acesso restrito por função; não interpretar autenticação como controle de acesso suficiente.** O frontend não é defesa contra cliente autenticado malicioso; controles realmente imutáveis exigem Rules/servidor. Não realizar teste de gravação em contas reais sem autorização.

## Reversão
Restaurar o comportamento anterior do `script.js` a partir do commit anterior ao hotfix, desativar ou manter explicitamente a gravação de auditoria embutida e **incrementar novamente** `CACHE_NAME` para substituir o PWA instalado. Não excluir os registros existentes: conservá-los para análise e retenção autorizada. A regra de raio previamente adotada era de 1.500 m nas lojas confirmadas e 50 km na localização incerta. Corrigir gradualmente a base antes de reativar o bloqueio.
