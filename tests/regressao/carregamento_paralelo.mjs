// Abertura mais rápida: as páginas de uma tabela grande (ex: ~30 mil
// receitas do Group) são pedidas em paralelo em vez de uma depois da
// outra (lerEmPaginas em db.js), e os dados do Group/DRE chegam em segundo
// plano depois que o sistema já abriu (carregarDadosDre em app.js) -- até
// lá, as abas do DRE mostram "Carregando os dados do Group...".
import { bootApp, PERFIS, esperar } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);
const db = await import('./app/src/js/db.js');
const { app } = await import('./app/src/js/state.js');
const appMod = await import('./app/src/js/app.js');

console.log('### páginas em paralelo, na ordem certa ###');
async function simular(total, { comContagem }) {
  const linhas = Array.from({ length: total }, (_, i) => i);
  let pedidas = 0, emVoo = 0, picoEmVoo = 0;
  const lidas = await db.lerEmPaginas(async (de, ate, contar) => {
    pedidas++; emVoo++; picoEmVoo = Math.max(picoEmVoo, emVoo);
    await esperar(5 + Math.random() * 10); // chegam fora de ordem
    emVoo--;
    return { data: linhas.slice(de, ate + 1), count: comContagem && contar ? total : undefined, error: null };
  });
  return { ok: lidas.length === total && lidas.every((v, i) => v === i), pedidas, picoEmVoo };
}
const pequena = await simular(807, { comContagem: true });
checar(pequena.ok && pequena.pedidas === 1, `tabela pequena (807 linhas): uma requisição só (${pequena.pedidas})`);
const grande = await simular(29631, { comContagem: true });
checar(grande.ok, '29.631 linhas: nenhuma faltando nem repetida, na ordem certa mesmo chegando fora de ordem');
checarIgual(grande.pedidas, 30, '30 páginas de 1.000');
checar(grande.picoEmVoo >= 5 && grande.picoEmVoo <= 6, `até 6 páginas ao mesmo tempo (pico ${grande.picoEmVoo}), em vez de uma por vez`);
const semContagem = await simular(2500, { comContagem: false });
checar(semContagem.ok, 'sem contagem do servidor, ainda traz tudo (rodadas de 6 páginas)');
let erroPego = '';
await db.lerEmPaginas(async () => ({ data: null, error: { message: 'falhou' } }), { rotulo: 'teste' }).catch(e => { erroPego = e.message; });
checarIgual(erroPego, 'Erro carregando teste: falhou', 'erro do servidor vira mensagem clara');

console.log('\n### dados do Group em segundo plano ###');
checar(!!app.dreCarregadoEm && app.dreCarregando === false, 'depois da abertura, os dados do Group terminam de carregar sozinhos');
checar(!document.body.textContent.includes('Carregando os dados do Group'), 'com os dados prontos, a Visão geral mostra o conteúdo');
app.dreCarregadoEm = null; app.dreCarregando = true;
appMod.render();
checar(document.body.textContent.includes('Carregando os dados do Group'), 'enquanto a primeira carga não chega, a aba avisa em vez de mostrar números zerados');
await appMod.carregarDadosDre();
await esperar(20);
checar(!document.body.textContent.includes('Carregando os dados do Group'), 'quando a carga termina, a tela se redesenha sozinha');

checarSemErrosNaoTratados(erros, 'carregamento_paralelo');
relatorioFinal('carregamento_paralelo');
