# Fluxo de processo — Central CP

Este documento descreve as regras de negócio do protótipo, para quem for
reimplementar o sistema com Supabase + Vercel. O protótipo (em
`prototype/central-cp.html`) já implementa todo esse fluxo client-side
usando `window.storage` (exclusivo do ambiente Claude.ai) — ele serve como
**especificação viva**, não como código para produção.

## 1. Perfis de usuário

| Perfil | Quem é | Setor obrigatório? |
|---|---|---|
| `departamento` | Quem solicita o pagamento (recebe NF + boleto do fornecedor) | Sim — Marketing, Operações ou Financeiro |
| `contas_a_pagar` | Lança no ERP "Group", abre chamado no Acelerato (CSC), confirma pagamento | Não (visão global) |
| `gerente_financeiro` | Aprovador único de **todas** as notas, de qualquer setor. Tem acesso total — vê tudo e também executa as 4 ações do contas a pagar | Não (visão global) |
| `administrador` | Acesso total como o gerente financeiro, **e também** gerencia usuários (convidar/promover/desativar) e delegações | Não (visão global) |

O papel `gestor` (aprovador por setor) não existe mais — foi substituído
pelo `gerente_financeiro`, único e global. O valor continua no enum do
banco só por compatibilidade histórica, mas nenhuma tela ou policy usa
esse papel.

### 1.1 Cadastro de usuário é fechado

Ninguém se auto-cadastra mais. Só um `administrador` cria uma conta nova
(tela Cadastros → Usuários → "Convidar usuário"): informa nome, e-mail e
perfil, e o sistema manda um e-mail com um link para a pessoa definir a
própria senha. Isso é feito por uma Edge Function (`convidar-usuario`) que
roda com a `service_role key` — só ela consegue criar linha em
`auth.users`; não existe policy de `insert` em `usuarios` para o cliente.

Um administrador também pode editar o perfil/setor de qualquer usuário, e
desativar/reativar uma conta (desativar também revoga a sessão de Auth,
não é só um flag). Um usuário comum só pode editar dados básicos do
próprio perfil — trocar o próprio `role`/`setor`/`ativo`/`email` é
bloqueado por um trigger (`bloquear_auto_promocao`), não só pela tela.

**Bootstrap**: como o cadastro é fechado, alguém precisa criar a primeira
conta de administrador rodando `supabase/criar-admin.mjs` localmente (com
a `service_role key`, nunca pelo navegador) — depois disso, todo o resto
é convidado pela própria tela do app.

### 1.2 Delegação (férias/ausência)

Um `administrador` ou `gerente_financeiro` pode criar uma delegação
(Cadastros → Delegações): titular, delegado e um período. Enquanto ativa e
dentro do período, o delegado assume as permissões do titular — tanto o
papel dele (ex: um contas a pagar cobrindo o gerente financeiro também
passa a aprovar) quanto a identidade dele (ex: um departamento cobrindo
outro vê e edita as notas do titular). O histórico da nota continua
registrando quem de fato clicou, não o titular.

Isso é resolvido inteiramente no banco por duas funções (`papeis_efetivos()`
e `pode_agir_como()`), usadas em vez de checar `role`/`criado_por`
diretamente em toda policy relevante — a UI só espelha o resultado pra
decidir o que mostrar, quem garante de verdade é a RLS.

## 2. Ciclo de vida da nota (`status`)

```
rascunho → lancado → aprovado → lancado_no_group → chamado_aberto → validado_csc → pago
              ↑pendente=true, em qualquer etapa depois de "aprovado" — devolve para o
               departamento corrigir, sem regredir o status (ver seção 2.1)
```

- **rascunho**: departamento salvou parcialmente, ainda não enviou. Só o
  criador (ou quem estiver cobrindo ele por delegação) vê.
- **lancado**: enviado, aguardando aprovação do gerente financeiro.
- **aprovado**: liberado para o Contas a Pagar lançar no Group.
- **lancado_no_group**: já lançada no ERP Group — falta abrir o chamado no
  Acelerato. Guarda `numero_lancamento_group` e `data_lancamento_group`.
- **chamado_aberto**: chamado aberto no Acelerato — aguardando validação do
  CSC da administradora. Guarda `numero_chamado` e `data_chamado`.
- **validado_csc**: o CSC validou o chamado — aguardando a confirmação do
  pagamento. Guarda `data_validacao_csc` e `validado_por`.
- **pago**: pagamento confirmado.

O lançamento no Group e a abertura do chamado no Acelerato são **duas ações
separadas e nessa ordem** (primeiro Group, depois Acelerato) — cada uma gera
seu próprio código/número, e os dois ficam registrados na nota (não só no
histórico) para exportação futura em Excel.

### 2.1 Pendência (`pendente`)

`pendente` é um flag independente do `status` — pode ser ligado em qualquer
etapa a partir de `aprovado` (contas a pagar encontra um problema, ou o CSC
recusa a validação do chamado) e sempre vem com um `motivo_pendencia`. Ao
marcar, o **status não muda** — a nota só sai da fila normal do contas a
pagar e entra na fila de pendências.

Quem resolve é sempre o **departamento dono da nota** (ou quem estiver
cobrindo ele por delegação) — não o contas a pagar: ele edita os dados
apontados como incorretos e devolve. Isso limpa `pendente`/`motivo_pendencia`
e mantém o `status` como estava — a nota retoma exatamente de onde parou
na esteira, sem voltar para a aprovação de novo (essa etapa já passou).

A única exceção é a pendência na etapa `lancado` (reprovada antes de
aprovar): aí sim o departamento reenvia pelo fluxo normal de aprovação
(pode voltar a cair na alçada automática se o valor foi corrigido para
dentro do limite).

`administrador` e `gerente_financeiro` não têm essa restrição — têm acesso
total e podem mover a nota para qualquer status, em qualquer momento,
inclusive pular etapas se precisarem corrigir algo manualmente.

### Regra de alçada (aprovação automática)

Se `valor_bruto <= 5000`, a nota **pula** a etapa `lancado`/aprovação do
gestor e nasce direto em `aprovado`. Isso é decidido no momento do envio
(não no momento da criação do rascunho — um rascunho de R$10.000 não decide
nada até ser efetivamente enviado).

> O limite (`5000`) deve ficar configurável, não hard-coded — hoje no
> protótipo é a constante `LIMITE_APROVACAO_GESTOR`.

### Competência

Além de data de emissão e vencimento, toda nota tem uma **competência**
(`competencia`, guardada como o dia 1 do mês, ex: `2026-06-01` para
"06/2026") — o mês contábil ao qual a despesa pertence, que pode ser
diferente do mês de emissão/vencimento. É um campo obrigatório no
lançamento (`<input type="month">` na tela), usado nos filtros de "Todas
as notas"/exportação e na aba "Notas" do Excel exportado.

## 3. Classificação contábil (cascata)

A nota é classificada usando até 4 níveis encadeados, todos vindos dos
cadastros (ver `seed/plano-de-contas.json` para a base já extraída da
planilha original):

```
Pagador (Origem) → Centro de Custo → Classe da Conta → Código da Classificação
```

- **Pagador**: Condomínio, FPP ou Consórcio.
- **Centro de Custo**: filtrado pelo Pagador (campo `origem_siglas` do
  centro de custo — ex: um centro de custo "FPP - Eventos" só aparece se o
  pagador escolhido for FPP).
- **Classe da Conta**: filtrado pelo Centro de Custo escolhido.
- **Código da Classificação**: filtrado pela Classe — **opcional**, porque
  algumas classes não têm subdivisão analítica.

### Rateio (`tem_rateio`)

Quando a nota precisa ser dividida entre múltiplos centros de custo:

- `tem_rateio = true` → os campos únicos `centro_custo_id` /
  `classe_conta_id` / `codigo_classificacao_id` da nota ficam nulos, e a
  classificação inteira vive em `nota_rateios` (uma linha por divisão).
- Cada linha de rateio tem seu próprio Centro de Custo → Classe → Código
  (os mesmos 3 níveis, mas independentes por linha) + **valor** + **descrição**.
- **Regra de validação**: a soma de `valor` de todas as linhas de rateio
  precisa ser exatamente igual ao `valor_bruto` da nota (tolerância de
  R$0,01 por arredondamento). Isso é validado no momento do envio, não a
  cada linha incluída.
- `tem_rateio = false` → os 3 campos da nota são usados diretamente, sem
  nenhuma linha em `nota_rateios`.

## 4. Forma de pagamento e dados bancários

- Campo `forma_pagamento`: Boleto bancário, TED ou Pix.
- Se TED ou Pix **e** o fornecedor tiver pelo menos 1 conta cadastrada, o
  campo `conta_bancaria_id` é obrigatório:
  - 1 conta cadastrada → preenche automaticamente (sem precisar escolher).
  - 2+ contas cadastradas → usuário precisa selecionar qual usar.
  - 0 contas cadastradas → bloqueia o envio com um aviso (mas permite salvar
    como rascunho).
- Se Boleto bancário → `conta_bancaria_id` fica nulo, não se aplica.

## 5. Anexos

O protótipo **não tem upload de arquivo real** — o campo `anexos` é só uma
lista de nomes de arquivo digitados manualmente, pra referência. O PDF de
fato continua sendo trocado por fora (e-mail/WhatsApp) até a versão real
implementar upload (ex: Supabase Storage).

## 6. Permissões por ação (resumo)

| Ação | Quem pode | Quando |
|---|---|---|
| Criar / salvar rascunho | `departamento` (ou delegado dele) | Sempre |
| Enviar para aprovação | `departamento` (dono da nota, ou delegado) | status = rascunho ou (lancado + pendente) |
| Aprovar / Reprovar | `gerente_financeiro`, `administrador` (ou delegado de um deles) | status = lancado, pendente = false |
| Lançar no Group | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = aprovado, pendente = false |
| Abrir chamado no Acelerato | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = lancado_no_group, pendente = false |
| Validar CSC | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = chamado_aberto, pendente = false |
| Confirmar pagamento | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = validado_csc, pendente = false |
| Marcar pendência | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = aprovado, lancado_no_group, chamado_aberto ou validado_csc |
| Corrigir e devolver pendência | `departamento` (dono da nota, ou delegado) | pendente = true e status ≠ rascunho/lancado |
| Criar / editar / excluir cadastros (fornecedor, pagador, centro de custo, classe, código) | `contas_a_pagar`, `gerente_financeiro`, `administrador` | Sempre — os demais perfis só consultam |
| Convidar / editar / desativar usuário | `administrador` | Sempre |
| Criar / revogar delegação | `administrador`, `gerente_financeiro` | Sempre |

`administrador` e `gerente_financeiro` também podem fazer **qualquer**
transição de status em **qualquer** nota, a qualquer momento (não estão
limitados à lista de status "de origem" acima) — é o que dá o "acesso
total" a esses dois perfis.

As 4 etapas do contas a pagar (Lançar no Group / Abrir chamado / Validar
CSC / Confirmar pagamento) aparecem como abas separadas na UI, e dentro de
cada aba as notas ficam **agrupadas por Pagador + Data de vencimento** —
reflete como os chamados são abertos de fato no Acelerato (um chamado por
pagador+vencimento, podendo juntar várias notas de uma vez). A ação em cada
aba é em lote: um clique aplica o mesmo código/data a todas as notas do
grupo, mas cada nota recebe sua própria entrada no histórico.

## 7. Cadastros (massa de dados)

Os 4 arquivos em `src/data/seed/` são a extração fiel das planilhas
originais do cliente (`Plano_de_Contas.xlsx` e `Fornecedores.xlsx`) e devem
ser usados como **dados de carga inicial (seed)** das tabelas
correspondentes no Supabase — não como fonte de verdade contínua. Depois da
carga inicial, os cadastros são mantidos direto na plataforma.

- `plano-de-contas.json` → `pagadores`, `centros_custo`, `classes_conta`,
  `codigos_classificacao` (3 + 27 + 101 + 500 registros).
- `fornecedores.json` → `fornecedores` + `fornecedor_contas` (872
  fornecedores, alguns com mais de uma conta bancária).

## 8. Alerta por e-mail a cada movimentação

Toda linha nova em `nota_historico` (ou seja, toda movimentação de
qualquer nota) dispara um trigger de banco (`trg_notificar_movimentacao`,
via `pg_net`, assíncrono — não trava a escrita da nota) que chama a Edge
Function `notificar-movimentacao`. Ela decide quem é responsável pela
etapa **atual** da nota (depois da movimentação) e manda um e-mail por
[Resend](https://resend.com):

| Estado da nota após a movimentação | Quem recebe |
|---|---|
| `pendente = true` (em qualquer etapa) | Departamento dono da nota |
| `status = lancado`, sem pendência | `gerente_financeiro` + `administrador` |
| `status = aprovado` / `lancado_no_group` / `chamado_aberto` / `validado_csc`, sem pendência | `contas_a_pagar` + `gerente_financeiro` + `administrador` |
| `status = pago` | Departamento dono da nota |
| `status = rascunho` | Ninguém (ainda não foi enviada) |

Precisa do secret `RESEND_API_KEY` configurado no projeto Supabase
(Project Settings → Edge Functions → Secrets). Sem essa chave, a função
responde normalmente mas não manda e-mail nenhum — não quebra o fluxo de
notas, só fica "desligada" até a chave existir.

## 9. Exportação para Excel

Botão "Exportar Excel" na tela "Todas as notas" (`src/js/export_excel.js`),
gerando um `.xlsx` com 3 abas — Notas (esteira completa), Rateio por Centro
de Custo (cobrindo 100% do valor, rateada ou não) e Resumo (subtotal e %
por centro de custo). Roda no navegador via `exceljs` carregado por CDN.

O arquivo exportado é sempre exatamente o que está filtrado na tela.
Filtros disponíveis: busca livre (fornecedor/NF/centro de custo), status,
pendência, pagador, setor, centro de custo, período (por vencimento **ou**
emissão, à escolha) e competência. Por padrão, o período vem limitado ao
**ano corrente** — com anos de histórico acumulado, carregar/exportar tudo
de uma vez ficaria pesado; o botão "Limpar filtros" remove esse limite se
for preciso um recorte maior.
