// supabase/seed.mjs
//
// Script de carga inicial (roda UMA VEZ, depois de criar o schema).
// Lê src/data/seed/*.json e insere em pagadores, centros_custo,
// classes_conta, codigos_classificacao, fornecedores e fornecedor_contas,
// remapeando os IDs do JSON (gerados pelo protótipo) para os UUIDs reais
// que o Postgres vai gerar.
//
// Uso:
//   1. npm install
//   2. copie .env.example para .env e preencha SUPABASE_URL e
//      SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role —
//      NUNCA use essa chave no frontend, só aqui, local, uma vez)
//   3. npm run seed

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(__dirname, '..', relPath), 'utf-8'));
}

async function insertAndMap(table, rows, mapId) {
  if (rows.length === 0) return new Map();
  const { data, error } = await supabase.from(table).insert(rows).select('id');
  if (error) throw new Error(`Erro inserindo em ${table}: ${error.message}`);
  const map = new Map();
  data.forEach((row, i) => map.set(mapId(rows[i], i), row.id));
  return map;
}

async function main() {
  console.log('Lendo arquivos de seed...');
  const plano = readJson('src/data/seed/plano-de-contas.json');
  const fornecedoresSeed = readJson('src/data/seed/fornecedores.json');

  // -------- checagem de carga já existente --------
  const { count: jaTemPagadores } = await supabase.from('pagadores').select('*', { count: 'exact', head: true });
  if (jaTemPagadores > 0) {
    console.log(`A tabela "pagadores" já tem ${jaTemPagadores} registro(s).`);
    console.log('Para evitar duplicar dados, este script não roda sobre uma base que já tem pagadores.');
    console.log('Se quiser recarregar do zero, limpe as tabelas antes (TRUNCATE) e rode de novo.');
    process.exit(0);
  }

  // -------- 1. pagadores --------
  console.log(`Importando ${plano.pagadores.length} pagadores...`);
  const pagadorIdMap = await insertAndMap(
    'pagadores',
    plano.pagadores.map(p => ({ nome: p.nome, sigla: p.sigla })),
    (row) => row.sigla // a chave de remapeamento é a sigla (única)
  );
  // remapeia usando a sigla do JSON original (já que o id antigo não existe mais)
  const pagadorOldIdToNewId = new Map();
  plano.pagadores.forEach(p => pagadorOldIdToNewId.set(p.id, pagadorIdMap.get(p.sigla)));

  // -------- 2. centros_custo --------
  console.log(`Importando ${plano.centros_custo.length} centros de custo...`);
  const centroIdMap = await insertAndMap(
    'centros_custo',
    plano.centros_custo.map(c => ({
      codigo: c.codigo, nome: c.nome, sigla: c.sigla, origem_siglas: c.origem_siglas
    })),
    (row) => row.sigla
  );
  const centroOldIdToNewId = new Map();
  plano.centros_custo.forEach(c => centroOldIdToNewId.set(c.id, centroIdMap.get(c.sigla)));

  // -------- 3. classes_conta (depende de centro_custo_id) --------
  console.log(`Importando ${plano.classes_conta.length} classes de conta...`);
  const classesPayload = plano.classes_conta.map(cl => ({
    codigo: cl.codigo,
    nome: cl.nome,
    centro_custo_id: centroOldIdToNewId.get(cl.centro_custo_id)
  }));
  // usamos o índice como chave de remapeamento aqui (não há campo único natural)
  const { data: classesInseridas, error: errClasses } = await supabase
    .from('classes_conta').insert(classesPayload).select('id');
  if (errClasses) throw new Error(`Erro inserindo classes_conta: ${errClasses.message}`);
  const classeOldIdToNewId = new Map();
  plano.classes_conta.forEach((cl, i) => classeOldIdToNewId.set(cl.id, classesInseridas[i].id));

  // -------- 4. codigos_classificacao (depende de classe_conta_id) --------
  console.log(`Importando ${plano.codigos_classificacao.length} códigos de classificação...`);
  const codigosPayload = plano.codigos_classificacao.map(co => ({
    codigo: co.codigo,
    nome: co.nome,
    classe_conta_id: classeOldIdToNewId.get(co.classe_conta_id)
  }));
  // insere em lotes de 500 (limite confortável por request)
  for (let i = 0; i < codigosPayload.length; i += 500) {
    const lote = codigosPayload.slice(i, i + 500);
    const { error } = await supabase.from('codigos_classificacao').insert(lote);
    if (error) throw new Error(`Erro inserindo codigos_classificacao: ${error.message}`);
  }

  // -------- 5. fornecedores + 6. fornecedor_contas --------
  console.log(`Importando ${fornecedoresSeed.length} fornecedores...`);
  for (let i = 0; i < fornecedoresSeed.length; i += 200) {
    const lote = fornecedoresSeed.slice(i, i + 200);
    const { data: fornecedoresInseridos, error: errForn } = await supabase
      .from('fornecedores')
      .insert(lote.map(f => ({ nome: f.nome, cnpj: f.cnpj || null, municipio: f.municipio || null, cod_group: f.cod_group || null })))
      .select('id');
    if (errForn) throw new Error(`Erro inserindo fornecedores: ${errForn.message}`);

    const contasPayload = [];
    lote.forEach((f, idx) => {
      const novoFornecedorId = fornecedoresInseridos[idx].id;
      (f.contas || []).forEach(c => {
        contasPayload.push({
          fornecedor_id: novoFornecedorId,
          cod_banco: c.cod_banco || null,
          agencia: c.agencia || null,
          conta: c.conta || null
        });
      });
    });
    if (contasPayload.length > 0) {
      const { error: errContas } = await supabase.from('fornecedor_contas').insert(contasPayload);
      if (errContas) throw new Error(`Erro inserindo fornecedor_contas: ${errContas.message}`);
    }
    console.log(`  ...${Math.min(i + 200, fornecedoresSeed.length)}/${fornecedoresSeed.length}`);
  }

  console.log('\nImportação concluída com sucesso.');
  console.log('Pagadores:', plano.pagadores.length);
  console.log('Centros de custo:', plano.centros_custo.length);
  console.log('Classes de conta:', plano.classes_conta.length);
  console.log('Códigos de classificação:', plano.codigos_classificacao.length);
  console.log('Fornecedores:', fornecedoresSeed.length);
}

main().catch(err => {
  console.error('\nFALHOU:', err.message);
  process.exit(1);
});
