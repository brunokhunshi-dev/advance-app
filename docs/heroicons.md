# Padronização dos ícones — Heroicons

Todos os ícones de interface próprios do app usam Heroicons 24px outline, com traço de 1,5px. SVGs incorporados no HTML/JS e imagens de fundo no CSS são locais; nenhuma API, conta ou CDN é necessária. A licença MIT oficial está em `midia/heroicons/LICENSE`.

| Uso substituído | Heroicon |
| --- | --- |
| Início, navegação inferior | home |
| Agenda e campos de data | calendar-days |
| Visitas, navegação inferior | briefcase |
| Perfil e marcador do promotor | user |
| Filtro do histórico | adjustments-horizontal |
| Fechar telas, visualizadores, checkout, QR e pop-ups; remover fotos, produtos e superfícies | x-mark |
| Excluir visita | trash |
| Editar campos da visita | pencil-square |
| Adicionar imagens e expandir detalhes | plus |
| Recolher detalhes | minus |
| Horários na agenda, histórico e campos de hora | clock |
| Endereço nos cards e pins principal/secundários das lojas | map-pin |
| Captura de foto e fotos dos módulos comercial/treinamento | camera |
| Galeria e miniatura sem imagem disponível | photo |
| Arquivo de áudio antigo sem miniatura | musical-note |
| Arquivo de vídeo antigo e indicador de reprodução | play |
| Abrir módulos comercial/treinamento | chevron-right |
| Seletores e filtro de atividade do perfil | chevron-down |
| Telefone do perfil | phone |
| E-mail do perfil | envelope |
| Compartilhar contato | arrow-up-tray |

Foram removidos os quatro SVGs anteriores do perfil. Os pequenos sinais `+`, `−`, `×`, `›`, os emojis de câmera e os glifos de galeria/mídia também foram substituídos. O fechamento gerado pelo MapLibre recebe a máscara local `x-mark.svg`.

Logo, favicon e imagens de instalação preservam a marca Advance. QR Code é conteúdo funcional gerado a partir do contato, não um ícone. Fotografias, pontos de calendário, círculos de progresso, gráficos e controles nativos do navegador não são desenhos iconográficos substituíveis.

Validação: 116 testes aprovados, verificação sintática/importações de 59 arquivos, avaliação do ponto de entrada com Firebase simulado, auditoria de SVGs de interface/ícones CSS e ausência dos emojis/glifos anteriores. Cache PWA atualizado para v59. Não houve validação visual em navegador ou alteração de dados de produção.

Fonte: https://github.com/tailwindlabs/heroicons/tree/master/optimized/24/outline
