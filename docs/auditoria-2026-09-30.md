# Auditoria do Advance Check — 30/09/2026

Registro da primeira etapa. Para as alterações posteriores e o estado atual, consulte [refatoracao-2026-10-01.md](refatoracao-2026-10-01.md).

Base: `b558cf94dd29c29a3bf401b07a72f14cdad020d7` da main. Branch: `fix/auditoria-otimizacao-app`.

## Correções implementadas

| Área | Falha encontrada | Alteração |
| --- | --- | --- |
| Clientes | Visitas paralelas ao mesmo cliente geravam várias leituras antes de preencher o cache. Uma resposta antiga podia repovoar o cache após logout. | Compartilhamento da consulta em andamento, isolamento por versão de sessão e possibilidade de tentar novamente após falha. |
| Agenda | `innerHTML +=` recriava os cards anteriores a cada iteração, aumentando o trabalho com o tamanho da lista. | Montagem em memória e uma única inserção dos cards no DOM. |
| Histórico | O limite de 100 era aplicado antes de excluir visitas pendentes; agendamentos podiam esconder visitas concluídas. | Filtro de status na consulta antes do limite; fallback ordenado e limitado antes de buscar clientes. |
| Filtros do histórico | Cada troca de filtro repetia a consulta ao Firestore. | Filtragem dos dados já carregados. Abrir a tela novamente continua atualizando os dados. |
| IDs | Expressões regulares tratavam barras literais, prejudicando acentos e separação do nome. | Iniciais corretas para novos registros; IDs existentes preservados. |
| Dashboard de gestão | O máximo de 10 mil atividades só era aplicado depois de baixar todos os resultados. | Consulta ordenada com limite de 10.001 no servidor; o registro adicional permite avisar sobre truncamento. Removido fallback de gestão que lia toda a coleção. |
| Dashboard | Cada formatação criava outro objeto `Intl`, inclusive dentro dos gráficos. | Reutilização dos formatadores de data, hora e número. |
| Datas | Filtros usavam o fuso do dispositivo, enquanto os resultados eram exibidos em São Paulo. | Limites de dia em UTC−03 para o período atual da operação. |
| Relatórios no dashboard | Leitura sempre em `relatorios`, ignorando as coleções por tipo e o texto técnico estruturado. | Respeita `relatorioColecao` e lê constatações dos formatos novo e legado. |
| Modais e sessão | Uma leitura atrasada podia substituir um modal novo ou interferir em uma sessão posterior. | Invalidação por versão do modal/sessão, inclusive após fechamento e logout. |
| Upload de mídia | `Promise.all` rejeitava antes de todos os PUTs terminarem; uma exclusão podia preceder o término de outro upload. | Aguarda ambos os envios antes da limpeza de uma tentativa parcialmente falha. |
| Compressão | Piso independente de 800 px distorcia imagens panorâmicas/retratos; metadados podiam não corresponder ao blob escolhido. | Redução proporcional, dimensões do blob selecionado e erro explícito se ainda exceder 300 KB. |
| Thumbnail | Canvases intermediários na resolução da imagem aumentavam a memória para gerar apenas 96 × 96 px. | Recorte central direto em um único canvas de 96 × 96 px. |
| Previews | MutationObserver varria todo o documento para qualquer alteração de DOM. | Inspeciona apenas os elementos adicionados relevantes para mídia. |
| PWA | Registro duplicado, remoção de caches de outros apps, cache irrestrito de GETs locais e erro de cache que descartava uma resposta válida. | Registro único, limpeza exclusiva do prefixo Advance, lista finita de arquivos estáticos, assets em cache sem nova requisição e tolerância a erro de gravação. Dashboard tem seu próprio HTML offline. |

Não foi medida uma porcentagem de ganho em produção. As reduções acima decorrem dos caminhos removidos no código e dos testes controlados.

## Validação

- `npm run check`: sintaxe de todos os arquivos JavaScript alterados.
- `npm test`: 17 testes com Node, sem dependências adicionais ou credenciais. Incluem leituras concorrentes, sessão, coleção do relatório, fechamento de modal, ordenação da limpeza de upload, compressão e ciclo do service worker.
- Workflow de GitHub Actions incluído para executar os mesmos comandos em pushes e PRs.
- O teste visual em Chromium não pôde ser executado: o ambiente não possui o executável do navegador.
- Não foram feitas gravações no Firebase/R2 de produção. Login real, permissões de acesso, upload real, dispositivos iOS/Android e atualização de um PWA já instalado precisam de homologação.

## Índice do histórico

`firestore.indexes.json` contém o índice composto necessário para a consulta otimizada: coleção `atividades`, campos `ptvId ASC`, `status ASC`, `data DESC`.

O arquivo é uma definição para incorporar à configuração de índices existente do projeto, sem substituir outros índices. O índice **não foi publicado no Firebase**. Até sua criação, o app mantém a consulta de compatibilidade por profissional e exibe um aviso no console. Esse fallback ainda lê o histórico completo do profissional; apenas as 100 visitas concluídas/canceladas mais recentes seguem para enriquecimento e renderização.

## Próximas otimizações recomendadas

1. **Paginação por cursor e consultas por período na visão individual.** A visão individual do dashboard ainda lê todas as atividades do profissional. Equipe/clientes também são carregados integralmente e `loadMissingClients` pode disparar até 200 leituras simultâneas. Priorizar paginação, pesquisa de clientes no servidor e concorrência limitada. O histórico hoje mostra no máximo 100 visitas, não uma busca por toda a base.
2. **Índices e agregações para métricas.** Aplicar o índice do histórico e medir leituras/latência. Para volumes maiores, calcular totais no servidor: o dashboard de gestão atual avisa ao truncar, mas os indicadores representam somente os registros carregados.
3. **Revisões de relatórios em subcoleção.** `historico`/`revisoes` crescem dentro do mesmo documento a cada alteração. Separar revisões para reduzir transferência e evitar atingir o limite de tamanho do documento. Exige migração compatível com os registros atuais.
4. **Regras de acesso e backend de mídia versionados.** As regras do Firestore e o código do Worker R2 não estão neste repositório. A lista de administradores no frontend não substitui autorização no servidor. Auditar permissões por profissional e vínculo atividade/arquivo nesses componentes antes de afirmar que a aplicação é segura.
5. **Bundle local e testes com Emulator Suite.** O shell pode ser servido offline, mas Firebase, fontes e bibliotecas do dashboard continuam externos. O cache não garante operações offline nem login offline. Empacotar dependências, dividir módulos por funcionalidade e testar check-in/checkout/salvamento concorrente contra emuladores.
6. **Homologação visual e de conectividade.** Testar fotos HEIC, redes lentas, duas abas, mudança de conta e atualização do PWA. Medir tempo até interação, leituras por tela e memória com dados fictícios antes de definir metas quantitativas.

Manutenção do cache: alterar `CACHE_NAME` em `sw.js` sempre que o shell estático mudar; os assets são reutilizados por versão do service worker. O fuso fixo dos filtros cobre a operação atual em São Paulo; um suporte futuro a históricos de horário de verão ou outros fusos exige conversão por zona IANA.
