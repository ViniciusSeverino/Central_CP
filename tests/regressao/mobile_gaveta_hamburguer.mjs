// Shell mobile: hambúrguer abre/fecha a gaveta lateral (não mais a barra
// horizontal de abas), fecha ao navegar ou tocar no fundo, e fica
// acessível mesmo com formulário/detalhe de página inteira aberto.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp({ ...PERFIS.departamento, mobile: true });

checar(!!document.querySelector('.m-app'), '.m-app existe (shell mobile, não desktop)');
checar(!document.querySelector('.sidebar'), '.sidebar do desktop não existe no mobile');
checar(!!document.getElementById('btn-menu-mobile'), 'botão hambúrguer existe');
checar(!document.querySelector('.m-drawer.open'), 'gaveta começa fechada');

document.getElementById('btn-menu-mobile').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('.m-drawer.open'), 'gaveta abre ao clicar no hambúrguer');
checar(document.getElementById('btn-menu-mobile').getAttribute('aria-expanded') === 'true', 'aria-expanded reflete o estado aberto');
checar(!!document.querySelector('.m-drawer-backdrop.show'), 'fundo escurecido aparece junto');

const tabs = Array.from(document.querySelectorAll('.m-drawer-nav [data-view]')).map(b => b.dataset.view);
checar(tabs.includes('cadastros') && tabs.includes('todas'), 'gaveta tem paridade completa com o desktop (inclusive Cadastros e Todas as notas)');

document.getElementById('m-drawer-backdrop').click();
await new Promise(r => setTimeout(r, 100));
checar(!document.querySelector('.m-drawer.open'), 'tocar no fundo escurecido fecha a gaveta sem navegar');

document.getElementById('btn-menu-mobile').click();
await new Promise(r => setTimeout(r, 50));
document.querySelector('.m-drawer-nav [data-view="todas"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!document.querySelector('.m-drawer.open'), 'escolher um item na gaveta fecha ela sozinha');
checar(!!document.querySelector('.tbl-wrap table.data-tbl'), 'tabela larga de "Todas as notas" fica dentro de .tbl-wrap (scroll horizontal, não estoura a tela)');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('.page-form'), 'botão "+" abre o formulário em página inteira');
checar(!!document.getElementById('btn-menu-mobile'), 'hambúrguer continua acessível durante o formulário de página inteira (igual à sidebar do desktop)');

checarSemErrosNaoTratados(erros, 'mobile_gaveta_hamburguer');
relatorioFinal('mobile_gaveta_hamburguer');
