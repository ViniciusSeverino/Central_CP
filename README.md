# Central CP

Sistema de controle de contas a pagar entre setores (Marketing, Operações, Financeiro), com fluxo departamento → gestor → contas a pagar (CSC).

## Status atual

- **Em produção**: `prototype/central-cp.html` — um app single-file (HTML+CSS+JS, sem build) integrado de verdade ao Supabase (Auth + Postgres com RLS). É o que está publicado na Vercel hoje; `vercel.json` reescreve `/` para esse arquivo.
- **Banco**: Supabase (projeto `Central_CP`), schema completo em `supabase/schema.sql`, com Row Level Security aplicando as regras de papel/setor no próprio banco (não só na tela).
- **Pendente**:
  - Dados reais de seed (`src/data/seed/*.json`) — ainda vazios, aguardando planilha/export de fornecedores e plano de contas.
  - Alçada por valor e cascata de aprovação — ver `docs/fluxo-processo.md#alçada-e-cascata--pendente-de-definição`.

## Por onde a TI começa

1. Leia `docs/fluxo-processo.md` para entender o fluxo de aprovação e as regras de negócio.
2. `supabase/schema.sql` tem o schema completo (tabelas, enums, índices, policies de RLS) — é a fonte de verdade do banco.
3. `prototype/central-cp.html` é o app real hoje. As credenciais do Supabase (URL + anon key) estão hardcoded no topo do `<script>` porque é um HTML estático sem etapa de build — veja `.env.example` para o que essas variáveis representam caso o projeto migre para um app com bundler.
4. `src/data/seed/` tem o formato esperado dos dados de plano de contas e fornecedores; hoje estão vazios.

## Estrutura

```
central-cp/
├── README.md
├── prototype/central-cp.html   → o app funcional, integrado ao Supabase (é o que roda em produção)
├── docs/fluxo-processo.md      → regras de negócio: alçada, cascata, rateio, permissões
├── supabase/schema.sql         → schema completo das tabelas, enums, índices e RLS
├── src/data/seed/
│   ├── plano-de-contas.json    → pagadores / centros de custo / classes / códigos (pendente de dados reais)
│   └── fornecedores.json       → fornecedores + contas bancárias (pendente de dados reais)
├── vercel.json                 → reescreve "/" para prototype/central-cp.html
├── .env.example
└── .gitignore
```

## Deploy

- **Vercel**: deploy automático a partir do branch `main` deste repositório.
- **Supabase**: projeto já provisionado; RLS habilitada em todas as tabelas de negócio. Autenticação via Supabase Auth (e-mail/senha) — o campo "Usuário" da tela de login aceita tanto um nome de usuário quanto um e-mail de verdade.
