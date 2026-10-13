# Armazém

Aplicação de estoque com frontend Next.js em `frontend/`, API FastAPI em
`backend/` e PostgreSQL. O agente de reposição usa regras locais por padrão;
o provedor OpenAI é opcional e executado somente no backend.

## Documentação

Use Context7 MCP para consultar documentação atual ao trabalhar com APIs,
configuração, instalação, migração ou comportamento específico de bibliotecas,
frameworks, SDKs, ferramentas CLI e serviços de nuvem. Primeiro use
`resolve-library-id`, depois `query-docs` com o ID escolhido e uma consulta
específica. Isso não é necessário para revisar código, refatorar ou analisar
regras de negócio sem dúvidas sobre uma tecnologia.

## Code Review Rules

Revise as mudanças da pull request e os caminhos afetados. Escreva os comentários
em português, com prioridade, arquivo/linha, condição que causa o problema e
impacto concreto. Reporte problemas introduzidos pela mudança com evidência no
código; não trate preferências de estilo como bugs. Declare limitações e não
afirme que testes passaram sem executá-los.

### Estoque e histórico

- O saldo disponível é a quantidade de pedidos `recebido` menos as quantidades
  vendidas. Pedidos `rascunho`, `enviado` e `cancelado` não geram entrada no saldo.
  Sinalize mudanças que contabilizem entradas antes do recebimento ou contem uma
  movimentação duas vezes. Vendas e pedidos preservam seus preços e dados
  históricos; editar cadastros não deve reescrever transações anteriores.

### Reposição e aprovação humana

- A política cadastrada exige estoque mínimo de pelo menos 10 unidades e alvo
  maior que o mínimo. A projeção inclui pedidos `rascunho` e `enviado` para evitar
  reposições duplicadas. A reposição automática cria somente pedidos em
  rascunho, agrupados por fornecedor; o envio depende de revisão humana.
  A função pura de cálculo pode receber mínimos menores nos testes; a restrição
  de 10 unidades pertence à validação da política na API.

### Autenticação e dados do agente

- Preserve a autenticação dos endpoints operacionais. Senhas, tokens e a chave
  OpenAI não podem chegar ao frontend, às respostas do chat, a logs ou ao Git.
  O chat recebe somente o contexto operacional autorizado; mudanças no provedor
  de IA devem manter as restrições de dados e o funcionamento do provedor local.
