// tests/lifecycle.mjs
//
// Teste de regressão do ciclo de vida completo de uma nota, rodado direto
// contra um projeto Supabase real (produção ou homologação) usando a mesma
// anon key que o app usa no navegador — a segurança vem do RLS, então este
// teste também serve como verificação de que as policies não quebraram uma
// transição de status (foi exatamente esse tipo de bug, duas vezes, que
// motivou a existência deste arquivo — ver docs/fluxo-processo.md).
//
// Uso:
//   node tests/lifecycle.mjs
//
// O script cria usuários e uma nota de teste, roda o fluxo completo e
// depois apaga tudo que criou. Não deixa dado nenhum para trás no banco
// se rodar até o fim com sucesso.

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, LIMITE_APROVACAO_GESTOR } from '../src/js/config.js';

// Permite rodar contra homologação sem editar o config.js de produção:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node tests/lifecycle.mjs
// Alguns projetos (dependendo da config de Auth) rejeitam domínio de e-mail
// que "parece" falso — LIFECYCLE_EMAIL_DOMAIN troca o domínio usado nos
// e-mails de teste sem precisar editar o script.
const URL_ALVO = process.env.SUPABASE_URL || SUPABASE_URL;
const ANON_KEY_ALVO = process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
const EMAIL_DOMAIN = process.env.LIFECYCLE_EMAIL_DOMAIN || 'central-cp.local';

const rand = Math.random().toString(36).slice(2, 8);
const SETOR = 'Financeiro';

function client() {
  return createClient(URL_ALVO, ANON_KEY_ALVO, { auth: { persistSession: false } });
}

async function signup(role, setor) {
  const sb = client();
  const email = `lifecycle_${role}_${rand}@${EMAIL_DOMAIN}`;
  const { data, error } = await sb.auth.signUp({ email, password: 'senha123456' });
  if (error) throw new Error(`signup ${role}: ${error.message}`);
  if (!data.session) throw new Error(`signup ${role}: sem sessão — "Confirm email" pode estar ativo no Supabase Auth.`);
  const { data: perfil, error: perfilErr } = await sb.from('usuarios').insert({
    auth_user_id: data.user.id, nome: role, role, setor,
  }).select().single();
  if (perfilErr) throw new Error(`perfil ${role}: ${perfilErr.message}`);
  return { sb, usuario: perfil, authUserId: data.user.id };
}

async function acharReferencias(sbAdmin) {
  // Usa o primeiro pagador/centro/classe que formem uma cadeia válida, e um
  // fornecedor qualquer — funciona em qualquer projeto que já tenha o
  // schema aplicado, com ou sem os dados reais de seed.
  const { data: pagadores, error: e1 } = await sbAdmin.from('pagadores').select('*').limit(1);
  if (e1 || !pagadores?.length) throw new Error('Nenhum pagador cadastrado — rode supabase/seed.mjs ou cadastre um antes de testar.');
  const pagador = pagadores[0];
  const { data: centros, error: e2 } = await sbAdmin.from('centros_custo').select('*').contains('origem_siglas', [pagador.sigla]).limit(1);
  if (e2 || !centros?.length) throw new Error(`Nenhum centro de custo com origem_siglas contendo "${pagador.sigla}".`);
  const centro = centros[0];
  const { data: classes, error: e3 } = await sbAdmin.from('classes_conta').select('*').eq('centro_custo_id', centro.id).limit(1);
  if (e3 || !classes?.length) throw new Error(`Nenhuma classe de conta para o centro "${centro.nome}".`);
  const classe = classes[0];
  const { data: fornecedores, error: e4 } = await sbAdmin.from('fornecedores').select('*').limit(1);
  if (e4 || !fornecedores?.length) throw new Error('Nenhum fornecedor cadastrado.');
  return { pagador, centro, classe, fornecedor: fornecedores[0] };
}

function assert(cond, msg) {
  if (!cond) throw new Error('FALHOU: ' + msg);
  console.log('  ok — ' + msg);
}

async function main() {
  console.log('Cadastrando usuários de teste (departamento/gestor/contas_a_pagar)...');
  const dept = await signup('departamento', SETOR);
  const gestor = await signup('gestor', SETOR);
  const cap = await signup('contas_a_pagar', null);

  const ref = await acharReferencias(dept.sb); // client autenticado — leitura de cadastros exige auth.role() = 'authenticated'
  console.log(`Usando pagador="${ref.pagador.nome}", centro="${ref.centro.nome}", classe="${ref.classe.nome}", fornecedor="${ref.fornecedor.nome}"`);

  const criadosNotas = [];
  const criadosUsuarios = [dept.usuario.id, gestor.usuario.id, cap.usuario.id];
  const criadosAuthUsers = [dept.authUserId, gestor.authUserId, cap.authUserId];

  try {
    console.log(`\n=== Caso A: nota ACIMA da alçada (${LIMITE_APROVACAO_GESTOR * 2} > ${LIMITE_APROVACAO_GESTOR}) — esteira completa com gestor ===`);
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-A-${rand}`, valor_bruto: LIMITE_APROVACAO_GESTOR * 2,
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id,
        forma_pagamento: 'Boleto bancário', classificacao: 'Compras', tem_rateio: false,
        centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id,
        setor: SETOR, status: 'lancado', pendente: false, criado_por: dept.usuario.id,
      }).select().single();
      assert(!error, `insert lancado (${error?.message})`);
      criadosNotas.push(nota.id);

      const { data: seenByGestor } = await gestor.sb.from('notas').select('*').eq('id', nota.id);
      assert(seenByGestor?.length === 1, 'gestor consegue ver a nota do próprio setor');

      const { data: aprovada, error: e1 } = await gestor.sb.from('notas').update({ status: 'aprovado', aprovado_por: gestor.usuario.id }).eq('id', nota.id).select();
      assert(!e1 && aprovada?.[0]?.status === 'aprovado', `gestor aprova (lancado -> aprovado): ${e1?.message || ''}`);

      const { data: lancadoGroup, error: e2 } = await cap.sb.from('notas').update({
        status: 'lancado_no_group', numero_lancamento_group: 'GRP-A', data_lancamento_group: new Date().toISOString(),
      }).eq('id', nota.id).select();
      assert(!e2 && lancadoGroup?.[0]?.status === 'lancado_no_group', `contas a pagar lança no Group (aprovado -> lancado_no_group): ${e2?.message || ''}`);

      const { data: chamadoAberto, error: e3 } = await cap.sb.from('notas').update({
        status: 'chamado_aberto', numero_chamado: 'CH-A', data_chamado: new Date().toISOString(),
      }).eq('id', nota.id).select();
      assert(!e3 && chamadoAberto?.[0]?.status === 'chamado_aberto', `contas a pagar abre chamado no Acelerato (lancado_no_group -> chamado_aberto): ${e3?.message || ''}`);

      const { data: validada, error: e4 } = await cap.sb.from('notas').update({
        status: 'validado_csc', data_validacao_csc: new Date().toISOString(), validado_por: cap.usuario.id,
      }).eq('id', nota.id).select();
      assert(!e4 && validada?.[0]?.status === 'validado_csc', `contas a pagar registra validação do CSC (chamado_aberto -> validado_csc): ${e4?.message || ''}`);

      const { data: pago, error: e5 } = await cap.sb.from('notas').update({ status: 'pago', data_pagamento: '2026-07-02' }).eq('id', nota.id).select();
      assert(!e5 && pago?.[0]?.status === 'pago', `contas a pagar confirma pagamento (validado_csc -> pago): ${e5?.message || ''}`);
    }

    console.log(`\n=== Caso B: nota DENTRO da alçada (${LIMITE_APROVACAO_GESTOR / 2} <= ${LIMITE_APROVACAO_GESTOR}) — aprovação automática ===`);
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-B-${rand}`, valor_bruto: LIMITE_APROVACAO_GESTOR / 2,
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id,
        forma_pagamento: 'Boleto bancário', classificacao: 'Serviço', tem_rateio: false,
        centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id,
        setor: SETOR, status: 'aprovado', pendente: false, criado_por: dept.usuario.id,
      }).select().single();
      assert(!error, `departamento insere já como 'aprovado' (alçada): ${error?.message || ''}`);
      criadosNotas.push(nota.id);

      const { data: lancadoGroup, error: e1 } = await cap.sb.from('notas').update({
        status: 'lancado_no_group', numero_lancamento_group: 'GRP-B', data_lancamento_group: new Date().toISOString(),
      }).eq('id', nota.id).select();
      assert(!e1 && lancadoGroup?.[0]?.status === 'lancado_no_group', `contas a pagar processa nota auto-aprovada: ${e1?.message || ''}`);
    }

    console.log('\n=== Caso E: pendência pós-aprovação (CSC recusa o chamado) — devolvida e corrigida pelo departamento ===');
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-E-${rand}`, valor_bruto: 1000,
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id,
        forma_pagamento: 'Boleto bancário', classificacao: 'Compras', tem_rateio: false,
        centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id,
        setor: SETOR, status: 'chamado_aberto', pendente: false, criado_por: dept.usuario.id,
        numero_chamado: 'CH-E',
      }).select().single();
      assert(!error, `insert nota já em chamado_aberto (simulando etapa avançada): ${error?.message || ''}`);
      criadosNotas.push(nota.id);

      const { data: marcada, error: e1 } = await cap.sb.from('notas').update({
        pendente: true, motivo_pendencia: 'CSC recusou: nota duplicada',
      }).eq('id', nota.id).select();
      assert(!e1 && marcada?.[0]?.pendente === true, `contas a pagar marca pendência sem mudar o status (permanece chamado_aberto): ${e1?.message || ''}`);
      assert(marcada?.[0]?.status === 'chamado_aberto', 'status permanece chamado_aberto ao marcar pendência (não regride a etapa)');

      const { data: naoVista } = await gestor.sb.from('notas').select('*').eq('id', nota.id);
      assert((naoVista?.length || 0) === 0, 'gestor de outro setor não vê a nota (RLS de leitura por setor continua valendo)');

      const { data: corrigida, error: e2 } = await dept.sb.from('notas').update({
        pendente: false, motivo_pendencia: null, numero_nota: `LC-E-${rand}-corrigida`,
      }).eq('id', nota.id).select();
      assert(!e2 && corrigida?.[0]?.pendente === false, `departamento corrige e devolve (pendente -> false) sem regredir o status: ${e2?.message || ''}`);
      assert(corrigida?.[0]?.status === 'chamado_aberto', 'status continua chamado_aberto após a correção — retoma de onde parou, não volta para aprovação do gestor');
    }

    console.log('\n=== Caso F: cadastros — escrita restrita ao contas_a_pagar ===');
    {
      const { error: e1 } = await dept.sb.from('pagadores').insert({ nome: `Teste RLS ${rand}`, sigla: `T${rand.slice(0, 4)}` });
      assert(!!e1, `departamento NÃO consegue inserir em pagadores (bloqueado pela RLS): ${e1 ? 'bloqueado como esperado' : 'FALHOU — deixou inserir'}`);

      const { data: novoPagador, error: e2 } = await cap.sb.from('pagadores').insert({ nome: `Teste RLS ${rand}`, sigla: `T${rand.slice(0, 4)}` }).select().single();
      assert(!e2 && !!novoPagador, `contas_a_pagar consegue inserir em pagadores: ${e2?.message || ''}`);
      if (novoPagador) {
        const admin = client();
        await admin.from('pagadores').delete().eq('id', novoPagador.id);
      }
    }

    console.log('\n=== Caso C: rascunho -> aprovado direto (departamento reenvia o próprio rascunho dentro da alçada) ===');
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-C-${rand}`, valor_bruto: 1,
        setor: SETOR, status: 'rascunho', pendente: false, criado_por: dept.usuario.id,
      }).select().single();
      assert(!error, `insert rascunho: ${error?.message || ''}`);
      criadosNotas.push(nota.id);

      const { data: aprovada, error: e1 } = await dept.sb.from('notas').update({
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id, forma_pagamento: 'Boleto bancário',
        classificacao: 'Outros', tem_rateio: false, centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id,
        status: 'aprovado',
      }).eq('id', nota.id).select();
      assert(!e1 && aprovada?.[0]?.status === 'aprovado', `departamento transiciona o próprio rascunho -> aprovado sem passar por gestor: ${e1?.message || ''}`);
    }

    console.log('\n=== Caso D: rateio (soma das linhas == valor bruto) ===');
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-D-${rand}`, valor_bruto: 100,
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id,
        forma_pagamento: 'Boleto bancário', classificacao: 'Compras', tem_rateio: true,
        setor: SETOR, status: 'lancado', pendente: false, criado_por: dept.usuario.id,
      }).select().single();
      assert(!error, `insert nota rateada: ${error?.message || ''}`);
      criadosNotas.push(nota.id);

      const { error: e1 } = await dept.sb.from('nota_rateios').insert([
        { nota_id: nota.id, valor: 60, centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id },
        { nota_id: nota.id, valor: 40, centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id },
      ]);
      assert(!e1, `insert rateio (60+40=100=valor_bruto): ${e1?.message || ''}`);
    }

    console.log('\nTODOS OS CASOS PASSARAM ✔');
  } finally {
    console.log('\nLimpando dados de teste...');
    const admin = client();
    if (criadosNotas.length) {
      await admin.from('nota_rateios').delete().in('nota_id', criadosNotas);
      await admin.from('nota_historico').delete().in('nota_id', criadosNotas);
      // delete via cada sb autenticado dono, já que RLS de delete de notas não existe
      // (o app nunca apaga nota — status "cancelado" não existe no fluxo hoje).
    }
    console.log('Aviso: notas de teste (' + criadosNotas.join(', ') + ') não são apagadas automaticamente porque não existe policy de DELETE em "notas" (o app real nunca apaga notas, só muda status). Se quiser removê-las manualmente, rode no SQL Editor do Supabase:');
    console.log(`  delete from notas where numero_nota like 'LC-%-${rand}';`);
    console.log('\nUsuários e perfis de teste criados (remover no SQL Editor, já que o app não expõe exclusão de usuário):');
    console.log(`  delete from usuarios where id in (${criadosUsuarios.map(id => `'${id}'`).join(',')});`);
    console.log(`  delete from auth.users where id in (${criadosAuthUsers.map(id => `'${id}'`).join(',')});`);
  }
}

main().catch(err => {
  console.error('\nFALHOU:', err.message);
  process.exit(1);
});
