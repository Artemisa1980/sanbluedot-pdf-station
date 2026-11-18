import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { parseHTML } from "linkedom";

const viteSuffixes = {
  name: "vite-suffixes",
  setup(b) {
    b.onResolve({ filter: /\?(raw|inline)$/ }, (a) => {
      const bare = a.path.replace(/\?(raw|inline)$/, "");
      const file = bare.startsWith(".") ? path.resolve(a.resolveDir, bare) : path.resolve("node_modules", bare);
      return { path: file, namespace: a.path.endsWith("?raw") ? "raw" : "inline" };
    });
    b.onLoad({ filter: /.*/, namespace: "raw" }, async (a) => ({ contents: await readFile(a.path, "utf8"), loader: "text" }));
    b.onLoad({ filter: /.*/, namespace: "inline" }, async (a) => ({
      contents: `export default "data:font/woff2;base64,${(await readFile(a.path)).toString("base64")}"`,
      loader: "js"
    }));
    b.onResolve({ filter: /\/thumbnails$/ }, () => ({ path: "thumbnails", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const evictSource = () => {};", loader: "js" }));
  }
};

let chart;
let compile;
let workDir;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "pdf-station-chart-"));
  const bundle = async (entry, name) => {
    const out = path.join(workDir, name);
    await build({
      entryPoints: [path.resolve(entry)],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: out,
      logLevel: "silent",
      plugins: [viteSuffixes],
      external: ["linkedom"]
    });
    return import(pathToFileURL(out).href);
  };
  chart = await bundle("src/renderer/src/engine/chart.ts", "chart.mjs");
  compile = await bundle("src/renderer/src/engine/compile.ts", "compile.mjs");
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;

const defaultStyle = {
  fontId: "charter",
  fontSizePt: 9.5,
  lineHeight: 1.4,
  bgColor: "#ffffff",
  textColor: "#232a3a",
  thBg: "#16213e",
  thText: "#ffffff"
};

test("compileMathExpr safely evaluates arithmetic, power, variables and math functions", () => {
  const f1 = chart.compileMathExpr("2 * x + 5");
  assert.equal(f1({ x: 3 }), 11);

  const f2 = chart.compileMathExpr("x^2 - 4*x + 4");
  assert.equal(f2({ x: 2 }), 0);
  assert.equal(f2({ x: 0 }), 4);

  const f3 = chart.compileMathExpr("sin(pi / 2) + cos(0)");
  assert.equal(Math.round(f3({})), 2);

  const f4 = chart.compileMathExpr("sqrt(16) + abs(-5)");
  assert.equal(f4({}), 9);
});

test("compileMathExpr blocks unknown variables or arbitrary code execution", () => {
  assert.throws(() => chart.compileMathExpr("window.alert(1)")({ x: 1 }));
  assert.throws(() => chart.compileMathExpr("eval('1+1')")({ x: 1 }));
  assert.throws(() => chart.compileMathExpr("y + 2")({ x: 1 }));
});

test("renderChartSvg produces clean vector SVG with title, paths, dots and labels", () => {
  const spec = {
    title: "Curva de Prueba",
    domain: [-2, 2],
    fn: "x^3 - 3*x",
    points: [
      { x: -1, label: "Máximo local" },
      { x: 1, label: "Mínimo local" }
    ]
  };

  const html = chart.renderChartSvg(spec, defaultStyle, document);
  assert.match(html, /<figure class="sb-chart">/);
  assert.match(html, /<svg\b[^>]*viewBox=/);
  assert.match(html, /Curva de Prueba/);
  assert.match(html, /Máximo local/);
  assert.match(html, /Mínimo local/);
  assert.doesNotMatch(html, /<foreignObject>/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderChartSvg inherits font and colors from DocStyle", () => {
  const customStyle = {
    fontId: "lora",
    fontSizePt: 12,
    lineHeight: 1.5,
    bgColor: "#e9eedf",
    textColor: "#1f3326",
    thBg: "#3e5a45",
    thText: "#f1f4ea"
  };

  const spec = {
    domain: [0, 5],
    fn: "2*x"
  };

  const html = chart.renderChartSvg(spec, customStyle, document);
  assert.match(html, /Lora/);
  assert.match(html, /#1f3326/i);
});

test("compileDocHtml parses ```plot block into rendered SVG", () => {
  const doc = {
    id: "d1",
    name: "test.md",
    kind: "md",
    content: "# Gráfica\n\n```plot\n{\n  \"domain\": [-2, 2],\n  \"fn\": \"x^2\"\n}\n```",
    preset: "sanbluedot",
    compiledB64: null
  };
  const html = compile.buildDocHtml(doc);
  assert.match(html, /<figure class="sb-chart">/);
  assert.match(html, /<svg\b/);
});

test("compileMathExpr respects unary minus precedence over power (-x^2)", () => {
  const f = chart.compileMathExpr("-x^2");
  assert.equal(f({ x: 3 }), -9); // -(3^2) = -9, NOT (-3)^2 = 9

  const fParens = chart.compileMathExpr("(-x)^2");
  assert.equal(fParens({ x: 3 }), 9);
});

test("compileMathExpr blocks Object.prototype pollution and leaks", () => {
  assert.throws(() => chart.compileMathExpr("toString + 1")({ x: 1 }), /Variable desconocida/);
  assert.throws(() => chart.compileMathExpr("constructor * 2")({ x: 1 }), /Variable desconocida/);
  assert.throws(() => chart.compileMathExpr("valueOf")({ x: 1 }), /Variable desconocida/);
});

test("compileDocHtml supports CRLF line breaks in ```plot blocks", () => {
  const crlfContent = "# Windows CRLF\r\n\r\n```plot\r\n{\r\n  \"domain\": [0, 4],\r\n  \"fn\": \"2*x\"\r\n}\r\n```\r\n";
  const doc = {
    id: "d2",
    name: "windows.md",
    kind: "md",
    content: crlfContent,
    preset: "sanbluedot",
    compiledB64: null
  };
  const html = compile.buildDocHtml(doc);
  assert.match(html, /<figure class="sb-chart">/);
  assert.match(html, /<svg\b/);
});

test("plotBlockExtension escapes HTML in syntax error fallback box", () => {
  const badDoc = {
    id: "d3",
    name: "bad.md",
    kind: "md",
    content: "```plot\n{ \"invalid\": <img src=x onerror=alert(1)> }\n```",
    preset: "sanbluedot",
    compiledB64: null
  };
  const html = compile.buildDocHtml(badDoc);
  assert.match(html, /⚠️ Error en bloque de gráfica/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test("each point label carries its own dx, dy and anchor, and never sits on its dot", () => {
  const html = chart.renderChartSvg(
    {
      fn: "12 - x^2",
      domain: [-3.5, 3.5],
      yDomain: [0, 13],
      points: [
        { x: 0, y: 12, label: "Vertex" },
        { x: 2, y: 8, label: "Right", dx: 40, dy: -6, anchor: "start" },
        { x: -2, y: 8, label: "Left", dx: -40, dy: 16, anchor: "end" }
      ]
    },
    defaultStyle,
    document
  );
  // A function passed as dx/dy/textAnchor is dropped by Plot and leaks into the markup
  assert.doesNotMatch(html, /=>/);
  const layer = (label) => {
    const m = new RegExp(`<g[^>]*aria-label="text"[^>]*>(?:(?!</g>)[\\s\\S])*${label}`).exec(html);
    assert.ok(m, `label layer for ${label}`);
    return m[0];
  };
  assert.match(layer("Right"), /translate\(40,-6\)/);
  assert.match(layer("Right"), /text-anchor="start"/);
  assert.match(layer("Left"), /translate\(-40,16\)/);
  assert.match(layer("Left"), /text-anchor="end"/);
  // No dy given: the label is lifted clear of the 4.5px dot
  const lift = /translate\(0,(-\d+)\)/.exec(layer("Vertex"));
  assert.ok(lift && Number(lift[1]) <= -12, "default label offset clears the dot");
  assert.equal(Number(lift[1]), chart.defaultLabelDy(defaultStyle.fontSizePt));
});

test("the x-axis title sits below the tick numbers at the document font size", () => {
  const html = chart.renderChartSvg({ fn: "x", domain: [0, 6], xLabel: "Admissible Domain x" }, defaultStyle, document);
  const num = (re) => {
    const m = re.exec(html);
    assert.ok(m, String(re));
    return m.slice(1).map(Number);
  };
  const [tickShift] = num(/<g[^>]*transform="translate\(0,([\d.]+)\)"[^>]*aria-label="x-axis tick label"|aria-label="x-axis tick label"[^>]*transform="translate\(0,([\d.]+)\)"/).filter((n) => !Number.isNaN(n));
  const [tickY] = num(/aria-label="x-axis tick label"[^>]*><text[^>]*transform="translate\([\d.]+,([\d.]+)\)"/);
  const g = /<g[^>]*aria-label="x-axis label"[^>]*>/.exec(html)[0];
  const labelShift = Number(/translate\([-\d.]+,([-\d.]+)\)/.exec(g)[1]);
  const [labelY] = num(/aria-label="x-axis label"[^>]*><text[^>]*transform="translate\([\d.]+,([\d.]+)\)"/);
  const fontPx = (defaultStyle.fontSizePt * 4) / 3;
  const tickBottom = tickY + tickShift + fontPx; // tick text hangs below its anchor (y="0.71em")
  const titleTop = labelY + labelShift - fontPx; // the title's baseline minus one line
  assert.ok(titleTop >= tickBottom - 1, `title top ${titleTop} must clear tick bottom ${tickBottom}`);
});

const lineSegments = (html) => {
  const m = /aria-label="line"[\s\S]*?<path[^>]* d="([^"]+)"/.exec(html);
  assert.ok(m, "line path");
  return (m[1].match(/M/g) || []).length;
};

test("log is base 10 and ln the natural logarithm", () => {
  assert.equal(chart.compileMathExpr("log(100)")({}), 2);
  assert.equal(chart.compileMathExpr("ln(e)")({}), 1);
});

test("an unknown name or a malformed number shows the error box instead of an empty chart", () => {
  assert.throws(() => chart.compileMathExpr("2*z"), /Variable desconocida: z/);
  assert.throws(() => chart.compileMathExpr("foo(x)"), /Función matemática no permitida: foo/);
  assert.throws(() => chart.compileMathExpr("1.2.3*x"), /Número inválido/);
  const box = chart.plotBlockExtension.extensions[0].renderer({ text: '{"fn": "2*z"}' });
  assert.match(box, /Error en bloque de gráfica/);
  assert.match(box, /Variable desconocida: z/);
});

test("a curve beyond yDomain is clipped to the frame; a curve inside it gets no clip", () => {
  assert.match(chart.renderChartSvg({ fn: "x^2", domain: [-5, 5], yDomain: [0, 10] }, defaultStyle, document), /clip-path/);
  assert.doesNotMatch(chart.renderChartSvg({ fn: "x^2", domain: [-3, 3], yDomain: [0, 10] }, defaultStyle, document), /clip-path/);
  assert.doesNotMatch(chart.renderChartSvg({ fn: "x^2" }, defaultStyle, document), /clip-path/);
});

test("an asymptote breaks the line; a steep or oscillating continuous curve stays whole", () => {
  assert.equal(lineSegments(chart.renderChartSvg({ fn: "1/x" }, defaultStyle, document)), 2);
  assert.equal(lineSegments(chart.renderChartSvg({ fn: "tan(x)", domain: [-3, 3] }, defaultStyle, document)), 3);
  assert.equal(lineSegments(chart.renderChartSvg({ fn: "100*x", yDomain: [-1, 1] }, defaultStyle, document)), 1);
  assert.equal(lineSegments(chart.renderChartSvg({ fn: "x^3 - 3*x", domain: [-2, 2] }, defaultStyle, document)), 1);
  assert.equal(lineSegments(chart.renderChartSvg({ fn: "sin(x)", domain: [-10, 10] }, defaultStyle, document)), 1);
});

test("shaded opacity 0 stays 0", () => {
  const html = chart.renderChartSvg({ fn: "x", shaded: { fromX: 0, toX: 2, opacity: 0 } }, defaultStyle, document);
  assert.match(html, /fill-opacity="0"/);
});

test("a point without y sits on the main curve or the first series formula; otherwise it is an error", () => {
  const html = chart.renderChartSvg({ series: [{ fn: "x^2" }], points: [{ x: 2, label: "P" }] }, defaultStyle, document);
  const onCurve = chart.renderChartSvg({ series: [{ fn: "x^2" }], points: [{ x: 2, y: 4, label: "P" }] }, defaultStyle, document);
  assert.equal(html, onCurve);
  assert.throws(() => chart.renderChartSvg({ series: [{ data: [[0, 0], [1, 1]] }], points: [{ x: 1 }] }, defaultStyle, document), /necesita "y"/);
  assert.throws(() => chart.renderChartSvg({ fn: "sqrt(x)", points: [{ x: -1 }] }, defaultStyle, document), /no tiene valor en la curva/);
});

test("long Y tick labels widen the left margin; labels that fit keep Plot's 40 px", () => {
  const axisX = (spec) => {
    const html = chart.renderChartSvg(spec, defaultStyle, document);
    return Number(/aria-label="y-axis tick label">\s*<text[^>]*transform="translate\(([\d.]+),/.exec(html)[1]);
  };
  assert.ok(axisX({ fn: "20000*x" }) > 70, "−100,000 needs more than 40 px");
  assert.equal(axisX({ fn: "x^2" }), 40);
  assert.equal(axisX({ fn: "x", yDomain: [0, 125] }), 40);
});

test("a series label is kept in the block but not drawn", () => {
  const labelled = chart.renderChartSvg({ series: [{ fn: "x", label: "Recta" }] }, defaultStyle, document);
  assert.doesNotMatch(labelled, /Recta/);
  assert.equal(labelled, chart.renderChartSvg({ series: [{ fn: "x" }] }, defaultStyle, document));
});
