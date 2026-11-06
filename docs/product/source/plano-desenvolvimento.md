# Advance Check — Plano de desenvolvimento e entrega

**Versão 1.1 · 6 de novembro de 2026**  
**Destinatários:** desenvolvimento, produto e QA.  
**Status:** plano de execução proposto, baseado no PRD 1.1, BRD e decisões posteriores de interface. Não representa código implementado nem uma estimativa de prazo aprovada.

## 1. Comece aqui

**Começar:** etapa 0 — confirmar decisões pendentes, inspecionar o repositório existente e preparar ambiente de homologação.  
**Primeira entrega demonstrável:** um promotor autenticado encontra um cliente, agenda uma visita e consulta seus detalhes.  
**Primeiro fluxo completo:** agenda → chegada confirmada no servidor → relatório comercial → conclusão → consulta das respostas no histórico.  
**Terminar a entrega atual:** etapas 0–8 → etapa 10, com piloto do app aprovado, produção monitorada e operação transferida. A etapa 9 pertence a uma entrega futura, sem data definida.

**Escopo aprovado agora: app do promotor e backend necessário. O painel administrativo não será desenvolvido nesta entrega.** Seus tickets ficam fora do sprint, orçamento e critérios de conclusão atuais. Os IDs foram preservados para manter rastreabilidade.

Execute as etapas na ordem abaixo. Uma etapa só está concluída quando sua demonstração e seus critérios de aceite passam. Telas com dados fictícios, botões sem ação ou salvamento apenas visual não contam como entrega funcional.

| Ordem | Entrega | Depende de | Evidência de conclusão |
|---|---|---|---|
| 0 | Escopo e decisões técnicas | — | Decisões registradas e backlog pronto |
| 1 | Fundação, acesso e segurança | 0 | Promotor acessa somente dados autorizados |
| 2 | Clientes, locais e catálogo | 1 | Cliente existente/provisório e produtos disponíveis |
| 3 | Agenda, início e mapas | 2 | Agendar, editar, cancelar e alternar calendário |
| 4 | Execução da visita | 3 | Check-in confirmado, evento e exclusividade de visita |
| 5 | Motor de relatórios, rascunhos e mídia | 1, 2, 4 | Formulário recuperável e foto enviada sem duplicar |
| 6 | Relatório comercial e encerramento | 5 | Primeiro fluxo completo até o histórico |
| 7 | Treinamento, assistência e múltiplos locais | 6 | Três modalidades e visita com duas paradas |
| 8 | Histórico, resultados e PDF | 6, 7 | Respostas completas e exportação por modalidade |
| 10 — agora, após 8 | Homologação, piloto e produção do app | 0–8 | Checklist do app e aceite do produto |
| 9 — entrega futura | Painel administrativo e decisões de regularização | Entrega atual concluída + nova priorização | Aceite próprio; não bloqueia a entrega atual |

**Como trabalhar:** abrir um ticket para cada ID deste documento. Usar os critérios da etapa como subtarefas de aceite. Para uma única pessoa, seguir a ordem linear. O painel não deve ser iniciado nesta entrega, mesmo com equipe disponível. Segurança, auditoria e persistência local começam na fundação, não ficam para o fim.

## 2. Fonte de verdade e mudanças aprovadas

- [Figma — página V3 Essencial](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=78-2): referência visual e de interação.
- [PRD atualizado](https://chatgpt.com/library?file_id=libfile_53dc160347c48191ad0b0ac2ff7ae32a&account_id=personal): campos, opções, condicionais e regras de negócio.
- [BRD atualizado](https://chatgpt.com/library?file_id=libfile_91500d14d0808191b56daf44e0448d7e&account_id=personal): objetivos e contexto.
- [Guia UX/UI](https://chatgpt.com/library?file_id=libfile_d5ed696b51f4819186de358f472e7d20&account_id=personal): critérios gerais, subordinados às revisões abaixo.

As decisões recentes abaixo substituem as descrições anteriores de interface. As demais regras de negócio continuam válidas.

| Tema | Implementar |
|---|---|
| Agenda | Somente Semana e Mês, alternados na mesma agenda; manter navbar, cabeçalho e ação de agendar; sem nova página ou botão de voltar ao trocar o modo |
| Cards de visita | Cliente como informação principal; depois modalidade, horário e endereço. Endereço com ícone e estilo equivalente ao horário |
| Próxima visita | Card diferenciado com botão “Ver visita” dentro dele |
| Início | Próxima visita → mapa → demais visitas em cards. Sem CTA global fixo |
| Mapas | Posição da pessoa, próxima visita destacada e demais locais discretos. Na chegada, comparar posição atual e ponto cadastrado |
| Correção do ponto | “Usar minha localização atual”, prévia no mapa e confirmação. Sem inputs de latitude/longitude para o promotor |
| Formulários | Dropdown, opções inline ou menu sobreposto; nenhum campo abre uma página nova apenas para escolher valor. Isso inclui produtos e filtros |
| Histórico | Busca com um botão de filtro ao lado; painel sob demanda; cards com cliente, resultado, atividade, data/horário e endereço |
| Edição | Detalhe da visita → Editar → Salvar. Sem etapa intermediária de gerenciamento |
| Relatório final | Acesso aos módulos e respostas reais, inclusive condicionais, anexos e registros por parada |
| Densidade visual | Sem bordas decorativas, sem cards para todo agrupamento, sem avisos permanentes de conexão saudável ou salvamento normal |
| Falhas | Mensagem próxima da ação afetada. Não esconder bloqueio de check-in, falha de upload ou risco de perda de rascunho |

**Limites do protótipo:** mapas são ilustrações, CNPJs e respostas podem ser exemplos, botões e calendários não comprovam comportamento de produção. Nunca importar respostas fictícias como registros reais. Os frames antigos de seleção não são rotas obrigatórias do aplicativo. O frame mensal antigo não define uma página independente.

## 3. Etapa 0 — Preparar a execução

**Responsáveis:** produto + liderança técnica. **Saída:** tarefas DEV-00.1 a DEV-00.3 concluídas.

- **DEV-00.1 — Inspecionar código existente.** Identificar stack, autenticação, coleções, integrações, testes e componentes reaproveitáveis. Registrar reutilizar/adaptar/substituir. Não iniciar uma reescrita automaticamente.
- **DEV-00.2 — Congelar contratos de negócio.** Resolver as pendências abaixo com produto; documentar decisão, responsável e data.
- **DEV-00.3 — Preparar entrega.** Criar backlog com estes IDs, ambientes separados, dados sintéticos, responsáveis e roteiro de demonstração por etapa.

| Decisão pendente | Quem resolve | Até quando | Trabalho que pode continuar |
|---|---|---|---|
| Stack frontend, hospedagem e execução do backend | Liderança técnica | Antes da etapa 1 | Inventário e contratos |
| Provedores de mapa, tiles, geocodificação, CNPJ e CEP; limites e orçamento | Técnica + produto | Antes da integração da etapa 2/3 | Interfaces e adaptadores simulados |
| Obrigatoriedade de VC-05 e de campos sem marcação explícita nos módulos TR | Produto | Antes do aceite das etapas 6/7 | Estrutura modular e campos já definidos |
| Formatos, tamanho e compressão das imagens | Técnica + produto | Antes do aceite da etapa 5 | Fluxo de upload parametrizado |
| Encerramento com anexo obrigatório ainda pendente de upload | Produto | Antes da etapa 6 | Bloquear apenas a entrega dessa regra; não presumir sucesso |
| Política de conflitos de rascunho em dois dispositivos | Técnica + produto | Antes do aceite da etapa 5 | Persistência local por usuário |
| Marco inicial e exceções da retenção de cinco anos prevista no PRD | Responsável pelo produto/dados | Antes da produção | Modelo de datas e descarte parametrizado |
| Operação temporária: provisionamento/desativação de usuários, carga de catálogo e tratamento de exceções | Produto + técnica | Antes do piloto do app | Desenvolvimento normal do app; procedimento restrito e auditável, sem construir painel |
| Atendimento a pedidos de regularização antes do painel | Produto | Antes do piloto | Proposta: manter envio/consulta no app somente se houver responsável e procedimento de tratamento; caso contrário, retirar essa entrada da primeira versão. Não prometer uma aprovação inexistente |
| Configuração de formulários no admin | Produto + técnica | Somente na entrega futura | Schema e formulários versionados em código nesta entrega |

Não estimar datas definitivas antes desse levantamento. A equipe estima cada ticket após conhecer reaproveitamento, capacidade e dependências externas.

## 4. Etapa 1 — Fundação e controle de acesso

**Responsável principal:** desenvolvimento. **Dependência:** 0.

- **DEV-01.1:** configurar PWA mobile e backend necessário; ambientes de desenvolvimento, homologação e produção; configuração e segredos fora do frontend.
- **DEV-01.2:** autenticação individual, sessão, logout, usuário desativado e recuperação de acesso conforme provedor adotado.
- **DEV-01.3:** implementar acesso do promotor e regras por equipe/propriedade; reservar estrutura de papéis para evolução futura, sem telas ou fluxos administrativos; validar autorização no servidor e nas regras de acesso.
- **DEV-01.4:** montar navegação Início, Agenda, Histórico e Perfil; tokens Outfit, cores, espaçamento e componentes acessíveis da V3.
- **DEV-01.5:** preparar testes de regras, migrações, logs e pipeline de publicação em homologação.

**Aceite:** promotor não lê nem altera visita de outro usuário sem autorização; operação privilegiada falha mesmo quando chamada fora da interface; logout não deixa dados privados visíveis a outro usuário no dispositivo.

## 5. Etapa 2 — Clientes, locais e catálogo

- **DEV-02.1:** busca interna por nome/CNPJ; resultados com nome, CNPJ e endereço; carregamento, vazio e erro.
- **DEV-02.2:** cadastro por CNPJ com confirmação dos dados externos; validação de dígitos e unicidade também no backend.
- **DEV-02.3:** cadastro manual provisório, pesquisa de possíveis duplicidades e estado Pendente de validação. Salvar ou completar dados não valida o cliente.
- **DEV-02.4:** endereço, geocodificação e estados da localização. Separar endereço textual, ponto cadastrado e GPS de eventos.
- **DEV-02.5:** catálogo `produtos`, importação controlada, IDs estáveis, busca sem acentos/maiúsculas e seleção sem duplicidade. Guardar ID e nome histórico nos relatórios.

**Aceite:** encontrar cliente existente sem duplicar; criar provisório quando integração falha; confirmar endereço; produto desativado continua legível em relatório antigo. Falha externa não perde o formulário.

## 6. Etapa 3 — Planejamento, agenda e início

- **DEV-03.1:** criar visita com cliente, data, hora, tipo e local inicial; observação opcional. Não pedir paradas futuras.
- **DEV-03.2:** editar diretamente pelo detalhe enquanto Agendada; cancelar com motivo e confirmação, preservando histórico.
- **DEV-03.3:** Semana/Mês na mesma rota; período anterior/próximo; data selecionada e lista cronológica consistentes; indicadores de visitas por dia. Tratar virada de mês/ano e fuso definido pelo produto.
- **DEV-03.4:** início com visita ativa ou próxima, botão no card, mapa e demais visitas. Sem botão global de “Ver próxima visita”.
- **DEV-03.5:** mapas reais com posição atual e locais; estados de GPS negado, localização indisponível e cliente sem ponto. Não mostrar posição inventada nem rastrear continuamente sem necessidade aprovada.

**Aceite:** editar horário atualiza agenda/início; mudar Semana/Mês preserva a navegação; clicar no dia filtra a lista; cancelar atualiza histórico; card sempre mostra endereço disponível, sem fabricar um endereço ausente.

## 7. Etapa 4 — Visita e eventos confiáveis

- **DEV-04.1:** check-in autenticado com horário do servidor, coordenada e precisão disponíveis; mostrar mapa antes da confirmação.
- **DEV-04.2:** transação que garante uma visita Em andamento por promotor, inclusive em duas sessões. Visita atrasada Agendada não bloqueia.
- **DEV-04.3:** visita ativa, eventos cronológicos e retomada após recarregar; separar estado operacional e pendência de regularização.
- **DEV-04.4:** correção do ponto cadastrado por captura da posição atual, prévia e confirmação; auditoria de antes/depois/autor/horário. Não alterar GPS já registrado.
- **DEV-04.5:** preparar comando de checkout com validação no servidor; a liberação depende dos relatórios da etapa 6.

**Aceite:** sem internet não há check-in/check-out nem fila retroativa desses comandos; duplo toque ou resposta perdida não cria evento duplicado; GPS indisponível é registrado como indisponível, sem coordenada falsa; divergência do ponto não bloqueia automaticamente.

## 8. Etapa 5 — Infraestrutura compartilhada dos relatórios

- **DEV-05.1:** schema versionado por modalidade/módulo; renderer de texto, data, número, seleção única/múltipla, produto e campos condicionais. Validação equivalente no cliente e servidor.
- **DEV-05.2:** dropdowns/menus e Sim/Não na própria tela; seleção e fechamento retornam ao mesmo campo, preservando rolagem e dados.
- **DEV-05.3:** IndexedDB por usuário/visita/módulo; salvar, recuperar após fechamento e sincronizar rascunhos com controle de versão/conflito.
- **DEV-05.4:** editor em blocos ordenados e até seis fotos por módulo; câmera/galeria, preview, remoção e reenvio.
- **DEV-05.5:** upload privado no R2 com autorização temporária emitida pelo backend; original comprimido e miniatura; metadados no Firestore; fila idempotente e reconciliação de arquivos órfãos.
- **DEV-05.6:** leitor de respostas para app e PDF, reutilizável futuramente pelo painel; distinguir “Não”, vazio e “Não se aplica”.

**Aceite:** fechar/reabrir recupera rascunho; falha da foto não apaga texto; reenviar não duplica anexos; sétima foto é rejeitada também no backend; link privado não é acessível sem autorização; mudar Sim para Não não deixa respostas ocultas inválidas no resultado final.

## 9. Etapa 6 — Primeiro fluxo completo: comercial

Implementar o PRD §7.1 integralmente, incluindo opções e condicionais, sem copiar apenas o exemplo visual do Figma.

| Ticket | Módulo | Aceite específico |
|---|---|---|
| DEV-06.1 | VC-01 Contato | Nome, cargo e objetivo obrigatórios |
| DEV-06.2 | VC-02 Disponibilidade | Três perguntas respondidas; Sim abre seleção de produtos; Não não exige produto |
| DEV-06.3 | VC-03 Exposição | Evidência exigida quando há necessidade de organização/ausência de exposição; Outro abre descrição |
| DEV-06.4 | VC-04 Relato livre | Opcional; ordem dos blocos e fotos preservada |
| DEV-06.5 | VC-05 Encaminhamentos | Campos e condicionais completos; obrigatoriedade conforme decisão da etapa 0 |
| DEV-06.6 | Revisão e checkout | Lista de pendências com acesso ao módulo; servidor valida, registra saída e conclui |
| DEV-06.7 | Consulta mínima no histórico | Abrir visita concluída e ler exatamente as respostas salvas |

**Demonstração obrigatória:** login → cliente → agendamento → check-in → preencher VC → tentar concluir incompleto → corrigir → concluir → abrir histórico → verificar respostas e fotos. Este é o primeiro marco de produto funcional; ainda não é liberação para produção.

## 10. Etapa 7 — Demais modalidades e paradas

- **DEV-07.1 — Treinamento:** TR-01 planejamento; TR-02 execução; TR-03 relato opcional; TR-04 feedback; TR-05 revisão. Aplicação prática = Não oculta produtos aplicados, substratos e resultado. “Não respondeu” não vira nota zero. Quantidades são inteiros.
- **DEV-07.2 — Assistência:** AT-01 cliente/aplicação; AT-02 produto/queixa; AT-03 preparo/condições; AT-04 verificações/medições; AT-05 constatações; AT-06 conclusão. Mínimo para concluir: produto, queixa e constatações. “Medição não realizada” nunca produz zero fictício.
- **DEV-07.3 — Adicionar local:** disponível durante visita ativa; saída da parada atual → deslocamento → chegada no novo local. Preservar cliente principal, endereço, GPS, horários e registros de cada parada.
- **DEV-07.4 — Registro da parada:** observações/fotos por padrão; relatório técnico completo opcional. Cliente comercial independente exige outra visita.

**Aceite:** demonstrar treinamento com e sem aplicação prática; assistência com medição não realizada; visita comercial com segunda parada e relatório técnico vinculado; histórico distingue os locais sem misturar respostas.

## 11. Etapa 8 — Histórico e relatório final

- **DEV-08.1:** busca, filtros de período/tipo/resultado em painel recolhido; seleções sem página nova; limpar filtros; vazio e paginação.
- **DEV-08.2:** resumo da visita → módulos preenchidos → respostas, fotos e blocos somente leitura; navegação entre módulos e retorno ao resumo. Não entregar apenas rótulos “Completo”.
- **DEV-08.3:** PDF consolidado por visita e parada, com respostas reais, modalidade, autores, horários e anexos; geração e download autorizados.
- **DEV-08.4:** estados cancelada, concluída e regularização; preservar motivo e evidência original.

**Aceite:** app e PDF exibem os mesmos valores; campos condicionais e respostas negativas são interpretados corretamente; alterações futuras no schema não quebram relatórios antigos.

## 12. Etapa 9 — Gestão administrativa · ENTREGA FUTURA

**Fora do desenvolvimento atual.** Não implementar agora dashboard, filas de aprovação, administração de usuários, consulta de auditoria ou editor de formulários. Os tickets abaixo são apenas backlog futuro; não são dependências do lançamento do app.

- **DEV-09.1:** visão operacional, filtros de equipe/promotor, visitas e detalhes.
- **DEV-09.2:** fila de cadastros provisórios; validar ou devolver com registro. Promotor não consegue executar a aprovação.
- **DEV-09.3:** solicitação de ajuste de horário com declaração e motivo; aprovação/recusa pelo gestor; mostrar original, declarado e decisão sem sobrescrever a evidência.
- **DEV-09.4:** usuários, equipes e permissões pelo administrador; acesso a relatórios, fotos e exportações.
- **DEV-09.5:** auditoria pesquisável de alterações críticas; antes/depois, autor e horário do servidor.
- **DEV-09.6:** configuração/versionamento de campos conforme escopo aprovado. Distinguir alterar definição futura do formulário de alterar respostas de relatório concluído; não liberar edição retroativa sem regra explícita e auditoria.

**Aceite:** cadastro aprovado repercute no mobile; decisão de regularização aparece no histórico; gestor de outra equipe não acessa ou decide; usuário desativado perde acesso; relatório final permanece rastreável.

## 13. Contratos de dados e backend

Estrutura abaixo é uma proposta de implementação a confirmar na etapa 0; Firebase/Firestore e R2 já são premissas do PRD.

| Entidade | Conteúdo essencial | Regra |
|---|---|---|
| Usuário/equipe | identidade, perfil, vínculo, ativo | Autorização efetiva no servidor |
| Cliente | CNPJ normalizado, nomes, endereço, validação | CNPJ único; provisório não se autovalida |
| Local | cliente, endereço, ponto e estado geográfico | Ponto cadastrado separado do GPS da visita |
| Visita | promotor, cliente, tipo, planejamento, estado | Uma ativa por promotor; cancelamento não exclui |
| Parada | visita, local, finalidade, chegada/saída | Criada durante execução; mantém contexto próprio |
| Evento | tipo, visita/parada, autor, timestamp, GPS/precisão | Registro original preservado |
| Relatório/módulo | modalidade, versão do schema, respostas, revisão | Validação e histórico independem do layout |
| Mídia | visita/parada/módulo, chaves R2, MIME, tamanho, estado | Privada e vinculada ao registro autorizado |
| Solicitação | motivo, declarado, original, estado, decisão | Não substitui evento original |
| Auditoria | ação, objeto, antes/depois, autor, instante | Escrita protegida |

**Escopo temporal:** gravação de auditoria, autenticação, segurança e backend do app permanecem obrigatórios agora. UI de gestão, decisões administrativas e configuração de formulários ficam para a entrega futura. Clientes provisórios mantêm o estado Pendente de validação; somente uma aprovação explícita autorizada poderá validá-los. O adiamento do painel não concede poderes de gestor ao promotor.

**Comandos críticos:** agendar, editar, cancelar, check-in, sair de parada, chegar a parada, checkout, corrigir ponto, solicitar regularização e decidir solicitação. Cada comando deve validar identidade, escopo, estado atual, dados e chave idempotente. Persistir alteração e evento/auditoria de forma consistente; retornar o resultado confirmado. Não confiar apenas em `navigator.onLine`.

**Datas:** guardar instantes de eventos de forma consistente e converter para exibição; definir fuso do planejamento explicitamente. Horário local do aparelho não substitui timestamp do servidor.

## 14. Etapa 10 — Homologação e lançamento

| Ticket | Verificação obrigatória |
|---|---|
| DEV-10.1 | Testes de domínio: estados, condicionais, obrigatoriedade, calendário, retenção parametrizada |
| DEV-10.2 | Integração: regras de acesso, transações concorrentes, idempotência, R2 e falhas externas |
| DEV-10.3 | Ponta a ponta: três relatórios, cadastro provisório sem autovalidação, cancelamento, duas paradas e PDF; regularização conforme procedimento temporário aprovado, sem exigir painel |
| DEV-10.4 | Resiliência: perda de rede antes/depois de confirmação, app fechado, upload interrompido, dois dispositivos, sessão expirada |
| DEV-10.5 | UX: 360/390/430 px, nomes/endereço longos, teclado, zoom, foco, contraste, toque e última linha acessível acima da navbar |
| DEV-10.6 | Piloto do app com promotores e responsável pelo produto, registro de problemas, correções e aceite do produto |
| DEV-10.7 | Publicação: migrações, backup/restauração, rollback, monitoramento, responsável de suporte e documentação operacional |

### Critério final de entrega

- [ ] Critérios CA-01 a CA-15 estão rastreados: CA-12 (análise no painel) e a aprovação administrativa de CA-02 ficam na entrega futura; a parte de CA-02 relativa a validação de CNPJ, duplicidade e proibição de autovalidação permanece agora. Os demais critérios aplicáveis ao app têm evidência e aceite.
- [ ] Todas as decisões da etapa 0 estão resolvidas ou formalmente excluídas do lançamento pelo produto.
- [ ] Nenhum dado fictício do Figma chega ao ambiente produtivo.
- [ ] Rascunhos e anexos recuperam após falha; check-in/out só aparecem confirmados após resposta do servidor.
- [ ] Agenda e mapas usam dados reais; troca Semana/Mês funciona na mesma tela.
- [ ] Toda modalidade permite concluir e consultar suas respostas completas e exportação.
- [ ] Autorização e gravação de auditoria do app funcionam; painel, filas e decisões administrativas não fazem parte deste aceite.
- [ ] Provisionamento de contas, catálogo e suporte a exceções têm responsável e procedimento temporário documentado.
- [ ] Cadastro provisório continua utilizável no fluxo autorizado e Pendente de validação; não é promovido automaticamente a Validado pela ausência do painel.
- [ ] Piloto aceito; sem defeitos bloqueadores; publicação e rollback ensaiados.
- [ ] Repositório, ambientes, configuração, migrações, testes e manual operacional entregues ao responsável técnico.

## 15. Referências rápidas de tela

| Fluxo | Figma | Etapas |
|---|---|---|
| Início e próxima visita | [Início](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-2) | 3 |
| Agenda Semana/Mês | [Agenda](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-86) | 3 |
| Buscar cliente | [Busca](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-424) | 2 |
| Detalhe e edição | [Detalhe](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-205) | 3 |
| Chegada e mapa | [Chegada](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-263) | 4 |
| Corrigir ponto | [Localização](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-1673) | 4 |
| Visita ativa | [Execução](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-323) | 4–7 |
| Comercial | [Módulos VC](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-2076) | 5–6 |
| Treinamento | [Módulos TR](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-2463) | 7 |
| Assistência | [Módulos AT](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-2898) | 7 |
| Histórico | [Histórico](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-1341) | 8 |
| Respostas da visita | [Relatório](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-1914) | 8 |
| Administração — fora da entrega atual | [Painel futuro](https://www.figma.com/design/IzwnHc2Qpouqqqw04sQlyY?node-id=79-4747) | 9 — futuro |

## 16. Modelo de ticket e rotina de aceite

**Título:** DEV-XX.X — verbo + resultado.  
**Objetivo:** o que o usuário consegue fazer.  
**Dependências:** IDs que precisam estar concluídos.  
**Referências:** seção do PRD e frame da V3.  
**Implementação:** interface, dados, comando, permissão e estados de erro.  
**Aceite:** cenário inicial → ação → resultado verificável.  
**Evidência:** teste, captura ou gravação em homologação.  
**Responsáveis:** execução, revisão técnica e aceite do produto.

Uma tarefa só muda para Concluída depois de revisão técnica, testes pertinentes e demonstração com persistência real em homologação. Ao finalizar cada etapa, revisar este plano e registrar mudanças aprovadas; não aumentar o escopo silenciosamente.
