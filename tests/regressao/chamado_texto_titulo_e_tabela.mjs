// Título + tabela padrão de abertura de chamado pro CSC (documento WE9,
// "Padrão de Abertura de Chamado"), geradas a partir do lote (pagador +
// vencimento) que já está na fila "Abrir chamado" -- prontas pra copiar
// e colar na descrição do Freshdesk, sem digitar tudo de novo à mão.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);
const { pessoaTipo, tituloChamado, linhasChamado, totalChamado } = await import('./app/src/js/chamado_texto.js');

// 1) PF/PJ é calculado pela contagem de dígitos do CPF/CNPJ cadastrado --
// não depende de nenhum campo novo no fornecedor.
checarIgual(pessoaTipo('123.456.789-01'), 'PF', 'CPF (11 dígitos, com máscara) -> PF');
checarIgual(pessoaTipo('12.345.678/0001-99'), 'PJ', 'CNPJ (14 dígitos, com máscara) -> PJ');
checarIgual(pessoaTipo(null), '—', 'sem CPF/CNPJ cadastrado -> "—"');
checarIgual(pessoaTipo('123'), '—', 'quantidade de dígitos que não bate com CPF nem CNPJ -> "—"');

// 2) Injeta um lote de 2 notas (mesmo pagador+vencimento, fornecedores
// diferentes -- uma PF, outra PJ) já em "lancado_no_group", pronto pra
// abrir chamado.
const fixtures = supabaseClientMod.__fixtures();
fixtures.fornecedores.push(
  { id: 'forn-pf-teste', nome: 'João da Silva ME', cnpj: '123.456.789-01', municipio: 'BAURU', cod_group: null, contas: [] },
  { id: 'forn-pj-teste', nome: 'Fazenda do Bolo LTDA', cnpj: '12.345.678/0001-99', municipio: 'BAURU', cod_group: null, contas: [] },
);
const base = {
  pagador_id: 'pag-1', forma_pagamento: 'Boleto bancário', classificacao: 'Compras', tem_rateio: false,
  centro_custo_id: 'cc-1', classe_conta_id: 'cl-1', codigo_classificacao_id: null,
  status: 'lancado_no_group', pendente: false, motivo_pendencia: null, setor: 'Marketing',
  criado_por: 'u-dept-1', criado_em: new Date().toISOString(), vencimento: '2026-07-08',
  competencia: '2026-06-01', aprovado_por: 'u-gerente-1', data_aprovacao: new Date().toISOString(),
  numero_lancamento_group: 'GR-300', data_lancamento_group: new Date().toISOString(),
  numero_chamado: null, data_chamado: null, data_validacao_csc: null, validado_por: null, data_pagamento: null,
  anexo_arquivado_em: null, anexos: [], nota_rateios: [], nota_historico: [],
  tipo_despesa_prazo: 'padrao', pagamento_excecao: false,
};
fixtures.notas.push(
  { ...base, id: 'nota-chamado-pf', numero_nota: 'NF-CH-1', fornecedor_id: 'forn-pf-teste', data_emissao: '2026-06-25', valor_bruto: '1500.50', descricao: 'Serviço avulso de manutenção', tipo_contratacao: 'sob_demanda' },
  { ...base, id: 'nota-chamado-pj', numero_nota: 'NF-CH-2', fornecedor_id: 'forn-pj-teste', data_emissao: '2026-06-20', valor_bruto: '2340.00', descricao: 'Consultoria mensal', tipo_contratacao: 'mensal' },
);
const ids = ['nota-chamado-pf', 'nota-chamado-pj'];
// app.notas já foi carregado no boot, antes das notas de teste serem
// empurradas pro fixture -- as funções puras leem de app.notas, então
// precisam do refresh antes de qualquer checagem.
document.getElementById('btn-refresh').click();
await new Promise(r => setTimeout(r, 150));

// 3) Título: BSB_DESPESA_{sigla do pagador}_{vencimento em DD.MM ATÉ DD.MM.AAAA}.
// As duas notas têm o mesmo vencimento (08/07), então o período colapsa
// pra essa única data nas duas pontas.
checarIgual(tituloChamado(ids), 'BSB_DESPESA_COND_08.07 ATÉ 08.07.2026', 'título monta sigla do shopping + pagador + período de vencimentos');

// 4) Cada linha da tabela tem os campos certos, na ordem que o CSC espera.
const linhas = linhasChamado(ids);
checarIgual(linhas.length, 2, 'uma linha por nota do lote');
const linhaPf = linhas.find(l => l.numeroNf === 'NF-CH-1');
checarIgual(linhaPf.vencimentoNetEmpresa, '08/07/2026', 'vencimento net empresa formatado dd/mm/aaaa');
checarIgual(linhaPf.vencimentoOriginal, linhaPf.vencimentoNetEmpresa, 'vencimento original igual ao net empresa (app não distingue os dois)');
checarIgual(linhaPf.dataEmissao, '25/06/2026', 'data de emissão da NF certa');
checarIgual(linhaPf.pfPj, 'PF', 'fornecedor com CPF (11 dígitos) -> PF');
checarIgual(linhaPf.contrato, 'SOB DEMANDA', 'tipo de contratação "sob_demanda" vira "SOB DEMANDA"');
checarIgual(linhaPf.fornecedor, 'João da Silva ME', 'nome do fornecedor certo');
checarIgual(linhaPf.canalPagamento, 'BOLETO', 'canal de pagamento na sigla certa (mesma de anexos_pdf.js)');
checarIgual(linhaPf.debito, 1500.50, 'valor a debitar (número, não string)');

const linhaPj = linhas.find(l => l.numeroNf === 'NF-CH-2');
checarIgual(linhaPj.pfPj, 'PJ', 'fornecedor com CNPJ (14 dígitos) -> PJ');
checarIgual(linhaPj.contrato, 'MENSAL', 'tipo de contratação "mensal" vira "MENSAL"');

checarIgual(totalChamado(linhas), 3840.50, 'total soma o débito das duas linhas certo');

// 5) Fim a fim: abre o modal "Abrir chamado" pra esse lote e clica no
// botão -- confere que a área aparece com o título certo e a quantidade
// certa de linhas na tabela (mais a linha de TOTAL), e que o botão
// esconde de novo no segundo clique.
document.querySelector('[data-view="abrir_chamado"]').click();
await new Promise(r => setTimeout(r, 100));
// Não dá pra filtrar pelo texto do card (numero_nota passa por
// escapeHtml, que zera texto no jsdom) -- como as 2 notas de teste
// compartilham pagador+vencimento, viram um único grupo na fila.
const grupo = document.querySelector('.grupo-card');
checar(!!grupo, 'o lote das 2 notas aparece na fila "Abrir chamado"');
grupo.querySelector('[data-lote-action]').click();
await new Promise(r => setTimeout(r, 100));

const btnGerar = document.getElementById('btn-gerar-tabela-chamado');
checar(!!btnGerar, 'modal de abrir chamado mostra o botão "Gerar título e tabela do chamado"');
const area = document.getElementById('tabela-chamado-area');
checar(area.style.display === 'none', 'a área começa escondida');

btnGerar.click();
await new Promise(r => setTimeout(r, 50));
checar(area.style.display !== 'none', 'clicar no botão mostra a área com o título e a tabela');
// O valor do campo de título vem de escapeHtml() (embutido no atributo
// value="..." do HTML), que zera texto no jsdom -- já conferimos o
// conteúdo certo direto pela função pura (tituloChamado) acima; aqui só
// confirma que o campo existe na estrutura.
checar(!!document.getElementById('chamado-titulo-texto'), 'campo do título aparece dentro do modal');
const linhasTabela = document.querySelectorAll('#tabela-chamado-conteudo tbody tr');
checarIgual(linhasTabela.length, 3, 'tabela tem 2 linhas de nota + 1 linha de TOTAL');
checar(document.getElementById('btn-copiar-titulo-chamado') && document.getElementById('btn-copiar-tabela-chamado'), 'botões de copiar título e copiar tabela existem depois de gerar');

btnGerar.click();
await new Promise(r => setTimeout(r, 50));
checar(area.style.display === 'none', 'clicar de novo esconde a área');

checarSemErrosNaoTratados(erros, 'chamado_texto_titulo_e_tabela');
relatorioFinal('chamado_texto_titulo_e_tabela');
