// Pré-cadastro de fornecedor (ver migration 0030) é só do perfil
// "completo". Cobre também a correção pedida pelo dono do produto (ponto
// 3 do pedido "recebedor"): "Completar lançamento" e "Devolver pedindo
// documento" exigem preencher o resto da nota (valor, vencimento, pagador,
// forma de pagamento...) -- só o perfil "completo" faz isso. Antes dessa
// correção, qualquer departamento do mesmo setor via esses botões também,
// recebedor incluído (ver ehRecebedor() em renderDetailActions,
// ui_nota.js) -- o recebedor não tem mais NENHUM caminho até o formulário
// inteiro, então o link de pré-cadastro (que só existe nele) fica
// automaticamente fora de alcance.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.departamentoRecebedor);

// nota-recebida-1 (fixture, setor Marketing) está 'recebido', sem
// pendência -- o recebedor não completa o lançamento nem devolve pedindo
// documento (isso é do perfil "completo" do mesmo setor); só "Corrigir e
// devolver" continua disponível pra qualquer perfil, e só quando pendente.
document.querySelector('[data-open="nota-recebida-1"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!document.querySelector('[data-action="completar_recebimento"][data-id="nota-recebida-1"]'), 'recebedor NÃO vê "Completar lançamento" (isso é do perfil completo)');
checar(!document.querySelector('[data-action="marcar_pendencia"][data-id="nota-recebida-1"]'), 'recebedor NÃO vê "Devolver pedindo documento" (isso é do perfil completo)');
checar(!document.getElementById('nf-valor'), 'recebedor não tem como abrir o formulário inteiro a partir desta nota');

checarSemErrosNaoTratados(erros, 'fornecedor_pre_cadastro_recebedor_nao_ve');
relatorioFinal('fornecedor_pre_cadastro_recebedor_nao_ve');
