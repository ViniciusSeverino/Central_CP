// src/js/brand.js
//
// Fonte única do ícone da marca usado inline no app (sidebar, header
// mobile, tela de login) — imagem em src/brand/logo-mark.jpg (mesma
// origem dos ícones do PWA em src/icons/, ver README pra regenerar).
// Era um SVG desenhado à mão (documento com check) antes da marca nova
// (cubo isométrico "CP") -- agora é raster, então não dá mais pra ter uma
// variante "sem fundo" de verdade (não tem como recortar a máscara de um
// JPEG sem processamento de imagem à parte); como o fundo da própria foto
// já é preto/quase preto e os lugares onde o ícone aparece (sidebar,
// header mobile) também usam um fundo bem escuro (--brand-dark), o
// quadrado da imagem não chega a aparecer contra o fundo ao redor.
// Sem estilo inline de tamanho aqui de propósito -- width/height/object-fit
// já vêm das regras ".mark img" em styles.css/mobile.css (cada contexto
// onde a marca aparece já tinha essa regra pro .mark svg antigo, só
// reaproveitada pro <img>). Um "style=" inline com "height:100%" faria
// esta tag colidir com qualquer seletor de teste genérico por
// "[style*='height:100%']" em outra tela (foi exatamente isso que
// quebrou tests/regressao/armazenamento_thresholds_cor_da_barra.mjs -- o
// querySelector pegava esta imagem, sempre presente na sidebar, em vez da
// barra de progresso de armazenamento).
const LOGO_MARK_IMG = `<img src="src/brand/logo-mark.jpg" alt="Central CP">`;

export const ICON_MARK_SVG = LOGO_MARK_IMG;
export const ICON_MARK_SVG_TRANSPARENT = LOGO_MARK_IMG;
