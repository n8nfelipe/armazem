# Armazém · produtos, fornecedores, vendas, pedidos e estoque

Aplicação de catálogo de produtos, categorias, fornecedores, vendas, pedidos de compra e posição de estoque com frontend Next.js, API FastAPI e PostgreSQL. Os três serviços são iniciados pelo Docker Compose.

## Acesso

A tela `/login` pede usuário e senha. No primeiro início, a API cria a conta inicial indicada por `ADMIN_USERNAME` e `ADMIN_PASSWORD` no arquivo `.env` da raiz. As senhas são armazenadas com hash Argon2 no PostgreSQL. O `.env` é local e está excluído do Git; use `.env.example` como referência para configurar outra senha.

## Iniciar

Na raiz do projeto:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000
- Documentação interativa da API: http://localhost:8000/docs

Para encerrar: `docker compose down`. Para apagar também os dados salvos no PostgreSQL: `docker compose down -v`.

## Cadastro

Cada produto tem nome, SKU único, uma categoria cadastrada, preço de venda e descrição opcional. Quantidade não faz parte do cadastro. O catálogo permite buscar por nome, SKU ou categoria, editar e remover produtos.

A área **Categorias** permite cadastrar, consultar, editar, buscar e remover categorias. Ao renomear uma categoria, os produtos vinculados são atualizados automaticamente. Categorias em uso não podem ser excluídas. Na primeira execução após a atualização, categorias já presentes nos produtos são importadas automaticamente para o novo cadastro.

O PostgreSQL guarda os registros no volume `postgres_data`. As credenciais definidas no Compose são adequadas para desenvolvimento local; altere-as antes de expor o serviço em outro ambiente.

A área **Fornecedores** permite cadastrar, buscar, editar e remover parceiros comerciais. Nome/razão social e documento são obrigatórios; pessoa de contato, e-mail, telefone, endereço e observações são opcionais. O documento não pode se repetir.

A área **Vendas** permite registrar, buscar, editar e remover vendas com múltiplos produtos e quantidades. O preço do cadastro é copiado para o item no momento da gravação, preservando o histórico mesmo quando o preço do produto muda.

A área **Pedidos** permite criar ordens de compra para um fornecedor, incluindo múltiplos produtos, quantidades, custos unitários, previsão de entrega, status e observações. Dados do fornecedor e dos produtos são preservados no pedido.

A área **Estoque** calcula o saldo de cada produto em tempo real: soma das quantidades em pedidos com status **Recebido**, menos a soma das quantidades vendidas. Pedidos em rascunho, enviados ou cancelados não geram entrada no estoque.

## Agente de reposição

A área **Agente** analisa o estoque sem usar APIs de IA ou chaves externas. Para cada produto, configure fornecedor preferencial, custo de compra, prazo de entrega e estoque alvo. O estoque mínimo é obrigatoriamente **10 unidades**.

O cálculo usa as vendas dos últimos 30 dias para estimar o consumo durante o prazo do fornecedor. O saldo projetado considera o estoque disponível e também as quantidades que já estão em pedidos com status **Rascunho** ou **Enviado**, evitando gerar pedidos duplicados.

Quando há necessidade de reposição, selecione as recomendações e use **Montar pedidos em rascunho**. O sistema agrupa os itens por fornecedor, calcula a previsão de entrega e cria ordens de compra em rascunho para revisão humana antes do envio.
