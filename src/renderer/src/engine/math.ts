import katex from "katex";
import type { MarkedExtension } from "marked";

/* Fórmulas en bloque: $$…$$ (en una línea o en varias, con o sin contenido junto a los $$)
   y \[…\]. En línea: $…$ y \(…\); un $$…$$ o \[…\] dentro de un párrafo sale centrado.
   KaTeX las dibuja al compilar (HTML con sus letras incrustadas + MathML): contenido
   estático que Chromium imprime vectorial, sin scripts (CSP script-src 'none') ni red.
   Dinero no es fórmula ("$200 y $180"): el $ que abre no lleva espacio después y el
   que cierra no lleva espacio antes ni un dígito después (misma regla que Pandoc).
   \$ sigue siendo un $ literal. */
const render = (tex: string, displayMode: boolean): string =>
  katex.renderToString(tex, { output: "htmlAndMathml", displayMode, throwOnError: false });

/* El cuerpo de un $$ en bloque no contiene otro $$: "$$a$$ y $$b$$" en una línea son dos
   fórmulas (camino en línea), no una sola de "a$$ y $$b". */
const BLOCK = /^\$\$(?!\$)((?:(?!\$\$)[\s\S])+?)\$\$[ \t]*(?:\r?\n+|$)/;
const BLOCK_BRACKET = /^\\\[([\s\S]+?)\\\][ \t]*(?:\r?\n+|$)/;
const INLINE_DISPLAY = /^\$\$(?!\$)((?:\\.|[^\\$])+?)\$\$|^\\\[((?:(?!\r?\n[ \t]*\r?\n)[\s\S])+?)\\\]/;
const INLINE_PAREN = /^\\\(((?:(?!\r?\n[ \t]*\r?\n)[\s\S])+?)\\\)/;
const INLINE = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/;

/** Una fórmula no cruza una línea en blanco: evita tragarse párrafos enteros entre dos $$ sueltos. */
const sinLineaEnBlanco = (tex: string): boolean => tex.trim() !== "" && !/\r?\n[ \t]*\r?\n/.test(tex);

export const mathExtension: MarkedExtension = {
  extensions: [
    {
      name: "mathBlock",
      level: "block",
      start(src) {
        const i = src.search(/^(?:\$\$|\\\[)/m);
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const m = BLOCK.exec(src) ?? BLOCK_BRACKET.exec(src);
        return m && sinLineaEnBlanco(m[1]) ? { type: "mathBlock", raw: m[0], text: m[1].trim() } : undefined;
      },
      renderer: (token) => `${render(token.text, true)}\n`
    },
    {
      name: "mathInline",
      level: "inline",
      start(src) {
        const i = src.search(/(?<!\\)\$|\\[[(]/);
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const d = INLINE_DISPLAY.exec(src);
        if (d) {
          const tex = (d[1] ?? d[2]).trim();
          return tex ? { type: "mathInline", raw: d[0], text: tex, display: true } : undefined;
        }
        const m = INLINE_PAREN.exec(src) ?? INLINE.exec(src);
        return m && m[1].trim() ? { type: "mathInline", raw: m[0], text: m[1].trim(), display: false } : undefined;
      },
      renderer: (token) => render(token.text, token.display === true)
    }
  ]
};
