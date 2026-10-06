// Padrão de tabelas do app (ver README, "Tabelas"): toda tabela de dados
// tem cabeçalho (e linha de total, quando houver) fixos e rolagem própria
// -- <div class="tbl-wrap tbl-fixa" data-tbl-fixa="<id>">, ver
// src/js/tabelas_fixas.js. A exceção precisa ser declarada com o motivo:
// <div class="tbl-wrap" data-tbl-livre="<motivo>">. Este teste lê o código
// (não renderiza nada) e reprova qualquer tabela nova que não siga nenhum
// dos dois -- é o que mantém o padrão sem depender de lembrar dele.
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checar, relatorioFinal } from './lib/assert.mjs';

const srcJs = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'js');
const semPadrao = [];
const semId = [];
const ids = new Map();
let total = 0;

for (const arquivo of readdirSync(srcJs).filter(f => f.endsWith('.js'))) {
  readFileSync(join(srcJs, arquivo), 'utf8').split('\n').forEach((linha, i) => {
    if (/^\s*\/\//.test(linha)) return; // exemplo em comentário não é tabela
    for (const m of linha.matchAll(/<div\b[^>]*class="tbl-wrap\b[^"]*"[^>]*>/g)) {
      total++;
      const tag = m[0];
      const onde = `${arquivo}:${i + 1}`;
      const fixa = /\btbl-fixa\b/.test(tag);
      const livre = /data-tbl-livre="[^"]+"/.test(tag);
      if (!fixa && !livre) semPadrao.push(onde);
      if (fixa) {
        const id = (tag.match(/data-tbl-fixa="([^"]+)"/) || [])[1];
        if (!id) semId.push(onde);
        else if (ids.has(id)) semId.push(`${onde} (id "${id}" repetido de ${ids.get(id)})`);
        else ids.set(id, onde);
      }
    }
  });
}

checar(total > 0, `encontrou as tabelas do app (${total})`);
checar(semPadrao.length === 0, `toda tabela é fixa (tbl-fixa) ou declara o motivo de não ser (data-tbl-livre)${semPadrao.length ? ' -- fora do padrão: ' + semPadrao.join(', ') : ''}`);
checar(semId.length === 0, `toda tabela fixa tem um data-tbl-fixa único (usado pra manter a rolagem entre redesenhos)${semId.length ? ' -- problema em: ' + semId.join(', ') : ''}`);

relatorioFinal('tabelas_padrao_cabecalho_fixo');
