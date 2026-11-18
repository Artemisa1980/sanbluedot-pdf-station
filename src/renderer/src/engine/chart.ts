import * as Plot from "@observablehq/plot";
import type { MarkedExtension } from "marked";
import type { DocStyle } from "../../../shared/types";
import { fontById } from "./fonts";
import { plotFenceTokenizer } from "./plotFence";

/* =========================================================================
   AST Math Evaluator — Seguro, recursivo, sin eval() ni new Function()
   ========================================================================= */

type TokenType = "NUMBER" | "IDENT" | "PLUS" | "MINUS" | "MUL" | "DIV" | "POW" | "LPAREN" | "RPAREN" | "COMMA" | "EOF";

interface Token {
  type: TokenType;
  value?: string | number;
}

class Lexer {
  private pos = 0;
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  nextToken(): Token {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
    if (this.pos >= this.input.length) return { type: "EOF" };

    const ch = this.input[this.pos];

    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
        numStr += this.input[this.pos++];
      }
      // "1.2.3" o "." no son números: parseFloat los leía en silencio como 1.2 o NaN
      if (!/^(?:\d+\.?\d*|\.\d+)$/.test(numStr)) {
        throw new Error(`Número inválido en fórmula: '${numStr}'`);
      }
      return { type: "NUMBER", value: parseFloat(numStr) };
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
        ident += this.input[this.pos++];
      }
      return { type: "IDENT", value: ident };
    }

    this.pos++;
    switch (ch) {
      case "+": return { type: "PLUS" };
      case "-": return { type: "MINUS" };
      case "*": return { type: "MUL" };
      case "/": return { type: "DIV" };
      case "^": return { type: "POW" };
      case "(": return { type: "LPAREN" };
      case ")": return { type: "RPAREN" };
      case ",": return { type: "COMMA" };
      default: throw new Error(`Carácter no reconocido en fórmula: '${ch}'`);
    }
  }
}

type ASTNode =
  | { type: "Num"; val: number }
  | { type: "Var"; name: string }
  | { type: "Binary"; op: string; left: ASTNode; right: ASTNode }
  | { type: "Unary"; op: string; expr: ASTNode }
  | { type: "Call"; name: string; args: ASTNode[] };

class Parser {
  private curr: Token;
  private lexer: Lexer;

  constructor(input: string) {
    this.lexer = new Lexer(input);
    this.curr = this.lexer.nextToken();
  }

  private eat(type: TokenType): Token {
    const tok = this.curr;
    if (tok.type !== type) {
      throw new Error(`Error de sintaxis: se esperaba ${type}, se obtuvo ${tok.type}`);
    }
    this.curr = this.lexer.nextToken();
    return tok;
  }

  parse(): ASTNode {
    const node = this.expr();
    if (this.curr.type !== "EOF") {
      throw new Error("Tokens inesperados al final de la expresión");
    }
    return node;
  }

  // expr = term (("+" | "-") term)*
  private expr(): ASTNode {
    let node = this.term();
    while (this.curr.type === "PLUS" || this.curr.type === "MINUS") {
      const op = this.curr.type === "PLUS" ? "+" : "-";
      this.eat(this.curr.type);
      node = { type: "Binary", op, left: node, right: this.term() };
    }
    return node;
  }

  // term = unary (("*" | "/") unary)*
  private term(): ASTNode {
    let node = this.unary();
    while (this.curr.type === "MUL" || this.curr.type === "DIV") {
      const op = this.curr.type === "MUL" ? "*" : "/";
      this.eat(this.curr.type);
      node = { type: "Binary", op, left: node, right: this.unary() };
    }
    return node;
  }

  // unary = ("+" | "-") unary | power
  private unary(): ASTNode {
    if (this.curr.type === "PLUS") {
      this.eat("PLUS");
      return this.unary();
    }
    if (this.curr.type === "MINUS") {
      this.eat("MINUS");
      return { type: "Unary", op: "-", expr: this.unary() };
    }
    return this.power();
  }

  // power = primary ("^" unary)? (right-associative)
  private power(): ASTNode {
    const node = this.primary();
    if (this.curr.type === "POW") {
      this.eat("POW");
      return { type: "Binary", op: "^", left: node, right: this.unary() };
    }
    return node;
  }

  // primary = NUMBER | IDENT ("(" args ")")? | "(" expr ")"
  private primary(): ASTNode {
    const tok = this.curr;
    if (tok.type === "NUMBER") {
      this.eat("NUMBER");
      return { type: "Num", val: Number(tok.value) };
    }
    if (tok.type === "IDENT") {
      const name = String(tok.value);
      this.eat("IDENT");
      if ((this.curr as Token).type === "LPAREN") {
        this.eat("LPAREN");
        const args: ASTNode[] = [];
        if ((this.curr as Token).type !== "RPAREN") {
          args.push(this.expr());
          while ((this.curr as Token).type === "COMMA") {
            this.eat("COMMA");
            args.push(this.expr());
          }
        }
        this.eat("RPAREN");
        return { type: "Call", name, args };
      }
      return { type: "Var", name };
    }
    if (tok.type === "LPAREN") {
      this.eat("LPAREN");
      const node = this.expr();
      this.eat("RPAREN");
      return node;
    }
    throw new Error(`Expresión matemática inválida cerca de '${tok.type}'`);
  }
}

/** Variables y funciones que una fórmula de gráfica puede usar. */
const ALLOWED_VARS = new Set(["x", "pi", "e"]);
const ALLOWED_FUNCS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "cbrt", "abs", "ln", "log", "exp", "min", "max"]);

/** Revisa la fórmula antes de evaluarla: un nombre desconocido es un error visible, no una gráfica vacía. */
function checkNames(n: ASTNode): void {
  switch (n.type) {
    case "Var":
      if (!ALLOWED_VARS.has(n.name.toLowerCase())) throw new Error(`Variable desconocida: ${n.name}`);
      return;
    case "Call":
      if (!ALLOWED_FUNCS.has(n.name.toLowerCase())) throw new Error(`Función matemática no permitida: ${n.name}`);
      n.args.forEach(checkNames);
      return;
    case "Unary":
      checkNames(n.expr);
      return;
    case "Binary":
      checkNames(n.left);
      checkNames(n.right);
      return;
  }
}

export function compileMathExpr(exprStr: string): (ctx: Record<string, number>) => number {
  const ast = new Parser(exprStr).parse();
  checkNames(ast);

  return function evaluate(ctx: Record<string, number>): number {
    function evalNode(n: ASTNode): number {
      switch (n.type) {
        case "Num":
          return n.val;
        case "Var": {
          const lower = n.name.toLowerCase();
          if (Object.prototype.hasOwnProperty.call(ctx, lower)) return ctx[lower];
          if (lower === "pi") return Math.PI;
          if (lower === "e") return Math.E;
          throw new Error(`Variable desconocida: ${n.name}`);
        }
        case "Unary":
          if (n.op === "-") return -evalNode(n.expr);
          return evalNode(n.expr);
        case "Binary": {
          const l = evalNode(n.left);
          const r = evalNode(n.right);
          switch (n.op) {
            case "+": return l + r;
            case "-": return l - r;
            case "*": return l * r;
            case "/": return l / r;
            case "^": return Math.pow(l, r);
            default: throw new Error(`Operador desconocido: ${n.op}`);
          }
        }
        case "Call": {
          const fnName = n.name.toLowerCase();
          const args = n.args.map(evalNode);
          switch (fnName) {
            case "sin": return Math.sin(args[0]);
            case "cos": return Math.cos(args[0]);
            case "tan": return Math.tan(args[0]);
            case "asin": return Math.asin(args[0]);
            case "acos": return Math.acos(args[0]);
            case "atan": return Math.atan(args[0]);
            case "sqrt": return Math.sqrt(args[0]);
            case "cbrt": return Math.cbrt(args[0]);
            case "abs": return Math.abs(args[0]);
            case "ln": return Math.log(args[0]);
            case "log": return Math.log10(args[0]);
            case "exp": return Math.exp(args[0]);
            case "min": return Math.min(...args);
            case "max": return Math.max(...args);
            default: throw new Error(`Función matemática no permitida: ${fnName}`);
          }
        }
      }
    }
    return evalNode(ast);
  };
}

/* =========================================================================
   Chart Spec & Observable Plot Builder
   ========================================================================= */

export interface ChartPoint {
  x: number;
  y?: number;
  label?: string;
  dy?: number;
  dx?: number;
  anchor?: "start" | "middle" | "end";
  dot?: boolean;
}

export interface ChartSeries {
  fn?: string;
  data?: Array<[number, number] | { x: number; y: number }>;
  color?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  /** Nombre de la serie para quien lee el bloque; no se dibuja (las lecciones lo usan como nota). */
  label?: string;
}

export interface ChartSpec {
  title?: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  domain?: [number, number];
  yDomain?: [number, number];
  fn?: string; // Función principal simple
  series?: ChartSeries[];
  points?: ChartPoint[];
  shaded?: {
    fromX?: number;
    toX?: number;
    color?: string;
    opacity?: number;
  };
  grid?: boolean;
  rules?: boolean;
  axes?: boolean;
  width?: number;
  height?: number;
}

let linkedomDoc: any = null;
function getDOMDocument(): Document {
  if (typeof document !== "undefined") {
    return document;
  }
  if (typeof window !== "undefined" && window.document) {
    return window.document;
  }
  if (!linkedomDoc) {
    try {
      const req = (globalThis as any).require;
      if (typeof req === "function") {
        const { parseHTML } = req("linkedom");
        linkedomDoc = parseHTML("<!doctype html><html><body></body></html>").document;
      }
    } catch {
      // linkedom might not be available
    }
  }
  return linkedomDoc;
}

let currentDocStyle: DocStyle = {
  fontId: "charter",
  fontSizePt: 9.5,
  lineHeight: 1.4,
  bgColor: "#ffffff",
  textColor: "#232a3a",
  thBg: "#16213e",
  thText: "#ffffff"
};

/** Dominio X que usa el motor cuando la gráfica no declara uno. */
export const DEFAULT_X_DOMAIN: [number, number] = [-5, 5];

/** Tamaño en px de las etiquetas de punto para un documento de `fontSizePt`. */
function labelFontPx(fontSizePt: number): number {
  return Math.max(9, Math.round(((fontSizePt * 4) / 3) * 0.9));
}

/** dy de una etiqueta sin dy propio: queda entera por encima del círculo, sin tocarlo. */
export function defaultLabelDy(fontSizePt: number): number {
  return -Math.round(labelFontPx(fontSizePt) / 2 + 9);
}

/** Textos aproximados de las marcas del eje Y (mismo paso 1-2-5 que d3), para medir el margen. */
function yTickLabels(min: number, max: number, count: number): string[] {
  const span = max - min;
  if (!(span > 0)) return [min.toLocaleString("en-US")];
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  const step = (err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.SQRT2 ? 2 : 1) * pow;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const labels: string[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    labels.push(Number(v.toFixed(decimals)).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  }
  return labels.length > 0 ? labels : [min.toLocaleString("en-US")];
}

export function setPlotDocStyle(style: DocStyle): void {
  currentDocStyle = style;
}

export function renderChartSvg(spec: ChartSpec, style?: DocStyle, customDoc?: Document): string {
  const activeStyle = style || currentDocStyle;
  const doc = customDoc || getDOMDocument();
  const font = fontById(activeStyle.fontId);
  const fontStack = font ? font.stack : 'system-ui, -apple-system, sans-serif';
  const strokeColor = activeStyle.thBg || "#16213E";
  const textColor = activeStyle.textColor || "#232A3A";
  const dotBlue = "#7CB3E8";
  const gold = "#EFC15E";

  const width = spec.width || 600;
  const height = spec.height || 360;
  const domain = spec.domain || DEFAULT_X_DOMAIN;
  const grid = spec.grid !== false;
  // Los ejes heredan el tamaño del documento (pt → px). Plot reserva margen para 10px:
  // con letra mayor, el título del eje X caía sobre los números.
  const axisPx = (activeStyle.fontSizePt * 4) / 3;
  const labelPx = labelFontPx(activeStyle.fontSizePt);
  const marginBottom = Math.round(axisPx * 3) + 4;

  const marks: any[] = [];

  // Recopilar funciones y series a dibujar
  const allSeries: ChartSeries[] = [];
  if (spec.fn) {
    allSeries.push({ fn: spec.fn, color: strokeColor });
  }
  if (spec.series && Array.isArray(spec.series)) {
    allSeries.push(...spec.series);
  }

  // Muestrear funciones: cada serie queda como lista de puntos; NaN marca un corte de la línea
  const SAMPLES = 250;
  const step = (domain[1] - domain[0]) / SAMPLES;
  const sampled: Array<{ s: ChartSeries; pts: Array<{ x: number; y: number }> }> = [];

  for (const s of allSeries) {
    let pts: Array<{ x: number; y: number }> = [];
    if (s.fn) {
      const evalFn = compileMathExpr(s.fn);
      for (let i = 0; i <= SAMPLES; i++) {
        const x = domain[0] + i * step;
        const y = evalFn({ x });
        const prev = pts[pts.length - 1];
        // Asíntota (1/x, tan x): entre dos muestras de signo contrario, una curva continua pasa por
        // valores intermedios; un polo da en el medio un valor mayor que ambos o ninguno. Ahí se corta.
        if (prev && Number.isFinite(prev.y) && Number.isFinite(y) && Math.sign(prev.y) * Math.sign(y) < 0) {
          const mid = evalFn({ x: (prev.x + x) / 2 });
          if (!Number.isFinite(mid) || Math.abs(mid) > Math.max(Math.abs(prev.y), Math.abs(y))) {
            pts.push({ x: (prev.x + x) / 2, y: NaN });
          }
        }
        // División por cero o fuera de dominio (1/0, sqrt(-1)): corte, no un salto unido
        pts.push({ x, y: Number.isFinite(y) ? y : NaN });
      }
    } else if (s.data && Array.isArray(s.data)) {
      pts = s.data.map((d: any) => (Array.isArray(d) ? { x: d[0], y: d[1] } : d));
    }
    if (pts.some((p) => Number.isFinite(p.y))) sampled.push({ s, pts });
  }

  // Recorte al marco solo cuando algo cae fuera del rango declarado: el resto de gráficas no cambia
  const outsideFrame = (p: { x: number; y: number }) =>
    p.x < Math.min(domain[0], domain[1]) ||
    p.x > Math.max(domain[0], domain[1]) ||
    (spec.yDomain !== undefined && (p.y < Math.min(...spec.yDomain) || p.y > Math.max(...spec.yDomain)));

  for (const { s, pts } of sampled) {
    const clip = pts.some((p) => Number.isFinite(p.y) && outsideFrame(p));
    // Región sombreada si aplica
    if (spec.shaded && (spec.shaded.fromX !== undefined || spec.shaded.toX !== undefined)) {
      const fromX = spec.shaded.fromX ?? domain[0];
      const toX = spec.shaded.toX ?? domain[1];
      const shadedPts = pts.filter((p) => p.x >= fromX && p.x <= toX);
      if (shadedPts.some((p) => Number.isFinite(p.y))) {
        marks.push(
          Plot.areaY(shadedPts, {
            x: "x",
            y: "y",
            fill: spec.shaded.color || dotBlue,
            fillOpacity: spec.shaded.opacity ?? 0.25,
            ...(clip ? { clip: true } : {})
          })
        );
      }
    }

    marks.push(
      Plot.line(pts, {
        x: "x",
        y: "y",
        stroke: s.color || strokeColor,
        strokeWidth: s.strokeWidth || 2.2,
        strokeDasharray: s.strokeDasharray,
        ...(clip ? { clip: true } : {})
      })
    );
  }

  // Puntos anotados (máximos, mínimos, extremos)
  const computedPoints: Array<{ x: number; y: number; label: string; dy: number; dx: number; anchor: "start" | "middle" | "end"; dot?: boolean }> = [];
  if (spec.points && Array.isArray(spec.points)) {
    // Un punto sin "y" se calcula sobre la curva principal o, si no hay, sobre la primera serie con fórmula
    const curveFn = spec.fn ?? spec.series?.find((s) => s.fn)?.fn;
    const curve = curveFn ? compileMathExpr(curveFn) : null;

    const defaultDy = defaultLabelDy(activeStyle.fontSizePt);
    for (const p of spec.points) {
      let yVal = p.y;
      if (yVal === undefined) {
        if (!curve) throw new Error(`El punto en x = ${p.x} necesita "y": la gráfica no tiene una fórmula donde calcularlo.`);
        yVal = curve({ x: p.x });
        if (!Number.isFinite(yVal)) throw new Error(`El punto en x = ${p.x} no tiene valor en la curva.`);
      }
      computedPoints.push({
        x: p.x,
        y: yVal,
        label: p.label || "",
        dy: p.dy ?? defaultDy,
        dx: p.dx ?? 0,
        anchor: p.anchor ?? "middle",
        dot: p.dot
      });
    }

    // Puntos (círculos) — solo para puntos donde dot !== false
    const dotsOnly = computedPoints.filter((p) => p.dot !== false);
    if (dotsOnly.length > 0) {
      marks.push(
        Plot.dot(dotsOnly, {
          x: "x",
          y: "y",
          r: 4.5,
          fill: dotBlue,
          stroke: strokeColor,
          strokeWidth: 1.5,
          ...(dotsOnly.some(outsideFrame) ? { clip: true } : {})
        })
      );
    }

    // Etiquetas de texto: Plot solo acepta dx, dy y textAnchor como constantes de la capa
    // (una función se descarta en silencio), así que cada etiqueta va en su propia capa.
    for (const p of computedPoints) {
      if (!p.label) continue;
      marks.push(
        Plot.text([p], {
          x: "x",
          y: "y",
          text: "label",
          dx: p.dx,
          dy: p.dy,
          textAnchor: p.anchor,
          fill: textColor,
          stroke: activeStyle.bgColor || "#ffffff",
          strokeWidth: 3,
          fontSize: labelPx,
          fontFamily: fontStack,
          fontWeight: "bold"
        })
      );
    }
  }

  // Regla y = 0 y x = 0 (ejes cartesianos)
  if (spec.rules !== false) {
    marks.push(Plot.ruleX([0], { stroke: "#CBD5E1", strokeWidth: 1 }));
    marks.push(Plot.ruleY([0], { stroke: "#CBD5E1", strokeWidth: 1 }));
  }

  // Margen izquierdo según el número más largo del eje Y: con los 40 px de Plot, "100,000" se
  // cortaba. Solo se ensancha cuando hace falta, así las gráficas que ya cabían no cambian.
  let marginLeft: number | undefined;
  if (spec.axes !== false) {
    const ys = (spec.yDomain ?? [...sampled.flatMap(({ pts }) => pts.map((p) => p.y)), ...computedPoints.map((p) => p.y)]).filter(Number.isFinite);
    if (ys.length > 0) {
      const count = Math.max(1, Math.floor((height - 20 - marginBottom) / 35));
      const longest = Math.max(...yTickLabels(Math.min(...ys), Math.max(...ys), count).map((t) => t.length));
      const needed = Math.ceil(longest * axisPx * 0.6 + 15);
      if (needed > 40) marginLeft = needed;
    }
  }

  const plotOptions: any = {
    document: doc,
    width,
    height,
    grid,
    ...(spec.axes === false ? {} : { marginBottom }),
    ...(marginLeft !== undefined ? { marginLeft } : {}),
    style: {
      background: "transparent",
      fontFamily: fontStack,
      fontSize: `${activeStyle.fontSizePt}pt`,
      color: textColor
    },
    x: {
      label: spec.xLabel || (spec.axes === false ? null : "x"),
      domain: domain,
      labelOffset: marginBottom - 4,
      axis: spec.axes === false ? null : undefined
    },
    y: {
      label: spec.yLabel || (spec.axes === false ? null : "y"),
      domain: spec.yDomain,
      axis: spec.axes === false ? null : undefined
    },
    marks
  };

  if (spec.title) {
    plotOptions.title = spec.title;
  }
  if (spec.subtitle) {
    plotOptions.subtitle = spec.subtitle;
  }

  const plotElem = Plot.plot(plotOptions);
  let svgString = plotElem.outerHTML || "";

  // Asegurar responsividad vectorial (viewBox limpio)
  if (!svgString.includes("viewBox")) {
    svgString = svgString.replace(/<svg\b([^>]*)>/, `<svg viewBox="0 0 ${width} ${height}" $1>`);
  }

  // Evitar anidamiento redundante si Plot.plot ya produjo un <figure> (por título/subtítulo)
  if (svgString.startsWith("<figure")) {
    return svgString.replace(/^<figure\b[^>]*>/, '<figure class="sb-chart">');
  }

  return `<figure class="sb-chart">${svgString}</figure>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================================
   Marked Extension para ```plot
   ========================================================================= */

export const plotBlockExtension: MarkedExtension = {
  extensions: [
    {
      ...plotFenceTokenizer,
      renderer(token) {
        try {
          const spec: ChartSpec = JSON.parse(token.text);
          return renderChartSvg(spec, currentDocStyle);
        } catch (err: any) {
          const msg = escapeHtml(err instanceof Error ? err.message : String(err));
          return `<div style="border: 2px dashed #C0392B; padding: 0.8rem; margin: 1rem 0; background: #FFF5F5; color: #8A615A; font-family: monospace; font-size: 9pt; border-radius: 6px;">
<strong>⚠️ Error en bloque de gráfica (\`\`\`plot):</strong><br>
${msg}
</div>`;
        }
      }
    }
  ]
};
