# Intel de Campo 0.1 — Mapeador de estrutura do Firestore

## Finalidade

Validar a matriz de campos usada durante os testes dos três promotores, sem editar ou migrar os registros e sem tocar no BRD estratégico. O mapeamento é **amostral**, por coleção. Ele não prova completude da base.

## Execução

Requisitos: Node.js 22+, repositório atualizado nesta branch e uma conta que já tenha acesso ao Firebase Authentication.

Na raiz do repositório:

~~~sh
node tools/map-firestore-schema.mjs
~~~

Informe e-mail e senha somente no **terminal local**, nunca no GitHub, no chat ou em variáveis públicas. A senha será ocultada durante a digitação e não será persistida.

Alternativas:

~~~sh
node tools/map-firestore-schema.mjs --limit 10
node tools/map-firestore-schema.mjs --limit 60
node tools/map-firestore-schema.mjs --all-collections
node tools/map-firestore-schema.mjs --no-audit
~~~

A ferramenta coleta estrutura de até 30 documentos por coleção por padrão e consulta referências pontuais para verificar vínculos. **Somente métodos GET são usados para acessar o Firestore**. O login exige um POST exclusivamente para o Firebase Auth.

## Resultados locais (não versionar)

- schema-firestore/mapa-estrutura.json
- schema-firestore/matriz-campos.md

Contêm nomes de campos, tipos, porcentagem de presença na amostra e alertas agregados de inconsistência. Não incluem valores de documentos, IDs de registros ou tokens. **Revisar os resultados antes de compartilhar**, especialmente se houver chaves dinâmicas incomuns em mapas.

## Coleções

Por padrão: promotores, atividades, clientes, relatorios, relatorios_comerciais, relatorios_treinamentos e relatorios_assistencia_tecnica. Para expandir a análise para as demais coleções identificadas no console, usar --all-collections.

Valida relações entre atividades.ptvId, atividades.clienteId, atividades.relatorioId e os metadados do relatório vinculado. Inclui a coleção legada relatorios.

## Limitações e segurança

- **O acesso ao GitHub não equivale a acesso autenticado ao Firebase.** O mapeador precisa de login Firebase real e não pode ler dados de produção sozinho.
- As regras Firestore atualmente informadas permitem read/write a qualquer usuário autenticado: isso deve ser revisto antes de liberar o Intel a terceiros, mas este mapeador não altera as regras.
- Uma amostra de 30 documentos não garante representar dados antigos, outros promotores nem todos os campos.
- Permissões negadas, limite de cota e dados ausentes exigem diagnóstico, nunca afrouxamento automático de regras.
- Nenhum acesso ao bucket R2 é necessário para mapear a estrutura.
- Não salvar resultados contendo dados operacionais em um repositório público.

## Teste sem acesso ao Firebase

~~~sh
node --test tests/map-firestore-schema.test.mjs
~~~
