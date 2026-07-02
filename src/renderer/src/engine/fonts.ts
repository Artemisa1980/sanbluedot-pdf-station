/**
 * Tipografías disponibles para el cuerpo del documento.
 * Las de marca (@fontsource) se incrustan como data-URI en el HTML de compilación:
 * la ventana oculta de printToPDF no tiene el bundle del renderer, así que sin esto
 * caerían al fallback del sistema. Las de sistema (Charter, Georgia…) no necesitan embed.
 */
import instrumentSerif from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?inline";
import instrumentSerifItalic from "@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?inline";
import outfit400 from "@fontsource/outfit/files/outfit-latin-400-normal.woff2?inline";
import outfit600 from "@fontsource/outfit/files/outfit-latin-600-normal.woff2?inline";
import fira400 from "@fontsource/fira-code/files/fira-code-latin-400-normal.woff2?inline";
import fira700 from "@fontsource/fira-code/files/fira-code-latin-700-normal.woff2?inline";
import lora400 from "@fontsource/lora/files/lora-latin-400-normal.woff2?inline";
import lora400i from "@fontsource/lora/files/lora-latin-400-italic.woff2?inline";
import lora700 from "@fontsource/lora/files/lora-latin-700-normal.woff2?inline";
import merri400 from "@fontsource/merriweather/files/merriweather-latin-400-normal.woff2?inline";
import merri400i from "@fontsource/merriweather/files/merriweather-latin-400-italic.woff2?inline";
import merri700 from "@fontsource/merriweather/files/merriweather-latin-700-normal.woff2?inline";
import plexSerif400 from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff2?inline";
import plexSerif400i from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-italic.woff2?inline";
import plexSerif700 from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-700-normal.woff2?inline";
import grotesk400 from "@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2?inline";
import grotesk700 from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?inline";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?inline";
import inter400i from "@fontsource/inter/files/inter-latin-400-italic.woff2?inline";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff2?inline";
import plexMono400 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?inline";
import plexMono700 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2?inline";

export interface FontChoice {
  id: string;
  label: string;
  /** font-family CSS para el body */
  stack: string;
  /** @font-face a incrustar en el HTML compilado (solo fuentes de marca) */
  faces?: string;
}

function face(family: string, weight: number, style: string, dataUri: string): string {
  return `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};src:url(${dataUri}) format("woff2")}`;
}

export const FONT_CHOICES: FontChoice[] = [
  {
    id: "charter",
    label: "Charter (Serif académico)",
    stack: `"Charter","Bitstream Charter","Sitka Text",Georgia,"Times New Roman",serif`
  },
  {
    id: "instrument",
    label: "Instrument Serif (Serif elegante)",
    stack: `"Instrument Serif",Georgia,serif`,
    faces:
      face("Instrument Serif", 400, "normal", instrumentSerif) +
      face("Instrument Serif", 400, "italic", instrumentSerifItalic)
  },
  {
    id: "lora",
    label: "Lora (Serif editorial)",
    stack: `"Lora",Georgia,serif`,
    faces:
      face("Lora", 400, "normal", lora400) +
      face("Lora", 400, "italic", lora400i) +
      face("Lora", 700, "normal", lora700)
  },
  {
    id: "merriweather",
    label: "Merriweather (Serif lectura)",
    stack: `"Merriweather",Georgia,serif`,
    faces:
      face("Merriweather", 400, "normal", merri400) +
      face("Merriweather", 400, "italic", merri400i) +
      face("Merriweather", 700, "normal", merri700)
  },
  {
    id: "plexserif",
    label: "IBM Plex Serif (Serif técnica)",
    stack: `"IBM Plex Serif",Georgia,serif`,
    faces:
      face("IBM Plex Serif", 400, "normal", plexSerif400) +
      face("IBM Plex Serif", 400, "italic", plexSerif400i) +
      face("IBM Plex Serif", 700, "normal", plexSerif700)
  },
  { id: "georgia", label: "Georgia (Serif clásica)", stack: `Georgia,"Times New Roman",serif` },
  {
    id: "outfit",
    label: "Outfit (Sans moderna)",
    stack: `"Outfit",-apple-system,"Segoe UI",Roboto,sans-serif`,
    faces: face("Outfit", 400, "normal", outfit400) + face("Outfit", 600, "normal", outfit600)
  },
  {
    id: "grotesk",
    label: "Space Grotesk (Sans retro-tech)",
    stack: `"Space Grotesk",-apple-system,"Segoe UI",sans-serif`,
    faces: face("Space Grotesk", 400, "normal", grotesk400) + face("Space Grotesk", 700, "normal", grotesk700)
  },
  {
    id: "inter",
    label: "Inter (Sans neutra)",
    stack: `"Inter",-apple-system,"Segoe UI",Roboto,sans-serif`,
    faces:
      face("Inter", 400, "normal", inter400) +
      face("Inter", 400, "italic", inter400i) +
      face("Inter", 700, "normal", inter700)
  },
  { id: "helvetica", label: "Helvetica (Sans clásica)", stack: `"Helvetica Neue",Helvetica,Arial,sans-serif` },
  {
    id: "fira",
    label: "Fira Code (Mono terminal)",
    stack: `"Fira Code",Menlo,Consolas,monospace`,
    faces: face("Fira Code", 400, "normal", fira400) + face("Fira Code", 700, "normal", fira700)
  },
  {
    id: "plexmono",
    label: "IBM Plex Mono (Mono retro)",
    stack: `"IBM Plex Mono",Menlo,Consolas,monospace`,
    faces: face("IBM Plex Mono", 400, "normal", plexMono400) + face("IBM Plex Mono", 700, "normal", plexMono700)
  }
];

export function fontById(id: string): FontChoice {
  return FONT_CHOICES.find((f) => f.id === id) ?? FONT_CHOICES[0];
}
