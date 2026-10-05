# Advance Check

Aplicativo web de visitas comerciais, treinamentos e assistência técnica. HTML/CSS e módulos JavaScript nativos, Firebase Auth/Firestore e serviço de mídia externo no Cloudflare R2.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `index.html`, `script.js` | Telas e coordenação dos fluxos do aplicativo. |
| `src/domain/` | Datas, identificadores, formatos de relatório, filtros de histórico. Funções independentes do Firebase e da interface. |
| `src/data/` | Cache de clientes por sessão, consulta compatível de CNPJ. O acesso ao banco é recebido como função. |
| `src/services/location.js` | GPS, precisão, distâncias e consultas de endereço. |
| `src/ui/` | Formulário de assistência, visualizador/impressão e interface de instalação do PWA. |
| `technical-report-editor.js` | Editor de blocos, compressão e integração com mídia. |
| `firebase-config.js` | Configuração de conexão do app, sem efeitos sobre a interface. |
| `manifest.json`, `sw.js` | Identidade e cache do PWA. O registro do worker permanece no HTML, para permitir atualizações mesmo quando o JS está em cache. |
| `midia/` | Logo e ícones efetivamente utilizados. |
| `tools/` | Exportação de banco e verificação de JavaScript. |
| `tests/` | Testes de regressão e integração dos módulos com serviços simulados. |
| `docs/` | Auditorias, decisões e documentação de mídia. |

## Verificação local

Com Node.js 22 ou superior, execute `npm run check` e `npm test`. Esses comandos não exigem instalação de dependências nem credenciais de produção. A dependência `firebase-admin` é utilizada somente por `npm run export:firestore`.

O app precisa ser servido por HTTP/HTTPS, não aberto como arquivo local. Para desenvolvimento, um servidor estático como `python3 -m http.server 8080` é suficiente. O preview utiliza o projeto definido em `firebase-config.js`: criar uma branch não cria um banco de testes.

## Dados e compatibilidade

- Novos clientes com CNPJ usam `codigoCnpj` com o número real, conforme a correção da main. A busca também reconhece `cnpj` e o código hexadecimal antigo.
- Relatórios antigos sem coleção explícita continuam sendo lidos em `relatorios`. Novos relatórios mantêm as coleções por tipo.
- O modelo persistido de revisões e as regras do Firestore não são alterados por esta refatoração.
- `firestore.indexes.json` define os índices do histórico. Incorporar essas definições à configuração existente do projeto, preservando outros índices.

## Cache e publicação

Ao mudar HTML, CSS ou módulos do app, atualizar `CACHE_NAME` em `sw.js`. Novos módulos locais utilizados pelo app devem ser incluídos em `APP_SHELL`; os testes verificam os caminhos e a cobertura dos módulos. Firebase e bibliotecas externas continuam dependendo da rede/cache do navegador; não há garantia de login ou gravação offline.

Antes do merge, homologar no celular/PWA: troca de conta, cadastro por CNPJ, visita completa dos três tipos, imagens, descarte de edição, impressão e atualização de uma instalação existente. Os testes locais não substituem essa validação com Firebase/R2 e dispositivos reais.
