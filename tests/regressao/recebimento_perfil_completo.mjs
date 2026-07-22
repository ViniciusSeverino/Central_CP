// Perfil "completo" (ver migration 0029/ui_recebimento.js) do mesmo setor
// de um recebedor: enxerga a fila "Recebidos" do setor inteiro (não só o
// que ele mesmo criou), completa o lançamento (formulário inteiro, igual
// editar_reenviar, mas reatribuindo criado_por -- ver db.completarRecebimento)
// e pode devolver pedindo documento (reaproveita marcarPendencia). Ver
// nota no topo de recebimento_perfil_recebedor.mjs sobre por que a
// persistência de "Completar lançamento" é testada direto no db.js, sem
// clicar o "salvar" de verdade (mesclar PDF exige um import https:// que o
// loader padrão do Node não suporta).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');
const db = await import('./app/src/js/db.js');

// 1) "Completo" continua vendo os botões normais (não é o perfil recebedor).
checar(!!document.getElementById('btn-nova-nota'), 'perfil completo continua vendo "+ Nova nota"');
checar(!document.getElementById('btn-novo-recebimento'), 'perfil completo NÃO vê "+ Anexar documento" (isso é do recebedor)');

// 2) Fila "Recebidos" do setor -- as 2 notas 'recebido' de Marketing,
// mesmo tendo sido criadas pelo recebedor (não por este usuário).
document.querySelector('[data-view="recebidos"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-open="nota-recebida-1"]'), 'fila "Recebidos" mostra a nota recebida (não pendente)');
checar(!!document.querySelector('[data-open="nota-recebida-pendente-1"]'), 'fila "Recebidos" mostra também a que está com pendência');
checar(document.querySelector('[data-open="nota-recebida-1"]').innerHTML.includes('Recebido'), 'card mostra o selo "Recebido — aguarda complementação"');

// 3) Detalhe da nota recebida (não pendente): "Completar lançamento" e
// "Devolver pedindo documento".
document.querySelector('[data-open="nota-recebida-1"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-action="completar_recebimento"][data-id="nota-recebida-1"]'), 'mostra o botão "Completar lançamento"');
checar(!!document.querySelector('[data-action="marcar_pendencia"][data-id="nota-recebida-1"]'), 'mostra o botão "Devolver pedindo documento"');
// Excluir também aparece aqui (não só quando já está pendente, ver
// migration 0036) -- pedido do dono do produto: qualquer "recebido" ainda
// não completado nunca saiu do Central CP, então excluir de vez é seguro.
checar(!!document.querySelector('[data-excluir-nota="nota-recebida-1"]'), '"completo" vê "Excluir" numa recebida ainda não pendente também');

// 4) "Completar lançamento" abre o formulário inteiro, pré-preenchido com
// o que o recebedor já informou -- rótulo próprio, sem opção de rascunho
// (não faz sentido "rascunhar" algo que já chegou como recebido).
document.querySelector('[data-action="completar_recebimento"][data-id="nota-recebida-1"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.getElementById('nf-valor'), 'formulário completo (não o simplificado) -- tem campo de valor');
checarIgual(document.getElementById('nf-centro-custo').value, 'cc-1', 'centro de custo já vem preenchido (informado pelo recebedor)');
checarIgual(document.getElementById('btn-salvar-nota').textContent, 'Completar e lançar', 'rótulo do botão é o de completar recebimento, não "reenviar"');
checar(!document.getElementById('btn-salvar-rascunho'), 'não mostra "Salvar como rascunho" ao completar um recebimento');

// Fecha antes de seguir pro próximo cenário (recomeça do detalhe da outra nota).
document.getElementById('modal-close').click();
await new Promise(r => setTimeout(r, 100));

// 4b) Nota 'recebido' já pendente (outro recebedor a devolveu pedindo
// documento): "completo" vê "Excluir" no lugar do antigo botão duplicado
// que reabria o formulário inteiro -- é lançamento simples que nunca saiu
// do "recebido", sem nada fora do Central CP referenciando ainda (pedido
// do dono do produto). Ver migration 0035 pra RLS correspondente.
document.querySelector('[data-open="nota-recebida-pendente-1"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-action="corrigir_recebimento"][data-id="nota-recebida-pendente-1"]'), '"completo" também vê "Corrigir e devolver" (simplificado) numa recebida pendente do setor');
checar(!document.querySelector('[data-action="corrigir_pendencia"]'), 'não duplica com o botão que abriria o formulário completo');
checar(!!document.querySelector('[data-excluir-nota="nota-recebida-pendente-1"]'), '"completo" vê "Excluir" no lugar do formulário completo duplicado');
document.getElementById('modal-close').click();
await new Promise(r => setTimeout(r, 100));

// 5) "Devolver pedindo documento" -- reaproveita o mecanismo de pendência
// já existente (marcarPendencia), não mexe em anexo/PDF -- pode clicar até
// o fim com segurança nesta suíte.
document.querySelector('[data-open="nota-recebida-1"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-action="marcar_pendencia"][data-id="nota-recebida-1"]').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('input-motivo-pend').value = 'Falta o comprovante de pagamento, favor reenviar.';
document.getElementById('confirmar-pendencia').click();
await new Promise(r => setTimeout(r, 150));
const devolvida = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-recebida-1');
checarIgual(devolvida.pendente, true, 'devolver pedindo documento marca a nota como pendente');
checarIgual(devolvida.motivo_pendencia, 'Falta o comprovante de pagamento, favor reenviar.', 'guarda o motivo digitado');
checarIgual(devolvida.status, 'recebido', 'continua "recebido" -- só volta pra fila do recebedor resolver');

// 6) Persistência de "Completar lançamento" -- direto no db.js (ver nota
// no topo do arquivo sobre o motivo de não clicar "salvar" de verdade).
await db.completarRecebimento(
  'nota-recebida-pendente-1',
  {
    data_emissao: '2026-07-01', vencimento: '2026-07-20', competencia: '2026-07-01', numero_nota: 'NF-COMPLETADA',
    valor_bruto: 1000, pagador_id: 'pag-1', fornecedor_id: 'forn-1', forma_pagamento: 'Boleto bancário',
    classificacao: 'Compras', centro_custo_id: 'cc-1', classe_conta_id: 'cl-1', codigo_classificacao_id: null,
    tem_rateio: false, tem_retencao_imposto: false, descricao: '', anexos: ['nota-recebida-pendente-1/456-boleto-ilegivel.pdf'],
  },
  app.usuario, 'aprovado', [{ acao: 'Recebimento complementado e lançado' }],
);
const notaCompletada = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-recebida-pendente-1');
checarIgual(notaCompletada.status, 'aprovado', 'completar o lançamento leva pro status calculado pela alçada');
checarIgual(notaCompletada.numero_nota, 'NF-COMPLETADA', 'os dados preenchidos pelo "completo" foram salvos');
checarIgual(notaCompletada.criado_por, PERFIS.departamento.usuarioId, 'criado_por passa a ser de quem completou -- daqui pra frente é uma nota comum dela');
checarIgual(notaCompletada.pendente, false, 'completar limpa qualquer pendência anterior');

checarSemErrosNaoTratados(erros, 'recebimento_perfil_completo');
relatorioFinal('recebimento_perfil_completo');
