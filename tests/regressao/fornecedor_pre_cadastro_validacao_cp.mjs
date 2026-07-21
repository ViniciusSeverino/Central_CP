// CP valida um pré-cadastro de fornecedor (ver migration 0030): aba
// "Cadastrar fornecedor" lista fornecedores pendentes com as notas que
// esperam por eles; "Validar e ativar" reaproveita o modal de editar
// fornecedor de sempre -- editar promove pra status='ativo' (ver
// db.atualizarFornecedor), o que libera a(s) nota(s) dele pra fila
// "Lançar no Group".
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);
const { app } = await import('./app/src/js/state.js');

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(nav.includes('cadastrar_fornecedor'), 'CP vê a aba "Cadastrar fornecedor"');
const contador = document.querySelector('[data-view="cadastrar_fornecedor"] .count');
checarIgual(contador.textContent, '1', 'contador mostra 1 fornecedor pendente (fixture forn-precadastro-1)');

// A nota aprovada desse fornecedor NÃO deve estar em "Lançar no Group" ainda.
document.querySelector('[data-view="lancar_group"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!document.querySelector('[data-lote-ids="nota-fornecedor-pendente-1"]'), 'antes da validação, a nota do fornecedor pendente não aparece em "Lançar no Group"');

document.querySelector('[data-view="cadastrar_fornecedor"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-validar-fornecedor="forn-precadastro-1"]'), 'mostra o botão "Validar e ativar" do fornecedor pendente');
checar(!!document.querySelector('[data-baixar-documento-fornecedor="forn-precadastro-1/123-contrato.pdf"]'), 'mostra o link do documento anexado no pré-cadastro');
checar(!!document.querySelector('[data-open="nota-fornecedor-pendente-1"]'), 'lista a nota que está esperando esse fornecedor');

document.querySelector('[data-validar-fornecedor="forn-precadastro-1"]').click();
await new Promise(r => setTimeout(r, 100));
checarIgual(app.state.modalData, 'forn-precadastro-1', 'abre o modal de editar fornecedor com o fornecedor pré-cadastrado certo');
// O campo "value" do input vem de escapeHtml(), que no jsdom sempre
// devolve string vazia (bug conhecido do jsdom, documentado em outros
// testes desta suíte -- num navegador de verdade já viria preenchido com
// o nome/CNPJ que o departamento informou). Reatribui aqui pra simular
// isso antes de continuar o fluxo de validação.
document.getElementById('cadnew-nome').value = 'Fornecedor Pré-cadastrado Teste';
document.getElementById('cadnew-municipio').value = 'BAURU';
document.getElementById('confirmar-fornecedor').click();
await new Promise(r => setTimeout(r, 150));

const validado = supabaseClientMod.__fixtures().fornecedores.find(f => f.id === 'forn-precadastro-1');
checarIgual(validado.status, 'ativo', 'validar e salvar promove o fornecedor pra status ativo');
checarIgual(validado.municipio, 'BAURU', 'os dados completados pelo CP foram salvos');

// Agora a nota já deve aparecer em "Lançar no Group", e a aba de pendências some.
document.querySelector('[data-view="lancar_group"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-lote-ids="nota-fornecedor-pendente-1"]'), 'depois de validado, a nota aparece em "Lançar no Group"');

const contadorDepois = document.querySelector('[data-view="cadastrar_fornecedor"] .count');
checarIgual(contadorDepois.textContent, '0', 'contador de "Cadastrar fornecedor" zera depois da validação');

checarSemErrosNaoTratados(erros, 'fornecedor_pre_cadastro_validacao_cp');
relatorioFinal('fornecedor_pre_cadastro_validacao_cp');
