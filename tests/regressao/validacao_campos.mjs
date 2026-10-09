// Etapa 3 da melhoria do OCR: validação dos campos extraídos
// (validacao_campos.js) e escolha entre candidatos no leitor
// (extrairCamposDetalhado em leitor_documentos.js). Os dados de teste de
// linha digitável e chave de acesso vêm do gerador do harness
// (tests/e2e/avaliacao_ocr/casos_sinteticos.mjs), escrito separado do
// validador do app -- um confere o outro.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const V = await import('./app/src/js/validacao_campos.js');
const { extrairCamposDetalhado, reclassificarComHints } = await import('./app/src/js/leitor_documentos.js');
const G = await import('../e2e/avaliacao_ocr/casos_sinteticos.mjs');

console.log('### CNPJ / CPF ###');
checar(V.cnpjValido('11.222.333/0001-81'), 'CNPJ válido conhecido passa');
checar(!V.cnpjValido('11.222.333/0001-82'), 'CNPJ com DV trocado não passa');
checar(!V.cnpjValido('11111111111111'), 'sequência repetida não passa');
checar(V.cpfValido('529.982.247-25'), 'CPF válido conhecido passa');
checar(!V.cpfValido('529.982.247-24') && !V.cpfValido('111.111.111-11'), 'CPF com DV errado ou repetido não passa');
checarIgual(V.corrigirConfusoes('l1.2S2.333/OOO1-B1'), '11.252.333/0001-81', 'confusões O/0, l/1, S/5, B/8 desfeitas');

console.log('\n### linha digitável ###');
const r = G.prng(7);
const linha = G.gerarLinhaDigitavel(r, { vencimentoIso: '2026-03-06', valor: 11856.12 });
checar(V.linhaDigitavelValida(linha.formatado), 'linha digitável bancária válida (formatada) passa');
const trocada = linha.digitos.slice(0, 40) + ((Number(linha.digitos[40]) + 1) % 10) + linha.digitos.slice(41);
checar(!V.linhaDigitavelValida(trocada), 'um dígito trocado no valor quebra o DV geral');
const dadosLinha = V.dadosDaLinha(linha.digitos, new Date('2026-01-10T12:00:00Z'));
checarIgual(dadosLinha, { valor: 11856.12, vencimento: '2026-03-06' }, 'valor e vencimento saem da própria linha');
checarIgual(V.vencimentoDoFator('1000', new Date('2026-01-10T12:00:00Z')), '2025-02-22', 'fator 1000 no ciclo novo = 22/02/2025');
// arrecadação (48 dígitos, começa com 8, ref 6 = módulo 10)
const barras = '8' + '2' + '6' + '0' + '00000012345' + '0270' + '1234567890123456789012345';
const blocos = [0, 1, 2, 3].map(b => barras.slice(b * 11, b * 11 + 11)).map(b => b + G.dvMod10(b)).join('');
checar(V.linhaDigitavelValida(blocos), 'linha de arrecadação (48 dígitos) válida passa');
checarIgual(V.dadosDaLinha(blocos).valor, 123.45, 'valor da conta de arrecadação');
checar(!V.linhaDigitavelValida(blocos.slice(0, 47) + ((Number(blocos[47]) + 1) % 10)), 'arrecadação com DV de bloco errado não passa');

console.log('\n### chave de acesso ###');
const chave = G.gerarChaveNfe(r, { cnpj: '11222333000181', dataIso: '2026-03-05', numero: 12345 });
checar(V.chaveNfeValida(chave.digitos), 'chave NF-e válida passa');
checar(!V.chaveNfeValida('99' + chave.digitos.slice(2)), 'UF inexistente não passa');
checar(!V.chaveNfeValida(chave.digitos.slice(0, 43) + ((Number(chave.digitos[43]) + 1) % 10)), 'DV errado não passa');
checarIgual(V.dadosDaChave(chave.digitos), { cnpjEmitente: '11222333000181', numeroNota: '12345', serie: '1', mesEmissao: '2026-03' }, 'CNPJ do emitente, número, série e mês saem da chave');
checarIgual(V.janelaValida('1' + chave.digitos, 44, V.chaveNfeValida), chave.digitos, 'dígito solto grudado na chave: acha a janela válida');

console.log('\n### datas e valores ###');
const hoje = new Date('2026-06-01T12:00:00Z');
checar(V.dataPlausivel('28/02/2026', { hoje }) && !V.dataPlausivel('30/02/2026', { hoje }), '30/02 não existe');
checar(!V.dataPlausivel('01/01/2096', { hoje }), 'ano muito longe (dígito trocado) não é plausível');
checar(V.valorPlausivel(10) && !V.valorPlausivel(0) && !V.valorPlausivel(9e9), 'valor positivo e abaixo do teto');

console.log('\n### escolha entre candidatos ###');
const cnpjA = G.gerarCnpj(G.prng(1)), cnpjB = G.gerarCnpj(G.prng(2)), cpf = G.gerarCpf(G.prng(3));
const comprovante = `Comprovante de transferência PIX\nValor\nR$ 1.500,00\nDestino\nNome: Fulano\nCPF: ${cpf.formatado}\nOrigem\nCNPJ: ${cnpjA.formatado}`;
const dc = extrairCamposDetalhado(comprovante);
checarIgual([dc.campos.cpf, dc.campos.cnpj], [cpf.formatado, undefined], 'comprovante: CPF do destino vence o CNPJ da origem');
const boleto = `Pagador\nCONDOMÍNIO - CNPJ ${cnpjA.formatado}\nBeneficiário\nFORNECEDOR X - CNPJ ${cnpjB.formatado}`;
const db = extrairCamposDetalhado(boleto);
checarIgual(db.campos.cnpj, cnpjB.formatado, 'boleto: CNPJ do beneficiário vence o do pagador, mesmo aparecendo depois');
checarIgual(db.documentosCandidatos, [cnpjB.digitos, cnpjA.digitos], 'todos os CNPJs válidos ficam como candidatos (melhor primeiro)');
const comO = cnpjA.formatado.replace(/0/g, 'O');
checarIgual(extrairCamposDetalhado(`CNPJ: ${comO}`).campos.cnpj, cnpjA.formatado, 'CNPJ lido com O no lugar de 0 é corrigido (o DV confirma)');
const ruim = extrairCamposDetalhado('CNPJ: 12.345.678/0001-99');
checarIgual([ruim.campos.cnpj, ruim.invalidos.cnpj], ['12.345.678/0001-99', 'dígito verificador não confere'], 'sem nenhum CNPJ válido, fica o do formato certo, marcado como inválido');

console.log('\n### chave e linha corrigem os outros campos ###');
const danfe = `DANFE Nº 000,528.349\nCNPJ: ${cnpjB.formatado}\nCHAVE DE ACESSO\n1 ${chave.formatado}.\nDATA DA EMISSÃO: 05/03/2026\nVALOR TOTAL DA NOTA R$ 900,00\nDesconto R$ 50,00`;
const dd = extrairCamposDetalhado(danfe);
checarIgual(dd.campos.chaveAcesso, chave.digitos, 'chave achada mesmo com dígito solto antes');
checarIgual(dd.campos.numeroNota, '000528349', 'número lido diferente do da chave: fica o lido...');
checar(dd.invalidos.numeroNota && dd.invalidos.chaveAcesso, '...e os dois vão pra conferir (a chave pode ter dois dígitos trocados e ainda passar no DV)');
const semNumero = extrairCamposDetalhado(danfe.replace('DANFE Nº 000,528.349\n', 'DANFE\n'));
checarIgual(semNumero.campos.numeroNota, '12345', 'sem número lido no texto, o número vem da chave (validado)');
checar(semNumero.validados.includes('numeroNota'), 'número tirado da chave conta como validado');
const comNumeroCerto = extrairCamposDetalhado(danfe.replace('000,528.349', '000.012.345'));
checar(comNumeroCerto.validados.includes('numeroNota') && !comNumeroCerto.invalidos.numeroNota, 'número lido que bate com a chave fica validado');
checarIgual(dd.campos.cnpj, '11.222.333/0001-81', 'CNPJ do emitente vem da chave');
checar(['cnpj', 'dataEmissao'].every(c => dd.validados.includes(c)), 'CNPJ (vindo da chave) e emissão (mês bate) ficam validados');
checarIgual(extrairCamposDetalhado(danfe.replace('05/03/2026', '05/04/2026')).invalidos.dataEmissao, 'não bate com o mês da chave de acesso', 'emissão fora do mês da chave fica inválida');
checarIgual(extrairCamposDetalhado('DANFE Nº 000,528.349').campos.numeroNota, '000528349', 'número com vírgula no lugar do ponto (OCR) sai inteiro');
checarIgual(extrairCamposDetalhado('Desconto R$ 50,00\nVALOR TOTAL DA NOTA R$ 900,00').campos.valor, 900, 'valor rotulado ("valor total") vence o primeiro R$');
const textoBoleto = `Banco | ${linha.formatado}\nVencimento\n06/03/2026\nValor do documento R$ 11.856,12`;
const dl = extrairCamposDetalhado(textoBoleto.replace('R$ 11.856,12', 'R$ 11.856,1Z'));
checarIgual([dl.campos.linhaDigitavel, dl.campos.valor], [linha.digitos, 11856.12], 'linha digitável válida traz o valor mesmo quando o R$ saiu ilegível');
checar(dl.validados.includes('valor') && dl.validados.includes('linhaDigitavel'), 'valor da linha conta como validado');

console.log('\n### confiança: validado não fica duvidoso; hint tira a validação ###');
const palavras = { 1: [{ texto: cnpjB.formatado, conf: 70 }] };
const rc = reclassificarComHints(`Beneficiário CNPJ ${cnpjB.formatado}`, [], palavras, 'ocr');
checar(!rc.camposDuvidosos.includes('cnpj'), 'CNPJ com DV válido não fica duvidoso mesmo com leitura de confiança 70');
const rh = reclassificarComHints(`Nota fiscal nº 123\nPedido: 456`, [{ campo: 'numeroNota', ancora: 'pedido:' }], undefined, 'pdf_texto');
checarIgual(rh.campos.numeroNota, '456', 'hint do fornecedor continua com a palavra final');

relatorioFinal('validacao_campos');
