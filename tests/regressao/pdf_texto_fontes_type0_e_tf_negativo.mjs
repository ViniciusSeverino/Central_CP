// pdf_texto.js: interpretação do content stream de uma página de PDF --
// cobre especificamente o bug real encontrado com um DANFE de verdade
// (COND_BSB_..._NF984_TED.pdf, ver histórico): a página usava fonte
// Type0/Identity-H (código de 2 bytes) E tamanho de fonte NEGATIVO no
// operador Tf (comum quando a página inverte o eixo Y com um `cm` antes
// de desenhar texto -- caso real de DANFE gerado por sistema de
// faturamento). O regex que reconhece "/NomeFonte tamanho Tf" só aceitava
// dígitos, então com um tamanho negativo ele nunca casava, a fonte nunca
// era trocada, e a página inteira era decodificada como se fosse a fonte
// default (1 byte, WinAnsi) -- produzindo um caractere nulo intercalado
// com um caractere errado pra cada glifo real (texto ilegível, sem
// nenhuma palavra-chave reconhecível: por isso o documento aparecia como
// "não identificado" e sem nenhum campo extraído).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.departamento);
const { extrairTextoDoConteudo } = await import('./app/src/js/pdf_texto.js');

function cmapType0(pares) {
  const mapa = new Map();
  for (const [codigoHex, char] of pares) mapa.set(codigoHex, char);
  return mapa;
}

// 1) O bug real: fonte Type0 (2 bytes) + tamanho NEGATIVO no Tf.
const infoType0 = { Font_0: { cmap: cmapType0([['0041', 'N'], ['0042', 'F']]), doisBytes: true } };
const streamNegativo = 'BT /Font_0 -8 Tf <00410042> Tj ET';
checar(
  extrairTextoDoConteudo(streamNegativo, infoType0) === 'NF',
  'fonte Type0 com tamanho negativo no Tf (ex: /Font_0 -8 Tf) troca de fonte corretamente e decodifica os códigos de 2 bytes via ToUnicode',
);

// 2) Mesma fonte Type0, mas com tamanho positivo (garante que a correção
// do regex não quebrou o caso comum, só ADICIONOU o negativo).
const streamPositivo = 'BT /Font_0 8 Tf <00410042> Tj ET';
checar(
  extrairTextoDoConteudo(streamPositivo, infoType0) === 'NF',
  'fonte Type0 com tamanho positivo no Tf continua funcionando normalmente',
);

// 3) Fonte simples (1 byte, sem ToUnicode -- cai no WinAnsi) também com
// tamanho negativo: o fix é no reconhecimento do operador Tf, não é
// específico de Type0, então tem que valer pra fonte simples também.
const infoSimples = { Font_1: { cmap: null, doisBytes: false } };
const streamSimplesNegativo = 'BT /Font_1 -12 Tf (AB) Tj ET';
checar(
  extrairTextoDoConteudo(streamSimplesNegativo, infoSimples) === 'AB',
  'fonte simples com tamanho negativo no Tf também troca de fonte corretamente (fix não é específico de Type0)',
);

// 4) Tamanho negativo com casas decimais (ex: -8.25) -- variação real de
// tamanho de fonte, garante que o "-?" não quebrou o "[\d.]+" já existente.
const streamDecimalNegativo = 'BT /Font_0 -8.25 Tf <0041> Tj ET';
checar(
  extrairTextoDoConteudo(streamDecimalNegativo, infoType0) === 'N',
  'tamanho de fonte negativo com casas decimais (-8.25) também é reconhecido',
);

// 5) Sem correspondência de fonte (nome desconhecido no Resources) --
// não lança erro, só mantém a fonte atual (aqui, a default de 1 byte,
// já que não havia nenhuma selecionada antes).
const streamFonteDesconhecida = 'BT /Font_9 -8 Tf <0041> Tj ET';
checar(
  extrairTextoDoConteudo(streamFonteDesconhecida, infoType0) === '\u0000A',
  'nome de fonte não encontrado no Resources não quebra (mantém a fonte anterior, não lança erro)',
);

// 6) Código de 2 bytes sem correspondência na tabela ToUnicode não vira
// um caractere "chutado" (fail-safe: mais vale faltar do que inventar).
const streamSemCmap = 'BT /Font_0 -8 Tf <FFFF> Tj ET';
checar(
  extrairTextoDoConteudo(streamSemCmap, infoType0) === '',
  'código de 2 bytes sem entrada na tabela ToUnicode vira "" em vez de um caractere errado',
);

checarSemErrosNaoTratados(erros, 'pdf_texto_fontes_type0_e_tf_negativo');
relatorioFinal('pdf_texto_fontes_type0_e_tf_negativo');
