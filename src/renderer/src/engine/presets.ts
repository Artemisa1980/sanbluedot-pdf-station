import type { DocStyle, SourceDoc } from "../../../shared/types";

export interface Preset {
  id: string;
  label: string;
  /** CSS extra del preset (detalles más allá del estilo granular: código, citas, filas pares…) */
  overrides: string;
  /** Punto de partida del estilo granular — el usuario lo afina campo a campo */
  base: DocStyle;
  /** Letras extra que usan los overrides (p. ej. títulos), de FONT_CHOICES: se incrustan al compilar */
  fontIds?: string[];
}

export const PRESETS: Preset[] = [
  {
    id: "sanbluedot",
    label: "sanblueᵈᵒᵗ retro dev-station",
    overrides: "",
    base: {
      fontId: "charter",
      fontSizePt: 9.5,
      lineHeight: 1.4,
      bgColor: "#ffffff",
      textColor: "#232a3a",
      thBg: "#16213e",
      thText: "#ffffff"
    }
  },
  {
    // v1.10: papel salvia más cálido, tinta verde bosque, cuerpo en Lora y títulos en Instrument Serif
    id: "sage",
    label: "Sage Orgánico",
    fontIds: ["instrument"],
    overrides: `:root{--navy:#2e4a33;--ink:#1f3326;--muted:#5d6e57;--rule:#c9d3b8;--code-bg:#dfe7d2;--inline-bg:#dbe4cd;--gold:#8a9a5b}
h1,h2,h3{font-family:"Instrument Serif",Georgia,serif;font-weight:400;letter-spacing:0}
h1{font-size:22pt;border-bottom:2px solid #8a9a5b}
h2{font-size:15pt;font-style:italic;border-bottom:1px solid #c9d3b8}
h3{font-size:12.5pt}
strong{color:#2e4a33}
a{color:#3f6b4e;border-bottom-color:#8a9a5b}
blockquote{background:#e1e8d5;border-left:4px solid #9c7a4f;color:#33463a}
pre{border:1px solid #cdd8bd;border-left:4px solid #7e9a6a}
code{color:#2e4a33}
td{border-color:#c9d3b8}
tr:nth-child(even) td{background:#e2e9d6}
th{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:11.5pt;border-color:#3e5a45}
.masthead{border-bottom-color:#2e4a33}`,
    base: {
      fontId: "lora",
      fontSizePt: 9.5,
      lineHeight: 1.45,
      bgColor: "#e9eedf",
      textColor: "#1f3326",
      thBg: "#3e5a45",
      thText: "#f1f4ea"
    }
  },
  {
    // Papel de mecanografía, tinta de cinta negra con acentos de cinta roja
    id: "maquina",
    label: "Máquina de Escribir",
    overrides: `:root{--navy:#262119;--ink:#262119;--muted:#7a6e58;--rule:#cdbf9f;--code-bg:#ece2cb;--inline-bg:#e9dec4;--gold:#a8322a}
h1{text-transform:uppercase;letter-spacing:.06em;border-bottom:4px double #262119}
h2{border-bottom:1px dashed #cdbf9f}
h2::before{content:"§ ";color:#a8322a}
h3{color:#a8322a}
a{color:#a8322a;border-bottom-color:#a8322a}
blockquote{background:transparent;border-left:2px dashed #a8322a;color:#4a4233;font-style:italic}
pre{border:1px dashed #b9aa88;border-left:3px solid #a8322a;border-radius:0}
code{color:#262119}
td{border-color:#cdbf9f}
tr:nth-child(even) td{background:#eee5cf}
.masthead{border-bottom:2px solid #262119}`,
    base: {
      fontId: "plexmono",
      fontSizePt: 9,
      lineHeight: 1.55,
      bgColor: "#f3ebd8",
      textColor: "#262119",
      thBg: "#262119",
      thText: "#f3ebd8"
    }
  },
  {
    // Pantalla de fósforo ámbar: fondo carbón cálido, todo en Fira y títulos con cursor de terminal
    id: "ambar",
    label: "Terminal Ámbar",
    overrides: `:root{--navy:#ffb547;--ink:#e8d3a9;--muted:#a08b66;--rule:#3a3024;--code-bg:#201a13;--inline-bg:#2a2218;--gold:#ffb547}
h1,h2,h3,h4{color:#ffb547}
h1{border-bottom:2px solid #ffb547}
h1::after{content:" ▌";color:#ffb547}
h2{border-bottom:1px solid #3a3024}
h2::before{content:"> ";color:#7cb3e8}
strong{color:#ffc864}
a{color:#ffcf7a;border-bottom-color:#a06a1e}
blockquote{background:#1f1a13;border-left:4px solid #c98a2b;color:#d9c49a}
pre{border:1px solid #3a3024;border-left:4px solid #ffb547}
code{color:#ffcf7a}
td{border-color:#3a3024}
tr:nth-child(even) td{background:#1e1912}
.brand{color:#ffb547}
.masthead{border-bottom-color:#ffb547}`,
    base: {
      fontId: "fira",
      fontSizePt: 9,
      lineHeight: 1.5,
      bgColor: "#17130e",
      textColor: "#e8d3a9",
      thBg: "#ffb547",
      thText: "#17130e"
    }
  },
  {
    id: "crema",
    label: "Crema Retro 80s",
    overrides: "",
    base: {
      fontId: "charter",
      fontSizePt: 9.5,
      lineHeight: 1.4,
      bgColor: "#fbf9f3",
      textColor: "#2d3530",
      thBg: "#16213e",
      thText: "#ffffff"
    }
  },
  {
    id: "noche",
    label: "Noche Navy",
    overrides: `h1,h2,h3,h4,strong{color:#efc15e}
h1{border-bottom-color:#efc15e}
.brand{color:#efc15e}
code{color:#dde5df;background:rgba(124,179,232,.15)}
pre{background:rgba(124,179,232,.08);border-color:rgba(124,179,232,.25)}
blockquote{background:rgba(124,179,232,.06);color:#b8c4bb}
tr:nth-child(even) td{background:rgba(124,179,232,.06)}
td,th{border-color:rgba(124,179,232,.25)}`,
    base: {
      fontId: "charter",
      fontSizePt: 9.5,
      lineHeight: 1.4,
      bgColor: "#16213e",
      textColor: "#dde5df",
      thBg: "#efc15e",
      thText: "#16213e"
    }
  }
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** Estilo efectivo del doc: su style guardado, o la base de su preset (docs v1.0 viejos). */
export function resolveStyle(doc: Pick<SourceDoc, "preset" | "style">): DocStyle {
  return doc.style ?? presetById(doc.preset).base;
}
