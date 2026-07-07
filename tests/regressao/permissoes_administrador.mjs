// Perfil "administrador": acesso total + as telas exclusivas dele
// (Usuários, Importar histórico, Armazenamento) além de tudo que o
// gerente_financeiro já vê.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(nav.includes('aprovacao') && nav.includes('cadastros'), 'administrador vê aprovação e cadastros (acesso total)');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-cad-tab]')).map(b => b.dataset.cadTab);
['usuarios', 'delegacoes', 'importar', 'fornecedores', 'pagadores', 'centros_custo', 'classes_conta', 'codigos_classificacao'].forEach(t => {
  checar(tabs.includes(t), `administrador vê a aba "${t}"`);
});
// Armazenamento/Arquivos são sub-abas de Configurações no mesmo nível de
// Cadastros/Notificações/Meus dados agora (data-config-tab), não mais
// dentro da barra de sub-abas de Cadastros (data-cad-tab).
const configTabs = Array.from(document.querySelectorAll('[data-config-tab]')).map(b => b.dataset.configTab);
['armazenamento', 'arquivos'].forEach(t => {
  checar(configTabs.includes(t), `administrador vê a aba "${t}" (dentro de Configurações)`);
});

document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));
checar(!!document.getElementById('btn-convidar-usuario'), 'administrador vê botão de convidar usuário');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 50));
document.querySelector('[data-config-tab="armazenamento"]').click();
await new Promise(r => setTimeout(r, 150));
checar(!!document.getElementById('btn-atualizar-armazenamento'), 'administrador vê o dashboard de armazenamento');

checarSemErrosNaoTratados(erros, 'permissoes_administrador');
relatorioFinal('permissoes_administrador');
