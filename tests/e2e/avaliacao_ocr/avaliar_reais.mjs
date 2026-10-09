// tests/e2e/avaliacao_ocr/avaliar_reais.mjs
//
// Avaliação do OCR com os ANEXOS REAIS do sistema: pega as notas mais
// recentes com anexo, usa o que foi LANÇADO na nota como gabarito (número,
// valor bruto/líquido, CNPJ/CPF do fornecedor, emissão/vencimento) e mede
// o quanto o leitor de documentos acerta lendo o PDF anexado.
//
// SÓ LEITURA: faz SELECT e download do Storage -- nunca grava nada no
// banco. Os arquivos baixados ficam numa pasta temporária FORA do
// repositório (--pasta, padrão: diretório temporário do sistema) e são
// apagados no fim. Nada de conteúdo (valores, nomes, CNPJs, texto) vai
// pro console: só taxas agregadas. O JSON detalhado (só desfechos por
// campo + id interno da nota, pra depurar) vai pra resultados/reais_*.json,
// que está no .gitignore.
//
// Credenciais (variáveis de ambiente, nunca no código):
//   AVALIACAO_EMAIL + AVALIACAO_SENHA  -- usuário que enxerga as notas via
//     RLS (recomendado: passa pelas mesmas regras de acesso do app)
//   ou SUPABASE_SERVICE_ROLE_KEY       -- alternativa (ignora RLS)
//   SUPABASE_URL / SUPABASE_ANON_KEY   -- opcionais, padrão = src/js/config.js
//
// Duas trilhas por nota:
//   pipeline -- analisarAnexo() como o app faz (texto embutido do PDF
//               quando existe; OCR quando é escaneado)
//   ocr      -- força OCR em todas as páginas (renderiza cada página do
//               PDF com pdf.js e passa no extrairTextoDeImagem) -- é o que
//               mede o reconhecimento em si, o caso de foto/scan
//
// Uso (de tests/e2e):
//   node avaliacao_ocr/avaliar_reais.mjs --etapa=baseline [--limite=100] [--trilha=ocr|pipeline|ambas]
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { abrirApp, argumentos } from './navegador.mjs';
import { pontuarCaso, apareceNoTexto, agregar, tabelaMarkdown, tabelaComparativa } from './pontuacao.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../src/js/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = argumentos();
const etapa = args.etapa || 'baseline';
const limite = Number(args.limite || 100);
const trilhas = args.trilha && args.trilha !== 'ambas' ? [args.trilha] : ['pipeline', 'ocr'];
const URL_BASE = process.env.SUPABASE_URL || SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

async function autenticar() {
  if (process.env.AVALIACAO_EMAIL && process.env.AVALIACAO_SENHA) {
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.AVALIACAO_EMAIL, password: process.env.AVALIACAO_SENHA }),
    });
    if (!r.ok) throw new Error(`login do usuário de avaliação falhou (HTTP ${r.status})`);
    const { access_token } = await r.json();
    return { apikey: ANON, Authorization: `Bearer ${access_token}` };
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  }
  console.error('Faltam credenciais: defina AVALIACAO_EMAIL + AVALIACAO_SENHA (recomendado) ou SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(2);
}

const auth = await autenticar();

// Notas mais recentes, não canceladas, com anexo e número/valor lançados.
const consulta = new URLSearchParams({
  select: 'id,numero_nota,valor_bruto,valor_liquido,data_emissao,vencimento,anexos,fornecedor:fornecedores!fornecedor_id(cnpj)',
  status: 'neq.cancelada',
  anexos: 'neq.{}',
  numero_nota: 'not.is.null',
  valor_bruto: 'gt.0',
  order: 'criado_em.desc',
  limit: String(limite),
});
const resp = await fetch(`${URL_BASE}/rest/v1/notas?${consulta}`, { headers: auth });
if (!resp.ok) { console.error(`consulta das notas falhou (HTTP ${resp.status})`); process.exit(1); }
const notas = await resp.json();
console.log(`=== avaliação OCR (anexos reais) -- etapa "${etapa}", ${notas.length} notas, trilhas: ${trilhas.join(' + ')} ===`);

const pasta = args.pasta || join(tmpdir(), `avaliacao-ocr-${process.pid}`);
mkdirSync(pasta, { recursive: true });

// Baixa os anexos de cada nota (paths do bucket privado anexos-notas).
const casos = [];
for (const nota of notas) {
  const arquivos = [];
  for (const [k, anexo] of (nota.anexos || []).entries()) {
    const caminho = anexo.includes('/') ? anexo : `${nota.id}/${anexo}`;
    const r = await fetch(`${URL_BASE}/storage/v1/object/anexos-notas/${caminho.split('/').map(encodeURIComponent).join('/')}`, { headers: auth });
    if (!r.ok) continue;
    const ext = (anexo.match(/\.([a-z0-9]+)$/i) || [, 'pdf'])[1].toLowerCase();
    const local = `${nota.id}-${k}.${ext}`;
    writeFileSync(join(pasta, local), Buffer.from(await r.arrayBuffer()));
    arquivos.push({ local, ext });
  }
  if (!arquivos.length) continue;
  casos.push({
    id: nota.id,
    arquivos,
    gabarito: {
      numeroNota: nota.numero_nota,
      valor: [nota.valor_bruto, nota.valor_liquido].filter(v => v != null && Number(v) > 0).map(Number),
      documento: nota.fornecedor && nota.fornecedor.cnpj,
      data: [nota.data_emissao, nota.vencimento].filter(Boolean),
      dataEmissao: nota.data_emissao,
    },
  });
}
console.log(`${casos.length} notas com anexo baixado (${casos.reduce((s, c) => s + c.arquivos.length, 0)} arquivos)`);

const app = await abrirApp({ rotasLocais: { '/__docs/': (nome) => readFile(join(pasta, nome)) } });
const resultados = { pipeline: [], ocr: [] };
try {
  for (const [i, caso] of casos.entries()) {
    for (const trilha of trilhas) {
      let r;
      try {
        r = await app.page.evaluate(async ({ arquivos, trilha }) => {
          const { analisarAnexo, extrairCampos } = await import('/src/js/leitor_documentos.js');
          const t0 = performance.now();
          const textos = [], fontes = [];
          let paginas = 0;
          for (const a of arquivos) {
            const blob = await (await fetch(`/__docs/${encodeURIComponent(a.local)}`)).blob();
            const ehPdf = a.ext === 'pdf';
            const file = new File([blob], `anexo.${a.ext}`, { type: ehPdf ? 'application/pdf' : `image/${a.ext === 'jpg' ? 'jpeg' : a.ext}` });
            if (trilha === 'pipeline' || !ehPdf) {
              const res = await analisarAnexo(file);
              textos.push(res.texto); fontes.push(res.fonte); paginas++;
              continue;
            }
            const pdfjs = await import('https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
            const { extrairTextoDeImagem } = await import('/src/js/ocr_imagem.js');
            const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
            for (let p = 1; p <= doc.numPages; p++) {
              const pagina = await doc.getPage(p);
              const viewport = pagina.getViewport({ scale: 2 }); // ≈ 144 dpi
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width; canvas.height = viewport.height;
              await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
              const png = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
              const { texto } = await extrairTextoDeImagem(png);
              textos.push(texto); paginas++;
            }
            fontes.push('ocr');
          }
          const texto = textos.join('\n');
          // A nota inteira (NF + boleto + comprovante mesclados num PDF só)
          // é lida como um texto -- mesmo que o leitor faz com o anexo final.
          return { texto, campos: extrairCampos(texto), fontes, paginas, ms: performance.now() - t0 };
        }, { arquivos: caso.arquivos, trilha });
      } catch (e) {
        r = { texto: '', campos: {}, fontes: ['falhou'], paginas: 0, ms: 0 };
      }
      const pontos = pontuarCaso(caso.gabarito, r.campos);
      const noTexto = Object.fromEntries(Object.keys(pontos).map(c => [c, apareceNoTexto(c, caso.gabarito[c], r.texto)]));
      resultados[trilha].push({
        id: caso.id,
        grupos: { fonte: r.fontes.includes('ocr') ? 'escaneado/imagem' : (r.fontes.includes('pdf_texto') ? 'pdf com texto' : 'não lido') },
        pontos, noTexto, ms: Math.round(r.ms), paginas: r.paginas,
      });
    }
    // progresso sem conteúdo nenhum da nota
    if ((i + 1) % 5 === 0 || i === casos.length - 1) console.log(`  ${i + 1}/${casos.length} notas processadas`);
  }
} finally {
  await app.fechar();
  if (!args.pasta) rmSync(pasta, { recursive: true, force: true });
}

const saida = { etapa, geradoEm: new Date().toISOString(), notas: casos.length, trilhas: {} };
for (const trilha of trilhas) {
  const ag = agregar(resultados[trilha]);
  saida.trilhas[trilha] = { agregado: ag, resultados: resultados[trilha] };
  console.log('\n' + tabelaMarkdown(ag, `Anexos reais -- trilha "${trilha}" -- ${etapa}`));
  const fontes = Object.entries(ag.porGrupo.fonte || {}).map(([f, t]) => `${f}: ${Math.max(...Object.values(t).map(x => x.casos))}`).join(', ');
  if (fontes) console.log(`(notas por fonte: ${fontes})`);
}
mkdirSync(join(__dirname, 'resultados'), { recursive: true });
writeFileSync(join(__dirname, 'resultados', `reais_${etapa}.json`), JSON.stringify(saida, null, 2) + '\n');

if (args.comparar) {
  const arq = join(__dirname, 'resultados', `reais_${args.comparar}.json`);
  if (existsSync(arq)) {
    const antes = JSON.parse(readFileSync(arq, 'utf8'));
    for (const trilha of trilhas) {
      if (!antes.trilhas[trilha]) continue;
      console.log(`\nAntes x depois -- ${trilha}:\n` + tabelaComparativa(antes.trilhas[trilha].agregado, saida.trilhas[trilha].agregado, args.comparar, etapa));
    }
  }
}
