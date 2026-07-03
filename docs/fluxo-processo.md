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

cancelada — fora da linha principal: qualquer etapa antes de "pago" pode
            terminar aqui (ver seção 2.2), nunca o contrário.
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

**Exceção**: `administrador`/`gerente_financeiro` também lançam nota do
início ao fim (não só `departamento`). Quando é um desses dois perfis quem
lança, a nota sai direto `aprovado` **independente do valor** — eles já têm
autoridade total de aprovação, então esperar aprovação da própria nota não
faz sentido. Como não têm setor fixo, escolhem manualmente o setor da nota
na hora do lançamento.

### 2.2 Cancelamento e exclusão

Duas formas de desfazer um lançamento, dependendo de quão longe ele já foi:

- **Excluir de vez** (`DELETE`, remove a linha — rateios/histórico vão
  junto via cascade, anexos são apagados do Storage): só até a etapa
  `aprovado`, ou seja, **antes** de "lançado no Group". Nada fora do
  Central CP referencia a nota ainda, então apagar não deixa nada órfão.
  - `departamento`: só o próprio `rascunho` (nunca foi enviado).
  - `administrador`/`gerente_financeiro`: `rascunho`, `lancado` ou
    `aprovado`, de qualquer dono.
- **Cancelar** (`UPDATE status='cancelada'`, mantém a linha inteira): a
  partir de `lancado_no_group` — nesse ponto já existe um número no Group
  (e possivelmente um chamado no Acelerato) fora do Central CP, então
  apagar deixaria essa referência órfã. Cancelar tira a nota das filas
  ativas mas mantém tudo (`nota_historico` incluído) pra auditoria. Exige
  motivo (`motivo_cancelamento`) e registra quem/quando
  (`cancelado_por`/`data_cancelamento`). Só `administrador`/
  `gerente_financeiro`.
- **`pago` é definitivo**: uma nota já paga não pode ser excluída nem
  cancelada — é uma transação financeira concluída; corrigir isso exigiria
  um processo de estorno próprio, fora do escopo de "excluir lançamento".
  O banco garante isso com um trigger (`bloquear_cancelamento_de_paga`),
  não só a tela.

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

Upload real via Supabase Storage (bucket privado `anexos-notas`). Cada
arquivo é salvo com o caminho `{nota_id}/{timestamp}-{nome}`, e o campo
`anexos` da nota guarda a lista desses caminhos (não mais nomes digitados
à mão). A visibilidade de um anexo espelha a de `notas: select` — quem
pode ver a nota pode enviar, baixar (link assinado, válido por 60s) e
remover os arquivos dela. Nada é enviado/apagado de verdade até o
formulário ser salvo (cancelar descarta as duas listas sem tocar no
Storage).

## 6. Permissões por ação (resumo)

| Ação | Quem pode | Quando |
|---|---|---|
| Criar / salvar rascunho | `departamento` (ou delegado), `gerente_financeiro`, `administrador` | Sempre — os dois últimos escolhem o setor na hora |
| Enviar para aprovação | `departamento` (dono da nota, ou delegado) | status = rascunho ou (lancado + pendente) |
| Aprovar / Reprovar | `gerente_financeiro`, `administrador` (ou delegado de um deles) | status = lancado, pendente = false |
| Lançar no Group | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = aprovado, pendente = false |
| Abrir chamado no Acelerato | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = lancado_no_group, pendente = false |
| Validar CSC | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = chamado_aberto, pendente = false |
| Confirmar pagamento | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = validado_csc, pendente = false |
| Marcar pendência | `contas_a_pagar`, `gerente_financeiro`, `administrador` | status = aprovado, lancado_no_group, chamado_aberto ou validado_csc |
| Corrigir e devolver pendência | Quem lançou (dono da nota, ou delegado) — `departamento`, `gerente_financeiro` ou `administrador` | pendente = true e status ≠ rascunho/lancado |
| Excluir de vez | `departamento`: só o próprio rascunho. `gerente_financeiro`/`administrador`: rascunho, lancado ou aprovado, de qualquer dono | status ∈ {rascunho, lancado, aprovado} (antes do Group) |
| Cancelar lançamento | `gerente_financeiro`, `administrador` | status ∈ {lancado_no_group, chamado_aberto, validado_csc} — nunca `pago` |
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

Uma nota rateada vira **uma linha por item do rateio** já na própria aba
Notas (não só na aba de Rateio) — a coluna "Valor da linha" mostra o valor
daquele centro de custo específico, não o total da nota; somando por Nº NF
recupera o valor bruto original (a soma sempre bate, porque o banco já
garante isso na hora do lançamento).

O arquivo exportado é sempre exatamente o que está filtrado na tela.
Filtros disponíveis: busca livre (fornecedor/NF/centro de custo), status,
pendência, pagador, setor, centro de custo, período (por vencimento **ou**
emissão, à escolha) e competência. Por padrão, o período vem limitado ao
**ano corrente** — com anos de histórico acumulado, carregar/exportar tudo
de uma vez ficaria pesado; o botão "Limpar filtros" remove esse limite se
for preciso um recorte maior.

## 10. Importação de histórico (só administrador)

Aba **Cadastros → Importar histórico**, visível só pro `administrador`.
Serve pra carregar de uma vez lançamentos antigos, feitos antes do Central
CP existir, sem controle de esteira completo.

- **Modelo**: mesma estrutura de colunas da aba "Notas" do Exportar Excel
  (`src/js/export_excel.js` / `src/js/import_historico.js`, ver
  `COLUNAS_IMPORTACAO`) — o botão "Baixar modelo" gera essa mesma planilha
  em branco, ou dá pra reaproveitar uma exportação já feita.
- **Agrupamento**: linhas com o mesmo Nº NF + Fornecedor viram uma nota só,
  rateada entre os centros de custo de cada linha (mesma regra que a
  exportação usa no sentido inverso).
- **Campo mínimo**: só Fornecedor e Valor bruto são obrigatórios pra uma
  linha entrar na importação — todo o resto pode ficar em branco (dado
  histórico raramente tem o controle completo de hoje).
- **Dono do lançamento**: `criado_por` é sempre quem está importando (é uma
  exigência da RLS de `notas: insert` — só dá pra criar nota em nome de
  quem está logado). O nome de quem pediu de fato, quando preenchido na
  coluna "Solicitado por", fica guardado em `solicitante_historico` como
  referência — não aponta pra uma conta de usuário.
- **Status em branco**: assume `Pago` (aviso não-bloqueante) — é o caso
  mais comum pra um processo já concluído antes do sistema existir.
- **Duplicidade**: mesma NF + Fornecedor já cadastrado → linha pulada com
  aviso (não bloqueia o resto da importação).
- **Sem e-mail**: cada nota importada grava uma entrada de
  `nota_historico` com `origem = 'importacao_historica'` — o trigger de
  notificação (seção 8) ignora essas entradas, pra não disparar uma
  enxurrada de e-mails por lançamentos que já aconteceram há anos.
- Cada nota importada é uma nota normal depois de criada — dá pra
  editar/excluir/cancelar como qualquer outra, seguindo as mesmas regras
  da seção 2.2.
