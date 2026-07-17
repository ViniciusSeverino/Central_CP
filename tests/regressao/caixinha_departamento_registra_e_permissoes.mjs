// Caixinha (fundo fixo), perspectiva do departamento: também registra
// saída/reforço (decisão do dono do produto), mas TODA movimentação sua
// nasce pendente_aprovacao -- não tem autoridade de aprovação, então não
// vê os botões Aprovar/Rejeitar de ninguém. Só pode excluir o próprio
// pedido enquanto ainda pendente (arrependimento antes da aprovação). Só
// enxerga a caixinha do PRÓPRIO setor -- PERFIS.departamento (u-dept-1) é
// do Marketing, que corresponde à caixinha "Fundo" (caixinha-3, ver
// 0027_caixinha_por_setor.sql); as outras (Consórcio/Financeiro,
// Vértico/Operações) ficam fora do alcance.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);

document.querySelector('[data-view="caixinha"]').click();
await new Promise(r => setTimeout(r, 100));

checar(!!document.querySelector('[data-registrar-caixinha="caixinha-3"][data-tipo="reforco"]'), 'departamento vê o botão de registrar reforço na caixinha do próprio setor (Marketing -> Fundo)');
checar(!document.querySelector('[data-registrar-caixinha="caixinha-1"]'), 'departamento do Marketing NÃO vê a caixinha de outro setor (Consórcio -> Financeiro)');
checar(!document.querySelector('[data-editar-caixinha]'), 'departamento NÃO vê "Editar teto" (não é operador de cadastro)');
checar(!document.getElementById('btn-nova-caixinha'), 'departamento NÃO vê "+ Nova caixinha"');

// mov-2 (pendente, de outro usuário, na caixinha de outro setor) nem
// aparece pra esse departamento -- nem por autoridade de aprovação nem
// por não ser da caixinha do próprio setor.
checar(!document.querySelector('[data-aprovar-caixinha="mov-2"]'), 'departamento NÃO vê o botão Aprovar em nenhuma movimentação (não tem autoridade)');
checar(!document.querySelector('[data-excluir-caixinha="mov-2"]'), 'departamento NÃO vê/exclui uma movimentação de outro setor');

document.querySelector('[data-registrar-caixinha="caixinha-3"][data-tipo="reforco"]').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('cx-valor').value = '300';
document.getElementById('cx-data').value = '2026-07-12';
document.getElementById('cx-motivo').value = 'reposição via retirada do banco';
document.getElementById('confirmar-registrar-caixinha').click();
await new Promise(r => setTimeout(r, 150));

const nova = supabaseClientMod.__fixtures().caixinha_movimentacoes.find(m => m.motivo === 'reposição via retirada do banco');
checar(!!nova, 'reforço registrado com sucesso');
checar(nova && nova.caixinha_id === 'caixinha-3', 'registrado na caixinha do próprio setor');
checar(nova && nova.status === 'pendente_aprovacao', 'nasce pendente -- departamento não tem autoridade de aprovação, mesma regra pra qualquer valor');
checar(nova && nova.tipo === 'reforco', 'tipo salvo corretamente como reforço');
checar(nova && nova.criado_por === PERFIS.departamento.usuarioId, 'fica registrada em nome de quem registrou');

// Agora que é o próprio pedido (ainda pendente), pode excluir/desistir.
checar(!!document.querySelector(`[data-excluir-caixinha="${nova.id}"]`), 'departamento vê o botão Excluir no próprio pedido, ainda pendente');
document.querySelector(`[data-excluir-caixinha="${nova.id}"]`).click();
await new Promise(r => setTimeout(r, 150));
checar(!supabaseClientMod.__fixtures().caixinha_movimentacoes.find(m => m.id === nova.id), 'conseguiu desistir do próprio pedido pendente');

checarSemErrosNaoTratados(erros, 'caixinha_departamento_registra_e_permissoes');
relatorioFinal('caixinha_departamento_registra_e_permissoes');
