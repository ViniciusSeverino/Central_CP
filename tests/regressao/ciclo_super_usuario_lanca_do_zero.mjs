// administrador/gerente_financeiro lançam nota do início ao fim: tem
// campo Setor manual (não tem setor fixo), e aprova automaticamente por
// AUTORIDADE (não por alçada de valor) -- mesmo um valor bem acima do
// limite (R$9.000 > R$5.000) vira "aprovado" direto.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);

checar(!!document.getElementById('btn-nova-nota'), 'administrador vê o botão de nova nota');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.getElementById('nf-setor'), 'campo "Setor" aparece no formulário (administrador não tem setor fixo)');

document.getElementById('nf-emissao').value = '2026-07-01';
document.getElementById('nf-vencimento').value = '2026-07-20';
document.getElementById('nf-competencia').value = '2026-07';
document.getElementById('nf-numero').value = 'NF-ADMIN-1';
document.getElementById('nf-valor').value = '9000';
document.getElementById('nf-setor').value = 'Financeiro';
document.getElementById('nf-pagador').value = 'pag-1';
document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
document.getElementById('nf-fornecedor').value = 'forn-1';
document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';
document.getElementById('nf-classificacao').value = 'Compras';
document.getElementById('nf-centro-custo').value = 'cc-1';
document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
document.getElementById('nf-classe-conta').value = 'cl-1';
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 200));

const nota = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-ADMIN-1');
checar(!!nota, 'nota criada com sucesso');
checar(nota && nota.setor === 'Financeiro', 'setor manual salvo corretamente');
checar(nota && nota.status === 'aprovado', 'valor de R$9.000 (acima da alçada de R$5.000) aprova mesmo assim, por autoridade');
checar(nota && nota.criado_por === PERFIS.administrador.usuarioId, 'criado_por é o próprio administrador');

const hist = supabaseClientMod.__fixtures().nota_historico.filter(h => h.nota_id === nota.id);
checar(hist.some(h => /autoridade/i.test(h.detalhe || '')), 'histórico registra o motivo como "autoridade de aprovação", não "alçada"');

checarSemErrosNaoTratados(erros, 'ciclo_super_usuario_lanca_do_zero');
relatorioFinal('ciclo_super_usuario_lanca_do_zero');
