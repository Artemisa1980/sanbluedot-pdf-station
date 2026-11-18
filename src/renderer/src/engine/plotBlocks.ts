import { Marked, type Token } from "marked";
import type { ChartSpec } from "./chart";
import { mathExtension } from "./math";
import { PLOT_FENCE, plotFenceTokenizer } from "./plotFence";

export interface PlotBlockItem {
  index: number;
  raw: string;
  startIndex: number;
  endIndex: number;
  spec: ChartSpec;
  /** El JSON ocupa varias líneas: al reescribirlo se conserva esa forma */
  multiline: boolean;
}

/* El panel tokeniza con las mismas reglas que la compilación (fórmulas y ```plot): un ```plot
   dentro de un bloque de código o de una fórmula no es una gráfica y no se cuenta. */
const lexer = new Marked();
lexer.use(mathExtension);
lexer.use({ extensions: [plotFenceTokenizer] });

function collectPlotRaws(tokens: Token[], out: string[]): void {
  for (const token of tokens) {
    if (token.type === "plotBlock") out.push(token.raw);
    const nested = token as { tokens?: Token[]; items?: Token[] };
    if (Array.isArray(nested.tokens)) collectPlotRaws(nested.tokens, out);
    if (Array.isArray(nested.items)) collectPlotRaws(nested.items, out);
  }
}

export function parsePlotBlocks(content: string): PlotBlockItem[] {
  const raws: string[] = [];
  collectPlotRaws(lexer.lexer(content), raws);

  const items: PlotBlockItem[] = [];
  let cursor = 0;
  raws.forEach((raw, index) => {
    // Un bloque dentro de una cita o lista pierde su prefijo al tokenizarse: si su texto no
    // aparece tal cual en la fuente, el panel no lo edita (el índice ordinal se mantiene)
    const match = PLOT_FENCE.exec(raw);
    if (!match) return;
    // marked convierte CRLF en LF antes de tokenizar: en un archivo de Windows se busca la forma CRLF
    const lf = raw.replace(/[ \t]*(?:\r?\n)*$/, "");
    const crlf = lf.replace(/\n/g, "\r\n");
    const atLf = content.indexOf(lf, cursor);
    const atCrlf = crlf === lf ? -1 : content.indexOf(crlf, cursor);
    const useCrlf = atCrlf !== -1 && (atLf === -1 || atCrlf < atLf);
    const at = useCrlf ? atCrlf : atLf;
    const block = useCrlf ? crlf : lf;
    if (at === -1) return;
    cursor = at + block.length;
    try {
      items.push({
        index,
        raw: block,
        startIndex: at,
        endIndex: at + block.length,
        spec: JSON.parse(match[1]),
        multiline: /\n/.test(match[1].trim())
      });
    } catch {
      // JSON malformado: el bloque no se edita y el índice ordinal de los demás no cambia
    }
  });
  return items;
}

/** JSON en una sola línea con espacios legibles: {"a": 1, "b": [0, 10]} */
function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inlineJson(v)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

export function updatePlotBlockInContent(
  content: string,
  blockIndex: number,
  newSpec: ChartSpec
): string {
  const blocks = parsePlotBlocks(content);
  const target = blocks.find((b) => b.index === blockIndex);
  if (!target) return content;

  const isCrlf = content.includes("\r\n");
  const eol = isCrlf ? "\r\n" : "\n";
  const newJson = target.multiline ? JSON.stringify(newSpec, null, 2) : inlineJson(newSpec);
  const formattedJson = isCrlf ? newJson.replace(/\n/g, "\r\n") : newJson;
  const newBlock = `\`\`\`plot${eol}${formattedJson}${eol}\`\`\``;

  return content.slice(0, target.startIndex) + newBlock + content.slice(target.endIndex);
}
