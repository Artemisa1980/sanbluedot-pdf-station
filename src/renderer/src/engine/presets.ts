import type { DocStyle, SourceDoc } from "../../../shared/types";

export interface Preset {
  id: string;
  label: string;
  /** CSS extra del preset (detalles más allá del estilo granular: código, citas, filas pares…) */
  overrides: string;
  /** Punto de partida del estilo granular — el usuario lo afina campo a campo */
  base: DocStyle;
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
    id: "sage",
    label: "Sage Orgánico",
    overrides: `body{font-family:"Instrument Serif",Georgia,serif}`,
    base: {
      fontId: "instrument",
      fontSizePt: 9.5,
      lineHeight: 1.4,
      bgColor: "#e4ebe6",
      textColor: "#384c3c",
      thBg: "#acb4a3",
      thText: "#16213e"
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
