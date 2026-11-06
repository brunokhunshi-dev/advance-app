# BRD — Advance Check

**Business Requirements Document**

**Empresa:** Advance Tintas  
**Produto:** Advance Check  
**Versão:** 1.1  
**Status:** Requisitos de negócio aprovados

---

## 1. Visão do produto

O **Advance Check** será uma plataforma de gestão de atividades externas, desenvolvida para organizar, acompanhar e documentar visitas realizadas por representantes e promotores de campo da Advance Tintas.

A plataforma centralizará o planejamento de visitas, o cadastro de estabelecimentos, o acompanhamento dos atendimentos e a elaboração de relatórios, proporcionando maior organização operacional e visibilidade para a gestão.

O aplicativo dos promotores deverá funcionar em dispositivos móveis, com uma interface simples, rápida e adequada à rotina de trabalho externo. A gestão administrativa terá um painel próprio e separado, adequado ao acompanhamento da operação e ao gerenciamento de usuários e dados.

## 2. Objetivos de negócio

- **Organização:** centralizar o planejamento e o histórico das atividades de campo.
- **Produtividade:** reduzir etapas administrativas e facilitar a execução das visitas.
- **Confiabilidade:** registrar informações verificáveis sobre atendimentos, horários e localizações.
- **Padronização:** estabelecer processos consistentes para cadastros, visitas e relatórios.
- **Visibilidade:** oferecer aos gestores informações atualizadas sobre a operação.
- **Flexibilidade:** permitir situações não previstas no planejamento, mantendo o controle dos registros.

## 3. Usuários e responsabilidades

| Perfil        | Responsabilidades                                                                          |
| ------------- | ------------------------------------------------------------------------------------------ |
| Promotor      | Organizar visitas, cadastrar estabelecimentos, executar atendimentos e produzir relatórios |
| Gestor        | Acompanhar atividades, consultar resultados e analisar solicitações excepcionais           |
| Administrador | Gerenciar usuários, permissões, cadastros e configurações da plataforma                    |

Cada perfil terá acesso somente às informações e funcionalidades necessárias às suas responsabilidades. O painel administrativo será separado do aplicativo mobile e atenderá gestores e administradores.

## 4. Escopo funcional

### 4.1. Gestão de clientes e estabelecimentos

O sistema deverá permitir o cadastro, a consulta e a atualização de clientes e estabelecimentos atendidos.

**Requisitos:**

- Pesquisa de cadastros existentes por nome, CNPJ ou localização.
- Cadastro simplificado com informações essenciais.
- Complementação posterior de dados não obrigatórios.
- Identificação de cadastros provisórios ou pendentes de validação, cuja aprovação definitiva caberá ao gestor.
- Prevenção e identificação de possíveis duplicidades.
- Registro de endereço e coordenadas geográficas.
- Correção direta das coordenadas cadastradas pelo promotor, com histórico de alterações e preservação das evidências GPS originais.

O sistema deverá diferenciar o **cliente**, que representa o vínculo comercial, do **local de atendimento**, que representa o endereço onde determinada atividade ocorre. O preenchimento completo não tornará um cadastro provisório automaticamente validado: a validação dependerá da aprovação do gestor.

### 4.2. Planejamento e agenda

Os promotores poderão organizar suas atividades por meio de uma agenda integrada.

**Requisitos:**

- Criação de visitas com cliente, data, horário e finalidade.
- Visualização diária, semanal e mensal dos agendamentos.
- Organização cronológica das visitas.
- Consulta e edição de agendamentos.
- Cancelamento mediante registro do motivo.
- Identificação visual do estado de cada visita.
- Destaque para a próxima atividade e para pendências operacionais.
- Planejamento apenas do local inicial da visita; locais adicionais serão incluídos durante a execução, quando se tornarem necessários.

### 4.3. Execução de visitas

Cada visita deverá possuir um ciclo de execução claramente definido.

**Fluxo principal:**

Agendada → Em andamento → Concluída

Também deverão existir os estados **Cancelada** e **Pendente de regularização**, quando aplicáveis.

**Requisitos:**

- Check-in para registrar o início do atendimento, obrigatório com conexão ativa e confirmação do servidor.
- Check-out para registrar o encerramento, obrigatório com conexão ativa e confirmação do servidor.
- Captura automática de data, horário e localização.
- Acompanhamento da atividade em andamento.
- Registro de observações e evidências.
- Orientações claras diante de pendências ou impedimentos.
- Preservação dos registros originais de execução.

A plataforma deverá impedir somente a abertura de uma nova visita enquanto outra estiver Em andamento para o mesmo promotor. Agendamentos antigos e não iniciados não bloquearão novas visitas. Situações excepcionais terão fluxos próprios de resolução.

### 4.4. Atendimentos em múltiplos locais

Uma visita poderá envolver deslocamentos entre diferentes endereços relacionados ao mesmo atendimento.

**Exemplo:** um promotor visita uma revenda e posteriormente acompanha uma aplicação em uma residência indicada pelo estabelecimento.

**Requisitos:**

- Associação de múltiplos locais a uma única visita, com inclusão contextual pelo card ativo da linha do tempo durante o atendimento.
- Identificação da finalidade de cada parada.
- Registro individual de chegada, saída e localização.
- Inclusão de observações e fotografias por local, com registro simples por padrão e opção de relatório técnico completo quando necessário.
- Histórico cronológico das etapas realizadas.
- Consolidação das informações em um único atendimento.

Atendimentos comerciais independentes deverão constituir visitas distintas.

### 4.5. Relatórios de atendimento

O sistema deverá oferecer relatórios específicos conforme a finalidade da visita.

| Tipo                | Finalidade                                                                   |
| ------------------- | ---------------------------------------------------------------------------- |
| Visita comercial    | Registrar relacionamento, oportunidades, produtos e atividades comerciais    |
| Treinamento         | Documentar conteúdos apresentados, participantes e resultados                |
| Assistência técnica | Registrar ocorrências, condições observadas, análises e orientações técnicas |

Todos os relatórios deverão permitir observações, anexos fotográficos (até seis imagens por módulo) e salvamento de rascunhos.

As informações deverão permanecer vinculadas à visita e, quando necessário, ao local específico do atendimento.

### 4.6. Localização e validação

A plataforma deverá utilizar informações geográficas para contextualizar e documentar as atividades realizadas.

**Requisitos:**

- Registro de coordenadas durante as ações de campo.
- Associação de endereços aos estabelecimentos.
- Identificação de localizações não confirmadas ou divergentes.
- Edição direta de coordenadas cadastrais pelo promotor, registrando responsável, data/hora, valor anterior e novo valor.
- Preservação dos dados geográficos originalmente registrados.
- Exibição de informações relevantes para auditoria.

Divergências de localização deverão possuir procedimentos próprios de análise, sem depender exclusivamente de bloqueios automáticos.

### 4.7. Regularização de atividades

O sistema deverá oferecer mecanismos controlados para situações em que uma atividade não possa ser registrada no momento adequado.

**Requisitos:**

- Solicitação de regularização de horários.
- Registro de justificativa pelo promotor.
- Análise e decisão do gestor.
- Identificação de solicitações pendentes, aprovadas ou recusadas.
- Preservação das informações automáticas originais.
- Histórico de decisões e responsáveis.

Horários declarados pelo usuário deverão ser armazenados separadamente dos horários registrados pelo sistema.

### 4.8. Gestão administrativa

O produto incluirá **um painel administrativo completo e separado do aplicativo mobile do promotor**, voltado a gestores e administradores.

**Requisitos:**

- Acompanhamento de agendas, visitas, estados e pendências por período, equipe e promotor.
- Consulta, filtragem e exportação de relatórios e evidências.
- Gestão de usuários, perfis e permissões.
- Revisão de possíveis cadastros duplicados e aprovação de cadastros provisórios.
- Consulta da trilha de alterações de coordenadas realizadas pelos promotores.
- Aprovação ou recusa de regularizações, com justificativa e histórico.
- Auditoria de ações sensíveis e controle de acesso às informações.

As funções administrativas necessárias ao processo de campo deverão estar disponíveis antes do piloto operacional.

## 5. Diretrizes de experiência do usuário

A experiência do Advance Check deverá ser orientada pelos seguintes princípios:

**Simplicidade:** apresentar apenas as informações necessárias para a tarefa atual.

**Hierarquia:** destacar uma ação principal por contexto, evitando excesso de botões e opções simultâneas.

**Previsibilidade:** manter padrões consistentes de navegação, estados e componentes.

**Recuperação:** oferecer soluções compreensíveis para esquecimentos, erros e situações excepcionais.

**Mobilidade:** priorizar legibilidade, acessibilidade e interações rápidas em smartphones no aplicativo de campo; o painel administrativo deverá ter interface apropriada para consulta e gestão.

**Eficiência:** minimizar preenchimentos repetitivos, aproveitando informações já disponíveis no sistema.

## 6. Requisitos não funcionais

| Categoria       | Requisito                                                     |
| --------------- | ------------------------------------------------------------- |
| Segurança       | Autenticação, controle de acesso e permissões por perfil      |
| Integridade     | Preservação de registros originais e trilhas de auditoria     |
| Disponibilidade | Rascunhos e consulta local tolerantes a conexão instável; check-in e check-out somente online |
| Persistência    | Salvamento e recuperação segura de dados e rascunhos          |
| Desempenho      | Navegação e operações adequadas ao uso em dispositivos móveis |
| Privacidade     | Tratamento de dados pessoais e localização conforme a LGPD; retenção proposta de cinco anos para fotografias e dados residenciais, sujeita a revisão jurídica |
| Usabilidade     | Interface responsiva, acessível e consistente                 |
| Escalabilidade  | Possibilidade de expansão do número de usuários e atividades  |

## 7. Indicadores de sucesso

A efetividade do produto será acompanhada por indicadores operacionais.

| Indicador                        | Objetivo                                  |
| -------------------------------- | ----------------------------------------- |
| Visitas concluídas               | Acompanhar a execução do planejamento     |
| Relatórios finalizados           | Monitorar a documentação dos atendimentos |
| Cadastros validados              | Avaliar a qualidade da base de clientes   |
| Solicitações de suporte          | Identificar dificuldades de operação      |
| Regularizações solicitadas       | Acompanhar ocorrências excepcionais       |
| Tempo de resolução de pendências | Avaliar a eficiência dos processos        |
| Utilização da plataforma         | Acompanhar a adoção pelos usuários        |

As metas quantitativas serão estabelecidas conforme as necessidades e a capacidade operacional da empresa.

## 8. Fora do escopo inicial

O Advance Check não terá como objetivo inicial substituir sistemas de CRM, ERP ou ferramentas de gestão financeira.

Também não estão previstos para o escopo inicial:

- Emissão de pedidos e faturamento.
- Gestão de estoque.
- Roteirização automática otimizada.
- Rastreamento contínuo de funcionários.
- Gestão financeira ou comissionamento.

Integrações com outros sistemas poderão ser avaliadas posteriormente.

## 9. Critérios de sucesso do projeto

O produto deverá permitir que:

1. Um promotor planeje e execute visitas utilizando o próprio smartphone.
2. Clientes e locais de atendimento sejam registrados de forma padronizada.
3. Uma visita possa abranger diferentes locais sem perda de informações.
4. Check-in e check-out sejam confirmados online e suas evidências originais permaneçam preservadas.
5. Relatórios sejam preenchidos, salvos e consultados.
6. Pendências e regularizações possuam procedimentos claros.
7. Gestores acompanhem a operação, validem cadastros e aprovem regularizações em painel administrativo separado.
8. As principais atividades sejam concluídas sem necessidade recorrente de suporte.

## 9.1. Regras de operação aprovadas

- **Bloqueio:** apenas outra visita em andamento impede novo check-in do mesmo promotor.
- **Cadastro:** cadastro provisório passa a validado somente mediante aprovação do gestor.
- **Coordenadas:** promotor pode corrigir a localização cadastral, com histórico auditável.
- **Paradas:** adicionar novo local durante a visita, pelo card ativo da linha do tempo; registro simples com opção de relatório técnico.
- **Fotografias:** máximo de seis imagens por módulo de relatório.
- **Conectividade:** check-in e check-out somente online; rascunhos podem ficar locais até sincronização.
- **Retenção:** cinco anos para fotografias e dados residenciais, com política de descarte e validação jurídica.
- **Gestão:** painel administrativo próprio, separado e completo.

## 10. Entregáveis previstos

- Aplicativo de campo para promotores.
- Painel administrativo completo e separado, para gestores e administradores.
- Módulo de cadastro de clientes e locais.
- Agenda e gerenciamento de visitas.
- Sistema de relatórios.
- Mecanismos de regularização e auditoria.
- Documentação funcional e técnica.
- Testes de usabilidade e validação operacional.

---

**Resultado esperado**

Disponibilizar à Advance Tintas uma plataforma de operação de campo simples, confiável e estruturada, capaz de acompanhar desde o planejamento até a conclusão dos atendimentos, garantindo qualidade da informação, rastreabilidade e autonomia aos profissionais envolvidos.
