// tests/lifecycle.mjs
//
// Teste de regressão do ciclo de vida completo de uma nota, rodado direto
// contra um projeto Supabase real (produção ou homologação) usando a mesma
// anon key que o app usa no navegador — a segurança vem do RLS, então este
// teste também serve como verificação de que as policies não quebraram uma
// transição de status (foi exatamente esse tipo de bug, várias vezes, que
// motivou a existência deste arquivo — ver docs/fluxo-processo.md).
//
// Uso:
//   1. copie .env.example para .env e preencha SUPABASE_URL e
//      SUPABASE_SERVICE_ROLE_KEY (a mesma usada em supabase/seed.mjs e
//      supabase/criar-admin.mjs) — o cadastro é fechado agora, então
//      precisamos dela só pra CRIAR as contas de teste. Todo o resto do
//      teste roda com a anon key normal, autenticado como cada usuário de
//      teste, exatamente como o app faz no navegador.
//   2. node tests/lifecycle.mjs
//
// O script cria usuários e notas de teste, roda o fluxo completo e depois
// apaga tudo que criou (incluindo as contas de Auth). Não deixa dado nenhum
// para trás no banco se rodar até o fim com sucesso.

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, LIMITE_APROVACAO_GESTOR } from '../src/js/config.js';

// Permite rodar contra homologação sem editar o config.js de produção:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node tests/lifecycle.mjs
// Alguns projetos (dependendo da config de Auth) rejeitam domínio de e-mail
// que "parece" falso — LIFECYCLE_EMAIL_DOMAIN troca o domínio usado nos
// e-mails de teste sem precisar editar o script.
const URL_ALVO = process.env.SUPABASE_URL || SUPABASE_URL;
const ANON_KEY_ALVO = process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL_DOMAIN = process.env.LIFECYCLE_EMAIL_DOMAIN || 'central-cp.local';
const SENHA_TESTE = 'senha123456';

if (!SERVICE_KEY) {
  console.error('Faltou SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  console.error('O cadastro de usuário é fechado agora (só administrador convida) — este teste precisa');
  console.error('da service_role key só pra CRIAR as contas de teste, a mesma de supabase/seed.mjs e');
  console.error('supabase/criar-admin.mjs. Preencha no seu .env e rode de novo.');
  process.exit(1);
}

const rand = Math.random().toString(36).slice(2, 8);
const SETOR = 'Financeiro';

function client() {
  return createClient(URL_ALVO, ANON_KEY_ALVO, { auth: { persistSession: false } });
}
function adminClient() {
  return createClient(URL_ALVO, SERVICE_KEY, { auth: { persistSession: false } });
}

// Cria a conta com a service_role key (mesmo caminho da Edge Function
// "convidar-usuario") e depois loga normalmente com a anon key — a partir
// daí, tudo que o "usuario" de teste faz passa pela RLS de verdade, igual
// a um usuário real no navegador.
async function signup(role, setor) {
  const admin = adminClient();
  const email = `lifecycle_${role}_${rand}@${EMAIL_DOMAIN}`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email, password: SENHA_TESTE, email_confirm: true,
  });
  if (authError) throw new Error(`criar conta de auth (${role}): ${authError.message}`);

  const { data: perfil, error: perfilErr } = await admin.from('usuarios').insert({
    auth_user_id: authData.user.id, nome: `Teste ${role}`, role, setor, email, ativo: true,
  }).select().single();
  if (perfilErr) throw new Error(`criar perfil (${role}): ${perfilErr.message}`);

  const sb = client();
  const { error: loginErr } = await sb.auth.signInWithPassword({ email, password: SENHA_TESTE });
  if (loginErr) throw new Error(`login (${role}): ${loginErr.message}`);
  return { sb, usuario: perfil, authUserId: authData.user.id };
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
  console.log('Criando usuários de teste (departamento/gerente_financeiro/contas_a_pagar/administrador)...');
  const dept = await signup('departamento', SETOR);
  const deptOutroSetor = await signup('departamento', 'Marketing');
  const gerente = await signup('gerente_financeiro', null);
  const cap = await signup('contas_a_pagar', null);
  const admin = await signup('administrador', null);

  const ref = await acharReferencias(dept.sb); // client autenticado — leitura de cadastros exige auth.role() = 'authenticated'
  console.log(`Usando pagador="${ref.pagador.nome}", centro="${ref.centro.nome}", classe="${ref.classe.nome}", fornecedor="${ref.fornecedor.nome}"`);

  const criadosNotas = [];
  const criadosAuthUsers = [dept.authUserId, deptOutroSetor.authUserId, gerente.authUserId, cap.authUserId, admin.authUserId];

  try {
    console.log(`\n=== Caso A: nota ACIMA da alçada (${LIMITE_APROVACAO_GESTOR * 2} > ${LIMITE_APROVACAO_GESTOR}) — esteira completa com o gerente financeiro ===`);
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-A-${rand}`, valor_bruto: LIMITE_APROVACAO_GESTOR * 2,
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id,
        forma_pagamento: 'Boleto bancário', classificacao: 'Compras', tem_rateio: false,
        centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id, competencia: '2026-06-01',
        setor: SETOR, status: 'lancado', pendente: false, criado_por: dept.usuario.id,
      }).select().single();
      assert(!error, `insert lancado (${error?.message})`);
      criadosNotas.push(nota.id);

      const { data: seenByGerente } = await gerente.sb.from('notas').select('*').eq('id', nota.id);
      assert(seenByGerente?.length === 1, 'gerente financeiro (global, sem setor) consegue ver a nota de qualquer setor');

      const { data: naoVistaOutroDept } = await deptOutroSetor.sb.from('notas').select('*').eq('id', nota.id);
      assert((naoVistaOutroDept?.length || 0) === 0, 'departamento de outro setor (sem delegação) NÃO vê a nota');

      const { data: aprovada, error: e1 } = await gerente.sb.from('notas').update({ status: 'aprovado', aprovado_por: gerente.usuario.id }).eq('id', nota.id).select();
      assert(!e1 && aprovada?.[0]?.status === 'aprovado', `gerente financeiro aprova (lancado -> aprovado): ${e1?.message || ''}`);

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
        centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id, competencia: '2026-06-01',
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
        centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id, competencia: '2026-06-01',
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

      const { data: naoVistaOutroDept } = await deptOutroSetor.sb.from('notas').select('*').eq('id', nota.id);
      assert((naoVistaOutroDept?.length || 0) === 0, 'departamento sem relação com a nota (nem dono, nem delegado) não a vê mesmo pendente');

      const { data: corrigida, error: e2 } = await dept.sb.from('notas').update({
        pendente: false, motivo_pendencia: null, numero_nota: `LC-E-${rand}-corrigida`,
      }).eq('id', nota.id).select();
      assert(!e2 && corrigida?.[0]?.pendente === false, `departamento corrige e devolve (pendente -> false) sem regredir o status: ${e2?.message || ''}`);
      assert(corrigida?.[0]?.status === 'chamado_aberto', 'status continua chamado_aberto após a correção — retoma de onde parou, não volta para aprovação');
    }

    console.log('\n=== Caso F: cadastros — escrita restrita a contas_a_pagar/gerente_financeiro/administrador ===');
    {
      const { error: e1 } = await dept.sb.from('pagadores').insert({ nome: `Teste RLS ${rand}`, sigla: `T${rand.slice(0, 4)}` });
      assert(!!e1, `departamento NÃO consegue inserir em pagadores (bloqueado pela RLS): ${e1 ? 'bloqueado como esperado' : 'FALHOU — deixou inserir'}`);

      const { data: novoPagador, error: e2 } = await cap.sb.from('pagadores').insert({ nome: `Teste RLS ${rand}`, sigla: `T${rand.slice(0, 4)}` }).select().single();
      assert(!e2 && !!novoPagador, `contas_a_pagar consegue inserir em pagadores: ${e2?.message || ''}`);
      if (novoPagador) await adminClient().from('pagadores').delete().eq('id', novoPagador.id);
    }

    console.log('\n=== Caso G: administrador/gerente_financeiro têm acesso total (também executam as ações do contas a pagar) ===');
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-G-${rand}`, valor_bruto: 500,
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id,
        forma_pagamento: 'Boleto bancário', classificacao: 'Compras', tem_rateio: false,
        centro_custo_id: ref.centro.id, classe_conta_id: ref.classe.id, competencia: '2026-06-01',
        setor: SETOR, status: 'aprovado', pendente: false, criado_por: dept.usuario.id,
      }).select().single();
      assert(!error, `insert nota já aprovada: ${error?.message || ''}`);
      criadosNotas.push(nota.id);

      const { data: pulou, error: e1 } = await admin.sb.from('notas').update({
        status: 'pago', numero_lancamento_group: 'GRP-G', numero_chamado: 'CH-G', data_pagamento: '2026-07-02',
      }).eq('id', nota.id).select();
      assert(!e1 && pulou?.[0]?.status === 'pago', `administrador pula direto pra 'pago' sem passar pelas etapas intermediárias (acesso total): ${e1?.message || ''}`);
    }

    console.log('\n=== Caso H: delegação — departamento cobre outro departamento durante o período ===');
    {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: nota, error } = await deptOutroSetor.sb.from('notas').insert({
        numero_nota: `LC-H-${rand}`, valor_bruto: 10,
        setor: 'Marketing', status: 'rascunho', pendente: false, criado_por: deptOutroSetor.usuario.id,
      }).select().single();
      assert(!error, `insert rascunho do titular: ${error?.message || ''}`);
      criadosNotas.push(nota.id);

      const { data: semDelegacao } = await dept.sb.from('notas').select('*').eq('id', nota.id);
      assert((semDelegacao?.length || 0) === 0, 'antes da delegação, o outro departamento não vê o rascunho');

      const { error: eDeleg } = await admin.sb.from('delegacoes').insert({
        titular_id: deptOutroSetor.usuario.id, delegado_id: dept.usuario.id,
        data_inicio: hoje, data_fim: hoje, motivo: 'teste automatizado', criado_por: admin.usuario.id,
      });
      assert(!eDeleg, `administrador cria a delegação: ${eDeleg?.message || ''}`);

      const { data: comDelegacao } = await dept.sb.from('notas').select('*').eq('id', nota.id);
      assert((comDelegacao?.length || 0) === 1, 'com a delegação ativa, o delegado passa a ver o rascunho do titular');

      const { error: eEdit } = await dept.sb.from('notas').update({ numero_nota: `LC-H-${rand}-editado-por-delegado` }).eq('id', nota.id);
      assert(!eEdit, `delegado consegue editar a nota do titular: ${eEdit?.message || ''}`);
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
        competencia: '2026-06-01', status: 'aprovado',
      }).eq('id', nota.id).select();
      assert(!e1 && aprovada?.[0]?.status === 'aprovado', `departamento transiciona o próprio rascunho -> aprovado sem passar por aprovação: ${e1?.message || ''}`);
    }

    console.log('\n=== Caso D: rateio (soma das linhas == valor bruto) ===');
    {
      const { data: nota, error } = await dept.sb.from('notas').insert({
        numero_nota: `LC-D-${rand}`, valor_bruto: 100,
        pagador_id: ref.pagador.id, fornecedor_id: ref.fornecedor.id,
        forma_pagamento: 'Boleto bancário', classificacao: 'Compras', tem_rateio: true, competencia: '2026-06-01',
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
    const admin2 = adminClient();
    if (criadosNotas.length) {
      await admin2.from('nota_rateios').delete().in('nota_id', criadosNotas);
      await admin2.from('nota_historico').delete().in('nota_id', criadosNotas);
      await admin2.from('notas').delete().in('id', criadosNotas);
      await admin2.from('delegacoes').delete().ilike('motivo', 'teste automatizado');
    }
    for (const authUserId of criadosAuthUsers) {
      await admin2.auth.admin.deleteUser(authUserId); // cascade apaga a linha em usuarios também
    }
    console.log('Notas, delegação e contas de teste removidas.');
  }
}

main().catch(err => {
  console.error('\nFALHOU:', err.message);
  process.exit(1);
});
