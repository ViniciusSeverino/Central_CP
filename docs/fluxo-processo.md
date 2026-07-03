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

Upload real via Supabase Storage (bucket privado `anexos-notas`). A
visibilidade de um anexo espelha a de `notas: select` — quem pode ver a
nota pode enviar, baixar (link assinado, válido por 60s) e remover os
arquivos dela. Nada é enviado/apagado de verdade até o formulário ser
salvo (cancelar descarta as duas listas sem tocar no Storage).

**Cada nota tem sempre no máximo um anexo final salvo.** Não importa
quantos arquivos (PDF ou imagem) o departamento escolher no formulário —
ao salvar, `finalizarAnexos()` (`events_notas.js`) baixa o que já existia
(se a nota estiver sendo editada), junta com os arquivos novos, e chama
`mesclarAnexosEmPdfUnico()` (`anexos_pdf.js`, via `pdf-lib` carregado por
CDN) pra transformar tudo num PDF único — página de PDF existente é
copiada como está, imagem vira uma página nova. O resultado substitui
qualquer anexo anterior no Storage (nunca fica fragmento solto) e ganha o
nome padrão da empresa:

```
BSB_{SIGLA DO PAGADOR}_{DD-MM DO VENCIMENTO}_{FORNECEDOR}_NF{Nº}_{FORMA DE PAGAMENTO}.pdf
```

Exemplo: `BSB_COND_29-07_FAZENDA_DO_BOLO_NF1080_BOLETO.pdf` (ver
`nomeArquivoFinal()` em `anexos_pdf.js`). O nome é sempre recalculado a
partir dos dados atuais da nota — se algum desses campos mudar numa
correção, o arquivo é renomeado automaticamente no próximo salvamento.

**Zip do lote ao abrir chamado**: no modal de "Abrir chamado" (fila do
`contas_a_pagar`), o botão "Baixar anexos (.zip)" (`zip_anexos.js`, via
`jszip` por CDN) baixa o anexo de cada nota selecionada no lote e monta um
`.zip` só — como cada nota já tem um único PDF com nome padronizado, o
zip fica pronto pra anexar direto no chamado do Acelerato, sem precisar
abrir nota por nota.

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

## 12. UI mobile (celular)

O app detecta automaticamente celular pelo `navigator.userAgent`
(`src/js/device.js`, `ehMobile()` — só telefone, tablet continua na UI
desktop de sempre, que já tem espaço de sobra) e troca a sidebar fixa por
um shell mobile: header + tabs horizontais roláveis + botão flutuante "+"
de nova nota (`src/js/ui_mobile.js`, `renderShellMobile()`).

**Nada do conteúdo foi duplicado.** As telas de lista (cartões), detalhe
da nota e formulário de lançamento já eram fluidas o bastante pra caber
numa tela estreita — `renderShellMobile()` chama exatamente as mesmas
`renderMain()`/`renderModalPagina()`/`renderModal()` do desktop
(`ui.js`/`ui_modal.js`), só trocando o que fica em volta. Os elementos do
shell mobile reaproveitam de propósito os MESMOS ids/atributos do desktop
(`data-view`, `#btn-logout`, `#btn-nova-nota`) — os handlers que já
existem (`attachShellHandlers()`, `attachNotaListHandlers()`) amarram
neles sem precisar de nenhum "events_mobile.js" à parte.

**v1 cobre o ciclo de vida da nota**: login, listar/ver notas de cada
fila (mesma regra de `navItemsFor()` por perfil), aprovar/reprovar, ações
em lote do contas a pagar, marcar/corrigir pendência, e lançar nota nova
(incluindo anexar foto tirada na hora — que já vira PDF único
automaticamente, ver seção 5). **Cadastros e "Todas as notas"** (tela de
administração e tabela densa de relatório) continuam só na versão
desktop por enquanto — se o usuário cair numa dessas por um link antigo,
a UI mobile volta sozinha pra primeira aba disponível.

## 13. PWA (instalar como app)

O Central CP pode ser "instalado" — ícone na tela de início do celular ou
atalho no desktop, abrindo em tela cheia, sem a barra de endereço do
navegador. Não muda nada do funcionamento normal; é só a experiência de
abrir o app.

- **`manifest.json`** (raiz do projeto): nome, ícones (`src/icons/`,
  gerados programaticamente — fundo `--brand-dark` com o monograma "CP"),
  `display: standalone`, cor do tema.
- **`sw.js`** (service worker, raiz do projeto): existe só porque o
  Chrome/Android exige um service worker registrado pra oferecer o prompt
  de instalação — **não é uma estratégia de app offline**. Contas a pagar
  é dado que muda o tempo todo (status, pendência, aprovação), então o
  cache é deliberadamente conservador:
  - só intercepta `GET` do próprio site (html/css/js/ícones) — Storage e
    a API do Supabase, e os CDNs externos (`exceljs`/`jszip`/`pdf-lib`),
    **nunca** passam pelo cache, sempre direto na rede;
  - estratégia "network first": tenta a rede primeiro (pega sempre a
    versão mais nova do código); o cache só entra se a rede falhar (o app
    ainda abre com uma conexão ruim ou momentaneamente offline — mas sem
    Supabase disponível, não dá pra carregar dado nenhum, só a casca).
- **iOS**: o Safari não segue o `manifest.json` por completo, por isso o
  `index.html` também tem as tags `apple-mobile-web-app-*` (nome do
  atalho, tela cheia sem barra do Safari).

**Como instalar**: no Android/Chrome, o navegador oferece um banner
"Instalar app" sozinho (ou tem a opção no menu ⋮). No iPhone/Safari, é
manual: Compartilhar → "Adicionar à Tela de Início".

## 14. Marca (identidade visual)

Ícone, wordmark e paleta são v1 — identidade própria da ferramenta,
independente da marca do Boulevard Shopping Bauru (troca pelas cores/
logo oficiais do shopping quando esses materiais estiverem disponíveis).

- **Ícone**: documento com o check de aprovação — o gesto central de
  contas a pagar. Fonte vetorial em `src/brand/icon-mark.svg` (+
  `icon-mark-maskable.svg`, com respiro extra pra máscara circular do
  Android); versão inline usada no app (sidebar, header mobile, tela de
  login) em `src/js/brand.js` — os dois precisam ser atualizados juntos
  se o desenho mudar.
- **Wordmark**: "Central CP" em Space Grotesk 700, com "CP" sempre em
  âmbar (`--amber`) — mesma cor do check do ícone.
- **Paleta**: os tokens já existentes em `src/css/styles.css` (`:root`),
  com a adição de `--brand-light` (usado no ícone). Sem paleta nova —
  só formalização do que já estava em uso.
- Ícones do PWA (`src/icons/`) são gerados a partir do SVG mestre via
  Playwright (renderização real do vetor, não bitmap desenhado à mão) —
  ver o guia de marca completo (paleta, tipografia, aplicação) publicado
  como Artifact durante o desenvolvimento.

## 15. Armazenamento e Arquivos

O plano gratuito do Supabase tem limite de **500 MB de banco de dados** e
**1 GB de Storage** por projeto. Esses dois recursos abaixo existem pra
manter o sistema dentro desses limites, arquivando localmente (na rede da
empresa) os anexos de notas cujo processo já foi encerrado no Acelerato.

### 15.1 Dashboard de armazenamento (`administrador`)

Aba **Cadastros → Armazenamento**, visível só pro `administrador`
(`src/js/ui_armazenamento.js`, `restritoA: 'administrador'`). Mostra duas
barras de progresso, uma pra "Dados (Banco de Dados)" e outra pra
"Arquivos (Storage)", cada uma com % usado, valor usado/limite e cor
(verde abaixo de 70%, âmbar 70–90%, vermelho acima de 90%).

- Os números vêm da RPC `stats_armazenamento()` (migração
  `0013_stats_armazenamento.sql`), que soma `pg_database_size(current_database())`
  pro banco e `sum((metadata->>'size')::bigint)` de `storage.objects` pro
  Storage. A função é `security definer` e checa `eh_administrador()` por
  dentro — nega acesso com exceção pra qualquer outro perfil, mesmo que
  alguém tente chamar a RPC direto (a UI escondendo a aba não é a
  proteção real).
- Os limites (500 MB / 1 GB) estão hardcoded como constantes documentadas
  em `ui_armazenamento.js` (`LIMITE_BANCO_BYTES`, `LIMITE_STORAGE_BYTES`)
  — são os limites do plano gratuito do Supabase, não configuráveis pela
  UI.
- Botão "Atualizar" busca os números de novo (não há refresh automático).

### 15.2 Aba Arquivos (`administrador`, `contas_a_pagar`, `gerente_financeiro`)

Aba **Cadastros → Arquivos** (`src/js/ui_arquivos.js`,
`restritoA: 'operador_cadastro'` — mesma regra de acesso das outras
telas operacionais do CP). Agrupa as notas com anexo ainda armazenado no
Storage por **pagador** + **tipo de nota** (classificação cascateada da
seção 3, rotulada como "Nota de Compra", "Nota de Serviço" ou "Outros").

Uma nota só entra num grupo (fica elegível pra arquivamento) se:

1. tem `numero_chamado` preenchido — já foi aberto chamado no Acelerato
   pra ela, ou seja, o processo dela já está em andamento ou encerrado no
   CSC (não precisa ser exatamente o status `chamado_aberto`: cobre
   também `validado_csc` e `pago`, que também têm chamado preenchido);
2. ainda não foi arquivada (`anexo_arquivado_em` é nulo);
3. tem pelo menos um anexo de fato.

Notas de processos ainda ativos (sem chamado aberto) nunca aparecem
aqui — ficam retidas no Storage normalmente, como hoje.

### 15.3 Exportar → confirmar → arquivar

Cada grupo tem um botão "Baixar ZIP", que reaproveita o mesmo mecanismo
de zip em lote da seção de anexos (`zip_anexos.js`,
`baixarZipAnexosLote()`) — mesmo empacotamento com merge/renome de PDF já
usado em outras telas do sistema, só que aplicado às notas do grupo
inteiro em vez de uma seleção manual por checkbox.

Depois que o zip é baixado, o grupo passa a mostrar um segundo botão,
"Confirmar e apagar do Storage" — só depois dessa confirmação explícita
(mais um `confirm()` nativo do navegador) é que o sistema:

1. remove os arquivos do Storage do Supabase (`supabase.storage.remove()`
   em todos os objetos sob o prefixo `{notaId}/`);
2. grava `notas.anexo_arquivado_em = now()` pra cada nota do grupo;
3. registra uma entrada em `nota_historico` ("Anexo arquivado e removido
   do Storage") — o registro da nota em si nunca é apagado, só o arquivo
   binário no Storage.

O estado "zip já baixado, pronto pra confirmar apagar" (`app.gruposArquivadosProntos`)
só existe em memória durante a sessão — não precisa persistir, porque o
próximo passo (apagar do Storage) é imediato e, se a pessoa recarregar a
página antes de confirmar, o grupo simplesmente volta a mostrar só o
botão de baixar zip de novo (nenhum dado foi perdido).

### 15.4 Depois de arquivada

Na tela de detalhe da nota, a linha de anexo passa a mostrar "Arquivado
localmente em DD/MM/AAAA" (a data de `anexo_arquivado_em`) no lugar do
link de download, que deixaria de funcionar depois que o arquivo sai do
Storage (`src/js/ui_nota.js`).

### 15.5 Reforço no banco (defesa em profundidade)

A regra "só arquiva quem tem chamado aberto" não depende só da aba
Arquivos esconder o botão — a migração `0012_arquivamento_anexos.sql`
adiciona um trigger (`bloquear_arquivamento_sem_chamado`) que barra
qualquer `update` que tente setar `anexo_arquivado_em` numa nota com
`numero_chamado` nulo, não importa de onde venha a chamada.
