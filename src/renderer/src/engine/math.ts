import katex from "katex";
import type { MarkedExtension } from "marked";

/* Fórmulas: $…$ en línea y $$…$$ en bloque (cada $$ en su propia línea).
   KaTeX las dibuja como MathML al compilar: contenido estático que Chromium imprime
   vectorial, sin scripts (CSP script-src 'none') ni red.
   Dinero no es fórmula ("$200 y $180"): el $ que abre no lleva espacio después y el
   que cierra no lleva espacio antes ni un dígito después (misma regla que Pandoc).
   \$ sigue siendo un $ literal. */
const render = (tex: string, displayMode: boolean): string =>
  katex.renderToString(tex, { output: "mathml", displayMode, throwOnError: false });

/* Chromium (MathML Core) ignora columnalign/columnspacing/rowspacing de las tablas que
   KaTeX genera para aligned: sin esto los = no quedan en columna. Y la fórmula en bloque
   necesita aire arriba y abajo. */
export const mathCss = `math[display="block"]{margin:0.8em 0}
mtable[columnalign="right left"]>mtr>mtd{padding:0.15em 0}
mtable[columnalign="right left"]>mtr>mtd:nth-child(odd){text-align:right}
mtable[columnalign="right left"]>mtr>mtd:nth-child(even){text-align:left}`;

const BLOCK =/^\$\$[ \t]*\n([\s\S]+?)\n[ \t]*\$\$[ \t]*(?:\n+|$)/;
const INLINE = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/;

export const mathExtension: MarkedExtension = {
  extensions: [
    {
      name: "mathBlock",
      level: "block",
      start(src) {
        const i = src.search(/^\$\$[ \t]*$/m);
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const m = BLOCK.exec(src);
        return m ? { type: "mathBlock", raw: m[0], text: m[1] } : undefined;
      },
      renderer: (token) => `${render(token.text, true)}\n`
    },
    {
      name: "mathInline",
      level: "inline",
      start(src) {
        const i = src.search(/(?<!\\)\$/);
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const m = INLINE.exec(src);
        return m ? { type: "mathInline", raw: m[0], text: m[1] } : undefined;
      },
      renderer: (token) => render(token.text, false)
    }
  ]
};
