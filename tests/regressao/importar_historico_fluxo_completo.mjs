// Importação de histórico (só administrador): processa linhas cruas
// (bypassando exceljs/CDN, direto na lógica pura já testada isoladamente
// em Node), confirma, e checa que os lançamentos (simples e rateado) e o
// histórico de origem ficaram certos.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabImportar = document.querySelector('[data-cad-tab="importar"]');
checar(!!tabImportar, 'aba Importar histórico existe pro administrador');
tabImportar.click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.getElementById('btn-baixar-modelo-importacao'), 'botão "Baixar modelo" existe');
checar(!!document.getElementById('btn-processar-importacao'), 'botão "Processar planilha" existe');

const { app } = await import('./app/src/js/state.js');
const { processarLinhasImportacao } = await import('./app/src/js/import_historico.js');

const linhasCruas = [
  { numero_nota: 'NF-HIST-1', fornecedor: 'Fornecedor Teste 5', valor_bruto: '750', setor: 'Marketing', pagador: 'Condomínio', forma_pagamento: 'Boleto bancário', classificacao: 'Compras', centro_custo: '2.01', classe_conta: '2.01.01', status: 'Pago', pendente: 'Não', solicitado_por: 'Fulano (ex-funcionário, sem conta)', vencimento: '10/01/2022', data_emissao: '01/01/2022', competencia: '01/2022' },
  { numero_nota: 'NF-HIST-2', fornecedor: 'Fornecedor Teste 6', valor_bruto: '400', centro_custo: '2.01', classe_conta: '2.01.01' },
  { numero_nota: 'NF-HIST-2', fornecedor: 'Fornecedor Teste 6', valor_bruto: '200', centro_custo: '2.02', classe_conta: '2.02.01' }, // mesma NF+fornecedor -- vira rateio
  { numero_nota: 'NF-HIST-3', fornecedor: 'Fornecedor Que Nao Existe', valor_bruto: '100' }, // erro
];

app.importar.resultado = processarLinhasImportacao(linhasCruas, {
  cadastros: app.cadastros, usuarios: app.usuarios, notasExistentes: app.notas, usuarioImportador: app.usuario,
});
checar(app.importar.resultado.prontas.length === 2, 'processamento gera 2 lançamentos prontos (1 simples + 1 rateado agrupado)');
checar(app.importar.resultado.erros.length === 1, 'fornecedor inexistente vira 1 erro bloqueante');

window.__render();
await new Promise(r => setTimeout(r, 100));
checar(!!document.getElementById('btn-confirmar-importacao'), 'botão de confirmar importação aparece com linhas prontas');

const notasAntes = supabaseClientMod.__fixtures().notas.length;
document.getElementById('btn-confirmar-importacao').click();
await new Promise(r => setTimeout(r, 300));
checar(supabaseClientMod.__fixtures().notas.length === notasAntes + 2, 'as 2 notas prontas foram realmente importadas');

const simples = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-HIST-1');
checar(!!simples, 'a nota simples foi criada');
checar(simples && simples.criado_por === PERFIS.administrador.usuarioId, 'criado_por é sempre quem está importando (exigência da RLS)');
checar(simples && simples.solicitante_historico === 'Fulano (ex-funcionário, sem conta)', 'quem pediu de fato fica preservado como referência histórica, não como dono da nota');
checar(simples && simples.status === 'pago', 'status da planilha foi respeitado');
const historicoDaNota = supabaseClientMod.__fixtures().nota_historico.filter(h => h.nota_id === simples.id);
checar(historicoDaNota.some(h => h.origem === 'importacao_historica'), 'histórico marca origem=importacao_historica (não dispara alerta de e-mail)');

const rateada = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-HIST-2');
checar(!!rateada && rateada.tem_rateio === true, 'linhas com mesma NF+fornecedor viram uma única nota rateada');
checar(rateada && Number(rateada.valor_bruto) === 600, 'valor_bruto da nota rateada é a soma das linhas (400+200)');
const rateiosDaNota = supabaseClientMod.__fixtures().nota_rateios.filter(r => r.nota_id === rateada.id);
checar(rateiosDaNota.length === 2, 'as 2 linhas da planilha viraram 2 linhas de rateio');

checar(!document.getElementById('btn-confirmar-importacao'), 'depois de confirmar, a tela de "prontos" some (resultado limpo)');

checarSemErrosNaoTratados(erros, 'importar_historico_fluxo_completo');
relatorioFinal('importar_historico_fluxo_completo');
