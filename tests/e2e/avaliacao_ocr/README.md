# Avaliação do OCR

A régua usada para medir cada etapa de melhoria do leitor de documentos (`src/js/ocr_imagem.js` e `src/js/leitor_documentos.js`). Fica fora do CI, porque o `tests/e2e/run-all.mjs` não lê subpastas.

| Arquivo | O que faz |
|---|---|
| `avaliar.mjs` | Roda os casos sintéticos (nota, boleto e comprovante, cada um com 10 degradações) pelo mesmo caminho do app e imprime as taxas de acerto por campo. |
| `avaliar_reais.mjs` | Roda os anexos reais das notas mais recentes. O gabarito é o que foi lançado na nota. Só faz leitura, apaga os arquivos ao final e só imprime taxas agregadas. |
| `casos_sinteticos.mjs` | Gera os dados fictícios e os layouts de forma determinística: CNPJ/CPF, chave NF-e e linha digitável com DV válido. |
| `gerar_sinteticos.js` | Roda no navegador: desenha a página no canvas e aplica a degradação. |
| `pontuacao.mjs` | Normaliza, pontua e monta as tabelas. É testado em `tests/regressao/ocr_pontuacao.mjs`. |
| `resultados/` | Um `<etapa>.json` por etapa (sintético, versionado). Os arquivos `reais_*` ficam no `.gitignore`. |

Para rodar, a partir de `tests/e2e`, depois do `npm ci`:

```
node avaliacao_ocr/avaliar.mjs --etapa=baseline
node avaliacao_ocr/avaliar.mjs --etapa=etapa1 --comparar=baseline
AVALIACAO_EMAIL=... AVALIACAO_SENHA=... node avaliacao_ocr/avaliar_reais.mjs --etapa=baseline --limite=100
```

## Métricas

Cada campo cai em uma de três categorias:

- **acerto**
- **erro silencioso:** o campo veio preenchido, mas errado, que é o pior caso porque parece certo;
- **ausente.**

A coluna **aparece no texto** separa duas falhas diferentes: quando o OCR não leu o valor, e quando ele leu, mas o leitor escolheu outro.
