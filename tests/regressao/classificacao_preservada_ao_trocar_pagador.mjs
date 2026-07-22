// Bug real reportado pelo dono do produto: ao "Completar lançamento" de
// uma nota 'recebido' (perfil recebedor já escolheu centro de
// custo/classe, ver ui_recebimento.js/migration 0029), o "completo" ainda
// precisa escolher/confirmar o pagador -- e cada vez que ele tocava esse
// campo, refreshClassificacaoArea() (ui_nota.js) reconstruía a área só
// com `{ pagador_id }`, descartando centro_custo_id/classe_conta_id/
// codigo_classificacao_id já escolhidos. Resultado: a classificação do
// recebedor sumia toda vez que o pagador era selecionado/ajustado.
//
// Fix: só reseta centro/classe/código quando o centro JÁ escolhido não
// pertence ao recorte do pagador novo (ver centrosParaPagador em
// state.js) -- quando continua válido, preserva.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento); // completo, Marketing
const db = await import('./app/src/js/db.js');
const { app } = await import('./app/src/js/state.js');

// Cenário 1 (o bug de verdade): nota 'recebido' criada por um recebedor
// com centro_custo_id='cc-1' (só aceita pagador COND) e SEM pagador ainda
// (fluxo real de quem lançou antes do campo pagador existir, ou que
// deixou em branco) -- "completo" abre "Completar lançamento" e escolhe o
// pagador Condomínio (pag-1, compatível com cc-1): a classificação
// PRECISA continuar lá.
const recebedorFake = { id: 'u-dept-recebedor-1', setor: 'Marketing' };
const notaRecebida = await db.criarNota(
  { pagador_id: null, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1', codigo_classificacao_id: null, fornecedor_id: null, descricao: null, anexos: ['x/doc.pdf'], setor: 'Marketing' },
  recebedorFake, 'recebido', [{ acao: 'Documento recebido' }],
);
app.notas = await db.carregarNotas();

document.querySelector('[data-view="recebidos"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector(`[data-open="${notaRecebida.id}"]`).click();
await new Promise(r => setTimeout(r, 100));
document.querySelector(`[data-action="completar_recebimento"][data-id="${notaRecebida.id}"]`).click();
await new Promise(r => setTimeout(r, 100));

checarIgual(document.getElementById('nf-centro-custo').value, 'cc-1', 'antes de mexer no pagador, centro de custo do recebedor já vem selecionado');
checarIgual(document.getElementById('nf-classe-conta').value, 'cl-1', 'antes de mexer no pagador, classe da conta do recebedor já vem selecionada');

document.getElementById('nf-pagador').value = 'pag-1'; // Condomínio -- compatível com cc-1
document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));

checarIgual(document.getElementById('nf-pagador').value, 'pag-1', 'pagador foi selecionado');
checarIgual(document.getElementById('nf-centro-custo').value, 'cc-1', 'BUG CORRIGIDO: centro de custo do recebedor continua selecionado depois de escolher o pagador compatível');
checarIgual(document.getElementById('nf-classe-conta').value, 'cl-1', 'BUG CORRIGIDO: classe da conta do recebedor continua selecionada depois de escolher o pagador compatível');

// Cenário 2 (comportamento correto continua existindo): se o pagador
// escolhido NÃO é compatível com o centro já selecionado, ainda reseta --
// a classificação antiga genuinamente deixou de fazer sentido.
document.getElementById('nf-pagador').value = 'pag-2'; // FPP -- cc-1 só aceita COND
document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checarIgual(document.getElementById('nf-centro-custo').value, '', 'pagador incompatível com o centro anterior -- aí sim reseta a classificação');

checarSemErrosNaoTratados(erros, 'classificacao_preservada_ao_trocar_pagador');
relatorioFinal('classificacao_preservada_ao_trocar_pagador');
