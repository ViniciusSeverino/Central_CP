// src/js/db.js
import { supabase } from './supabaseClient.js';

/* ============================ USUARIOS ============================ */

export async function carregarUsuarios() {
  const { data, error } = await supabase.from('usuarios').select('id, nome, role, setor');
  if (error) throw new Error('Erro carregando usuários: ' + error.message);
  return data;
}

/* ============================ CADASTROS ============================ */

export async function carregarCadastros() {
  const [pag, cc, cl, cod, forn] = await Promise.all([
    supabase.from('pagadores').select('*').order('nome'),
    supabase.from('centros_custo').select('*').order('codigo'),
    supabase.from('classes_conta').select('*').order('codigo'),
    supabase.from('codigos_classificacao').select('*').order('codigo'),
    supabase.from('fornecedores').select('*, fornecedor_contas(*)').order('nome'),
  ]);
  for (const r of [pag, cc, cl, cod, forn]) {
    if (r.error) throw new Error('Erro carregando cadastros: ' + r.error.message);
  }
  return {
    pagadores: pag.data,
    centros_custo: cc.data,
    classes_conta: cl.data,
    codigos_classificacao: cod.data,
    fornecedores: forn.data.map(f => ({ ...f, contas: f.fornecedor_contas || [] })),
  };
}

export async function adicionarPagador({ nome, sigla }) {
  const { error } = await supabase.from('pagadores').insert({ nome, sigla });
  if (error) throw new Error(error.message);
}

export async function adicionarCentroCusto({ codigo, nome, sigla, origem_siglas }) {
  const { error } = await supabase.from('centros_custo').insert({ codigo, nome, sigla, origem_siglas });
  if (error) throw new Error(error.message);
}

export async function adicionarClasseConta({ codigo, nome, centro_custo_id }) {
  const { error } = await supabase.from('classes_conta').insert({ codigo, nome, centro_custo_id });
  if (error) throw new Error(error.message);
}

export async function adicionarCodigoClassificacao({ codigo, nome, classe_conta_id }) {
  const { error } = await supabase.from('codigos_classificacao').insert({ codigo, nome, classe_conta_id });
  if (error) throw new Error(error.message);
}

export async function adicionarFornecedor({ nome, cnpj, municipio, cod_group, contas }) {
  const { data: forn, error } = await supabase
    .from('fornecedores')
    .insert({ nome, cnpj, municipio, cod_group })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (contas && contas.length > 0) {
    const { error: errContas } = await supabase.from('fornecedor_contas').insert(
      contas.map(c => ({ fornecedor_id: forn.id, cod_banco: c.cod_banco, agencia: c.agencia, conta: c.conta }))
    );
    if (errContas) throw new Error(errContas.message);
  }
}

export async function removerItemCadastro(tabela, id) {
  const { error } = await supabase.from(tabela).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ============================== NOTAS =============================== */

const SELECT_NOTA_COMPLETA = '*, nota_rateios(*), nota_historico(*)';

function normalizarNota(row) {
  return {
    ...row,
    rateios: (row.nota_rateios || []).slice(),
    historico: (row.nota_historico || []).slice().sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em)),
  };
}

export async function carregarNotas() {
  const { data, error } = await supabase.from('notas').select(SELECT_NOTA_COMPLETA);
  if (error) throw new Error('Erro carregando notas: ' + error.message);
  return data.map(normalizarNota);
}

async function registrarHistorico(notaId, usuarioId, acao, detalhe) {
  const { error } = await supabase.from('nota_historico').insert({ nota_id: notaId, usuario_id: usuarioId, acao, detalhe: detalhe || null });
  if (error) throw new Error(error.message);
}

async function salvarRateios(notaId, rateios) {
  await supabase.from('nota_rateios').delete().eq('nota_id', notaId);
  if (rateios && rateios.length > 0) {
    const { error } = await supabase.from('nota_rateios').insert(
      rateios.map(r => ({
        nota_id: notaId,
        valor: r.valor,
        centro_custo_id: r.centro_custo_id,
        classe_conta_id: r.classe_conta_id,
        codigo_classificacao_id: r.codigo_classificacao_id || null,
        descricao: r.descricao || null,
      }))
    );
    if (error) throw new Error(error.message);
  }
}

// payload: campos da tabela `notas` (sem id/status/criado_por/setor) + rateios[]
export async function criarNota(payload, usuario, status, historicoInicial) {
  const { rateios, ...campos } = payload;
  const { data: nota, error } = await supabase
    .from('notas')
    .insert({ ...campos, status, criado_por: usuario.id, setor: usuario.setor })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (payload.tem_rateio) await salvarRateios(nota.id, rateios);
  for (const h of historicoInicial) await registrarHistorico(nota.id, usuario.id, h.acao, h.detalhe);
  return nota;
}

export async function atualizarNota(notaId, payload, usuario, status, historicoEntradas) {
  const { rateios, ...campos } = payload;
  const { error } = await supabase
    .from('notas')
    .update({ ...campos, status, pendente: false, motivo_pendencia: null })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await salvarRateios(notaId, payload.tem_rateio ? rateios : []);
  const entradas = Array.isArray(historicoEntradas) ? historicoEntradas : (historicoEntradas ? [historicoEntradas] : []);
  for (const h of entradas) await registrarHistorico(notaId, usuario.id, h.acao, h.detalhe);
}

export async function aprovarNota(notaId, usuario, comentario) {
  const { error } = await supabase
    .from('notas')
    .update({ status: 'aprovado', aprovado_por: usuario.id, data_aprovacao: new Date().toISOString(), comentario_aprovacao: comentario || null })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Nota aprovada', comentario);
}

export async function reprovarNota(notaId, usuario, motivo) {
  const { error } = await supabase
    .from('notas')
    .update({ pendente: true, motivo_pendencia: motivo })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Nota reprovada / devolvida ao departamento', motivo);
}

export async function lancarNoGroup(notaId, usuario, numeroChamado) {
  const { error } = await supabase
    .from('notas')
    .update({ status: 'em_pagamento', numero_chamado: numeroChamado, data_chamado: new Date().toISOString() })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Lançado no Group e chamado aberto no Acelerato', `Chamado nº ${numeroChamado}`);
}

export async function confirmarPagamento(notaId, usuario, dataPagamento) {
  const { error } = await supabase
    .from('notas')
    .update({ status: 'pago', data_pagamento: dataPagamento })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Pagamento confirmado', `Pago em ${dataPagamento}`);
}

export async function marcarPendencia(notaId, usuario, motivo) {
  const { error } = await supabase.from('notas').update({ pendente: true, motivo_pendencia: motivo }).eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Pendência registrada', motivo);
}

export async function resolverPendencia(notaId, usuario, resolucao) {
  const { error } = await supabase.from('notas').update({ pendente: false, motivo_pendencia: null }).eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Pendência resolvida', resolucao);
}
