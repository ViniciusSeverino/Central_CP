// Caixinha (fundo fixo), perspectiva do administrador: vê a aba, registra
// uma movimentação (nasce já aprovada -- autoridade de aprovação, mesma
// lógica de notas), aprova/rejeita pendências de outros perfis, e pode
// excluir qualquer movimentação (exceção do administrador, mesmo espírito
// de 0023_admin_exclui_qualquer_etapa.sql).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(nav.includes('caixinha'), 'administrador vê a aba "Caixinha"');

document.querySelector('[data-view="caixinha"]').click();
await new Promise(r => setTimeout(r, 100));

// Nome do card usa escapeHtml() (via innerText), que o jsdom não
// implementa de verdade -- sempre vira string vazia nesse ambiente de
// teste (bug conhecido do jsdom, não do app real). Por isso a checagem é
// estrutural (o card de cada caixinha existe), não por texto do nome.
checar(!!document.querySelector('[data-registrar-caixinha="caixinha-1"]') && !!document.querySelector('[data-registrar-caixinha="caixinha-2"]'), 'mostra os cards das duas caixinhas cadastradas');
const { fmtMoney } = await import('./app/src/js/state.js');
checar(document.body.textContent.includes(fmtMoney(800)), 'saldo da caixinha Consórcio reflete a saída aprovada do fixture (teto 1000 - 200)');

// Registrar uma saída como administrador -- deve nascer já aprovada.
document.querySelector('[data-registrar-caixinha="caixinha-2"][data-tipo="saida"]').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('cx-valor').value = '120';
document.getElementById('cx-data').value = '2026-07-10';
document.getElementById('cx-motivo').value = 'compra emergencial de teste';
document.getElementById('confirmar-registrar-caixinha').click();
await new Promise(r => setTimeout(r, 150));

const novaMov = supabaseClientMod.__fixtures().caixinha_movimentacoes.find(m => m.motivo === 'compra emergencial de teste');
checar(!!novaMov, 'movimentação registrada com sucesso');
checar(novaMov && novaMov.status === 'aprovado', 'nasce já aprovada -- administrador tem autoridade de aprovação');
checar(novaMov && novaMov.criado_por === PERFIS.administrador.usuarioId, 'fica registrada em nome do administrador');

// Aprovar a pendência pré-existente do fixture (mov-2, criada por contas_a_pagar).
checar(!!document.querySelector('[data-aprovar-caixinha="mov-2"]'), 'administrador vê o botão Aprovar numa movimentação pendente de outro perfil');
document.querySelector('[data-aprovar-caixinha="mov-2"]').click();
await new Promise(r => setTimeout(r, 150));
const movAprovada = supabaseClientMod.__fixtures().caixinha_movimentacoes.find(m => m.id === 'mov-2');
checar(movAprovada.status === 'aprovado', 'mov-2 passou a aprovado');
checar(movAprovada.aprovado_por === PERFIS.administrador.usuarioId, 'registra quem aprovou');

// Excluir a movimentação recém aprovada (administrador pode excluir
// qualquer status, não só pendente).
document.querySelector('[data-excluir-caixinha="mov-2"]').click();
await new Promise(r => setTimeout(r, 150));
checar(!supabaseClientMod.__fixtures().caixinha_movimentacoes.find(m => m.id === 'mov-2'), 'administrador excluiu mov-2 mesmo já aprovada');

// Teto configurável: administrador (operador de cadastro) pode editar o
// valor-teto de uma caixinha já existente e cadastrar uma nova.
checar(!!document.getElementById('btn-nova-caixinha'), 'administrador vê "+ Nova caixinha"');
checar(!!document.querySelector('[data-editar-caixinha="caixinha-2"]'), 'administrador vê "Editar teto" nos cards');
document.querySelector('[data-editar-caixinha="caixinha-2"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.getElementById('cx-teto').value === '500', 'formulário de editar já vem preenchido com o teto atual');
// cx-nome vem de escapeHtml(c.nome), que o jsdom não renderiza de verdade
// (mesmo motivo do card acima) -- precisa reatribuir aqui pra simular o
// texto que já estaria lá de verdade num navegador real.
document.getElementById('cx-nome').value = 'Vértico';
document.getElementById('cx-teto').value = '750';
document.getElementById('confirmar-caixinha-cadastro').click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().caixinhas.find(c => c.id === 'caixinha-2').valor_teto === 750, 'teto configurável -- valor foi atualizado');

checarSemErrosNaoTratados(erros, 'caixinha_administrador_aprova_e_exclui');
relatorioFinal('caixinha_administrador_aprova_e_exclui');
