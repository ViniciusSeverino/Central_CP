// Conversão dos arquivos já salvos para o nome novo (ver
// renomear_anexos.js / migration 0053): copia, troca o caminho na nota e
// só então apaga o original; rodar de novo não faz nada; só administrador.
// Fixture: nota-5 e nota-7 têm anexo no padrão antigo (BSB_COND_...).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const objetos = () => supabaseClientMod.supabase.storage._objetos.filter(o => o.bucket === 'anexos-notas').map(o => o.path);

app.state.view = 'cadastros'; app.state.configTab = 'armazenamento';
render();
await esperar(50);
const btn = document.getElementById('btn-renomear-anexos');
checar(!!btn, 'Armazenamento mostra o botão de renomear quando há arquivo no padrão antigo');

globalThis.confirm = () => true; if (globalThis.window) globalThis.window.confirm = () => true;
btn.click();
for (let i = 0; i < 40 && app.state.renomearAnexos && app.state.renomearAnexos.rodando; i++) await esperar(25);

const fx = supabaseClientMod.__fixtures().notas;
checarIgual(fx.find(n => n.id === 'nota-5').anexos, ['nota-5/COND_BSB_01-06_FORNECEDOR_4_NF5_BOLETO.pdf'], 'nota-5 aponta pro nome novo');
checarIgual(fx.find(n => n.id === 'nota-7').anexos, ['nota-7/COND_BSB_01-07_FORNECEDOR_4_NF7_BOLETO.pdf'], 'nota-7 aponta pro nome novo');
checar(objetos().includes('nota-5/COND_BSB_01-06_FORNECEDOR_4_NF5_BOLETO.pdf') && !objetos().includes('nota-5/BSB_COND_01-06_FORNECEDOR_4_NF5_BOLETO.pdf'), 'no Storage: o arquivo novo existe e o antigo foi apagado');
checar(objetos().includes('nota-recebida-1/123-boleto.pdf'), 'arquivo fora do padrão não é tocado');
checarIgual(app.state.renomearAnexos.relatorio.renomeados, 2, 'relatório: 2 renomeados');
checar(!document.getElementById('btn-renomear-anexos'), 'depois de converter tudo, o botão some');

console.log('### Rodar de novo é seguro ###');
const { renomearAnexosPadraoAntigo } = await import('./app/src/js/renomear_anexos.js');
const de_novo = await renomearAnexosPadraoAntigo(app.notas);
checarIgual(de_novo.renomeados + de_novo.falhas.length, 0, 'segunda rodada não encontra nada pra fazer');

console.log('### Falha no meio não perde nada ###');
const nota = { id: 'nota-x', anexos: ['nota-x/BSB_FPP_01-01_A_NF1_TED.pdf'] };
supabaseClientMod.supabase.storage._objetos.push({ bucket: 'anexos-notas', path: 'nota-x/BSB_FPP_01-01_A_NF1_TED.pdf', file: new Blob(['x']) });
const r = await renomearAnexosPadraoAntigo([nota]);
checarIgual(r.falhas.length, 1, 'nota que o banco recusa (não existe) entra como falha');
checar(objetos().includes('nota-x/BSB_FPP_01-01_A_NF1_TED.pdf') && !objetos().includes('nota-x/FPP_BSB_01-01_A_NF1_TED.pdf'), 'o original continua lá e a cópia é desfeita');

checarSemErrosNaoTratados(erros, 'anexos_renomear_padrao_antigo');
relatorioFinal('anexos_renomear_padrao_antigo');
