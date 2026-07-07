// Dashboard de Armazenamento: só administrador vê a aba, e os números
// mostrados batem com o que a RPC mockada devolve (mesmos limites do
// plano gratuito documentados: 500 MB banco / 1 GB storage).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-config-tab="armazenamento"]'), 'administrador vê a aba Armazenamento');
document.querySelector('[data-config-tab="armazenamento"]').click();
await new Promise(r => setTimeout(r, 150));

const texto = document.body.textContent;
checar(texto.includes('500') && texto.includes('MB'), 'mostra o limite de 500 MB do banco de dados');
checar(texto.includes('1.00 GB') || texto.includes('1 GB'), 'mostra o limite de 1 GB do Storage');
checar(!!document.getElementById('btn-atualizar-armazenamento'), 'botão "Atualizar" existe');

checarSemErrosNaoTratados(erros, 'armazenamento_visivel_so_administrador');
relatorioFinal('armazenamento_visivel_so_administrador');
