// Fase do formulário (ver formNovaNota/renderResumoNota/renderAvisosNota em
// ui_nota.js e bindRodapeNota/marcarCamposFaltando em events_notas.js):
// obrigatórios marcados, ajudas como "?", rodapé fixo com resumo dos
// valores ao vivo, aviso de NF duplicada ANTES de salvar e campos que
// faltam marcados em vermelho quando a validação falha.
// Fixture: nota-1 é a NF "NF-1" do fornecedor forn-0.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const disparar = (el, tipo) => el.dispatchEvent(new dom.window.Event(tipo, { bubbles: true }));

document.getElementById('btn-nova-nota').click();
await esperar(80);

console.log('### Obrigatórios e ajudas ###');
const obrig = Array.from(document.querySelectorAll('#box-nota label.obrig')).map(l => l.textContent.trim());
checar(['Fornecedor', 'Data de emissão', 'Data de vencimento', 'Competência', 'N° da NF', 'Valor bruto (R$)', 'Pagador', 'Forma de pagamento', 'Classificação'].every(r => obrig.some(o => o.startsWith(r))), `campos obrigatórios marcados com * (${obrig.length})`);
checar(document.querySelectorAll('#box-nota .dica').length >= 4, 'textos de ajuda viram "?" ao lado do rótulo');
checar(!document.querySelector('#box-nota .form-section-title') || !Array.from(document.querySelectorAll('#box-nota .form-section-title')).some(h => h.textContent.trim() === 'Descrição'), 'Descrição não é mais uma seção só pra ela');

console.log('### Rodapé com resumo ao vivo ###');
checar(!!document.querySelector('.nota-form-rodape #btn-salvar-nota'), 'botão de salvar fica no rodapé fixo');
const valor = document.getElementById('nf-valor');
valor.value = '1500.50';
disparar(valor, 'input');
await esperar(20);
checar(document.getElementById('nota-resumo').textContent.includes('1.500,50'), `resumo mostra o bruto digitado ("${document.getElementById('nota-resumo').textContent.trim()}")`);

console.log('### Aviso de NF duplicada antes de salvar ###');
checarIgual(document.getElementById('avisos-nota').innerHTML.trim(), '', 'sem fornecedor/NF, nenhum aviso');
document.getElementById('nf-fornecedor').value = 'forn-0';
const numero = document.getElementById('nf-numero');
numero.value = 'NF-1';
disparar(numero, 'input');
await esperar(20);
checar(document.getElementById('avisos-nota').textContent.includes('já tem a NF'), 'mesmo fornecedor + mesma NF já lançada: aviso aparece enquanto preenche');
numero.value = 'NF-NOVA-999';
disparar(numero, 'input');
await esperar(20);
checarIgual(document.getElementById('avisos-nota').innerHTML.trim(), '', 'trocando pra uma NF nova, o aviso some');

console.log('### Campos faltando marcados ao salvar ###');
document.getElementById('btn-salvar-nota').click();
await esperar(30);
const invalidos = Array.from(document.querySelectorAll('.campo-invalido')).map(el => el.id);
checar(invalidos.includes('nf-emissao') && invalidos.includes('nf-competencia') && invalidos.includes('nf-forma-pagamento'), `campos obrigatórios vazios ficam marcados (${invalidos.join(', ')})`);
checar(!invalidos.includes('nf-valor') && !invalidos.includes('nf-numero'), 'campos já preenchidos não são marcados');
const emissao = document.getElementById('nf-emissao');
emissao.value = '2026-07-01';
disparar(emissao, 'input');
await esperar(10);
checar(!emissao.classList.contains('campo-invalido'), 'preencher o campo tira a marcação');

checarSemErrosNaoTratados(erros, 'formulario_nota_rodape_avisos_obrigatorios');
relatorioFinal('formulario_nota_rodape_avisos_obrigatorios');
