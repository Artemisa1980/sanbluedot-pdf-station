export interface Preset {
  id: string;
  label: string;
  /** CSS que se inyecta DESPUÉS de sanbluedot-pdf.css — solo pisa colores/fuente del papel */
  overrides: string;
}

export const PRESETS: Preset[] = [
  {
    id: "sanbluedot",
    label: "sanblueᵈᵒᵗ retro dev-station",
    overrides: ""
  },
  {
    id: "sage",
    label: "Sage Orgánico",
    overrides: `body{background:#e4ebe6;color:#384c3c;font-family:"Instrument Serif",Georgia,serif}`
  },
  {
    id: "crema",
    label: "Crema Retro 80s",
    overrides: `body{background:#fbf9f3;color:#2d3530}`
  },
  {
    id: "noche",
    label: "Noche Navy",
    overrides: `body{background:#16213e;color:#dde5df}
h1,h2,h3,h4,strong{color:#efc15e}
h1{border-bottom-color:#efc15e}
.brand{color:#efc15e}
code{color:#dde5df;background:rgba(124,179,232,.15)}
pre{background:rgba(124,179,232,.08);border-color:rgba(124,179,232,.25)}
blockquote{background:rgba(124,179,232,.06);color:#b8c4bb}
th{background:#efc15e;color:#16213e}
tr:nth-child(even) td{background:rgba(124,179,232,.06)}
td,th{border-color:rgba(124,179,232,.25)}`
  }
];
