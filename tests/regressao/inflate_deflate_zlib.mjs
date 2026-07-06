// inflate.js: descompressor DEFLATE/zlib escrito do zero (sem lib
// nenhuma) -- é o que deixa o leitor de documentos (pdf_texto.js) ler o
// texto de um PDF sem depender de nada além do que já está no
// repositório, já que todo PDF comprime o conteúdo de cada página com
// /FlateDecode (zlib). Comprime com o zlib nativo do Node (só pra gerar
// o fixture do teste -- o app nunca usa isso, só recebe bytes já
// comprimidos vindos do PDF) e confere que o nosso inflate reproduz
// exatamente o original, em blocos fixed Huffman, dynamic Huffman e
// stored.
import zlib from 'node:zlib';
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.departamento);
const { inflateZlib } = await import('./app/src/js/inflate.js');

function checarInflate(texto, descricao) {
  const original = Buffer.from(texto, 'utf8');
  const comprimido = new Uint8Array(zlib.deflateSync(original));
  const descomprimido = Buffer.from(inflateZlib(comprimido));
  checar(descomprimido.equals(original), `${descricao} (${texto.length} bytes)`);
}

// 1) Texto curto -- normalmente vira um único bloco fixed Huffman.
checarInflate('ola mundo', 'texto curto simples');
checarInflate('', 'string vazia');
checarInflate('BT /Helvetica-Bold 12 Tf (NOTA FISCAL NF-12345) Tj ET', 'trecho de content stream de PDF de verdade');

// 2) Texto repetitivo/longo -- zlib tende a usar dynamic Huffman (tabela
// de códigos otimizada pra frequência real dos símbolos).
checarInflate('lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(80), 'texto longo repetitivo (dynamic Huffman)');
checarInflate('a'.repeat(2000), 'run longo do mesmo caractere (LZ77 back-reference longa)');

// 3) JSON com estrutura repetida (mistura de literais e back-references).
checarInflate(JSON.stringify({ a: 1, b: [1, 2, 3, 4, 5], c: 'texto repetido texto repetido texto repetido' }), 'JSON com padrão repetido');

// 4) Acentuação (Latin-1/UTF-8) -- o mesmo tipo de texto que aparece de
// verdade num documento em português.
checarInflate('Fornecedor: Açaí & Café Ltda - São Paulo, descrição: manutenção predial', 'texto com acentuação em português');

// 5) Binário aleatório comprimido com level:0 (força bloco "stored", sem
// Huffman nenhum -- o caminho mais simples do formato, mas também
// precisa funcionar).
const aleatorio = Buffer.from(Array.from({ length: 400 }, () => Math.floor(Math.random() * 256)));
const comprimidoStored = new Uint8Array(zlib.deflateSync(aleatorio, { level: 0 }));
const descomprimidoStored = Buffer.from(inflateZlib(comprimidoStored));
checar(descomprimidoStored.equals(aleatorio), 'bloco "stored" (dados pouco compressíveis, level 0) descomprime byte a byte igual ao original');

checarSemErrosNaoTratados(erros, 'inflate_deflate_zlib');
relatorioFinal('inflate_deflate_zlib');
