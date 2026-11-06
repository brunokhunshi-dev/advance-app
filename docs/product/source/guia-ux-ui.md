# Advance Check — Guia de UX/UI e critérios de qualidade

**Documento de apoio ao BRD e PRD · Versão 1.0 · Novembro de 2026**  
**Destinatário:** agente de UX/UI responsável pela concepção, sistema visual e protótipo do Advance Check.  
**Natureza:** diretrizes de design, não substitui regras de negócio nem detalhamento funcional dos formulários do PRD.

## 1. Missão do design

Conceber **do zero** uma experiência mobile de trabalho em campo, com um **painel administrativo separado**. O foco não é modernizar superficialmente telas antigas: é tornar simples registrar uma visita com qualidade, lidar com imprevistos e recuperar-se de erros sem perder rastreabilidade.

**Proposição central:** *o promotor deve entender em poucos segundos onde está, o que já aconteceu, o que precisa fazer agora e o que acontecerá depois.*

Prioridades, nesta ordem:

1. **Clareza operacional e prevenção de erros.**
2. **Rapidez no uso real**, inclusive sob sol, com uma mão e com conectividade instável.
3. **Qualidade dos dados** sem incentivar preenchimento fictício ou precipitado.
4. **Preservação das evidências**, especialmente horários, locais, motivos e anexos.
5. **Consistência visual e percepção profissional**, sem excesso de ornamentos.

O app de campo é **mobile-first / PWA**. O painel administrativo será **uma interface própria**, mais densa e adequada a desktop, com comportamento responsivo; não é uma versão ampliada das telas do promotor.

## 2. Materiais de referência e precedência

Ler antes de desenhar:

1. **BRD Advance Check:** objetivos, usuários, limites do negócio.
2. **PRD Advance Check:** formulários, estados, validações, integrações e regras aprovadas. **É a fonte primária de verdade funcional.**
3. **Aplicação atual e repositório:** referência de conceitos e recursos já úteis, não de layout a reproduzir.
4. **Figma atual:** observar identidade, linguagem e estruturas que se mostraram úteis; não copiar problemas de densidade, hierarquia e navegação.

Referências de consulta:
- Repositório: https://github.com/brunokhunshi-dev/advance-app
- Figma: https://www.figma.com/design/QeINub3jRlY6eyZDt11kHR/Sem-t%C3%ADtulo
- Aplicação existente: https://advance-app-one.vercel.app/

**Precedência:** se houver contradição entre produto atual e PRD, **vale o PRD atualizado**. Se houver lacuna, registrar uma hipótese e uma pergunta de validação. Não inventar regra operacional.

### A distinção entre observado e proposto

- **Preservar:** funcionalidade e conceito comprovadamente presentes no código atual.
- **Reinterpretar:** padrão útil que precisa ganhar legibilidade ou consistência.
- **Criar:** padrão novo exigido pelo PRD. Validar antes de tratar como regra definitiva.

As decisões sobre fricções de campo decorrem do planejamento e relatos do projeto; **não constituem evidência de teste formal com todos os promotores**.

## 3. O que merece ser preservado do Advance Check atual

### 3.1. Identidade e linguagem

O código existente usa:
- **Outfit** como fonte de interface.
- Tokens de referência: `#040438` (escuro), `#0F2960` (azul), `#F51E30` (vermelho), `#F9F9FA` (fundo), `#FFFFFF` (cartões), `#6E6E90` (texto discreto) e `#E6E6ED` (bordas).
- Controles grandes: altura-base **52 px**; referência atual de raios: **24 px nos cartões, 28 px nos controles, 20 px nos campos**.
- Ícones **Heroicons outline de 24 px, traço 1,5 px** no padrão documentado do repositório.

**Regra:** conservar o reconhecimento da marca, mas não usar todos os valores legados de forma literal. É permitido refinar a escala de raios, tipografia e contrastes, desde que resulte em um sistema coerente. Usar o vermelho preferencialmente para a ação principal e ênfases relevantes, não para todo elemento clicável.

### 3.2. Elementos funcionais que têm valor

- **Agenda com calendário e dias selecionáveis**, navegação de meses e indicadores de visitas; o código atual trata toque e rolagem vertical com cuidado.
- **Cards de agenda inteiros clicáveis**: conceito superior a muitos botões em cada item.
- **Distinção entre tipos de atendimento:** comercial, treinamento e assistência técnica.
- **Formulários comerciais e de treinamento em módulos**, com status de progresso e validação de preenchimento.
- **Busca de produtos no catálogo**, incluindo seleções múltiplas e relacionamento com perguntas específicas.
- **Editor de relatório com texto e imagens em blocos**, útil especialmente para assistência técnica e relatórios livres.
- **Rascunhos, recuperação e mensagens de salvamento**, essenciais ao trabalho em campo.
- **Histórico e visualização de relatórios**, sem depender apenas da memória do promotor.
- **Indicadores de estado**, como visita em andamento, pendente e concluída.
- **PWA com navegação inferior** e atenção às áreas seguras do celular.
- **Estados de carregamento**, animações curtas e respeito à preferência por movimento reduzido.

**Não confundir “já implementado” com “validado como ideal”:** esses são conceitos a preservar e melhorar; o acabamento e o arranjo atual não são restrições.

## 4. Antipadrões que não devem voltar

1. **Cards com 2–3 botões repetidos:** a agenda não pode virar uma parede de CTAs. **Card inteiro abre detalhes**. Um único CTA só quando o contexto realmente pede execução imediata.
2. **Tudo em uma única tela:** não mostrar simultaneamente agenda, ações, formulário, mapa, histórico e alertas competindo por atenção.
3. **Avisos genéricos:** substituir “atividade pendente” por “visita X continua em andamento desde HH:MM; finalize ou solicite regularização”.
4. **Cancelamento escondido em menus profundos:** acessível na tela de detalhes sob “Gerenciar agendamento”, com motivo e confirmação.
5. **Solicitar cadastro perfeito em momento inadequado:** permitir cadastro provisório com status explícito; somente o gestor valida definitivamente.
6. **Confundir cliente, estabelecimento e local visitado:** são entidades distintas e precisam aparecer com rótulos distintos.
7. **Forçar previsão de segundo endereço no agendamento:** **outro local é incluído durante a visita**, a partir do **card ativo na linha do tempo**.
8. **Bloquear todas as visitas antigas pendentes:** apenas uma **visita em andamento** do mesmo promotor bloqueia novo check-in.
9. **Tratar coordenada do cadastro como verdade absoluta:** permitir correção direta pelo promotor com histórico; não alterar o GPS capturado.
10. **Mostrar check-in/check-out offline como realizado:** esses comandos **exigem internet e confirmação do servidor**. Rascunhos e leituras em cache podem continuar offline.
11. **Perguntas condicionais visíveis desde o início:** revelar campos apenas após a resposta que os torna relevantes.
12. **Estados sem feedback:** nenhum clique importante pode parecer não ter ocorrido; indicar andamento, sucesso, erro e consequência.
13. **Excesso de cores e sombras:** usar a hierarquia por tipografia e espaço antes de recorrer a decorações.
14. **Protótipo de caminho feliz apenas:** incluir erros, GPS incerto, bloqueio, cadastro provisório, mídia não enviada e aprovação administrativa.

## 5. Arquitetura de navegação

### Aplicativo do promotor

Navegação inferior: **Início · Agenda · Histórico · Perfil**.

**Início** deve responder: “O que faço agora?” Apresentar o card da visita em andamento ou próxima, roteiro cronológico e apenas pendências relevantes. **Não** replicar a agenda completa.

**Agenda** responde: “O que está previsto?” Calendário compacto, lista por data e criação de visita. Cada item abre detalhe; ações secundárias pertencem ao detalhe.

**Histórico** responde: “O que foi registrado?” Busca e filtros, consulta dos eventos e relatórios. Registros finais devem distinguir evidências automáticas de declarações ajustadas.

**Perfil** responde: “Quem está conectado e como obtenho ajuda?” Conta, ajuda e solicitações do próprio usuário.

### Painel do gestor e administrador

Arquitetura própria e separada, com ao menos: **Visão operacional, Visitas, Clientes, Solicitações, Relatórios, Usuários, Auditoria**. Permissões e menus diferentes para Gestor e Administrador. A aprovação de cadastros provisórios é função de gestor; edição direta de coordenadas pelos promotores gera trilha de auditoria consultável.

## 6. Padrões de tela e componentes

### 6.1. Anatomia básica de tela mobile

1. Topo enxuto: retorno quando necessário; título com propósito claro.
2. Contexto atual: cliente, tipo, horário, status.
3. Conteúdo principal: uma tarefa ou um conjunto coeso de módulos.
4. Ação principal perceptível, preferencialmente no fim do conteúdo ou em área fixa quando não obscurecer campos.
5. Ação secundária com menor peso visual.
6. Navegação inferior apenas nas áreas raiz; em fluxos de execução, priorizar foco e retorno previsível.

### 6.2. Densidade de informação

- Cada **card de lista**: nome, natureza/status, informação temporal e local relevante, e indicador discreto de abertura. Sem fileiras de botões.
- Cada **card ativo da visita**: estado atual, tempo/horário, local e **ação principal contextual**. “Adicionar local” deve estar acessível no card ativo, mas **subordinado** à ação principal, não competindo visualmente.
- Preferir descrição de status humana a siglas administrativas.
- Diferenciar informação verificável, informada pelo promotor e pendente de revisão.
- Exibir resumo antes de detalhes extensos.

### 6.3. Formulários

- Um módulo por etapa, com tela de visão geral e indicadores **Não iniciado · Em andamento · Completo**.
- Rotular **obrigatório**, **opcional** e **condicional** corretamente. Não usar asteriscos sem legenda.
- Inputs numéricos usam teclado adequado; selecionar datas/horas com componentes previsíveis.
- Seleções múltiplas usam chips/tokens legíveis, busca e remoção simples.
- Os campos de produto consultam catálogo compartilhado; não permitir nomenclaturas livres quando há correspondência válida.
- Erro em campo aparece perto do campo, não em alerta genérico distante.
- Preferir autosave de rascunho com status explícito; **salvo no dispositivo** não é **sincronizado**.
- Ao finalizar, mostrar um resumo do que falta, com atalhos para os módulos pendentes.
- Não introduzir campo novo, simplificar regra de obrigatoriedade ou alterar lista do PRD sem registrar a alteração proposta.

### 6.4. Editor de relato e mídias

- Blocos de texto e fotografias em ordem editável.
- Até **seis fotos por módulo**, conforme regra aprovada.
- Ações claras: **Adicionar foto**, **Visualizar**, **Remover** e **Tentar reenviar**.
- Mostrar carregamento e status real de cada foto; falha de upload não pode destruir o texto do relatório.
- Preview e detalhes podem usar miniaturas; foto original deve permanecer vinculada ao registro.
- A interface não deve expor termos técnicos como R2, Firestore, chave do objeto ou assinatura de upload ao promotor.

## 7. Fluxos que obrigatoriamente precisam estar prototipados

### F01 — Agendar e visitar cliente existente

Início/Agenda → Buscar cliente → Ver correspondência por nome/CNPJ → Definir data/hora/tipo → Agendar → Abrir detalhes → Check-in com conexão → Relatório → Check-out com conexão → Histórico.

### F02 — Cliente novo e provisório

Busca sem resultado → Cadastro rápido → Consulta CNPJ (se disponível) → Confirmar/sinalizar endereço → Salvar **Pendente de validação** → Criar visita → Gestor avalia no painel → Cadastro **Validado** ou devolvido para correção.

**Importante:** endereço incompleto não deve se converter visualmente em “validado” porque o promotor tocou em Salvar.

### F03 — Nova parada que surge durante o atendimento

Visita **Em andamento** → Card ativo na **linha do tempo** → “Adicionar local” → Selecionar tipo (obra, residência, estabelecimento, outro) → Referência/endereço possível → Confirmar saída da parada anterior → Estado **Em deslocamento** → Confirmar chegada ao novo local **com conexão** → Registro simples → **Opcional:** abrir relatório técnico completo → Concluir etapa → Check-out geral → Histórico consolidado por local.

**Não** adicionar locais extras ao agendar. Não criar automaticamente um novo cliente comercial. Exibir claramente o cliente principal e o local atual. Cada parada conserva seus próprios eventos e evidências.

### F04 — Visita anterior ainda em andamento

Início/Agenda → Tentativa de novo check-in → Informar qual visita está aberta → Ir para a visita original → Concluir ou solicitar regularização → Reavaliar possibilidade de iniciar outra visita.

### F05 — Cancelamento

Agenda → Detalhes → Gerenciar → Cancelar → Selecionar motivo → Confirmar → Histórico como Cancelada, com justificativa. Não apagar silenciosamente.

### F06 — GPS cadastrado errado

Detalhe de cliente/local → Indicar divergência → Corrigir coordenada diretamente → Confirmar → Histórico da mudança (autor, data, ponto anterior, ponto novo). GPS original de uma visita **não** pode ser alterado.

### F07 — Check-in/check-out sem internet

Botão indisponível + explicação clara → Preservar informações já digitadas localmente → Repetir tentativa quando houver conexão. **Nunca** apresentar horário offline como check-in validado pelo servidor.

### F08 — Regularização de horário

Visita → Solicitar regularização → Declarar horário e justificar → Solicitação pendente → Gestor revisa no painel separado → Aprova ou recusa → Histórico distingue hora original, hora declarada e decisão.

### F09 — Fotos e rascunho sob falha

Preencher módulo → Anexar até seis fotos → Interrupção de upload/conectividade → Rascunho local com status → Retomar → Reenviar somente o pendente → Confirmar sincronização.

### F10 — Visão e tarefas administrativas

Gestor autentica no painel separado → Filtra solicitações e cadastros → Inspeciona contexto e evidências → Aprova/recusa com registro → Resultado repercute no app do promotor.

## 8. Especificação visual inicial — hipóteses, não dogmas

Utilizar um sistema consistente, com design de aparência industrial e confiável, sem cair em estética excessivamente corporativa ou datada.

| Elemento | Direção inicial |
|---|---|
| Família tipográfica | Outfit (preservar) |
| Cor principal | Azul profundo institucional |
| Ação primária | Vermelho Advance, usado com parcimônia |
| Fundo | Neutro claro, limpo |
| Texto | Contraste alto; preferir azul quase preto para conteúdo |
| Ícones | Heroicons outline, consistentes por família e espessura |
| Espaçamento | Escala de 4 ou 8 px, sem valores improvisados a cada tela |
| Raio | Uma escala coerente para campos, cartões, modais e controles |
| Superfície | Cartões somente quando agrupam conteúdo, não como moldura universal |
| Movimento | Transições curtas, funcionais e compatíveis com `prefers-reduced-motion` |

**Sugestão:** o designer pode explorar mais de uma direção visual mantendo a marca. Apresentar 2 alternativas de tela-chave (**Início** e **Visita em andamento**) antes de expandir para todas as telas. Escolher por legibilidade, densidade e reconhecimento da tarefa — não apenas estética.

## 9. Acessibilidade e ergonomia

- Área de toque ideal ≥ **44 × 44 px**; ação primária tipicamente 48–56 px de altura.
- Tipografia de corpo preferencialmente **14–16 px**, evitando textos críticos minúsculos.
- Contraste de texto **≥ 4,5:1** para texto comum; **≥ 3:1** para elementos gráficos e texto grande, conforme WCAG, com exceções aplicáveis.
- Não depender apenas de cor para comunicar status: usar texto e, quando útil, ícone.
- Estados de foco visíveis, labels reais, navegação de teclado e suporte a leitor de tela.
- Permitir zoom de texto e não cortar nomes longos de estabelecimentos.
- Evitar gesto escondido como única forma de chegar a uma ação.
- Respeitar safe areas do sistema e teclado virtual; CTA fixo não deve cobrir o último campo.
- Reduzir animações em `prefers-reduced-motion`.
- Testar visualmente em pelo menos **360 × 800**, **390 × 844** e **430 × 932**; verificar também dispositivos pequenos e zoom ampliado.

## 10. Estados e mensagens obrigatórias

Cada tela importante deve contemplar:

- **Vazio:** sem visitas, sem clientes, sem resultados de busca, sem relatórios, sem solicitações.
- **Carregando:** busca CNPJ, catálogo, consulta de agenda, imagens, aprovação.
- **Erro recuperável:** rede, GPS negado/indisponível, CNPJ não encontrado, upload falhou.
- **Salvo localmente / sincronizando / salvo no servidor:** estados distintos.
- **Bloqueado:** nova visita impedida por outra em andamento, com ação para resolver.
- **Confirmação:** cancelamento, check-in, check-out, remoção de anexo, mudança de coordenada.
- **Permissão negada:** mensagem clara sem expor detalhes de infraestrutura.
- **Concluído:** resumo da visita, tempo, locais e relatório; acesso ao histórico.

**Regra de microcopy:** instruções objetivas, sem culpar o usuário. Exemplos:
- “Você ainda tem uma visita em andamento.”
- “Não foi possível registrar a chegada: conecte-se à internet e tente novamente.”
- “Foto salva neste dispositivo. Envio pendente.”
- “Cadastro salvo. Aguardando validação do gestor.”

## 11. Componentes e variantes do design system no Figma

Criar componentes editáveis, com Auto Layout e variantes claras:

1. `AppBar` / contexto e retorno.
2. `BottomNav` / quatro seções.
3. `VisitCard` / agendada, em andamento, concluída, cancelada, bloqueada.
4. `ActiveVisitCard` / ação primária + **Adicionar local** como ação contextual.
5. `TimelineEvent` / check-in, check-out, deslocamento, parada, relato, regularização.
6. `StatusBadge` / nome acessível e estado.
7. `FormField` / padrão, preenchido, erro, desabilitado, opcional.
8. `Select`, `MultiSelect`, `ProductSearch`, `ClientSearch`.
9. `ModuleCard` / incompleto, em edição, concluído.
10. `MediaTile` / local, enviando, enviado, erro, reenviar.
11. `Notice` / informação, atenção, erro, sucesso.
12. `ConfirmationDialog` / cancelamento, saída, mudança relevante.
13. `EmptyState`, `LoadingState`, `OfflineState`.
14. `AdminTable`, `AdminFilter`, `ReviewPanel`, `AuditTrail`.

Design tokens mínimos: tipografia, paleta semântica, espaçamento, raios, sombras (se usadas), bordas, tamanho de controles, breakpoints e motion.

Não criar uma biblioteca gigante por antecipação. Componentizar os padrões que **realmente se repetem**.

## 12. Entregáveis exigidos do agente

### Etapa A — Fundamentação (antes da alta fidelidade)

- Inventário do PRD por jornadas, telas e papéis.
- Sitemap do app mobile e do painel administrativo.
- Fluxogramas dos **10 fluxos obrigatórios** acima, incluindo estados de exceção.
- Registro de hipóteses e dúvidas de negócio (não responder por suposição).
- Duas propostas visuais comparáveis para Início e Visita em andamento, com justificativa de decisões.

### Etapa B — Design system e telas

- Tokens e componentes reutilizáveis no Figma.
- Telas mobile de Início, Agenda, Detalhe, Visita ativa, Linha do tempo, Histórico, Perfil.
- Cadastro CNPJ, provisório e validação pelo gestor.
- Módulos **completos** dos três relatórios do PRD: comercial, treinamento e assistência técnica; incluir todos os campos, opções e condições.
- Fluxo de segunda parada acionado **durante a visita**.
- Área administrativa com dashboard operacional, clientes, aprovações, relatórios, usuários e auditoria.
- Estados de carregamento, vazio, erro, bloqueio, offline, sincronização e sucesso.

### Etapa C — Prototipagem e handoff

- **Protótipo clicável**, não apenas frames organizados lado a lado.
- Múltiplos pontos de entrada, um para cada jornada relevante.
- Conexões navegáveis de retornar, iniciar, cancelar, concluir, adicionar local, salvar, reenviar, aprovar, recusar.
- Pelo menos um caminho completo do começo ao fim para cada tipo de relatório.
- Documentação de componente, comportamento, estados, validação e responsividade.
- Registro de decisões de UX: **problema → solução → por que funciona → como validar**.
- Lista de divergências entre PRD e proposta visual para aprovação, sem alterar silenciosamente requisitos.

## 13. Critérios de aceite do design

O trabalho de UX/UI só estará apto para implementação quando:

- [ ] É possível identificar a próxima ação na tela inicial sem interpretar vários CTAs concorrentes.
- [ ] Uma tela de três visitas **não** produz nove botões de ação.
- [ ] O promotor encontra cancelamento sem ajuda e entende a consequência.
- [ ] É possível adicionar uma segunda parada **depois do check-in**, pelo card ativo da linha do tempo.
- [ ] O app diferencia cliente, local inicial, parada adicional e relatório técnico.
- [ ] Cadastro provisório e validação do gestor são visualmente distintos.
- [ ] Check-in/check-out offline são bloqueados e explicados; rascunhos mantêm estado próprio.
- [ ] Edição de coordenadas preserva histórico e não altera evidência GPS original.
- [ ] Os três relatórios contêm campos, escolhas condicionais e limites previstos no PRD.
- [ ] Limite de **seis imagens por módulo** e seus estados de envio estão representados.
- [ ] O painel administrativo separado contempla fila de análise, clientes, usuários, relatórios e auditoria.
- [ ] A navegação do protótipo realmente funciona, incluindo voltar e casos de erro.
- [ ] Há componentes reutilizáveis, tokens e variantes de estado.
- [ ] O resultado passa por verificação de contraste, áreas de toque, leitura, zoom e dispositivo pequeno.
- [ ] Todas as decisões não cobertas pelo PRD estão documentadas como hipótese ou pergunta.

## 14. Erros de interpretação a evitar

- **Não** presumir que o Figma anterior equivale à especificação atual.
- **Não** criar um clone do aplicativo atual.
- **Não** transformar PRD em uma única tela extensa por formulário.
- **Não** adicionar campos de negócios, alterar obrigatoriedades ou inventar status como se fossem regras aprovadas.
- **Não** usar localização GPS como única indicação de que o endereço cadastrado está correto.
- **Não** sugerir check-in/out sem internet; é uma decisão explícita do produto.
- **Não** permitir que promotor valide definitivamente o próprio cadastro provisório.
- **Não** resumir o painel administrativo a uma tela de “aprovar/rejeitar”.
- **Não** esconder funções essenciais atrás de gestos desconhecidos.
- **Não** sacrificar legibilidade para ganhar aparência minimalista.

## 15. Prompt de execução para o agente

> Você é o designer de produto responsável pela UX/UI do Advance Check. Leia primeiro o BRD, depois o PRD atualizado e este Guia UX/UI. Construa uma proposta de produto novo, preservando os conceitos úteis do aplicativo existente, mas sem copiar suas limitações visuais. Comece pela arquitetura de informação, inventário de estados, jornadas completas e duas direções de interface. Só avance para telas em alta fidelidade depois de justificar a hierarquia e as interações. Produza telas móveis editáveis, componentes reutilizáveis e protótipos clicáveis, além do painel administrativo separado. Mantenha uma ação principal por contexto, seja rigoroso com os três formulários, o fluxo de múltiplos locais na linha do tempo, validações, imagens e estados de falha. Nunca altere silenciosamente regras aprovadas no PRD: sinalize dúvidas e propostas. Entregue o arquivo Figma organizado por páginas `01 — Fundamentos`, `02 — Fluxos`, `03 — Componentes`, `04 — Promotor`, `05 — Administração`, `06 — Protótipos`, `07 — Decisões & Handoff`.

---

### Rastreabilidade das referências atuais

Padrões de design e implementação examinados no repositório existente:
- `styles.css`: variáveis de marca, tipografia, raios, controles, mapa e agenda.
- `pwa-mobile.css`: navegação, áreas seguras, botões e dimensões móveis.
- `motion.css`: duração de movimento, transições, feedback e redução de movimento.
- `src/ui/agenda-cards.js` e `src/ui/agenda-calendar.js`: cards clicáveis e navegação temporal.
- `src/ui/commercial-report.js`, `src/ui/training-report.js`, `src/ui/assistance.js`: módulos e campos de relatórios.
- `docs/heroicons.md`: biblioteca iconográfica padrão.
- `docs/product-catalog.md`: integração do catálogo de produtos.

**Observação:** o arquivo de Figma não pôde ser inspecionado novamente nesta preparação por falta de permissão de edição na conexão disponível. Assim, as regras concretas acima foram verificadas no código e na documentação do repositório; qualquer avaliação sobre o refinamento exato das telas do Figma deverá ser feita pelo agente com acesso ao arquivo.
