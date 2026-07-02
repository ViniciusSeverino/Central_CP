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
| `gestor` | Aprova as notas do **seu** setor; visualiza todo o andamento do setor | Sim — mesmo enum acima |
| `contas_a_pagar` | Lança no ERP "Group", abre chamado no Acelerato (CSC), confirma pagamento | Não (visão global) |

Um gestor só vê e só pode aprovar notas cujo campo `setor` da nota seja igual
ao seu próprio `setor`.

## 2. Ciclo de vida da nota (`status`)

```
rascunho → lancado → aprovado → lancado_no_group → chamado_aberto → validado_csc → pago
              ↑pendente=true, em qualquer etapa depois de "aprovado" — devolve para o
               departamento corrigir, sem regredir o status (ver seção 2.1)
```

- **rascunho**: departamento salvou parcialmente, ainda não enviou. Só o
  criador vê.
- **lancado**: enviado, aguardando aprovação do gestor do setor.
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

Quem resolve é sempre o **departamento dono da nota** (não o contas a
pagar): ele edita os dados apontados como incorretos e devolve. Isso limpa
`pendente`/`motivo_pendencia` e mantém o `status` como estava — a nota
retoma exatamente de onde parou na esteira, sem voltar para a aprovação do
gestor de novo (essa etapa já passou).

A única exceção é a pendência na etapa `lancado` (gestor reprovou antes de
aprovar): aí sim o departamento reenvia pelo fluxo normal de aprovação
(pode voltar a cair na alçada automática se o valor foi corrigido para
dentro do limite).

### Regra de alçada (aprovação automática)

Se `valor_bruto <= 5000`, a nota **pula** a etapa `lancado`/aprovação do
gestor e nasce direto em `aprovado`. Isso é decidido no momento do envio
(não no momento da criação do rascunho — um rascunho de R$10.000 não decide
nada até ser efetivamente enviado).

> O limite (`5000`) deve ficar configurável, não hard-coded — hoje no
> protótipo é a constante `LIMITE_APROVACAO_GESTOR`.

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
| Criar / salvar rascunho | `departamento` | Sempre |
| Enviar para aprovação | `departamento` (dono da nota) | status = rascunho ou (lancado + pendente) |
| Aprovar / Reprovar | `gestor` do mesmo setor | status = lancado, pendente = false |
| Lançar no Group | `contas_a_pagar` | status = aprovado, pendente = false |
| Abrir chamado no Acelerato | `contas_a_pagar` | status = lancado_no_group, pendente = false |
| Validar CSC | `contas_a_pagar` | status = chamado_aberto, pendente = false |
| Confirmar pagamento | `contas_a_pagar` | status = validado_csc, pendente = false |
| Marcar pendência | `contas_a_pagar` | status = aprovado, lancado_no_group, chamado_aberto ou validado_csc |
| Corrigir e devolver pendência | `departamento` (dono da nota) | pendente = true e status ≠ rascunho/lancado |
| Criar / editar / excluir cadastros (fornecedor, pagador, centro de custo, classe, código) | `contas_a_pagar` | Sempre — os demais perfis só consultam |

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
