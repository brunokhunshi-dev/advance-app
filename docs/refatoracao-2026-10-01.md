# Limpeza e modularização — 01/10/2026

Continuação da auditoria, na branch `fix/auditoria-otimizacao-app`. A correção de CNPJ da main até `1916dbf` foi incorporada antes da reorganização.

## Alterações

- Removidos os dois ícones duplicados da raiz (arquivos JPEG com extensão PNG), o manifest alternativo e os SVGs usados somente por ele.
- Removida a função sem chamadas `gerarResumoAssistenciaTecnica`, o condicional vazio de instalação e o espalhamento de objeto vazio do schema.
- Extraídos módulos de domínio, dados, localização e interface. O coordenador `script.js` passou de aproximadamente 3.500 para 2.600 linhas; ainda concentra navegação e transações e poderá ser dividido por fluxo em etapas futuras.
- Configuração Firebase compartilhada entre app/dashboard. Interface de instalação separada; registro do worker mantido no HTML para permitir atualização quando uma versão anterior ainda serve JavaScript do cache.
- Cliente do visualizador deixou de ficar em `window`; o relatório e o nome do profissional são passados explicitamente às funções de visualização/impressão.
- Cache de clientes encapsulado, com expiração de cinco minutos, limpeza por sessão e atualização explícita após cadastro.
- Dashboard carrega clientes apenas das atividades solicitadas, com seis leituras simultâneas no máximo e sem o antigo corte arbitrário de 200 clientes. A visão individual não lê a equipe inteira.
- Consulta individual por período e limite no servidor, com índice definido e fallback compatível até sua publicação. O fallback ainda pode ler todo o histórico do profissional.
- Estatísticas da equipe calculadas uma vez por aplicação de filtros e reutilizadas. Gráficos existentes são atualizados, sem recriação em cada filtro.
- Removidas 41 declarações CSS idênticas que já eram sobrescritas em regras equivalentes. Preservados seletores, ordem e contextos de mídia/impressão; uma comparação estática confirmou os mesmos valores vencedores por propriedade no `styles.css`.
- Exportador de schema movido para `tools/`, carregado sob demanda e atualizado com CNPJ e blocos de mídia. Documentação de limites de imagens corrigida.
- Verificação de sintaxe/imports cobre os novos módulos automaticamente; testes de domínio usam imports reais, sem extrair funções do coordenador por texto.

## Validação e limites

32 testes aprovados, com dados fictícios e serviços simulados cobrem CNPJ real/legado, cache/sessão, concorrência, filtros, formulário técnico, visualizador/impressão, estatísticas, gráficos e service worker. Os dois pontos de entrada são ligados e avaliados como módulos com Firebase simulado. Isso verifica imports/exports e inicialização de módulos, não representa um teste visual de ponta a ponta.

Nenhuma regra, índice ou dado foi publicado no Firebase. Não houve gravação no R2. A migração de revisões para subcoleções e a trava de check-in entre dispositivos dependem de alterações coordenadas no backend/regras, ausentes deste repositório, e continuam pendentes. A organização do CSS ainda conserva ajustes responsivos e de impressão legítimos; esta etapa removeu somente redundâncias comprovadas, sem redesenhar telas.
