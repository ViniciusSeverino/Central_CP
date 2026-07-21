// Pré-cadastro de fornecedor inline no formulário de nota (ver migration
// 0030): quando o perfil "completo" do departamento não acha o fornecedor
// no combo, pode criar ali mesmo só com nome/CNPJ + documento -- sem
// travar o lançamento da nota. Fica status='pre_cadastro' até o CP
// revisar (ver fornecedor_pre_cadastro_validacao_cp.mjs).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

checar(!!document.getElementById('link-abrir-pre-cadastro-fornecedor'), 'perfil completo vê o link de pré-cadastro de fornecedor');
checar(!document.getElementById('pcf-nome'), 'a área começa fechada (só o link, sem os campos)');

document.getElementById('link-abrir-pre-cadastro-fornecedor').click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('pcf-nome'), 'clicar no link abre os campos do pré-cadastro');

// Validação: sem nome nem documento, bloqueia.
document.getElementById('btn-pre-cadastrar-fornecedor').click();
await new Promise(r => setTimeout(r, 50));
checar(Array.from(document.querySelectorAll('.toast')).pop().textContent.includes('nome'), 'sem nome, mostra toast pedindo pra informar');

document.getElementById('pcf-nome').value = 'Fornecedor Novo Teste';
document.getElementById('pcf-cnpj').value = '22.222.222/0001-22';
document.getElementById('btn-pre-cadastrar-fornecedor').click();
await new Promise(r => setTimeout(r, 50));
checar(Array.from(document.querySelectorAll('.toast')).pop().textContent.includes('documento'), 'sem documento anexado, mostra toast pedindo pra anexar');

// Anexa um arquivo (mesmo padrão de anexosNovos -- File() direto no input).
const arquivo = new dom.window.File(['conteudo'], 'contrato-social.pdf', { type: 'application/pdf' });
Object.defineProperty(document.getElementById('pcf-anexos-input'), 'files', { value: [arquivo], writable: false });
document.getElementById('pcf-anexos-input').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checarIgual(app.preCadastroFornecedorArquivos.length, 1, 'documento escolhido entra em app.preCadastroFornecedorArquivos');

document.getElementById('btn-pre-cadastrar-fornecedor').click();
await new Promise(r => setTimeout(r, 150));

const criado = supabaseClientMod.__fixtures().fornecedores.find(f => f.nome === 'Fornecedor Novo Teste');
checar(!!criado, 'fornecedor foi criado');
checarIgual(criado.status, 'pre_cadastro', 'nasce em status pre_cadastro -- ainda não é um cadastro validado');
checarIgual(criado.pre_cadastrado_por, PERFIS.departamento.usuarioId, 'guarda quem pré-cadastrou');
checarIgual(criado.documentos_pre_cadastro.length, 1, 'documento foi enviado e associado ao fornecedor');
checarIgual(document.getElementById('nf-fornecedor').value, criado.id, 'o fornecedor recém-criado já fica selecionado nesta nota');
checar(!!document.getElementById('link-abrir-pre-cadastro-fornecedor'), 'área volta a mostrar só o link (colapsada) depois de salvar');
checar(!document.getElementById('pcf-nome'), 'campos do pré-cadastro somem depois de salvar');

checarSemErrosNaoTratados(erros, 'fornecedor_pre_cadastro_criar');
relatorioFinal('fornecedor_pre_cadastro_criar');
