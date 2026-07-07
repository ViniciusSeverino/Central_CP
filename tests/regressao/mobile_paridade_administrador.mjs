// Paridade mobile pro administrador: todas as sub-abas de Cadastros
// (inclusive Armazenamento e Arquivos, que dependem de RPC/agrupamento)
// funcionam igual no shell mobile.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp({ ...PERFIS.administrador, mobile: true });

function abrirGaveta() { document.getElementById('btn-menu-mobile').click(); }

abrirGaveta();
await new Promise(r => setTimeout(r, 50));
document.querySelector('.m-drawer-nav [data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const subTabs = Array.from(document.querySelectorAll('[data-cad-tab]')).map(b => b.dataset.cadTab);
checar(['usuarios', 'delegacoes', 'importar'].every(t => subTabs.includes(t)), 'administrador vê todas as sub-abas exclusivas dele no mobile também');
const configTabsMobile = Array.from(document.querySelectorAll('[data-config-tab]')).map(b => b.dataset.configTab);
checar(['armazenamento', 'arquivos'].every(t => configTabsMobile.includes(t)), 'administrador vê Armazenamento/Arquivos (sub-abas de Configurações) no mobile também');

document.querySelector('[data-config-tab="armazenamento"]').click();
await new Promise(r => setTimeout(r, 150));
checar(!!document.getElementById('btn-atualizar-armazenamento'), 'dashboard de armazenamento renderiza no mobile');

abrirGaveta();
await new Promise(r => setTimeout(r, 50));
document.querySelector('.m-drawer-nav [data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 50));
document.querySelector('[data-config-tab="arquivos"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.grupo-card').length === 1, 'aba Arquivos agrupa igual no mobile');

abrirGaveta();
await new Promise(r => setTimeout(r, 50));
document.querySelector('.m-drawer-nav [data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 50));
// app.state.configTab ficou em "arquivos" da etapa anterior -- volta pra
// sub-aba Cadastros (onde fica [data-cad-tab="usuarios"]) antes de clicar.
document.querySelector('[data-config-tab="cadastros"]').click();
await new Promise(r => setTimeout(r, 50));
document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));
checar(!!document.querySelector('.tbl-wrap table.data-tbl'), 'tabela de usuários (larga) fica dentro de .tbl-wrap no mobile');

checarSemErrosNaoTratados(erros, 'mobile_paridade_administrador');
relatorioFinal('mobile_paridade_administrador');
