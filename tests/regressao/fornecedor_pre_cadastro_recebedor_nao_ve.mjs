// Pré-cadastro de fornecedor (ver migration 0030) é só do perfil
// "completo" -- o recebedor não vê o link, nem mesmo quando abre o
// formulário inteiro via "Completar lançamento" (ação que ele TEM acesso,
// ver renderDetailActions em ui_nota.js -- a separação recebedor/completo
// é só de UI, não de RLS, mas esse link específico é gated por perfil).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.departamentoRecebedor);

// nota-recebida-1 (fixture, setor Marketing) está 'recebido' -- o recebedor
// vê "Completar lançamento" (mesmo setor) e pode abrir o formulário inteiro.
document.querySelector('[data-open="nota-recebida-1"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-action="completar_recebimento"][data-id="nota-recebida-1"]'), 'recebedor vê "Completar lançamento" (mesmo setor)');
document.querySelector('[data-action="completar_recebimento"][data-id="nota-recebida-1"]').click();
await new Promise(r => setTimeout(r, 100));

checar(!!document.getElementById('nf-valor'), 'abriu o formulário inteiro (não o simplificado)');
checar(!document.getElementById('link-abrir-pre-cadastro-fornecedor'), 'recebedor NÃO vê o link de pré-cadastro de fornecedor, mesmo no formulário inteiro');

checarSemErrosNaoTratados(erros, 'fornecedor_pre_cadastro_recebedor_nao_ve');
relatorioFinal('fornecedor_pre_cadastro_recebedor_nao_ve');
