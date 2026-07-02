# Central CP

Sistema de controle de contas a pagar para shopping center — fluxo
departamento → gestor (aprovação por setor/alçada) → contas a pagar → CSC
(Acelerato), com plano de contas em cascata e cadastro de fornecedores.

## Status deste repositório

🟢 **Implementação real (Supabase + Vercel) já configurada, populada e em produção.**

O app vive em `index.html` + `src/js/` + `src/css/` e fala direto com o
Supabase (Postgres + Auth) via `@supabase/supabase-js`. Não tem build step:
é HTML/JS puro com módulos ES (`<script type="module">`), então funciona
tanto local quanto hospedado no Vercel sem nenhuma configuração de bundler.

O schema (`supabase/schema.sql`, já com a correção de RLS documentada nele)
está aplicado no projeto Supabase, os dados de `src/data/seed/` já foram
importados (3 pagadores, 27 centros de custo, 101 classes, 500 códigos de
classificação, 872 fornecedores e 603 contas bancárias) e `src/js/config.js`
já aponta para esse projeto. Não é necessário repetir os passos de "Como
colocar para rodar" abaixo — eles servem de referência para clonar isso em
outro ambiente (ex: um Supabase separado de homologação).

Também existe `prototype/central-cp.html` — o protótipo original, que usa
uma API de armazenamento exclusiva do ambiente Claude.ai. Ele não roda fora
de lá; está aqui só como referência histórica de como o comportamento foi
validado antes de implementar de verdade.

## Estrutura do repositório

```
central-cp/
├── index.html                     ← ponto de entrada do app real
├── package.json                   ← só para o script de seed (não há build)
├── src/
│   ├── css/styles.css             ← visual (extraído do protótipo)
│   ├── js/
│   │   ├── config.js              ← URL/chave do Supabase + constantes (LIMITE, SETORES)
│   │   ├── supabaseClient.js      ← inicialização do cliente Supabase
│   │   ├── auth.js                ← login/cadastro/logout via Supabase Auth
│   │   ├── db.js                  ← toda a leitura/escrita no banco (CRUD)
│   │   ├── state.js               ← estado em memória + helpers (formatação, cascata)
│   │   ├── ui.js                  ← tela de login, shell, navegação, filas
│   │   ├── ui_nota.js             ← formulário de nota, rateio, detalhe, ações
│   │   ├── ui_cadastros.js        ← telas de cadastro (fornecedores, plano de contas)
│   │   ├── ui_modal.js            ← roteamento dos modais
│   │   └── app.js                 ← entrypoint: liga eventos, orquestra tudo
│   └── data/seed/
│       ├── plano-de-contas.json   ← 3 pagadores, 27 centros, 101 classes, 500 códigos
│       └── fornecedores.json      ← 872 fornecedores + contas bancárias
├── supabase/
│   ├── schema.sql                 ← tabelas, enums, índices e Row Level Security completo
│   └── seed.mjs                   ← script de carga inicial (roda uma vez, local)
├── docs/
│   └── fluxo-processo.md          ← regras de negócio detalhadas
├── prototype/
│   └── central-cp.html            ← protótipo de referência (não roda fora do Claude.ai)
├── .env.example
└── .gitignore
```

## Como colocar para rodar

### 1. Criar o projeto no Supabase
- Crie uma conta/projeto em https://supabase.com
- Em **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e rode
- Em **Authentication → Providers**, confirme que "Email" está habilitado
  (vem habilitado por padrão)
- Em **Authentication → Settings**, se quiser pular a confirmação por
  e-mail durante os testes internos, desligue "Confirm email" temporariamente

### 2. Configurar as chaves
- Em **Project Settings → API**, copie a "Project URL" e a "anon public key"
- Edite `src/js/config.js` e cole os dois valores em `SUPABASE_URL` e
  `SUPABASE_ANON_KEY`

### 3. Popular os dados iniciais (fornecedores + plano de contas)
```bash
npm install
cp .env.example .env
# edite o .env e preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
# (a service_role key está em Project Settings → API → service_role —
#  NUNCA coloque essa chave em config.js ou em qualquer lugar do frontend)
npm run seed
```

### 4. Rodar localmente
Como é HTML/JS puro, basta servir a pasta com qualquer servidor estático.
Não dá para abrir `index.html` direto com `file://` porque módulos ES
exigem HTTP. Exemplos:
```bash
npx serve .
# ou
python3 -m http.server 8000
```
Abra `http://localhost:3000` (ou a porta que aparecer) e teste o cadastro
do primeiro usuário.

### 5. Deploy no Vercel
- Conecte o repositório no Vercel
- Não precisa configurar build command nem output directory (é estático)
- Depois do deploy, edite `src/js/config.js` de novo se trocar de projeto
  Supabase entre ambientes (dev/produção) — hoje a chave é fixa no código
  fonte, não uma variável de ambiente de runtime (ver seção de limites
  abaixo)

## Por onde começar a entender o código

1. Leia `docs/fluxo-processo.md` — regras de negócio.
2. `supabase/schema.sql` — modelo de dados e as policies de RLS que
   implementam quem-pode-ver-o-quê (departamento só vê o próprio, gestor só
   vê o setor, etc.) diretamente no banco.
3. `src/js/db.js` — todas as operações de leitura/escrita, uma função por
   ação de negócio (aprovarNota, lancarNoGroup, etc.) em vez de CRUD genérico.
4. `src/js/app.js` — onde tudo se conecta: carrega dados, renderiza,
   liga os cliques aos handlers.

## Limites conhecidos (próximos passos sugeridos)

- **Chave do Supabase fixa no código-fonte** (`src/js/config.js`): funciona
  porque a `anon key` é pública por design (segurança vem do RLS), mas o
  ideal a médio prazo é trocar por variáveis de ambiente do Vercel + um
  pequeno passo de build, para não precisar editar código ao trocar de
  ambiente.
- **Sem upload de arquivo real**: o campo de anexos ainda é só texto livre
  com o nome do arquivo. Próximo passo natural é Supabase Storage.
- **Cadastros sem controle de permissão por perfil**: qualquer usuário
  logado pode incluir/remover fornecedores e plano de contas. As policies
  de RLS hoje liberam isso para todo autenticado — aperte se quiser
  restringir por `role`.
- **Sem paginação real**: a lista de 872 fornecedores é carregada inteira
  na memória do navegador e filtrada no cliente. Funciona bem nesse volume,
  mas não escala indefinidamente — se a base crescer muito, trocar por
  busca via query (`ilike` no Supabase) com paginação.

