# PRD — Advance Check

Product Requirements Document

**Empresa:** Advance Tintas  
**Produto:** Advance Check  
**Versão:** 1.1  
**Status:** Especificação funcional consolidada  
**Documento de referência:** BRD — Advance Check

---

## 1. Visão do produto

O Advance Check será uma aplicação mobile para planejamento, execução e documentação de atividades de campo da Advance Tintas.

O produto deverá integrar cinco capacidades principais:

1. Gestão de clientes e estabelecimentos.  
2. Planejamento e acompanhamento de visitas.  
3. Execução de atendimentos com registro de horários e localização.  
4. Relatórios específicos por modalidade de visita.  
5. Histórico operacional, regularizações e auditoria.

A experiência será orientada à execução das tarefas do promotor, reduzindo ações desnecessárias e evitando que situações excepcionais interrompam a operação sem oferecer um caminho de resolução.

### 1.1. Premissas

* Aplicativo de campo destinado exclusivamente ao uso mobile; painel administrativo separado, com interface própria para gestores e administradores.  
* Distribuição como PWA instalável.  
* Autenticação individual dos usuários.  
* Dados operacionais centralizados no Firebase.  
* Arquivos e imagens armazenados no Cloudflare R2.  
* Operação tolerante à conectividade instável para consultas e rascunhos; check-in e check-out exigirão conexão ativa com o servidor.  
* Registros de auditoria preservados.  
* Painel administrativo completo e separado do aplicativo mobile, integrante do escopo do produto.

### 1.2. Papéis

| Perfil | Acesso |
| ----- | ----- |
| Promotor | Agenda, clientes, execução de visitas, relatórios e solicitações |
| Gestor | Consulta operacional e aprovação de solicitações relacionadas à sua equipe |
| Administrador | Gestão de usuários, perfis, permissões, cadastros e configurações no painel administrativo separado |

O gestor e o administrador utilizarão um painel administrativo próprio, separado da interface mobile dos promotores. O painel deverá contemplar acompanhamento operacional, usuários, validação de cadastros, solicitações, relatórios e auditoria.

---

## 2. Arquitetura de informação e navegação

O aplicativo terá quatro áreas principais na navegação inferior.

| Área | Conteúdo |
| ----- | ----- |
| **Início** | Situação atual, próxima visita e roteiro do dia |
| **Agenda** | Calendário, agendamentos, criação e gerenciamento de visitas |
| **Histórico** | Atendimentos finalizados, cancelamentos e solicitações |
| **Perfil** | Informações pessoais, configurações, ajuda e acesso à conta |

A criação de clientes será acessível no contexto do agendamento e da consulta de estabelecimentos.

### 2.1. Tela Início

A tela inicial deverá apresentar:

* Saudação e data atual.  
* Visita em andamento, quando existir.  
* Próximo atendimento programado.  
* Lista cronológica das demais visitas do dia.  
* Avisos de pendências que exigem ação.  
* Acesso rápido à Agenda.

**Comportamento:** tocar em uma visita abre sua tela de detalhes. Os cards não devem conter vários botões concorrentes.

### 2.2. Tela Agenda

Deverá disponibilizar:

* Visualização por dia, semana e mês.  
* Indicadores de visitas por data.  
* Lista cronológica dos agendamentos.  
* Identificação do tipo e estado de cada visita.  
* Ação para criar novo agendamento.  
* Abertura dos detalhes ao selecionar uma visita.

### 2.3. Tela Histórico

Deverá permitir:

* Consulta por período.  
* Pesquisa por cliente ou estabelecimento.  
* Filtro por tipo de atendimento e status.  
* Acesso aos registros e relatórios.  
* Consulta de cancelamentos e justificativas.  
* Acompanhamento de solicitações de regularização.  
* Visualização e compartilhamento de relatórios em PDF.

---

## 3. Gestão de clientes

### 3.1. Pesquisa e cadastro por CNPJ

O fluxo de criação de cliente deverá começar pela pesquisa de registros existentes.

**Sequência:**

1. Informar nome ou CNPJ.  
2. Consultar a base interna.  
3. Se não existir, recomendar o cadastro.  
4. Consultar os dados públicos do CNPJ por meio de um serviço integrado.  
5. Apresentar os dados encontrados para confirmação.  
6. Buscar coordenada pelo endereço do CNPJ.  
7. Completar informações ausentes.  
8. Salvar o cadastro.

### 3.2. Formulário de cliente

| Campo | Tipo | Regra |
| ----- | ----- | ----- |
| CNPJ | Numérico, 14 dígitos | Validar formato e dígitos verificadores; opcional no cadastro provisório |
| Razão social | Texto | Preenchimento automático quando disponível |
| Nome fantasia | Texto | Obrigatório |
| CEP | Numérico | Consulta de endereço quando disponível |
| Logradouro | Texto | Editável |
| Número | Texto | Aceitar complemento como S/N |
| Bairro | Texto | Editável |
| Cidade | Seleção/texto | Obrigatório |
| UF | Seleção | Obrigatório |
| Complemento | Texto | Opcional |
| Coordenadas | Latitude/longitude | Sugeridas e sujeitas à confirmação |
| Observações | Texto | Opcional |

**Regras:**

* O mesmo CNPJ não poderá gerar cadastros duplicados.  
* Informações retornadas por serviços externos deverão ser confirmadas pelo usuário.  
* Um cadastro poderá existir sem CNPJ, identificado como provisório.  
* Cadastros sem CNPJ deverão passar por verificação de possíveis duplicidades por nome, cidade e endereço.  
* Os campos exigidos para validação definitiva serão conferidos pelo gestor. Um cadastro provisório só poderá assumir o estado Validado após aprovação explícita do gestor no painel administrativo.  
* O sistema deverá preservar o histórico de alterações cadastrais.  
* Opção CNPJ indisponivel \> cadastro manual provisório. 

### 3.3. Cadastro provisório

Quando o promotor não possuir todas as informações, deverá ser possível registrar inicialmente:

* Nome do estabelecimento.  
* CEP  
* Endereço restante se não puxar automaticamente pelo CEP

O cadastro terá o estado Pendente de validação. Mesmo que o promotor complete os dados, somente a aprovação do gestor no painel administrativo poderá torná-lo Validado.

Os dados poderão ser complementados posteriormente, sem obrigar o usuário a repetir informações já registradas.

Ao cadastrar, conferir se não há um cadastro existente parecido, e avisar se houver.

### 3.4. Validação geográfica

O endereço cadastrado, a coordenada sugerida pelo serviço de geocodificação e a localização GPS registrada durante uma visita serão informações distintas.

Estados possíveis da localização:

* Não informada.  
* Sugerida automaticamente.  
* Incerta.  
* Confirmada.  
* Em revisão.

O promotor poderá corrigir diretamente as coordenadas cadastradas. Toda alteração deverá registrar coordenada anterior e nova, autor, data/hora e, quando disponível, justificativa. A correção não modifica coordenadas GPS já capturadas em visitas.

**Uma divergência entre o GPS do promotor e a coordenada cadastrada não deverá bloquear automaticamente o atendimento.**

---

## 4. Planejamento e gerenciamento de visitas

### 4.1. Formulário de agendamento

| Campo | Tipo | Regra |
| ----- | ----- | ----- |
| Cliente | Busca com autocomplete | Obrigatório; permite cadastrar novo |
| Data | Seletor de data | Obrigatório |
| Horário previsto | Seletor de hora | Obrigatório |
| Tipo | Seleção única | Comercial, Treinamento ou Assistência técnica |
| Local inicial | Seleção de endereço | Utiliza o endereço do cliente por padrão |
| Observações | Texto | Opcional |

O promotor poderá editar o planejamento enquanto a visita não tiver sido iniciada. O agendamento considera somente o local inicial; não deverá exigir que o promotor preveja endereços adicionais. Novas paradas serão incluídas durante a execução da visita.

### 4.2. Estados de uma visita

| Estado | Descrição |
| ----- | ----- |
| Agendada | Atividade planejada, ainda não iniciada |
| Em andamento | Atendimento iniciado por check-in |
| Concluída | Atendimento encerrado com os requisitos atendidos |
| Cancelada | Agendamento cancelado com motivo registrado |
| Pendente de regularização | Existe uma exceção que exige análise ou correção |

A pendência de regularização poderá coexistir com o estado operacional da visita. Por exemplo, uma visita concluída poderá ter uma solicitação de ajuste de horário em análise.

### 4.3. Cancelamento

A ação **Gerenciar agendamento** deverá estar disponível na tela de detalhes.

Ao selecionar Cancelar:

1. Exibir identificação da visita.  
2. Solicitar motivo.  
3. Permitir observação complementar.  
4. Solicitar confirmação.  
5. Registrar autor, data, horário e motivo.  
6. Alterar o estado para Cancelada.

Motivos sugeridos:

* Loja fechada.  
* Responsável ausente.  
* Solicitação do cliente.  
* Imprevisto operacional.  
* Duplicidade de agendamento.  
* Outro.

O cancelamento não poderá excluir permanentemente os registros operacionais.

### 4.4. Conflitos entre visitas

O sistema deverá impedir que um mesmo promotor mantenha duas visitas simultaneamente em andamento. A validação deverá ocorrer também no servidor, para impedir check-ins simultâneos por sessões diferentes.

Quando houver impedimento, a interface deverá:

* Identificar a atividade responsável.  
* Explicar por que a próxima não pode ser iniciada.  
* Oferecer opções para continuar, concluir ou solicitar regularização.  
- Somente a existência de outra visita Em andamento para o mesmo promotor impedirá um novo check-in. Agendamentos anteriores não iniciados, mesmo atrasados, não deverão bloquear uma nova visita. 

---

## 5. Execução e linha do tempo vertical

### 5.1. Estrutura da tela de visita

Durante uma atividade, a interface será organizada em uma linha do tempo vertical. O card da visita em andamento deverá disponibilizar a ação contextual “Adicionar local”, para registrar uma parada que surgiu durante o atendimento.

Cada evento aparecerá em ordem cronológica, com informações sobre horário, local e situação.

Exemplo:

**09:12 — Check-in realizado**  
Loja Sul Color Tintas · Campinas

**09:25 — Relatório iniciado**  
Módulo Contato na loja preenchido

**10:06 — Saída da loja**  
Primeira etapa encerrada

**10:06 — Deslocamento iniciado**  
Destino: residência vinculada

**10:24 — Chegada ao segundo local**  
GPS registrado

**10:48 — Relatório atualizado**  
Fotografias e observações adicionadas

**11:05 — Atendimento concluído**  
Check-out registrado

### 5.2. Funcionamento da linha do tempo

Cada evento deverá conter, conforme aplicável:

* Identificador do evento.  
* Tipo da ocorrência.  
* Data e horário do sistema.  
* Local ou parada correspondente.  
* Responsável pela ação.  
* Descrição resumida.  
* Estado de sincronização.  
* Referência ao relatório ou evidência associada.

**Eventos possíveis:**

* Visita agendada.  
* Agendamento alterado.  
* Check-in realizado.  
* Relatório criado ou atualizado.  
* Deslocamento iniciado.  
* Chegada a outro local.  
* Saída de um local.  
* Check-out realizado.  
* Visita cancelada.  
* Regularização solicitada.  
* Regularização aprovada ou recusada.

A linha do tempo será uma visualização de eventos, não um formulário permanente de edição. A ação “Adicionar local” ficará no card ativo da visita e abrirá um fluxo próprio de inclusão da nova parada, sem sobrecarregar a linha do tempo com campos ou botões repetidos.

### 5.3. Check-in

Ao iniciar uma visita:

1. Confirmar o cliente e o local.  
2. Solicitar permissão de localização, quando necessário.  
3. Capturar horário e coordenadas disponíveis.  
4. Registrar a precisão informada pelo dispositivo.  
5. Criar o evento de entrada.  
6. Alterar o estado da visita para Em andamento.

Na ausência de GPS, o sistema deverá informar a limitação e registrar a condição de captura. O check-in exige conexão ativa e resposta de confirmação do servidor; sem internet, a ação deverá permanecer bloqueada.

### 5.4. Check-out

O encerramento deverá:

* Verificar os módulos obrigatórios do relatório.  
* Apresentar resumo da atividade.  
* Exibir horários de entrada e saída.  
* Registrar a saída com horário automático.  
* Finalizar etapas ainda abertas, quando permitido pelas regras de negócio.  
* Confirmar a conclusão e atualizar a linha do tempo.

O usuário não poderá modificar diretamente os horários automáticos. O check-out exige conexão ativa e confirmação do servidor; sem internet, o promotor poderá manter rascunhos, mas não finalizar a visita.

---

## 6. Atendimento em múltiplos locais

Uma mesma visita poderá reunir diferentes paradas relacionadas ao cliente principal, mesmo quando elas não forem conhecidas no planejamento. O agendamento não conterá um cadastro prévio de paradas adicionais.

### 6.1. Estrutura

**Visita → Paradas → Registros e evidências**

Cada parada conterá:

* Tipo do local: estabelecimento, residência, obra ou outro.  
* Nome ou referência do destino.  
* Endereço e coordenadas.  
* Finalidade do atendimento.  
* Horário de chegada.  
* Horário de saída.  
* Atividades realizadas.  
* Fotografias e observações.

### 6.2. Fluxo

1. Promotor inicia a visita no estabelecimento.  
2. Registra as atividades realizadas.  
3. No card da visita em andamento, na linha do tempo, seleciona “Adicionar local” quando surgir a necessidade de deslocamento.  
4. Informa o tipo de destino e a referência disponível.  
5. Registra a saída da parada atual.  
6. O sistema identifica o período como deslocamento.  
7. Promotor registra chegada ao novo local.  
8. Continua o atendimento e preenche os registros correspondentes.  
9. Finaliza o atendimento geral após a última parada.

### 6.3. Relatórios em diferentes paradas

Uma parada poderá conter registros de natureza diferente da atividade principal. Por padrão, a parada adicional utilizará um registro simples de local, horário, GPS, observações e fotos, com opção de abrir um relatório de assistência técnica completo quando necessário.

Exemplo: visita comercial a uma revenda, seguida de avaliação técnica em uma residência indicada pela loja.

Nesse caso:

* A visita permanece vinculada à revenda.  
* A segunda parada terá identificação e localização próprias.  
* O registro técnico será opcional e, quando selecionado, poderá utilizar os módulos completos de assistência técnica, sem obrigar seu preenchimento em toda parada.  
* O histórico consolidado identificará claramente o local de cada informação.

O atendimento a um cliente comercial independente deverá gerar uma nova visita.

---

## 7. Sistema de relatórios

O preenchimento será organizado em módulos independentes.

Cada modalidade terá uma tela de visão geral com:

* Identificação do cliente e da visita.  
* Data e horário de chegada.  
* Lista de módulos.  
* Indicador de conclusão de cada módulo.  
* Acesso a rascunhos.  
* Salvamento manual e recuperação automática de alterações locais.

O usuário poderá retornar à visão geral sem perder informações.

Os módulos obrigatórios serão verificados no encerramento da visita. Módulos opcionais não impedirão a conclusão.

### 7.1. Formulário — Visita comercial

**Finalidade:** registrar relacionamento com estabelecimentos, disponibilidade de produtos, exposição da marca e oportunidades comerciais.

#### Módulo VC-01 — Contato na loja

| Campo | Tipo | Obrigatório |
| ----- | ----- | ----- |
| Nome de quem recebeu o promotor | Texto | Sim |
| Cargo do responsável | Seleção única | Sim |
| Objetivo principal | Seleção única | Sim |

**Cargo:**

* Proprietário.  
* Gerente.  
* Comprador.  
* Vendedor.  
* Responsável técnico.

**Objetivo principal:**

* Relacionamento e levantamento de necessidades.  
* Apoio às vendas ou reposição.  
* Apresentação de produto ou lançamento.  
* Orientação aos vendedores.  
* Acompanhamento de pendência.

#### Módulo VC-02 — Disponibilidade dos produtos

O módulo será dividido em três verificações.

| Pergunta | Respostas | Comportamento |
| ----- | ----- | ----- |
| Existe algum produto com estoque baixo? | Sim / Não | Se Sim, selecionar os produtos |
| Existe falta de algum produto? | Sim / Não | Se Sim, selecionar os produtos |
| Existe algum produto com baixo giro? | Sim / Não | Se Sim, selecionar os produtos |

**Seleção de produtos:**

* Pesquisa por nome.  
* Resultados obtidos do catálogo central.  
* Seleção de múltiplos produtos.  
* Remoção individual das seleções.  
* Prevenção de seleção duplicada na mesma pergunta.

As três respostas deverão ser preenchidas para concluir o módulo.

#### Módulo VC-03 — Exposição e materiais

**Organização dos produtos:**

* Organizada e visível.  
* Necessidade de organização.  
* Ausência de exposição.  
* Não foi verificado.

**Fotografias:**

* Permitir anexar imagens da exposição.  
* Permitir até seis fotografias neste módulo de exposição, seguindo o limite geral de seis imagens por módulo.  
* Exigir evidência fotográfica quando for identificada necessidade de organização ou ausência de exposição.  
* Não exigir fotografia caso a exposição não tenha sido verificada.

**Materiais e necessidades:**

Seleção múltipla entre:

* Catálogo.  
* Cartela de cores.  
* Material de ponto de venda.  
* Material técnico.  
* Outro.

Ao selecionar Outro, exibir campo descritivo.

#### Módulo VC-04 — Relatório livre

Editor para registrar:

* Observações do atendimento.  
* Informações comerciais adicionais.  
* Comentários recebidos.  
* Acontecimentos relevantes.  
* Fotografias e imagens inseridas entre blocos de texto.

O módulo será opcional e suportará conteúdo em blocos ordenados.

#### Módulo VC-05 — Encaminhamentos

| Campo | Tipo |
| ----- | ----- |
| Oportunidade comercial identificada? | Sim / Não |
| Tipo de oportunidade | Seleção, quando aplicável |
| Descrição da oportunidade | Texto |
| Próxima ação recomendada | Texto |
| Necessita acompanhamento? | Sim / Não |

Este módulo complementa a ficha comercial com informações úteis para continuidade do relacionamento.

**Conclusão:** todos os módulos obrigatórios deverão ser preenchidos antes do check-out. Os encaminhamentos poderão ser incorporados à revisão final, conforme a validação do processo comercial.

---

### 7.2. Formulário — Treinamento

**Finalidade:** documentar capacitações realizadas com vendedores, pintores, equipes técnicas e clientes.

#### Módulo TR-01 — Planejamento

| Campo | Tipo | Obrigatório |
| ----- | ----- | ----- |
| Nome do responsável | Texto | Sim |
| Perfil dos participantes | Seleção múltipla | Sim |
| Quantidade prevista | Número inteiro | Sim |
| Quantidade presente | Número inteiro | Sim |
| Objetivo principal | Seleção única | Sim |
| Produtos incluídos no treinamento | Busca no catálogo | Não |

**Perfis disponíveis:**

* Vendedores.  
* Pintores.  
* Equipe técnica.  
* Clientes industriais.

**Objetivos:**

* Capacitar venda.  
* Orientar aplicação.  
* Corrigir dificuldade.  
* Produtos novos ou lançamentos.

#### Módulo TR-02 — Execução do treinamento

**Conteúdos e atividades realizadas:**

Seleção múltipla:

* Aplicações e argumentos de venda.  
* Preparação da superfície e do produto.  
* Aplicação, equipamentos e segurança.  
* Secagem, repintura e cura.  
* Erros frequentes e prevenção.  
* Demonstração prática.  
* Verificação do entendimento.

**Houve aplicação prática?**

* Sim.  
* Não.

Se a resposta for Sim, apresentar:

**Produtos aplicados**

Pesquisa e seleção de produtos do catálogo.

**Substratos/superfícies**

* Aço carbono.  
* Aço galvanizado.  
* Alumínio.  
* Concreto.  
* Argamassa e alvenaria.  
* Madeira.  
* Cerâmica.  
* Superfície já pintada.

**Resultado da aplicação**

* Satisfatório.  
* Parcialmente satisfatório.  
* Insatisfatório.  
* Ainda não foi possível avaliar.

**Fotografias**

Permitir até seis imagens da aplicação prática, respeitando o limite geral de seis fotografias por módulo.

Se não houver aplicação prática, ocultar os campos específicos de produto aplicado, substrato e resultado.

#### Módulo TR-03 — Relatório livre

Editor em blocos para:

* Comentários sobre o treinamento.  
* Dúvidas apresentadas.  
* Dificuldades observadas.  
* Conteúdo complementar.  
* Imagens e registros relevantes.

Opcional.

#### Módulo TR-04 — Feedback

**Avaliação do promotor**

| Campo | Tipo |
| ----- | ----- |
| O objetivo foi atingido? | Sim / Parcialmente / Não |
| Participação do grupo | Alta / Moderada / Baixa |
| Opinião do promotor | Texto opcional |

**Avaliação do responsável**

| Campo | Tipo |
| ----- | ----- |
| Satisfação do responsável | Escala de 1 a 5 ou Não respondeu |
| Opinião do responsável | Texto opcional |

A escala de satisfação deverá apresentar descrições claras de cada nota, de Muito insatisfeito a Muito satisfeito.

#### Módulo TR-05 — Revisão e conclusão

Apresentar:

* Identificação do treinamento.  
* Quantidade prevista e presente.  
* Objetivos e conteúdos registrados.  
* Produtos e superfícies envolvidos.  
* Resultado da aplicação prática, quando houver.  
* Avaliações e anexos.  
* Pendências de preenchimento.

O módulo será a etapa de revisão anterior à conclusão do atendimento.

---

### 7.3. Formulário — Assistência técnica / Visita técnica

**Finalidade:** documentar ocorrências técnicas, condições de aplicação, análises, constatações e encaminhamentos.

A ficha será dividida em seis módulos para reduzir a densidade de informações por tela.

#### Módulo AT-01 — Cliente e aplicação

| Campo | Tipo |
| ----- | ----- |
| Cliente final | Texto |
| Contato | Texto |
| Setor ou função | Texto |
| Empresa de aplicação | Texto |
| Responsável pela empresa | Texto |
| Acompanhado por | Texto |
| Equipamento ou superfície | Texto |
| Data da aplicação | Data |
| Endereço de aplicação | Endereço/local vinculado |
| Houve especificação? | Sim / Não |
| Número da especificação | Texto condicional |

O número da especificação será exibido quando a resposta for Sim.

Quando a assistência ocorrer em outro endereço, o local deverá ser vinculado à parada correspondente.

#### Módulo AT-02 — Produto e queixa

| Campo | Tipo |
| ----- | ----- |
| Produto | Busca no catálogo |
| Lote | Texto |
| Cor | Texto |
| Queixa relatada | Texto longo |
| Esquema de pintura | Texto longo |

O produto deverá ser selecionado preferencialmente pelo catálogo central, mantendo identificador e nome no registro.

#### Módulo AT-03 — Preparo e condições de aplicação

**Preparo da superfície:** campo descritivo.

**Métodos de limpeza:** seleção múltipla:

* Aspiração.  
* Thinner.  
* Desengraxante.  
* Água corrente.  
* Alta pressão (WAP).  
* Detergente.  
* Ácido muriático.  
* Outro.

**Condições climáticas**

Pergunta: houve impacto relativo a questões climáticas ou intempéries?

* Sim.  
* Não.

Se Sim, solicitar descrição da condição observada.

**Ferramentas de aplicação:** seleção múltipla:

* Pistola.  
* Flooding.  
* Rolo.  
* Airless.  
* Trincha.  
* Desempenadeira dentada.  
* Imersão.  
* Espátula.

#### Módulo AT-04 — Verificações realizadas

Seleção múltipla dos itens inspecionados:

* Aderência.  
* Aspecto visual.  
* Bolha.  
* Brilho.  
* Cobertura.  
* Condições de aplicação.  
* Diluição.  
* Equipamento de pintura.  
* Espessura.  
* Preparo da superfície.  
* Secagem.  
* Treinamento da equipe.  
* Umidade.  
* Outro.

**Medições**

| Campo | Tipo |
| ----- | ----- |
| Umidade medida | Número decimal |
| Referência ou limite | Texto |
| Observações de medição | Texto opcional |

O sistema deverá permitir informar que determinada medição não foi realizada, sem inventar um resultado.

#### Módulo AT-05 — Constatações e evidências

Editor técnico em blocos contendo:

* Constatações da assistência.  
* Análise das condições observadas.  
* Descrição das possíveis causas.  
* Fotografias do problema ou aplicação.  
* Comentários associados às imagens.  
* Outras evidências relevantes.

O editor deverá preservar a ordem entre textos e mídias.

**Campos mínimos exigidos para concluir:** produto, queixa e constatações.

#### Módulo AT-06 — Conclusão técnica

| Campo | Tipo |
| ----- | ----- |
| Ações definidas | Texto longo |
| Conclusão técnica | Texto longo |
| Resultado da assistência | Seleção única |
| Próximo passo | Texto |

**Resultados possíveis:**

* Resolvido.  
* Acompanhar.  
* Nova visita.  
* Aguardando cliente.

O relatório final consolidará todos os módulos da ficha técnica, incluindo fotografias, condições observadas e encaminhamentos.

Os relatórios deverão ter estrutura modular e preparada para permitir edição posterior de seus campos pelo painel administrativo, sem exigir reconstrução dos formulários. 

---

## 8. Catálogo central de produtos

O aplicativo utilizará uma base própria dos produtos da Advance Tintas, compartilhada entre os formulários.

### 8.1. Estrutura de cada produto

Campos mínimos:

* `id`: identificador único e estável.  
* `nome`: nome oficial do produto.  
* `nomeNormalizado`: campo de apoio à pesquisa.  
* `categoria`: grupo ou família.  
* `ativo`: disponibilidade no catálogo.  
* `updatedAt`: data de atualização.

Outras propriedades técnicas poderão ser preservadas conforme o catálogo de origem.

### 8.2. Pesquisa

O componente de busca deverá:

* Ignorar diferenças de maiúsculas e acentuação.  
* Aceitar pesquisa parcial por múltiplas palavras.  
* Priorizar nomes que começam pelo termo pesquisado.  
* Não duplicar produtos já selecionados.  
* Permitir múltipla seleção quando o módulo exigir.  
* Manter o ID do produto como referência principal.  
* Preservar também um nome de referência no relatório para leitura histórica.

### 8.3. Fonte e atualização

O catálogo será armazenado na coleção `produtos` do Firestore.

A base inicial poderá ser carregada a partir do catálogo oficial da Advance, com importação controlada e versionamento.

O aplicativo deverá manter cache local para evitar consultas repetitivas. Uma referência inicial é validade de dez minutos, ajustável conforme testes.

O usuário não poderá alterar diretamente a base oficial durante o preenchimento de relatórios. Um produto não encontrado deverá gerar indicação de cadastro ou revisão.

---

## 9. Editor de textos e fotografias

Todos os relatórios utilizarão um editor compartilhado para textos e mídias.

### 9.1. Recursos

* Blocos de texto ordenados.  
* Fotografias entre os blocos, com limite máximo de seis imagens por módulo de relatório.  
* Inserção por câmera ou galeria.  
* Pré-visualização das imagens.  
* Remoção de anexos antes de salvar.  
* Rascunho recuperável.  
* Visualização somente leitura após conclusão.  
* Geração de relatório consolidado.

### 9.2. Integração com Cloudflare R2

O R2 será responsável pelo armazenamento dos arquivos.

O Firebase armazenará apenas os registros estruturados e as referências das mídias.

**Fluxo de upload:**

1. Usuário seleciona a fotografia.  
2. Aplicativo prepara original e miniatura.(Compressão de imagem para ambos)  
3. Arquivos são mantidos temporariamente em armazenamento local.  
4. Backend valida a sessão e a permissão sobre a visita.  
5. Backend emite autorização temporária de upload.  
6. Aplicativo envia os arquivos ao R2.  
7. Firestore registra os metadados e as referências dos objetos.  
8. Interface confirma que o salvamento foi concluído.

**Metadados mínimos de mídia:**

* ID da imagem.  
* ID da visita e, quando aplicável, da parada.  
* Nome e tipo MIME.  
* Tamanho do arquivo.  
* Chave do objeto no R2.  
* Chave da miniatura.  
* Data de inclusão.  
* Usuário responsável.  
* Estado da sincronização.

As credenciais permanentes do R2 nunca deverão ser expostas ao aplicativo.

### 9.3. Falhas e recuperação

* Arquivos pendentes deverão permanecer disponíveis localmente até a confirmação do upload, respeitando os limites do dispositivo.  
* O aplicativo deverá diferenciar arquivo selecionado, enviando, enviado e salvo.  
* Falhas poderão ser reenviadas sem gerar anexos duplicados.  
* A exclusão de arquivos deverá respeitar as referências ainda existentes no Firestore.  
* Uploads sem registro correspondente deverão possuir procedimento seguro de reconciliação.  
* Fotografias privadas deverão utilizar acesso autorizado e temporário.

---

## 10. Persistência e operação offline

O aplicativo deverá continuar útil em situações de conexão instável.

### 10.1. Funcionamento local

* Cache de dados necessários à atividade.  
* Persistência de rascunhos em IndexedDB.  
* Recuperação de campos preenchidos após fechamento inesperado.  
* Armazenamento temporário de imagens ainda não enviadas.  
* Identificação de operações aguardando sincronização.  
* Reenvio controlado quando houver conectividade.

### 10.2. Estados de sincronização

* Salvo neste dispositivo.  
* Aguardando conexão.  
* Sincronizando.  
* Sincronizado.  
* Falha de sincronização.

**Regra:** dados locais não poderão ser apresentados como confirmados no servidor antes do recebimento da confirmação correspondente.

Operações críticas deverão ser idempotentes, evitando duplicação em tentativas repetidas.

### 10.3. Check-in e check-out com conexão obrigatória

Check-in e check-out só poderão ser realizados com conexão ativa e confirmação do servidor. Sem internet, o aplicativo deverá informar a restrição e bloquear esses dois comandos, sem enfileirar registros retroativos de entrada ou saída. O uso offline permanece permitido para consulta em cache e rascunhos de formulários.

* Rascunhos editados localmente poderão aguardar sincronização, sem serem confundidos com check-in ou check-out.  
* Check-in e check-out deverão possuir horário de confirmação do servidor.  
* A origem e o usuário responsável por cada evento deverão ser identificados.  
* A sincronização posterior deverá se aplicar a rascunhos e conteúdos não críticos, não à criação retroativa de check-in ou check-out.

O horário do dispositivo não deverá ser tratado como prova absoluta do momento real da ação.

---

## 11. Regularização e auditoria

### 11.1. Solicitação de horário

O promotor poderá solicitar a regularização de um registro mediante:

* Identificação da visita.  
* Evento que deseja regularizar.  
* Data e horário declarados.  
* Justificativa.  
* Envio para aprovação.

### 11.2. Aprovação

O gestor autorizado poderá, por meio do painel administrativo separado:

* Consultar a solicitação.  
* Visualizar os registros automáticos.  
* Analisar a justificativa.  
* Aprovar ou recusar.  
* Registrar o motivo da decisão.

As decisões deverão ser preservadas com data, horário e identificação do responsável.

### 11.3. Integridade dos registros

O sistema deverá armazenar separadamente:

* Registro automático original.  
* Declaração do promotor.  
* Decisão do gestor.

Nenhuma aprovação poderá sobrescrever silenciosamente o registro original.

### 11.4. Painel administrativo separado

O painel administrativo será uma aplicação própria, separada do PWA de campo, com acesso restrito aos perfis Gestor e Administrador. Deverá ser uma solução de gestão completa, não apenas uma tela simplificada para aprovações.

Módulos e responsabilidades:

* **Visão operacional:** acompanhar agendas, visitas em andamento, concluídas, canceladas e pendências por equipe e período.  
* **Gestão de usuários:** administrar contas, perfis, vínculo com equipes e permissões de acesso.  
* **Gestão de clientes:** consultar duplicidades, revisar cadastros provisórios e aprovar sua validação definitiva.  
* **Auditoria de localização:** consultar o histórico das coordenadas corrigidas diretamente pelos promotores, com versões e responsáveis.  
* **Central de regularizações:** consultar evidências originais, analisar justificativas e aprovar ou recusar solicitações.  
* **Relatórios e evidências:** pesquisar, filtrar, visualizar, exportar e acompanhar documentos e fotografias com acesso autorizado.  
* **Segurança e rastreabilidade:** registrar ações sensíveis, restringir acesso por equipe e validar as permissões no servidor.

A validação de cadastros e as aprovações serão realizadas nesse painel. Por serem necessárias ao fluxo de campo, suas funções essenciais deverão estar operacionais antes do piloto. A gestão de configurações globais e permissões sensíveis será exclusiva do administrador.

---

## 12. Arquitetura técnica

### 12.1. Componentes

| Tecnologia | Responsabilidade |
| ----- | ----- |
| Frontend PWA | Interface mobile, formulários, navegação e armazenamento temporário |
| Firebase Authentication | Autenticação e sessão dos usuários |
| Cloud Firestore | Clientes, visitas, paradas, relatórios, produtos, eventos e solicitações |
| Cloudflare R2 | Fotografias, miniaturas e arquivos |
| Cloudflare Worker ou backend equivalente | Autorização de acesso às mídias e emissão de URLs temporárias |
| IndexedDB | Rascunhos, fila de operações e arquivos pendentes |

O frontend do aplicativo mobile e o painel administrativo separado poderão ser hospedados na Vercel. O painel administrativo deverá autenticar os gestores e administradores e validar permissões em todas as operações no servidor.

### 12.2. Modelo lógico de dados

Coleções propostas:

| Coleção | Responsabilidade |
| ----- | ----- |
| `usuarios` | Perfil, permissões e vínculo operacional |
| `clientes` | Cadastros e informações comerciais |
| `locais` | Endereços, coordenadas e estados de validação |
| `atividades` | Agendamentos e estado geral das visitas |
| `atividades/{id}/paradas` | Etapas de atendimento por local |
| `atividades/{id}/eventos` | Linha do tempo e auditoria operacional |
| `relatorios` | Estrutura compartilhada, tipo e referências dos relatórios |
| `produtos` | Catálogo central de produtos |
| `solicitacoes` | Regularizações de horários e localização |
| `midias` | Referências, versões e estados de arquivos no R2 |

Os dados específicos de cada formulário poderão ser armazenados em estruturas tipadas por modalidade, vinculadas ao relatório principal.  
O Id de todos os registros devem ser padronizados com iniciais de nome, data e hora e um código único pequeno no final. 

### 12.3. Entidades fundamentais

**Cliente:** pessoa jurídica ou estabelecimento que mantém o relacionamento comercial.

**Local:** endereço físico cadastrado ou temporário.

**Atividade:** atendimento planejado e executado pelo promotor.

**Parada:** etapa de uma atividade realizada em determinado local.

**Evento:** registro cronológico de uma ocorrência.

**Relatório:** conjunto de dados preenchidos conforme a modalidade de atendimento.

**Mídia:** arquivo armazenado externamente e relacionado a um relatório ou parada.

**Solicitação:** pedido formal de regularização ou revisão.

### 12.4. Segurança

* Regras do Firestore baseadas em autenticação e permissões.  
* Promotores com acesso somente aos registros autorizados.  
* Operações privilegiadas validadas no servidor.  
* Firebase App Check como camada complementar de proteção.  
* Bucket R2 privado.  
* URLs de upload e leitura temporárias.  
* Restrições de tipo e tamanho dos arquivos.  
* Validação de propriedade da visita antes de permitir operações.  
* Logs de alterações críticas.

A arquitetura deverá observar a LGPD, especialmente no tratamento de fotografias, endereços residenciais e informações de localização. Fotografias e dados residenciais terão retenção definida de cinco anos, com controle de acesso e descarte seguro ao término do prazo, ressalvadas exigências legais aplicáveis. O marco inicial da contagem e eventuais exceções deverão constar da política de retenção.

---

## 13. Requisitos de interface e experiência

### 13.1. Design system

A interface deverá utilizar:

* Tipografia Outfit.  
* Identidade visual da Advance Check.  
* Componentes padronizados.  
* Espaçamentos consistentes.  
* Estados visuais definidos.  
* Áreas de toque adequadas a smartphones.

### 13.2. Padrões de interação

* Uma ação principal por contexto.  
* Cards utilizados preferencialmente como navegação.  
* Ações secundárias dentro dos detalhes.  
* Formulários divididos em módulos.  
* Campos condicionais exibidos apenas quando necessários.  
* Validações próximas aos respectivos campos.  
* Feedback explícito de carregamento, salvamento e erro.  
* Confirmação para ações destrutivas.  
* Proteção contra perda de alterações não salvas.

### 13.3. Componentes principais

* Card de visita.  
* Linha do tempo vertical.  
* Indicador de status.  
* Seletor de produto com autocomplete.  
* Seletor de cliente.  
* Campo de endereço com confirmação.  
* Formulário modular.  
* Editor de texto e mídia.  
* Visualizador de imagens.  
* Modal de confirmação.  
* Aviso de pendência.  
* Indicador de sincronização.  
* Resumo de conclusão.

---

## 14. Critérios de aceite

| ID | Critério |
| ----- | ----- |
| CA-01 | O promotor consegue localizar ou cadastrar um cliente antes de criar a visita |
| CA-02 | CNPJs válidos são verificados, duplicidades são identificadas e cadastros provisórios somente se tornam Validados após aprovação do gestor no painel |
| CA-03 | A agenda apresenta visitas em ordem cronológica, com estados claros; somente outra visita Em andamento bloqueia um novo check-in |
| CA-04 | Cancelar uma visita exige motivo e preserva o histórico |
| CA-05 | Check-in e check-out exigem conexão e confirmação do servidor, registrando horários automáticos e informações de localização disponíveis |
| CA-06 | Uma visita pode possuir várias paradas criadas durante a execução, com registro simples por padrão e relatório técnico opcional |
| CA-07 | Os relatórios comercial, treinamento e técnico apresentam todos os módulos obrigatórios |
| CA-08 | Produtos são selecionados a partir de um catálogo centralizado |
| CA-09 | Cada módulo aceita até seis fotografias, enviadas com segurança ao R2 e referenciadas no Firestore |
| CA-10 | Rascunhos podem ser recuperados após interrupções |
| CA-11 | A linha do tempo apresenta os eventos na ordem correta |
| CA-12 | Regularizações são analisadas no painel administrativo separado e mantêm a evidência original |
| CA-13 | A conclusão de uma visita valida o preenchimento obrigatório |
| CA-14 | O histórico permite consultar e exportar relatórios finalizados |
| CA-15 | Não ocorrem duplicações de visitas, relatórios ou mídias por reenvio de operações |

---

## 15. Etapas de desenvolvimento

### Etapa 1 — Fundação

* Autenticação.  
* Estrutura mobile e navegação.  
* Clientes e CNPJ.  
* Catálogo de produtos.  
* Agenda e agendamento.

### Etapa 2 — Operação de campo

* Check-in e check-out.  
* Linha do tempo.  
* Visitas em andamento.  
* Cancelamentos.  
* Atendimentos em múltiplos locais.

### Etapa 3 — Documentação

* Relatório comercial.  
* Relatório de treinamento.  
* Relatório de assistência técnica.  
* Editor compartilhado.  
* Firebase + R2.  
* Histórico e exportação.

### Etapa 4 — Painel administrativo, confiabilidade e validação

* Rascunhos e operação offline.  
* Recuperação de falhas.  
* Painel administrativo completo, com validação de cadastros, consultas operacionais, regularizações e aprovações.  
* Auditoria.  
* Testes de segurança e usabilidade.  
* Piloto operacional.

As etapas são uma ordem de implementação, não autorizações para lançar funcionalidades críticas sem suas validações e controles de segurança.

---

## 16. Regras de negócio aprovadas

As seguintes regras foram aprovadas para orientar a especificação e o desenvolvimento:

1. Bloqueio: somente uma visita Em andamento impede o início de outra visita pelo mesmo promotor. Agendamentos atrasados e não iniciados não bloqueiam.  
2. Cadastro: um cadastro provisório só é considerado Validado mediante aprovação do gestor no painel administrativo; preenchimento pelo promotor, sozinho, não o valida.  
3. Coordenadas: o promotor pode corrigir diretamente a coordenada cadastrada, com trilha de alteração contendo valor anterior, novo valor, autor e data/hora; evidências GPS originais permanecem imutáveis.  
4. Paradas adicionais: utilizar registro simples por padrão, com opção de abrir um relatório de assistência técnica completo quando necessário. Novas paradas surgem durante a visita, pelo card ativo da linha do tempo.  
5. Fotografias: máximo de seis imagens por módulo dos relatórios. Formatos e tamanho máximo serão validados pelo backend conforme política de upload.  
6. Conectividade: check-in e check-out exigem conexão com o servidor. Offline permite rascunhos e consulta local, sem registrar chegada ou saída retroativamente.  
7. Retenção: fotografias e dados residenciais serão mantidos por cinco anos, com descarte seguro ao final e observância de exigências legais; o marco inicial deverá ser registrado na política de retenção.  
8. Gestão: as aprovações e demais funções administrativas serão feitas em um painel administrativo completo, separado do aplicativo mobile do promotor, com permissões, filas, histórico, relatórios e auditoria.

---

**Resultado esperado**

Um aplicativo mobile completo para gestão das atividades de campo da Advance Tintas, com execução simplificada, relatórios técnicos e comerciais estruturados, suporte a múltiplos locais, rastreabilidade operacional e integração segura entre Firebase e Cloudflare R2.
