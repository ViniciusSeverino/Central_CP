// tests/e2e/avaliacao_ocr/avaliar.mjs
//
// Harness de avaliação do OCR com casos SINTÉTICOS (casos_sinteticos.mjs):
// gera cada documento num canvas, degrada, passa pelo MESMO caminho do app
// (extrairTextoDeImagem de src/js/ocr_imagem.js + extrairCampos/
// classificarTipoDocumento de src/js/leitor_documentos.js) e mede a taxa
// de acerto por campo contra o gabarito.
//
// Não roda no CI (fica numa subpasta que tests/e2e/run-all.mjs não varre):
// leva alguns minutos e é uma régua pra comparar etapas, não um teste de
// passa/falha.
//
// Uso (de tests/e2e):
//   node avaliacao_ocr/avaliar.mjs --etapa=baseline
//   node avaliacao_ocr/avaliar.mjs --etapa=etapa1 --comparar=baseline
// Opções: --sementes=N (padrão 2), --tipo=boleto, --degradacao=ruido,
//   --imagens=<pasta> (salva os PNGs gerados, pra inspecionar),
//   --ocr='{"preprocessar":false}' (opções repassadas a extrairTextoDeImagem,
//   pra comparar variações sem mexer no código).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { abrirApp, argumentos } from './navegador.mjs';
import { gerarCasos, DEGRADACOES } from './casos_sinteticos.mjs';
import { pontuarCaso, apareceNoTexto, duvidososDoLeitor, agregar, tabelaMarkdown, tabelaPorGrupo, tabelaComparativa } from './pontuacao.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = argumentos();
const etapa = args.etapa || 'baseline';
const opcoesOcr = args.ocr ? JSON.parse(args.ocr) : undefined;
const casos = gerarCasos({
  sementes: Number(args.sementes || 2),
  tipos: args.tipo ? [args.tipo] : undefined,
  degradacoes: args.degradacao ? String(args.degradacao).split(',') : DEGRADACOES,
});

console.log(`=== avaliação OCR (sintético) -- etapa "${etapa}", ${casos.length} casos ===`);
const app = await abrirApp();
await app.page.addScriptTag({ content: readFileSync(join(__dirname, 'gerar_sinteticos.js'), 'utf8') });
if (args.imagens) mkdirSync(args.imagens, { recursive: true });

const resultados = [];
try {
  for (const [i, caso] of casos.entries()) {
    const r = await app.page.evaluate(async ({ caso, salvar, opcoesOcr }) => {
      const blob = await window.__gerarImagemSintetica(caso);
      const { extrairTextoDeImagem } = await import('/src/js/ocr_imagem.js');
      const { reclassificarComHints } = await import('/src/js/leitor_documentos.js');
      const t0 = performance.now();
      const { texto, palavras, confianca, preprocessada } = await extrairTextoDeImagem(blob, opcoesOcr);
      const { tipoDetectado, campos, confiancaCampos, camposDuvidosos } = reclassificarComHints(texto, [], palavras.length ? { 1: palavras } : undefined, 'ocr');
      const ms = performance.now() - t0;
      let png = null;
      if (salvar) png = Array.from(new Uint8Array(await blob.arrayBuffer()));
      return { texto, campos, confiancaCampos, camposDuvidosos, tipo: tipoDetectado, ms, nPalavras: palavras.length, png, confianca, preprocessada };
    }, { caso, salvar: !!args.imagens, opcoesOcr });
    if (args.imagens) writeFileSync(join(args.imagens, `${caso.id}.png`), Buffer.from(r.png));
    const pontos = pontuarCaso(caso.gabarito, r.campos);
    const noTexto = Object.fromEntries(Object.keys(pontos).map(c => [c, apareceNoTexto(c, caso.gabarito[c], r.texto)]));
    const duvidosos = duvidososDoLeitor(r.camposDuvidosos);
    resultados.push({
      id: caso.id, duvidosos, confiancaCampos: r.confiancaCampos,
      grupos: { tipo: caso.tipo, degradacao: caso.degradacao, classificacao: r.tipo === caso.tipo ? 'tipo certo' : 'tipo errado' },
      pontos, noTexto, ms: Math.round(r.ms),
      tipoDetectado: r.tipo, confianca: r.confianca ?? null, preprocessada: r.preprocessada ?? null,
    });
    const resumo = Object.entries(pontos).map(([c, d]) => `${c}:${d === 'acerto' ? '✓' : d === 'erro' ? '✗' : '·'}${duvidosos[c] && d !== 'ausente' ? '?' : ''}`).join(' ');
    console.log(`[${String(i + 1).padStart(3)}/${casos.length}] ${caso.id.padEnd(36)} ${String(Math.round(r.ms)).padStart(6)} ms  conf ${String(Math.round(r.confianca ?? 0)).padStart(3)}${r.preprocessada ? ' P' : '  '}  ${resumo}`);
  }
} finally {
  await app.fechar();
}

const agregado = agregar(resultados);
const acertoTipo = resultados.filter(r => r.grupos.classificacao === 'tipo certo').length;
const saida = {
  etapa, geradoEm: new Date().toISOString(), casos: casos.length, opcoesOcr: opcoesOcr || null,
  classificacaoTipo: { acertos: acertoTipo, casos: resultados.length },
  agregado, resultados,
};
mkdirSync(join(__dirname, 'resultados'), { recursive: true });
writeFileSync(join(__dirname, 'resultados', `${etapa}.json`), JSON.stringify(saida, null, 2) + '\n');

console.log('\n' + tabelaMarkdown(agregado, `Sintético -- ${etapa}`));
console.log(`\nClassificação do tipo de documento: ${acertoTipo}/${resultados.length}`);
console.log('\nAcerto por degradação:\n' + tabelaPorGrupo(agregado, 'degradacao'));
console.log('\nAcerto por tipo:\n' + tabelaPorGrupo(agregado, 'tipo'));
if (args.comparar) {
  const arq = join(__dirname, 'resultados', `${args.comparar}.json`);
  if (existsSync(arq)) {
    const antes = JSON.parse(readFileSync(arq, 'utf8'));
    console.log(`\nAntes x depois:\n` + tabelaComparativa(antes.agregado, agregado, args.comparar, etapa));
  } else console.log(`\n(sem ${args.comparar}.json pra comparar)`);
}
if (app.erros.length) console.log(`\n${app.erros.length} erro(s) no console do navegador:`, app.erros.slice(0, 5));
