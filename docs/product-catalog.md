# Catálogo Advance no Firebase

O arquivo `data/produtos-advance.json` é uma cópia exata do JSON fornecido: 102 produtos, cada um com ID único. A coleção `produtos` usa `_id` como identificador do documento e preserva todas as propriedades originais, incluindo objetos e arrays aninhados, URLs e regras de migração. `catalogos_produtos/advance` preserva os metadados de origem do catálogo.

## Importação

`importar-produtos.html` permite usar uma conta existente do Advance Check com permissão de gravação nas coleções do catálogo. Ao abrir a página no domínio do aplicativo, a sessão existente é reutilizada. O botão cadastra os 103 documentos em um lote atômico e confere cada propriedade após a gravação. Não altera regras de segurança. Caso a conta não tenha permissão, use o importador administrativo.

Para validar sem credenciais:

```sh
npm run import:products -- --validate-only
```

Para cadastrar usando credenciais administrativas existentes, com as dependências do projeto instaladas:

```sh
npm run import:products -- --service-account /caminho/credencial-firebase.json
```

Também aceita Application Default Credentials. O projeto de destino é `banco-de-dados-monitor`. As credenciais ficam fora do repositório. Repetir a importação atualiza os documentos pelos mesmos IDs e não duplica produtos nem apaga produtos ausentes do arquivo. O importador só informa sucesso após verificar os valores no banco.

## Busca

Disponibilidade dos produtos consulta `produtos` uma vez e mantém cache por dez minutos. As três perguntas compartilham a leitura. A pesquisa é local sobre os produtos retornados, por nome, sem diferenciar caixa ou acentos, permitindo palavras em qualquer ordem. O seletor exibe até 12 resultados; digitar mais refina a busca. Somente produtos do catálogo podem ser adicionados. Cada seleção salva `{id, title}`, enquanto nomes dos relatórios antigos permanecem compatíveis. Erros de leitura são exibidos com opção de tentar novamente, sem substituir silenciosamente o Firebase por dados locais.
