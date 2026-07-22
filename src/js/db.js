// src/js/db.js
import { supabase } from './supabaseClient.js';

/* ==================== APRENDIZADO DE EXTRAÇÃO (por fornecedor) ==================== */

export async function carregarExtracaoHints() {
  const { data, error } = await supabase.from('fornecedor_extracao_hints').select('*');
  if (error) throw new Error('Erro carregando dicas de extração: ' + error.message);
  return data;
}

// Upsert por (fornecedor_id, campo) -- a última resposta da pessoa sempre
// substitui a anterior (o layout do fornecedor não muda de um dia pro
// outro, então não faz sentido acumular várias dicas conflitantes pro
// mesmo campo).
export async function salvarExtracaoHint({ fornecedor_id, campo, ancora, valor_exemplo }, usuarioId) {
  const { error } = await supabase.from('fornecedor_extracao_hints').upsert(
    { fornecedor_id, campo, ancora, valor_exemplo, criado_por: usuarioId, atualizado_em: new Date().toISOString() },
    { onConflict: 'fornecedor_id,campo' },
  );
  if (error) throw new Error('Erro salvando dica de extração: ' + error.message);
}

/* ============================ PUSH (Web Push) ============================ */

// Upsert por endpoint -- se a pessoa reabrir o app no mesmo navegador com
// uma assinatura que já existe (ou o mesmo navegador logar como outro
// usuário depois), a linha é atualizada em vez de duplicar.
export async function salvarPushSubscricao(subscription, usuarioId) {
  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscricoes').upsert(
    { usuario_id: usuarioId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error('Erro salvando assinatura de notificações: ' + error.message);
}

export async function removerPushSubscricao(endpoint) {
  const { error } = await supabase.from('push_subscricoes').delete().eq('endpoint', endpoint);
  if (error) throw new Error('Erro removendo assinatura de notificações: ' + error.message);
}

// Cada usuário atualiza o PRÓPRIO nome (RLS: "usuarios: atualiza o próprio
// ou administrador atualiza qualquer" -- ver migration 0007) -- só o campo
// nome, de propósito (role/setor/ativo continuam só por administrador, via
// Cadastros → Usuários).
export async function atualizarMeuNome(usuarioId, nome) {
  const { error } = await supabase.from('usuarios').update({ nome }).eq('id', usuarioId);
  if (error) throw new Error('Erro atualizando nome: ' + error.message);
}

/* ============================ USUARIOS ============================ */

export async function carregarUsuarios() {
  const { data, error } = await supabase.from('usuarios').select('id, nome, role, setor');
  if (error) throw new Error('Erro carregando usuários: ' + error.message);
  return data;
}

// Versão completa (com email/ativo), pra tela de administração de usuários
// — a lista "leve" acima continua sendo o que o resto do app usa só pra
// resolver nome de quem criou/aprovou/etc.
export async function carregarUsuariosCompletos() {
  const { data, error } = await supabase.from('usuarios').select('*').order('nome');
  if (error) throw new Error('Erro carregando usuários: ' + error.message);
  return data;
}

// Próprio papel + papel de quem te delegou algo ativo agora — usado pra
// decidir o que mostrar na UI (a RLS é quem garante de verdade).
export async function carregarPapeisEfetivos() {
  const { data, error } = await supabase.rpc('papeis_efetivos');
  if (error) throw new Error('Erro carregando papéis: ' + error.message);
  return data || [];
}

// Único jeito de criar usuário novo — chama a Edge Function, que roda com
// service_role (só ela pode criar em auth.users). Só funciona se quem está
// logado já for administrador (a função confere isso ela mesma).
export async function convidarUsuario({ nome, email, role, setor, perfilDepartamento }) {
  const { data, error } = await supabase.functions.invoke('convidar-usuario', {
    body: { action: 'convidar', nome, email, role, setor, perfilDepartamento },
  });
  if (error) throw new Error(error.message);
  if (data && data.error) throw new Error(data.error);
  return data.usuario;
}

// Define a senha do usuário na hora (via mesma Edge Function, que usa a
// service_role) em vez de mandar link de "definir senha" por e-mail --
// alternativa pra quando a rede da empresa bloqueia o domínio do Supabase
// (o link do e-mail aponta pra lá) e o convite normal nunca chega a abrir.
export async function redefinirSenhaUsuario(usuarioId, novaSenha) {
  const { data, error } = await supabase.functions.invoke('convidar-usuario', {
    body: { action: 'redefinir_senha', usuarioId, novaSenha },
  });
  if (error) throw new Error(error.message);
  if (data && data.error) throw new Error(data.error);
}

export async function desativarUsuario(usuarioId) {
  const { data, error } = await supabase.functions.invoke('convidar-usuario', {
    body: { action: 'desativar', usuarioId },
  });
  if (error) throw new Error(error.message);
  if (data && data.error) throw new Error(data.error);
}

export async function reativarUsuario(usuarioId) {
  const { data, error } = await supabase.functions.invoke('convidar-usuario', {
    body: { action: 'reativar', usuarioId },
  });
  if (error) throw new Error(error.message);
  if (data && data.error) throw new Error(data.error);
}

// Exclusão permanente (diferente de desativar) -- só administrador (ver
// convidar-usuario/index.ts, checa isso ela mesma). O banco recusa se o
// usuário tiver notas/movimentações/histórico associados (sem "on delete
// cascade" de propósito -- ver comentário na Edge Function).
export async function excluirUsuario(usuarioId) {
  const { data, error } = await supabase.functions.invoke('convidar-usuario', {
    body: { action: 'excluir', usuarioId },
  });
  if (error) throw new Error(error.message);
  if (data && data.error) throw new Error(data.error);
}

// Trocar role/setor de alguém que já existe não precisa da Edge Function —
// dá pra fazer direto (RLS + trigger bloquear_auto_promocao já garantem
// que só administrador consegue).
export async function atualizarPapelUsuario(usuarioId, { role, setor, perfilDepartamento }) {
  const patch = { role, setor: setor || null };
  // perfil_departamento (ver migration 0029) só faz sentido pra
  // role='departamento' -- fora disso volta pro default 'completo' (não
  // deixa lixo de um perfil antigo se a pessoa trocar de role depois).
  if (perfilDepartamento !== undefined) patch.perfil_departamento = role === 'departamento' ? perfilDepartamento : 'completo';
  const { error } = await supabase.from('usuarios').update(patch).eq('id', usuarioId);
  if (error) throw new Error(error.message);
}

/* ============================ DELEGAÇÕES ============================ */

export async function carregarDelegacoes() {
  const { data, error } = await supabase.from('delegacoes').select('*').order('criado_em', { ascending: false });
  if (error) throw new Error('Erro carregando delegações: ' + error.message);
  return data;
}

export async function criarDelegacao({ titular_id, delegado_id, data_inicio, data_fim, motivo }, usuario) {
  const { error } = await supabase.from('delegacoes').insert({
    titular_id, delegado_id, data_inicio, data_fim, motivo: motivo || null, criado_por: usuario.id,
  });
  if (error) throw new Error(error.message);
}

export async function revogarDelegacao(delegacaoId) {
  const { error } = await supabase.from('delegacoes').update({ ativo: false }).eq('id', delegacaoId);
  if (error) throw new Error(error.message);
}

/* ============================ CADASTROS ============================ */

export async function carregarCadastros() {
  const [pag, cc, cl, cod, forn, caix, set] = await Promise.all([
    supabase.from('pagadores').select('*').order('nome'),
    supabase.from('centros_custo').select('*').order('codigo'),
    supabase.from('classes_conta').select('*').order('codigo'),
    supabase.from('codigos_classificacao').select('*').order('codigo'),
    supabase.from('fornecedores').select('*, fornecedor_contas(*)').order('nome'),
    supabase.from('caixinhas').select('*').order('nome'),
    supabase.from('setores').select('*').order('nome'),
  ]);
  for (const r of [pag, cc, cl, cod, forn, caix, set]) {
    if (r.error) throw new Error('Erro carregando cadastros: ' + r.error.message);
  }
  return {
    pagadores: pag.data,
    centros_custo: cc.data,
    classes_conta: cl.data,
    codigos_classificacao: cod.data,
    fornecedores: forn.data.map(f => ({ ...f, contas: f.fornecedor_contas || [] })),
    caixinhas: caix.data,
    setores: set.data,
  };
}

// Cria um departamento (setor) de verdade -- diferente dos outros
// cadastros genéricos (pagadores/centros de custo/etc.), não é um
// INSERT simples: precisa passar pela RPC criar_setor() (migration 0034),
// que ACRESCENTA o valor no enum setor_tipo (usuarios.setor/notas.setor/
// caixinhas.setor) antes de guardar a config aqui -- só administrador
// (a própria função confere isso, RLS não cobre ALTER TYPE).
export async function criarSetor({ nome, pagador_padrao_id }) {
  const { data, error } = await supabase.rpc('criar_setor', { p_nome: nome, p_pagador_padrao_id: pagador_padrao_id || null });
  if (error) throw new Error(error.message);
  return data;
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

export async function adicionarFornecedor({ nome, cnpj, municipio, cod_group, pessoa_tipo, tipo_contratacao_padrao, contrato_vigencia_inicio, contrato_vigencia_fim, contrato_observacoes, contas }) {
  const { data: forn, error } = await supabase
    .from('fornecedores')
    .insert({ nome, cnpj, municipio, cod_group, pessoa_tipo, tipo_contratacao_padrao, contrato_vigencia_inicio, contrato_vigencia_fim, contrato_observacoes })
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

// Contas bancárias são sempre substituídas por inteiro (apaga tudo e
// reinsere a partir de app.fornecedorContasTemp) -- mais simples do que
// tentar diferenciar quais mudaram, e não tem nada referenciando o id de
// uma conta bancária específica em outro lugar do banco.
// status: 'ativo' sempre -- editar/completar um fornecedor (por qualquer
// caminho, inclusive "Validar e ativar" na aba Cadastrar fornecedor) É o
// próprio ato de validação de um pré-cadastro (ver migration 0030); um
// fornecedor já ativo simplesmente continua ativo.
export async function atualizarFornecedor(id, { nome, cnpj, municipio, cod_group, pessoa_tipo, tipo_contratacao_padrao, contrato_vigencia_inicio, contrato_vigencia_fim, contrato_observacoes, contas }) {
  const { error } = await supabase
    .from('fornecedores')
    .update({ nome, cnpj, municipio, cod_group, pessoa_tipo, tipo_contratacao_padrao, contrato_vigencia_inicio, contrato_vigencia_fim, contrato_observacoes, status: 'ativo' })
    .eq('id', id);
  if (error) throw new Error(error.message);
  const { error: errDel } = await supabase.from('fornecedor_contas').delete().eq('fornecedor_id', id);
  if (errDel) throw new Error(errDel.message);
  if (contas && contas.length > 0) {
    const { error: errContas } = await supabase.from('fornecedor_contas').insert(
      contas.map(c => ({ fornecedor_id: id, cod_banco: c.cod_banco, agencia: c.agencia, conta: c.conta }))
    );
    if (errContas) throw new Error(errContas.message);
  }
}

const BUCKET_DOCUMENTOS_FORNECEDOR = 'documentos-fornecedor';

// Pré-cadastro de fornecedor (ver migration 0030): o departamento
// "completo" cria isso direto no formulário de nota quando não acha o
// fornecedor -- só nome/CNPJ + documento(s), sem contas bancárias/
// contrato (isso o CP completa depois, ver atualizarFornecedor). Volta o
// fornecedor criado (com id) pra já poder selecionar ele no combo da nota.
export async function preCadastrarFornecedor({ nome, cnpj }, arquivos, usuario) {
  const { data: forn, error } = await supabase
    .from('fornecedores')
    .insert({ nome, cnpj: cnpj || null, status: 'pre_cadastro', pre_cadastrado_por: usuario.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const caminhos = [];
  for (const file of arquivos || []) {
    const nomeSanitizado = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const caminho = `${forn.id}/${Date.now()}-${nomeSanitizado}`;
    const { error: errUpload } = await supabase.storage.from(BUCKET_DOCUMENTOS_FORNECEDOR).upload(caminho, file);
    if (errUpload) throw new Error(`Erro ao enviar o documento "${file.name}": ${errUpload.message}`);
    caminhos.push(caminho);
  }
  if (caminhos.length > 0) {
    const { error: errDocs } = await supabase.from('fornecedores').update({ documentos_pre_cadastro: caminhos }).eq('id', forn.id);
    if (errDocs) throw new Error(errDocs.message);
  }
  return { ...forn, documentos_pre_cadastro: caminhos };
}

export async function urlAssinadaDocumentoFornecedor(caminho) {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS_FORNECEDOR).createSignedUrl(caminho, 60);
  if (error) throw new Error('Erro ao gerar link do documento: ' + error.message);
  return data.signedUrl;
}

export async function removerItemCadastro(tabela, id) {
  const { error } = await supabase.from(tabela).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ============================== NOTAS =============================== */

const SELECT_NOTA_COMPLETA = '*, nota_rateios(*), nota_historico(*), nota_impostos(*)';

function normalizarNota(row) {
  return {
    ...row,
    rateios: (row.nota_rateios || []).slice(),
    historico: (row.nota_historico || []).slice().sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em)),
    impostos: (row.nota_impostos || []).slice(),
  };
}

// O PostgREST tem um teto padrão de 1000 linhas por resposta — sem
// paginar, uma vez que a tabela passar disso o app começa a "esquecer"
// notas silenciosamente (sem erro nenhum, só menos linhas voltando).
// Busca em páginas até a resposta vir menor que o tamanho da página,
// garantindo que carregarNotas() sempre traz tudo, não importa o volume.
const TAMANHO_PAGINA_NOTAS = 1000;

export async function carregarNotas() {
  const todas = [];
  let pagina = 0;
  for (;;) {
    const de = pagina * TAMANHO_PAGINA_NOTAS;
    const ate = de + TAMANHO_PAGINA_NOTAS - 1;
    const { data, error } = await supabase
      .from('notas')
      .select(SELECT_NOTA_COMPLETA)
      .order('id')
      .range(de, ate);
    if (error) throw new Error('Erro carregando notas: ' + error.message);
    todas.push(...data);
    if (data.length < TAMANHO_PAGINA_NOTAS) break;
    pagina++;
  }
  return todas.map(normalizarNota);
}

/* ============================ ANEXOS (Storage) ============================ */
const BUCKET_ANEXOS = 'anexos-notas';

// Path = "{notaId}/{timestamp}-{nome-sanitizado}" — o primeiro segmento
// é o que a RLS do bucket usa pra saber a qual nota o arquivo pertence
// (ver "anexos-notas: *" em supabase/migrations/0011_storage_anexos.sql).
export async function uploadAnexo(notaId, file) {
  const nomeSanitizado = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const caminho = `${notaId}/${Date.now()}-${nomeSanitizado}`;
  const { error } = await supabase.storage.from(BUCKET_ANEXOS).upload(caminho, file);
  if (error) throw new Error(`Erro ao enviar o anexo "${file.name}": ${error.message}`);
  return caminho;
}

export async function removerAnexo(caminho) {
  const { error } = await supabase.storage.from(BUCKET_ANEXOS).remove([caminho]);
  if (error) throw new Error('Erro ao remover anexo: ' + error.message);
}

// Baixa o conteúdo de um anexo já salvo — usado pra remontar o PDF único
// da nota (ver anexos_pdf.js) quando a edição mistura anexo que já existia
// com arquivo novo escolhido agora.
export async function baixarAnexo(caminho) {
  const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).download(caminho);
  if (error) throw new Error('Erro ao baixar anexo: ' + error.message);
  return data;
}

// Substitui TODOS os anexos da nota pelo PDF único já mesclado/renomeado
// (ver mesclarAnexosEmPdfUnico em anexos_pdf.js) — cada nota tem sempre no
// máximo um arquivo final no Storage, nunca fragmentos soltos.
export async function substituirAnexosFinal(notaId, blob, nomeArquivo) {
  const { data: existentes } = await supabase.storage.from(BUCKET_ANEXOS).list(notaId);
  if (existentes && existentes.length > 0) {
    await supabase.storage.from(BUCKET_ANEXOS).remove(existentes.map(a => `${notaId}/${a.name}`));
  }
  const caminho = `${notaId}/${nomeArquivo}`;
  const { error } = await supabase.storage.from(BUCKET_ANEXOS).upload(caminho, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error('Erro ao enviar anexo final: ' + error.message);
  return caminho;
}

export async function atualizarAnexosNota(notaId, anexos) {
  const { error } = await supabase.from('notas').update({ anexos }).eq('id', notaId);
  if (error) throw new Error(error.message);
}

export async function urlAssinadaAnexo(caminho) {
  const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(caminho, 60);
  if (error) throw new Error('Erro ao gerar link do anexo: ' + error.message);
  return data.signedUrl;
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

// Mesmo padrão de salvarRateios: apaga tudo e reinsere -- o trigger
// recalcular_valor_liquido_* (migration 0019) cuida de manter
// notas.valor_liquido em dia a cada mudança, não é responsabilidade do JS.
async function salvarImpostos(notaId, impostos) {
  await supabase.from('nota_impostos').delete().eq('nota_id', notaId);
  if (impostos && impostos.length > 0) {
    const { error } = await supabase.from('nota_impostos').insert(
      impostos.map(i => ({ nota_id: notaId, tipo: i.tipo, valor: i.valor, descricao: i.descricao || null }))
    );
    if (error) throw new Error(error.message);
  }
}

// payload: campos da tabela `notas` (sem id/status/criado_por/setor) + rateios[] + impostos[]
export async function criarNota(payload, usuario, status, historicoInicial) {
  // tem_parcelamento/parcelas (ver events_notas.js/coletarPayload): puro
  // controle de orquestração do parcelamento (explode em N chamadas a
  // criarNota, cada uma com seu próprio payload), nunca uma coluna de
  // `notas` -- precisa sair de `campos` igual rateios/impostos, senão o
  // insert/update quebra com coluna inexistente.
  const { rateios, impostos, tem_parcelamento, parcelas, ...campos } = payload;
  // setor já vem certo em campos.setor (coletarPayload resolve isso: fixo
  // do perfil pra departamento, escolhido na hora pra quem não tem setor
  // fixo) — não sobrescreve mais com usuario.setor, que é null pra
  // administrador/gerente_financeiro.
  const { data: nota, error } = await supabase
    .from('notas')
    .insert({ ...campos, status, criado_por: usuario.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (payload.tem_rateio) await salvarRateios(nota.id, rateios);
  if (payload.tem_retencao_imposto) await salvarImpostos(nota.id, impostos);
  for (const h of historicoInicial) await registrarHistorico(nota.id, usuario.id, h.acao, h.detalhe);
  return nota;
}

// Promove uma nota recém-criada como 'rascunho' pro status de verdade
// (lancado/aprovado) DEPOIS de já ter anexado os arquivos -- ver o
// comentário em cima da chamada em events_notas.js/events_lote_notas.js
// pro porquê dessa ordem (criar como rascunho -> anexar -> promover),
// não é só estética: departamento só pode dar UPDATE numa nota própria
// enquanto ela está em 'rascunho'/'lancado' (ou pendente=true) -- pular
// direto pra 'aprovado' na criação faria o UPDATE seguinte de anexar
// arquivo (uma chamada separada) cair fora dessa policy e a RLS
// simplesmente não afetar nenhuma linha, sem erro nenhum -- o anexo
// "sumia" silenciosamente. Criar como rascunho garante que esse UPDATE
// intermediário sempre acontece enquanto o status ainda está numa faixa
// que o dono pode mexer.
export async function promoverStatusNota(notaId, novoStatus, usuario, historicoEntradas) {
  const { error } = await supabase.from('notas').update({ status: novoStatus }).eq('id', notaId);
  if (error) throw new Error(error.message);
  for (const h of historicoEntradas || []) await registrarHistorico(notaId, usuario.id, h.acao, h.detalhe);
}

export async function atualizarNota(notaId, payload, usuario, status, historicoEntradas) {
  // tem_parcelamento/parcelas (ver events_notas.js/coletarPayload): puro
  // controle de orquestração do parcelamento (explode em N chamadas a
  // criarNota, cada uma com seu próprio payload), nunca uma coluna de
  // `notas` -- precisa sair de `campos` igual rateios/impostos, senão o
  // insert/update quebra com coluna inexistente.
  const { rateios, impostos, tem_parcelamento, parcelas, ...campos } = payload;
  const { error } = await supabase
    .from('notas')
    .update({ ...campos, status, pendente: false, motivo_pendencia: null })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await salvarRateios(notaId, payload.tem_rateio ? rateios : []);
  await salvarImpostos(notaId, payload.tem_retencao_imposto ? impostos : []);
  const entradas = Array.isArray(historicoEntradas) ? historicoEntradas : (historicoEntradas ? [historicoEntradas] : []);
  for (const h of entradas) await registrarHistorico(notaId, usuario.id, h.acao, h.detalhe);
}

// O "completo" preenche o resto de uma nota que chegou como 'recebido'
// (perfil recebedor: só anexo + classificação) e a lança de verdade --
// daqui pra frente ela vira uma nota comum, então criado_por passa a ser
// de quem completou (é quem "lançou" no sentido que o resto do app usa --
// "Minhas notas", uma pendência futura do contas a pagar etc. -- o
// recebedor só capturou o documento, não é dono do lançamento).
export async function completarRecebimento(notaId, payload, usuario, novoStatus, historicoEntradas) {
  // tem_parcelamento/parcelas (ver events_notas.js/coletarPayload): puro
  // controle de orquestração do parcelamento (explode em N chamadas a
  // criarNota, cada uma com seu próprio payload), nunca uma coluna de
  // `notas` -- precisa sair de `campos` igual rateios/impostos, senão o
  // insert/update quebra com coluna inexistente.
  const { rateios, impostos, tem_parcelamento, parcelas, ...campos } = payload;
  const { error } = await supabase
    .from('notas')
    .update({ ...campos, status: novoStatus, criado_por: usuario.id, pendente: false, motivo_pendencia: null })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await salvarRateios(notaId, payload.tem_rateio ? rateios : []);
  await salvarImpostos(notaId, payload.tem_retencao_imposto ? impostos : []);
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

// Aprovação em lote (pedido do dono do produto): o gerente/administrador
// seleciona várias notas na fila "Aguardando aprovação" (ver
// renderQueueAprovacao em ui.js) e aprova todas de uma vez -- mesmo
// destino final de aprovarNota (uma por uma), só que em loop; reprovar
// continua individual de propósito (cada reprovação tem um motivo
// próprio, não faz sentido reprovar várias com o mesmo texto).
export async function aprovarNotaLote(notaIds, usuario) {
  await atualizarNotasLote(
    notaIds,
    { status: 'aprovado', aprovado_por: usuario.id, data_aprovacao: new Date().toISOString() },
    usuario, 'Nota aprovada (aprovação em lote)', null
  );
}

// ---- ações do contas_a_pagar, sempre "em lote" (uma ou várias notas de
// uma vez — a UI agrupa por pagador + vencimento e chama essas funções com
// a lista de ids do grupo inteiro; uma nota isolada é só um lote de 1).
// Cada nota do lote recebe sua própria entrada de histórico, pro rastro de
// auditoria ficar completo mesmo quando a ação foi feita em conjunto.
async function atualizarNotasLote(notaIds, patch, usuario, acao, detalhe) {
  for (const notaId of notaIds) {
    const { error } = await supabase.from('notas').update(patch).eq('id', notaId);
    if (error) throw new Error(error.message);
    await registrarHistorico(notaId, usuario.id, acao, detalhe);
  }
}

export async function lancarNoGroupLote(notaIds, usuario, numeroLancamentoGroup) {
  await atualizarNotasLote(
    notaIds,
    { status: 'lancado_no_group', numero_lancamento_group: numeroLancamentoGroup, data_lancamento_group: new Date().toISOString() },
    usuario, 'Lançado no Group', `Código de lançamento: ${numeroLancamentoGroup}`
  );
}

export async function abrirChamadoLote(notaIds, usuario, numeroChamado) {
  await atualizarNotasLote(
    notaIds,
    { status: 'chamado_aberto', numero_chamado: numeroChamado, data_chamado: new Date().toISOString() },
    usuario, 'Chamado aberto no Acelerato', `Chamado nº ${numeroChamado}`
  );
}

export async function validarCscLote(notaIds, usuario) {
  await atualizarNotasLote(
    notaIds,
    { status: 'validado_csc', data_validacao_csc: new Date().toISOString(), validado_por: usuario.id },
    usuario, 'Validado pelo CSC', null
  );
}

export async function confirmarPagamentoLote(notaIds, usuario, dataPagamento) {
  await atualizarNotasLote(
    notaIds,
    { status: 'pago', data_pagamento: dataPagamento },
    usuario, 'Pagamento confirmado', `Pago em ${dataPagamento}`
  );
}

// Marcar pendência continua sendo por nota (o CSC recusa uma nota específica
// dentro do lote, não o lote inteiro) — quem resolve agora é sempre o
// departamento (ver corrigirPendencia), o contas_a_pagar só marca.
export async function marcarPendencia(notaId, usuario, motivo) {
  const { error } = await supabase.from('notas').update({ pendente: true, motivo_pendencia: motivo }).eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Pendência registrada', motivo);
}

// O departamento edita os dados da nota (mesma tela do formulário de nota)
// e devolve — o status não muda, só sai da fila de pendências e volta pra
// onde o contas_a_pagar tinha parado.
export async function corrigirPendencia(notaId, payload, usuario, resolucao, historicoExtra) {
  // tem_parcelamento/parcelas (ver events_notas.js/coletarPayload): puro
  // controle de orquestração do parcelamento (explode em N chamadas a
  // criarNota, cada uma com seu próprio payload), nunca uma coluna de
  // `notas` -- precisa sair de `campos` igual rateios/impostos, senão o
  // insert/update quebra com coluna inexistente.
  const { rateios, impostos, tem_parcelamento, parcelas, ...campos } = payload;
  const { error } = await supabase
    .from('notas')
    .update({ ...campos, pendente: false, motivo_pendencia: null })
    .eq('id', notaId);
  if (error) throw new Error(error.message);
  await salvarRateios(notaId, payload.tem_rateio ? rateios : []);
  await salvarImpostos(notaId, payload.tem_retencao_imposto ? impostos : []);
  await registrarHistorico(notaId, usuario.id, 'Pendência corrigida pelo departamento e devolvida', resolucao || null);
  const entradas = Array.isArray(historicoExtra) ? historicoExtra : (historicoExtra ? [historicoExtra] : []);
  for (const h of entradas) await registrarHistorico(notaId, usuario.id, h.acao, h.detalhe);
}

/* ======================= EXCLUIR / CANCELAR LANÇAMENTO ======================= */

// "Excluir de vez" — pra departamento/gerente_financeiro só funciona em
// notas que ainda não saíram do Central CP (rascunho/aguardando
// aprovação/aprovada); administrador pode em qualquer etapa, inclusive já
// paga (a RLS garante os dois casos, ver policy "notas: delete"). Apaga a
// linha (rateios e histórico vão junto, via cascade) e os arquivos
// anexados dela no Storage, que não têm cascade automático.
export async function excluirNota(notaId) {
  const { data: arquivos } = await supabase.storage.from('anexos-notas').list(notaId);
  if (arquivos && arquivos.length > 0) {
    await supabase.storage.from('anexos-notas').remove(arquivos.map(a => `${notaId}/${a.name}`));
  }
  const { error } = await supabase.from('notas').delete().eq('id', notaId);
  if (error) throw new Error(error.message);
}

// "Cancelar" — pra quando a nota já foi lançada no Group ou depois, ponto
// em que existe uma referência fora do Central CP e apagar de vez
// deixaria essa referência órfã. Mantém a linha (e todo o histórico) só
// tirando das filas ativas; o banco bloqueia cancelar uma nota já paga
// (trigger bloquear_cancelamento_de_paga).
export async function cancelarNota(notaId, usuario, motivo) {
  const { error } = await supabase.from('notas').update({
    status: 'cancelada',
    pendente: false,
    motivo_cancelamento: motivo,
    cancelado_por: usuario.id,
    data_cancelamento: new Date().toISOString(),
  }).eq('id', notaId);
  if (error) throw new Error(error.message);
  await registrarHistorico(notaId, usuario.id, 'Lançamento cancelado', motivo);
}

/* ======================= IMPORTAÇÃO DE HISTÓRICO (só administrador) ======================= */

// Insere uma nota já pronta (campos resolvidos por processarLinhasImportacao,
// ver import_historico.js). `criado_por` sempre é quem está importando — é
// exigência da RLS de "notas: insert" (eh_super_usuario() só permite
// criado_por = si mesmo) — o nome de quem solicitou de verdade, quando veio
// na planilha, fica em `solicitante_historico`. O histórico marca
// `origem: 'importacao_historica'` pra notificar_movimentacao() não disparar
// e-mail pra cada lançamento antigo importado em lote.
export async function importarNotaHistorica(nota) {
  const { rateios, _linhasPlanilha, ...campos } = nota;
  const { data: notaCriada, error } = await supabase.from('notas').insert(campos).select().single();
  if (error) throw new Error(error.message);
  if (nota.tem_rateio && rateios.length > 0) await salvarRateios(notaCriada.id, rateios);
  const { error: errHist } = await supabase.from('nota_historico').insert({
    nota_id: notaCriada.id, usuario_id: nota.criado_por, acao: 'Importado do histórico', detalhe: null, origem: 'importacao_historica',
  });
  if (errHist) throw new Error(errHist.message);
  return notaCriada;
}

/* ======================= ARMAZENAMENTO E ARQUIVAMENTO (Cadastros → Armazenamento/Arquivos) ======================= */

// Só administrador (a função no banco confere isso ela mesma e recusa
// qualquer outro perfil) — tamanho do banco (dados) e do Storage
// (arquivos), pra acompanhar os limites do plano gratuito do Supabase.
export async function obterEstatisticasArmazenamento() {
  const { data, error } = await supabase.rpc('stats_armazenamento');
  if (error) throw new Error('Erro ao carregar estatísticas de armazenamento: ' + error.message);
  return data && data[0];
}

// Baixa o .zip (ver zip_anexos.js) → confirma que salvou na rede local →
// só então isso é chamado: apaga os arquivos do Storage de cada nota do
// grupo, e a RPC arquivar_anexos_lote() marca anexo_arquivado_em + grava o
// histórico. É RPC (não um update direto) porque a policy geral de "notas:
// update" restringe contas_a_pagar a status até 'validado_csc' — uma nota
// já 'pago' (o caso mais comum pra arquivar) cairia fora dela e o update
// silenciosamente não afetaria nenhuma linha; a RPC confere a permissão ela
// mesma (eh_operador_cadastro()) e faz só essa operação específica, sem
// depender da policy de status. O banco também recusa isso pra nota sem
// chamado aberto no Acelerato — trigger bloquear_arquivamento_sem_chamado.
export async function arquivarAnexosNotas(notaIds) {
  for (const notaId of notaIds) {
    const { data: arquivos } = await supabase.storage.from('anexos-notas').list(notaId);
    if (arquivos && arquivos.length > 0) {
      await supabase.storage.from('anexos-notas').remove(arquivos.map(a => `${notaId}/${a.name}`));
    }
  }
  const { error } = await supabase.rpc('arquivar_anexos_lote', { p_nota_ids: notaIds });
  if (error) throw new Error(error.message);
}

/* ============================ CAIXINHA (fundo fixo) ============================ */

export async function carregarCaixinhas() {
  const { data, error } = await supabase.from('caixinhas').select('*').order('nome');
  if (error) throw new Error('Erro carregando caixinhas: ' + error.message);
  return data;
}

export async function carregarCaixinhaMovimentacoes() {
  const { data, error } = await supabase.from('caixinha_movimentacoes').select('*').order('criado_em', { ascending: false });
  if (error) throw new Error('Erro carregando movimentações da caixinha: ' + error.message);
  return data;
}

export async function adicionarCaixinha({ nome, valor_teto, setor }) {
  const { error } = await supabase.from('caixinhas').insert({ nome, valor_teto, setor });
  if (error) throw new Error(error.message);
}

export async function atualizarCaixinha(id, { nome, valor_teto, setor }) {
  const { error } = await supabase.from('caixinhas').update({ nome, valor_teto, setor }).eq('id', id);
  if (error) throw new Error(error.message);
}

// status já vem decidido por quem chama (statusInicialMovimentacaoCaixinha
// em events_caixinha.js -- aprovado direto se quem registra já tem
// autoridade de aprovação, senão pendente_aprovacao; a RLS confere de
// novo, então não dá pra forjar isso mandando um status errado).
export async function registrarMovimentacaoCaixinha({ caixinha_id, tipo, valor, data, motivo, status }, usuario) {
  const { data: mov, error } = await supabase
    .from('caixinha_movimentacoes')
    .insert({ caixinha_id, tipo, valor, data, motivo, status, criado_por: usuario.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mov;
}

const BUCKET_COMPROVANTES_CAIXINHA = 'comprovantes-caixinha';

// Comprovante é opcional e a movimentação já existe antes do upload (mesmo
// problema de ovo-e-galinha dos anexos de nota) -- por isso vem separado
// de registrarMovimentacaoCaixinha, chamado logo em seguida quando tem
// arquivo escolhido.
export async function uploadComprovanteCaixinha(movimentacaoId, file) {
  const nomeSanitizado = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const caminho = `${movimentacaoId}/${Date.now()}-${nomeSanitizado}`;
  const { error } = await supabase.storage.from(BUCKET_COMPROVANTES_CAIXINHA).upload(caminho, file);
  if (error) throw new Error(`Erro ao enviar o comprovante "${file.name}": ${error.message}`);
  const { error: errUpdate } = await supabase.from('caixinha_movimentacoes').update({ comprovante: caminho }).eq('id', movimentacaoId);
  if (errUpdate) throw new Error(errUpdate.message);
  return caminho;
}

export async function urlAssinadaComprovanteCaixinha(caminho) {
  const { data, error } = await supabase.storage.from(BUCKET_COMPROVANTES_CAIXINHA).createSignedUrl(caminho, 60);
  if (error) throw new Error('Erro ao gerar link do comprovante: ' + error.message);
  return data.signedUrl;
}

export async function aprovarMovimentacaoCaixinha(id, usuario) {
  const { error } = await supabase.from('caixinha_movimentacoes')
    .update({ status: 'aprovado', aprovado_por: usuario.id, aprovado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function rejeitarMovimentacaoCaixinha(id, usuario, motivo) {
  const { error } = await supabase.from('caixinha_movimentacoes')
    .update({ status: 'rejeitado', aprovado_por: usuario.id, aprovado_em: new Date().toISOString(), motivo_rejeicao: motivo })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirMovimentacaoCaixinha(movimentacaoId) {
  const { data: arquivos } = await supabase.storage.from(BUCKET_COMPROVANTES_CAIXINHA).list(movimentacaoId);
  if (arquivos && arquivos.length > 0) {
    await supabase.storage.from(BUCKET_COMPROVANTES_CAIXINHA).remove(arquivos.map(a => `${movimentacaoId}/${a.name}`));
  }
  const { error } = await supabase.from('caixinha_movimentacoes').delete().eq('id', movimentacaoId);
  if (error) throw new Error(error.message);
}
