# Fluxo de processo — Central CP

## Papéis

| Papel | O que faz | Escopo de visão |
|---|---|---|
| `departamento` | Lança notas do seu setor | Só as próprias notas |
| `gestor` | Aprova ou reprova notas do seu setor | Notas do seu setor (exceto rascunho) |
| `contas_a_pagar` (CSC) | Lança no Group, abre chamado, confirma pagamento, trata pendências | Todas as notas não-rascunho, de qualquer setor |

Cada usuário pertence a um `setor` (`Marketing`, `Operações` ou `Financeiro`), exceto `contas_a_pagar`, que atua sobre todos os setores. Essa regra é aplicada tanto na tela quanto no banco (Row Level Security no Supabase) — um gestor do Marketing não consegue ler nem aprovar uma nota da Financeiro nem via API direta.

## Ciclo de vida de uma nota

```
lancado → aprovado → em_pagamento → pago
```

1. **Lançamento** — departamento registra a nota (fornecedor, pagador, valor, centro de custo, classe da conta, classificação, código da classificação e, opcionalmente, rateio entre centros de custo). Status inicial: `lancado`.
2. **Aprovação** — gestor do mesmo setor aprova (`status = aprovado`) ou reprova. Reprovar não muda o status; marca a nota como `pendente` com o motivo, e ela volta para o departamento editar e reenviar.
3. **Lançamento no Group** — contas a pagar lança a nota aprovada no ERP e abre chamado no Acelerato (`status = em_pagamento`, grava `numero_chamado`).
4. **Pagamento** — contas a pagar confirma o pagamento (`status = pago`, grava `data_pagamento`).

Em qualquer etapa (exceto `lancado`), contas a pagar pode marcar uma **pendência** (divergência, boleto vencido, etc.) e depois resolvê-la, sem mudar o status da nota.

## Rateio

Uma nota pode ser dividida entre mais de um centro de custo. O valor do centro de custo principal (informado no formulário) é o valor bruto menos a soma dos rateios lançados. Cada linha de rateio tem seu próprio valor, classe da conta e centro de custo (tabela `nota_rateios`).

## Permissões (RLS)

Implementadas como policies no Postgres (ver `supabase/schema.sql`), não só no front-end:
- **Select** de notas: departamento só vê as próprias; gestor só vê as do seu setor (e nunca rascunho); contas a pagar vê todas as não-rascunho.
- **Insert** de notas: só departamento, e só com `criado_por` e `setor` iguais aos do próprio usuário.
- **Update** de notas: cada papel só pode atualizar notas nos status compatíveis com sua etapa do fluxo (ver comentário no `schema.sql` sobre por que o `WITH CHECK` é mais permissivo que o `USING`).

## Alçada e cascata — **pendente de definição**

O fluxo atual tem **uma única aprovação por gestor do setor**, sem regra de valor. Ainda não implementado (aguardando definição das regras de negócio):
- **Alçada por valor**: a partir de que valor uma nota exige um segundo aprovador? Existe mais de uma faixa (ex.: gestor até R$ X, diretoria acima disso)?
- **Cascata**: se houver mais de um aprovador, é sequencial (só libera o 2º depois do 1º aprovar) ou paralelo? O que acontece se o 1º aprovador reprovar?

Assim que essas regras forem definidas, isso muda: `supabase/schema.sql` (nova coluna/tabela de níveis de aprovação), as RLS policies de `notas`, e a tela de aprovação em `prototype/central-cp.html`.
