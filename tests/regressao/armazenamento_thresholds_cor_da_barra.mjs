// A barra de progresso do dashboard muda de cor conforme o % usado:
// verde (<70%), âmbar (70-90%), vermelho (>=90%) -- testa exatamente nos
// limites, não só num valor confortavelmente dentro de cada faixa.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const LIMITE_BANCO_BYTES = 500 * 1024 * 1024;

const { document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 50));
document.querySelector('[data-config-tab="armazenamento"]').click();
await new Promise(r => setTimeout(r, 100));

function corDaPrimeiraBarra(pctAlvo) {
  app.armazenamentoStats = { banco_bytes: Math.floor(LIMITE_BANCO_BYTES * pctAlvo), storage_bytes: 0, storage_arquivos: 0 };
  render();
  const barraFill = document.querySelector('[style*="height:100%"]');
  return barraFill ? barraFill.getAttribute('style') : null;
}

checar((corDaPrimeiraBarra(0.50) || '').includes('--good'), '50% de uso (bem abaixo do limite) mostra a barra verde (--good)');
checar((corDaPrimeiraBarra(0.699) || '').includes('--good'), '69,9% ainda é verde (--good) -- não bateu o limiar de 70%');
checar((corDaPrimeiraBarra(0.70) || '').includes('--amber'), 'exatamente 70% já vira âmbar (--amber)');
checar((corDaPrimeiraBarra(0.899) || '').includes('--amber'), '89,9% ainda é âmbar -- não bateu o limiar de 90%');
checar((corDaPrimeiraBarra(0.90) || '').includes('--alert'), 'exatamente 90% já vira vermelho (--alert)');
checar((corDaPrimeiraBarra(1.20) || '').includes('--alert'), 'acima de 100% (estourou o limite) continua vermelho');

app.armazenamentoStats = null;
checarSemErrosNaoTratados(erros, 'armazenamento_thresholds_cor_da_barra');
relatorioFinal('armazenamento_thresholds_cor_da_barra');
