// Fase 3 (detalhe da nota, ver renderDetalhe/renderDetailActions em
// ui_nota.js): campos em blocos por assunto, "Rastreabilidade" com quem
// aprovou/validou (antes só no histórico/Excel), uma ação principal à
// vista e o resto em "Mais ações" -- destrutivas por último, separadas --
// e o histórico longo recolhido depois de 5 itens.
// Fixture: nota-5 está em 'validado_csc', aprovada por u-gerente-1 e
// validada por u-cp-1, chamado CH-500 e Group GR-5.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// Histórico com 7 movimentações, pra testar o "ver histórico completo".
const nota5 = app.notas.find(n => n.id === 'nota-5');
nota5.historico = Array.from({ length: 7 }, (_, i) => ({ id: `h-${i}`, nota_id: 'nota-5', usuario_id: 'u-cp-1', acao: `Movimentação ${i + 1}`, detalhe: null, criado_em: new Date(Date.now() - (7 - i) * 3600000).toISOString() }));

app.state.modal = 'detalhe'; app.state.modalData = 'nota-5';
render();
await esperar(50);

console.log('### Cabeçalho e blocos ###');
const titulos = Array.from(document.querySelectorAll('.det-blocos .det-bloco h4')).map(h => h.textContent.trim());
checarIgual(titulos, ['Documento', 'Valores e pagamento', 'Fornecedor e classificação', 'Rastreabilidade'], 'campos agrupados nos 4 blocos por assunto');
checar(!!document.querySelector('.det-header .det-valor-num'), 'cabeçalho mostra o valor em destaque');
checar(!!document.querySelector('.det-header .status-chip.st-validado_csc'), 'cabeçalho mostra a etiqueta de status');

console.log('### Rastreabilidade ###');
// Nomes e números passam por escapeHtml(), que zera o texto no jsdom
// (limitação só do ambiente de teste, ver arquivos_agrupamento_e_
// elegibilidade.mjs) -- aqui confere a ESTRUTURA: marco feito x futuro, e
// a data (que não passa por escapeHtml). O texto em si é conferido nas
// capturas de tela do navegador real.
const marco = (rotulo) => Array.from(document.querySelectorAll('.det-kv')).find(el => el.querySelector('.k').textContent.trim() === rotulo);
for (const rotulo of ['Lançada', 'Aprovada', 'Lançada no Group', 'Chamado aberto', 'Validada pelo CSC']) {
  const m = marco(rotulo);
  checar(!!m && !m.classList.contains('det-futuro'), `marco "${rotulo}" aparece como feito`);
}
checar(/\d{2}\/\d{2}\/\d{4}/.test(marco('Aprovada').textContent), 'marco "Aprovada" traz a data da aprovação');
checar(!marco('Chamado aberto').textContent.includes('—'), 'marco sem data (chamado com número mas sem data no fixture) não mostra "—" sobrando');
const paga = marco('Paga');
checar(!!paga && paga.classList.contains('det-futuro'), '"Paga" (ainda não aconteceu) aparece como marco futuro');
console.log('### Ações: uma principal + "Mais ações" ###');
const visiveis = Array.from(document.querySelectorAll('.det-acoes > .btn')).map(b => b.textContent.trim());
checarIgual(visiveis, ['Confirmar pagamento'], 'só a ação principal da etapa fica à vista');
const itensMenu = Array.from(document.querySelectorAll('.menu-acoes-lista .menu-item')).map(b => b.textContent.trim());
checarIgual(itensMenu, ['Marcar pendência', 'Editar', 'Excluir', 'Cancelar lançamento'], '"Mais ações" tem as demais, destrutivas por último');
checar(Array.from(document.querySelectorAll('.menu-acoes-lista .menu-item.perigo')).map(b => b.textContent.trim()).join() === 'Excluir,Cancelar lançamento', 'Excluir e Cancelar lançamento marcados como destrutivos');
checar(!!document.querySelector('.menu-acoes-lista hr'), 'destrutivas separadas das demais por uma linha');
checar(!document.querySelector('details.menu-acoes').open, 'menu começa fechado');

// O botão no menu continua com o mesmo data-action -- abre o mesmo modal de sempre.
document.querySelector('.menu-item[data-action="cancelar_lancamento"]').click();
await esperar(30);
checarIgual(app.state.modal, 'cancelar_lancamento', '"Cancelar lançamento" do menu abre o modal de cancelamento de sempre');

console.log('### Histórico recolhido ###');
app.state.modal = 'detalhe'; app.state.modalData = 'nota-5';
render();
await esperar(30);
checarIgual(document.querySelectorAll('.det-secao > .timeline > .tl-item').length, 5, 'mostra as 5 movimentações mais recentes');
const mais = document.querySelector('.det-mais-historico');
checar(!!mais && mais.querySelector('summary').textContent.includes('mais 2'), '"Ver histórico completo" guarda as outras 2');
const datas = Array.from(document.querySelectorAll('.det-secao > .timeline > .tl-item .tl-meta')).map(el => {
  const m = el.textContent.match(/(\d{2})\/(\d{2})\/(\d{4}) às (\d{2}):(\d{2})/);
  return m ? `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}` : '';
});
checar(datas.length === 5 && datas.every((d, i) => i === 0 || datas[i - 1] >= d), 'mais recentes primeiro');

checarSemErrosNaoTratados(erros, 'detalhe_nota_blocos_rastreabilidade_e_acoes');
relatorioFinal('detalhe_nota_blocos_rastreabilidade_e_acoes');
