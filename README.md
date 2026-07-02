# Central CP

Sistema de controle de contas a pagar para shopping center — fluxo
departamento → gerente financeiro (aprovação por alçada) → contas a pagar →
CSC (Acelerato), com plano de contas em cascata, cadastro de fornecedores,
cadastro fechado de usuários e delegação de função (férias/ausência).

## Status deste repositório

🟢 **Implementação real (Supabase + Vercel) já configurada, populada e em produção.**

O app vive em `index.html` + `src/js/` + `src/css/` e fala direto com o
Supabase (Postgres + Auth) via `@supabase/supabase-js`. Não tem build step:
é HTML/JS puro com módulos ES (`<script type="module">`), então funciona
tanto local quanto hospedado no Vercel sem nenhuma configuração de bundler.

O schema (`supabase/schema.sql`, já com a correção de RLS documentada nele)
está aplicado no projeto Supabase de produção, os dados de `src/data/seed/`
já foram importados (3 pagadores, 27 centros de custo, 101 classes, 500
códigos de classificação, 872 fornecedores e 603 contas bancárias) e
`src/js/config.js` já aponta para esse projeto. Não é necessário repetir os
passos de "Como colocar para rodar" abaixo para o dia a dia.

Existe também um segundo projeto Supabase só de **homologação**
(`Central_CP_Homolog`, free tier), com o mesmo `supabase/schema.sql` já
aplicado mas sem os dados reais de fornecedores/plano de contas — use-o para
testar mudanças de schema/RLS antes de aplicar em produção (ver seção
"Ambientes" abaixo). É pra isso que serve `tests/lifecycle.mjs`.

Também existe `prototype/central-cp.html` — o protótipo original, que usa
uma API de armazenamento exclusiva do ambiente Claude.ai. Ele não roda fora
de lá; está aqui só como referência histórica de como o comportamento foi
validado antes de implementar de verdade.

## Estrutura do repositório

```
central-cp/
├── index.html                     ← ponto de entrada do app real
├── package.json                   ← só para os scripts locais (não há build)
├── src/
│   ├── css/styles.css             ← visual (extraído do protótipo)
│   ├── js/
│   │   ├── config.js              ← URL/chave do Supabase + constantes (LIMITE, SETORES)
│   │   ├── supabaseClient.js      ← inicialização do cliente Supabase
│   │   ├── auth.js                ← login/logout/recuperação de senha via Supabase Auth
│   │   ├── db.js                  ← toda a leitura/escrita no banco (CRUD)
│   │   ├── state.js               ← estado em memória + helpers (formatação, cascata, papéis efetivos)
│   │   ├── toast.js               ← notificação não-bloqueante (substitui alert())
│   │   ├── export_excel.js        ← exportação para Excel (ver seção própria abaixo)
│   │   ├── ui.js                  ← tela de login, shell, navegação, filas, filtros
│   │   ├── ui_nota.js             ← formulário de nota (com busca de fornecedor), rateio, detalhe
│   │   ├── ui_cadastros.js        ← telas de cadastro (fornecedores, plano de contas, usuários, delegações)
│   │   ├── ui_modal.js            ← roteamento dos modais
│   │   ├── events_auth.js         ← eventos da tela de login/recuperação de senha
│   │   ├── events_shell.js        ← eventos do chrome do shell (nav, atualizar, sair)
│   │   ├── events_cadastros.js    ← eventos da tela de Cadastros (inclui usuários/delegações)
│   │   ├── events_notas.js        ← eventos da lista/modais de nota (maior parte da lógica)
│   │   └── app.js                 ← entrypoint fino: monta o DOM raiz e orquestra os módulos acima
│   └── data/seed/
│       ├── plano-de-contas.json   ← 3 pagadores, 27 centros, 101 classes, 500 códigos
│       └── fornecedores.json      ← 872 fornecedores + contas bancárias
├── tests/
│   └── lifecycle.mjs              ← teste de regressão do ciclo de vida completo (ver seção "Testando")
├── supabase/
│   ├── schema.sql                 ← tabelas, enums, índices, RLS e o webhook de notificação completos
│   ├── seed.mjs                   ← script de carga inicial (roda uma vez, local)
│   ├── criar-admin.mjs            ← cria a PRIMEIRA conta de administrador (bootstrap — cadastro é fechado)
│   └── functions/
│       ├── convidar-usuario/      ← Edge Function: só administrador cria/desativa/reativa usuário
│       └── notificar-movimentacao/← Edge Function: e-mail a cada movimentação de nota (via Resend)
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

### 4. Criar a primeira conta de administrador (cadastro é fechado)
Ninguém se auto-cadastra — só um `administrador` convida os outros pela
própria tela do app. Pra criar o primeiro, rode uma vez, local:
```bash
node supabase/criar-admin.mjs "Seu Nome" seu@email.com "SenhaTemporaria123"
```
Precisa do mesmo `.env` do passo 3. Depois disso, entre no app com esse
e-mail/senha e use Cadastros → Usuários → "Convidar usuário" pra criar o
resto (o convidado recebe um e-mail pra definir a própria senha).

### 5. Deploy das Edge Functions
```bash
# instale a CLI do Supabase se ainda não tiver: https://supabase.com/docs/guides/cli
supabase functions deploy convidar-usuario --project-ref <seu-project-ref>
supabase functions deploy notificar-movimentacao --project-ref <seu-project-ref>
```
`convidar-usuario` é obrigatória (é o único jeito de criar usuário depois
do bootstrap). `notificar-movimentacao` manda um e-mail a cada movimentação
de nota — pra ativar de verdade:
1. Crie uma conta grátis em [resend.com](https://resend.com) e gere uma API key.
2. Em **Project Settings → Edge Functions → Secrets** no Supabase, adicione
   `RESEND_API_KEY` com essa chave (e, opcionalmente, `RESEND_FROM` com um
   remetente verificado, e `APP_URL` com a URL do app pro link no e-mail).
Sem essa chave a função continua funcionando, só não manda e-mail nenhum.

### 6. Rodar localmente
Como é HTML/JS puro, basta servir a pasta com qualquer servidor estático.
Não dá para abrir `index.html` direto com `file://` porque módulos ES
exigem HTTP. Exemplos:
```bash
npx serve .
# ou
python3 -m http.server 8000
```
Abra `http://localhost:3000` (ou a porta que aparecer) e entre com a conta
de administrador criada no passo 4.

### 7. Testando (recomendado antes de mexer no schema ou nas policies de RLS)
```bash
npm install
npm run test:lifecycle
```
Roda `tests/lifecycle.mjs`: usa a `service_role key` (mesmo `.env` do passo
3) só pra criar as contas de teste (departamento × 2, contas a pagar,
gerente financeiro, administrador — já que o cadastro é fechado), depois
faz login normal com a anon key pra cada uma e roda o fluxo completo através
da RLS de verdade: nota acima da alçada até "pago" passando pelo gerente
financeiro, nota dentro da alçada (aprovação automática), pendência
corrigida pelo departamento, cadastro restrito a quem opera, acesso total
de administrador/gerente financeiro, delegação de um departamento pra outro,
reenvio de rascunho e rateio. Qualquer regressão de RLS (como as que já
aconteceram várias vezes — ver `docs/fluxo-processo.md`) quebra o teste em
vez de só aparecer quando alguém tentar aprovar uma nota de verdade. Ao
final, apaga tudo que criou (notas, delegação e as contas de teste,
incluindo Auth) automaticamente.

### 8. Deploy no Vercel
- Conecte o repositório no Vercel
- Não precisa configurar build command nem output directory (é estático)
- Depois do deploy, edite `src/js/config.js` de novo se trocar de projeto
  Supabase entre ambientes (dev/produção) — hoje a chave é fixa no código
  fonte, não uma variável de ambiente de runtime (ver seção de limites
  abaixo)

## Ambientes

| | Produção | Homologação |
|---|---|---|
| Projeto Supabase | `Central_CP` | `Central_CP_Homolog` |
| Schema | aplicado | aplicado (idêntico) |
| Dados de fornecedores/plano de contas | sim (872 fornecedores) | não — rode `npm run seed` se precisar |
| Quem usa | app publicado no Vercel | testar mudanças de schema/RLS antes de aplicar em produção |

Para testar contra a homologação: use `SUPABASE_URL=... SUPABASE_ANON_KEY=...
node tests/lifecycle.mjs` (o script já lê essas variáveis de ambiente antes
de cair para os valores de produção em `config.js` — não precisa editar
nada). Como o cadastro é fechado por padrão em qualquer projeto novo, o
`SUPABASE_SERVICE_ROLE_KEY` do `.env` também precisa ser o da homologação
nesse caso.

## Por onde começar a entender o código

1. Leia `docs/fluxo-processo.md` — regras de negócio.
2. `supabase/schema.sql` — modelo de dados e as policies de RLS que
   implementam quem-pode-ver-o-quê diretamente no banco. As funções
   `papeis_efetivos()`, `pode_agir_como()` e `eh_super_usuario()` (com o
   comentário logo acima de cada uma) são a peça central — encapsulam
   papel próprio + delegação ativa, usadas em toda policy relevante.
3. `src/js/db.js` — todas as operações de leitura/escrita, uma função por
   ação de negócio (aprovarNota, lancarNoGroupLote, convidarUsuario,
   criarDelegacao, etc.) em vez de CRUD genérico.
4. `src/js/app.js` — o entrypoint, mas fino de propósito: só monta o `#app`,
   define `render()`/`carregarTudo()`/`closeModal*` e chama os módulos
   `events_*.js`. A lógica de cada tela (amarração de clique, validação,
   chamada ao `db.js`) vive no `events_*.js` correspondente — comece por
   `events_notas.js`, que concentra a maior parte (formulário de nota, rateio,
   e as ações de aprovar/reprovar/lançar/pagar/pendência).

## Limites conhecidos (próximos passos sugeridos)

- **Chave do Supabase fixa no código-fonte** (`src/js/config.js`): funciona
  porque a `anon key` é pública por design (segurança vem do RLS), mas o
  ideal a médio prazo é trocar por variáveis de ambiente do Vercel + um
  pequeno passo de build, para não precisar editar código ao trocar de
  ambiente.
- **Sem paginação real na tela**: `carregarNotas()` busca tudo do banco em
  páginas de 1000 (loop com `.range()`, pra nunca truncar silenciosamente
  mesmo passando do teto padrão do PostgREST), mas continua trazendo a
  tabela inteira pra memória do navegador de uma vez, e filtrando no
  cliente. A tela "Todas as notas"/exportação já limita o período por
  padrão ao ano corrente pra não pesar a renderização — com muitos anos de
  histórico acumulado, o carregamento inicial em si vai ficar cada vez
  mais pesado, e nesse ponto vale trocar por busca paginada de verdade no
  servidor (filtro de período aplicado antes do fetch, não depois).

## Exportar para Excel

Na tela "Todas as notas", o botão **Exportar Excel** gera um `.xlsx` com a
lista já filtrada na tela (mesmo filtro de busca/status aplicado), pronto
pra analisar sem nenhum ajuste manual de formatação:

- **Aba "Notas"** — uma linha por nota, com todos os dados da esteira
  (status, datas, código do lançamento no Group, número do chamado no
  Acelerato, validação do CSC, etc.).
- **Aba "Rateio por Centro de Custo"** — uma linha por alocação de custo
  (nota sem rateio também entra, com o centro/classe/código dela e o valor
  cheio), pra somar 100% do valor exportado por centro de custo.
- **Aba "Resumo por Centro de Custo"** — subtotal e participação percentual
  já calculados, sem precisar montar tabela dinâmica.

Cabeçalho fixo, filtro automático, valores como número (não texto) com
formatação de moeda, datas como data real e cor de status igual à da tela —
tudo já vem pronto ao abrir no Excel.

A geração roda 100% no navegador com a lib `exceljs`, carregada sob demanda
via CDN (`esm.sh`) só quando o botão é clicado — mesmo padrão de import de
`@supabase/supabase-js` já usado no resto do app (`src/js/supabaseClient.js`),
sem precisar de build step nem de servidor.

