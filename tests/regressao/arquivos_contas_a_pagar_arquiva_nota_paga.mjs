// Reproduz o bug real encontrado em produção: contas_a_pagar arquivando
// uma nota já 'pago' (o caso mais comum -- processo encerrado). Antes da
// RPC arquivar_anexos_lote(), o update direto de anexo_arquivado_em não
// afetava nenhuma linha pra esse papel nesse status (a policy "notas:
// update" só libera contas_a_pagar até 'validado_csc'), deixando o
// arquivo já apagado do Storage sem o marcador salvo no banco.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);
const db = await import('./app/src/js/db.js');

supabaseClientMod.__fixtures().notas.push({
  id: 'nota-teste-pago', numero_nota: 'NF-PAGO-CP', valor_bruto: '999.00', descricao: 'pago, elegível',
  pagador_id: 'pag-2', fornecedor_id: 'forn-5', forma_pagamento: 'Boleto bancário',
  classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-2', classe_conta_id: 'cl-2',
  codigo_classificacao_id: null, status: 'pago', pendente: false, motivo_pendencia: null,
  setor: 'Marketing', criado_por: 'u-dept-1', criado_em: new Date().toISOString(), data_emissao: '2026-04-01', vencimento: '2026-05-01', competencia: '2026-04-01',
  aprovado_por: 'u-gerente-1', data_aprovacao: new Date().toISOString(), numero_chamado: 'CH-999', data_pagamento: '2026-05-10',
  numero_lancamento_group: 'GR-999', data_lancamento_group: new Date().toISOString(), data_validacao_csc: new Date().toISOString(), validado_por: 'u-cp-1',
  anexo_arquivado_em: null,
  anexos: ['nota-teste-pago/anexo.pdf'], nota_rateios: [], nota_historico: [],
});
supabaseClientMod.supabase.storage._objetos.push({ bucket: 'anexos-notas', path: 'nota-teste-pago/anexo.pdf', file: new (globalThis.Blob)(['x'], { type: 'application/pdf' }) });

await db.arquivarAnexosNotas(['nota-teste-pago']);

const nota = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-teste-pago');
checar(!!nota.anexo_arquivado_em, 'contas_a_pagar CONSEGUE arquivar uma nota já paga (era o bug real -- antes ficava 0 linhas afetadas, silenciosamente)');
checar(!supabaseClientMod.supabase.storage._objetos.some(o => o.path.startsWith('nota-teste-pago/')), 'arquivo some do Storage');
checar(supabaseClientMod.__fixtures().nota_historico.some(h => h.nota_id === 'nota-teste-pago' && h.acao === 'Anexo arquivado e removido do Storage'), 'histórico registrado');

checarSemErrosNaoTratados(erros, 'arquivos_contas_a_pagar_arquiva_nota_paga');
relatorioFinal('arquivos_contas_a_pagar_arquiva_nota_paga');
