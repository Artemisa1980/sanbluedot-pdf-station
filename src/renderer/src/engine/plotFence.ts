import type { TokenizerAndRendererExtension } from "marked";

/* Regla única del bloque ```plot: la usan el motor (chart.ts, que dibuja) y el panel de
   Gráficas (plotBlocks.ts, que edita). Así el panel nunca cuenta como gráfica algo que el
   PDF no dibuja, por ejemplo un ```plot de ejemplo dentro de un bloque de código. */
export const PLOT_FENCE = /^```plot[ \t]*\r?\n([\s\S]+?)\r?\n```[ \t]*(?:\r?\n+|$)/;

export const plotFenceTokenizer: TokenizerAndRendererExtension = {
  name: "plotBlock",
  level: "block",
  start(src) {
    return src.indexOf("```plot");
  },
  tokenizer(src) {
    const match = PLOT_FENCE.exec(src);
    if (!match) return undefined;
    return {
      type: "plotBlock",
      raw: match[0],
      text: match[1].trim()
    };
  }
};
