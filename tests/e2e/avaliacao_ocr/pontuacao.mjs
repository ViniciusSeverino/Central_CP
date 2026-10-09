// tests/e2e/avaliacao_ocr/pontuacao.mjs
//
// Régua do harness de avaliação do OCR. O núcleo (normalização,
// pontuação, agregação) mora em src/js/ocr_acerto.js -- o mesmo que o
// painel de acerto da aba Treinamento usa no app; aqui ficam só as
// tabelas em markdown que os runners imprimem.
export * from '../../../src/js/ocr_acerto.js';
import { CAMPOS, ROTULO_CAMPO, taxa, erroNaoSinalizado, sinalizado, totalDe } from '../../../src/js/ocr_acerto.js';

const pct = (v) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

// Tabela markdown: uma linha por campo com acerto / erro silencioso /
// ausente / "aparece no texto" -- e, quando o leitor sinaliza campos
// duvidosos, quanto foi sinalizado e quanto erro passou SEM sinal.
// Campos sem nenhum caso ficam de fora.
export function tabelaMarkdown(agregado, titulo) {
  const linhas = [];
  if (titulo) linhas.push(`**${titulo}** (${agregado.casos} casos${agregado.msMedio ? `, ${(agregado.msMedio / 1000).toFixed(1).replace('.', ',')} s/doc` : ''})`, '');
  linhas.push('| Campo | Casos | Acerto | Erro silencioso | Ausente | Aparece no texto | Sinalizado p/ conferir | Erro NÃO sinalizado |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const campo of CAMPOS) {
    const t = totalDe(agregado, campo);
    if (!t.casos) continue;
    linhas.push(`| ${ROTULO_CAMPO[campo]} | ${t.casos} | ${pct(taxa(t))} | ${pct(taxa(t, 'erro'))} | ${pct(taxa(t, 'ausente'))} | ${pct(taxa(t, 'noTexto'))} | ${pct(sinalizado(t))} | ${pct(erroNaoSinalizado(t))} |`);
  }
  return linhas.join('\n');
}

// Tabela de acerto por campo x valores de um grupo (ex: degradação).
export function tabelaPorGrupo(agregado, chave) {
  const grupos = agregado.porGrupo[chave];
  if (!grupos) return '';
  const campos = CAMPOS.filter(c => totalDe(agregado, c).casos);
  const linhas = [`| ${chave} | ${campos.map(c => ROTULO_CAMPO[c]).join(' | ')} |`, `|---|${campos.map(() => '---:').join('|')}|`];
  for (const [valor, t] of Object.entries(grupos)) {
    linhas.push(`| ${valor} | ${campos.map(c => pct(taxa(t[c]))).join(' | ')} |`);
  }
  return linhas.join('\n');
}

// Antes x depois (duas agregações), uma linha por campo.
export function tabelaComparativa(antes, depois, rotuloAntes = 'Antes', rotuloDepois = 'Depois') {
  const linhas = [`| Campo | ${rotuloAntes} | ${rotuloDepois} | Δ acerto | Erro silencioso (antes → depois) | Erro NÃO sinalizado (antes → depois) |`, '|---|---:|---:|---:|---:|---:|'];
  for (const campo of CAMPOS) {
    const a = totalDe(antes, campo), d = totalDe(depois, campo);
    if (!a.casos && !d.casos) continue;
    const ta = taxa(a), td = taxa(d);
    const delta = ta === null || td === null ? '—' : `${td - ta >= 0 ? '+' : ''}${((td - ta) * 100).toFixed(1).replace('.', ',')} pp`;
    linhas.push(`| ${ROTULO_CAMPO[campo]} | ${pct(ta)} | ${pct(td)} | ${delta} | ${pct(taxa(a, 'erro'))} → ${pct(taxa(d, 'erro'))} | ${pct(erroNaoSinalizado(a))} → ${pct(erroNaoSinalizado(d))} |`);
  }
  return linhas.join('\n');
}
