// Harness de avaliação do OCR (tests/e2e/avaliacao_ocr): a régua em si
// também precisa de teste -- se a normalização/pontuação estiver errada,
// toda comparação antes x depois das etapas de melhoria do OCR fica
// errada junto. Testa a parte pura: normalização por campo, pontuação de
// um caso, "aparece no texto", agregação e os dígitos verificadores dos
// dados sintéticos (CNPJ/CPF, chave NF-e, linha digitável).
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
import { normalizar, pontuarCaso, apareceNoTexto, agregar, taxa, tabelaMarkdown } from '../e2e/avaliacao_ocr/pontuacao.mjs';
import { dvCnpj, dvCpf, dvChaveNfe, dvMod10, gerarCasos, gerarLinhaDigitavel, gerarChaveNfe, fatorVencimento, prng } from '../e2e/avaliacao_ocr/casos_sinteticos.mjs';

console.log('### normalização ###');
checarIgual(normalizar('numeroNota', '000.012.345'), '12345', 'número da nota: só dígitos, sem zeros à esquerda');
checarIgual(normalizar('valor', 1234.5), 1234.5, 'valor numérico fica como número');
checarIgual(normalizar('data', '05/03/2026'), '2026-03-05', 'data dd/mm/aaaa vira ISO');
checarIgual(normalizar('data', '2026-03-05'), '2026-03-05', 'data ISO do banco continua ISO');
checarIgual(normalizar('documento', '11.222.333/0001-81'), '11222333000181', 'CNPJ: só dígitos');
checarIgual(normalizar('documento', ''), null, 'vazio vira null');

console.log('\n### pontuação de um caso ###');
const gabarito = { numeroNota: '12345', valor: [1000, 950.5], documento: '11222333000181', data: '2026-03-05', linhaDigitavel: null };
const pontos = pontuarCaso(gabarito, { numeroNota: '012345', valor: 950.5, cnpj: '11.222.333/0001-81', data: '06/03/2026' });
checarIgual(pontos.numeroNota, 'acerto', 'número com zero à esquerda conta como acerto');
checarIgual(pontos.valor, 'acerto', 'valor bate com uma das alternativas aceitas (bruto ou líquido)');
checarIgual(pontos.documento, 'acerto', 'CNPJ formatado bate com o gabarito em dígitos');
checarIgual(pontos.data, 'erro', 'data preenchida com outro dia é erro silencioso');
checar(!('linhaDigitavel' in pontos), 'campo sem gabarito não é pontuado');
checarIgual(pontuarCaso({ valor: 10 }, {}).valor, 'ausente', 'campo não extraído é "ausente"');
checarIgual(pontuarCaso({ documento: '52998224725' }, { cpf: '529.982.247-25' }).documento, 'acerto', 'CPF do leitor também vale como documento');
checarIgual(pontuarCaso({ valor: 10 }, { valor: 10.004 }).valor, 'acerto', 'valor com diferença de arredondamento < 0,005 é acerto');

console.log('\n### aparece no texto ###');
checar(apareceNoTexto('valor', 11856.12, 'Valor R$ 11.856,12'), 'valor aparece (formato BR com milhar)');
checar(apareceNoTexto('data', '2026-03-06', 'Vencimento 06/03/2026'), 'data ISO é achada no texto em dd/mm/aaaa');
checar(apareceNoTexto('documento', '25444865000178', 'CNPJ 25.444.865/0001-78'), 'CNPJ aparece mesmo com pontuação');
checar(!apareceNoTexto('valor', 10, 'nada aqui'), 'valor ausente do texto -> false');

console.log('\n### agregação ###');
const ag = agregar([
  { id: 'a', grupos: { tipo: 'boleto' }, pontos: { valor: 'acerto', data: 'erro' }, noTexto: { valor: true, data: true }, ms: 100 },
  { id: 'b', grupos: { tipo: 'boleto' }, pontos: { valor: 'ausente' }, noTexto: { valor: false }, ms: 300 },
]);
checarIgual(ag.total.valor, { casos: 2, acerto: 1, erro: 0, ausente: 1, noTexto: 1 }, 'totais do campo valor');
checarIgual(taxa(ag.total.data, 'erro'), 1, 'taxa de erro silencioso da data');
checarIgual(ag.msMedio, 200, 'tempo médio por documento');
checarIgual(ag.porGrupo.tipo.boleto.valor.casos, 2, 'agrupamento por tipo');
checar(tabelaMarkdown(ag, 'x').includes('| Valor | 2 | 50,0% |'), 'tabela markdown traz a linha do valor');

console.log('\n### dígitos verificadores dos dados sintéticos ###');
checarIgual(dvCnpj('112223330001'), '81', 'DV de CNPJ conhecido (11.222.333/0001-81)');
checarIgual(dvCpf('529982247'), '25', 'DV de CPF conhecido (529.982.247-25)');
checarIgual(dvMod10('001905009'), 5, 'módulo 10 de um campo de linha digitável conhecido');
checarIgual(fatorVencimento('2025-02-22'), 1000, 'fator de vencimento reinicia em 1000 em 22/02/2025');
checarIgual(fatorVencimento('2000-07-03'), 1000, 'fator de vencimento 1000 do ciclo antigo (03/07/2000)');
const r = prng(42);
const chave = gerarChaveNfe(r, { cnpj: '11222333000181', dataIso: '2026-03-05', numero: 12345 });
checarIgual(chave.digitos.length, 44, 'chave NF-e tem 44 dígitos');
checarIgual(Number(chave.digitos[43]), dvChaveNfe(chave.digitos.slice(0, 43)), 'DV da chave NF-e confere');
checarIgual(chave.digitos.slice(6, 20), '11222333000181', 'chave NF-e embute o CNPJ do emitente');
const linha = gerarLinhaDigitavel(r, { vencimentoIso: '2026-03-06', valor: 11856.12 });
checarIgual(linha.digitos.length, 47, 'linha digitável tem 47 dígitos');
checarIgual(linha.digitos.slice(-10), '0001185612', 'linha digitável termina com o valor');
checarIgual(Number(linha.digitos[9]), dvMod10(linha.digitos.slice(0, 9)), 'DV do campo 1 da linha confere');
const casos = gerarCasos({ sementes: 2 });
checarIgual(casos.length, 60, '3 tipos x 10 degradações x 2 sementes = 60 casos');
checar(JSON.stringify(gerarCasos({ sementes: 2 })) === JSON.stringify(casos), 'geração é determinística (mesma semente, mesmos casos)');
checar(casos.every(c => c.gabarito.documento && (c.gabarito.documento.length === 14 ? c.gabarito.documento.slice(12) === dvCnpj(c.gabarito.documento.slice(0, 12)) : c.gabarito.documento.slice(9) === dvCpf(c.gabarito.documento.slice(0, 9)))), 'todo CNPJ/CPF sintético tem DV válido');

relatorioFinal('ocr_pontuacao');
