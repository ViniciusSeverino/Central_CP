// Nota já paga: a UI não deve nem oferecer a opção de cancelar (a regra
// de verdade é o trigger bloquear_cancelamento_de_paga no banco -- isso
// aqui só confirma que a UI não engana o usuário mostrando um botão que
// vai falhar).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-9'; // status: pago
render();
await new Promise(r => setTimeout(r, 50));

checar(!Array.from(document.querySelectorAll('[data-action]')).some(b => b.dataset.action === 'cancelar_lancamento'), 'nota já paga NÃO mostra o botão de cancelar lançamento');
checar(!document.querySelector('[data-excluir-nota]'), 'nota já paga também não mostra o botão de excluir');

app.state.modal = null; app.state.modalData = null;
checarSemErrosNaoTratados(erros, 'ciclo_cancelar_nota_paga_escondido_na_ui');
relatorioFinal('ciclo_cancelar_nota_paga_escondido_na_ui');
