# sanblueᵈᵒᵗ pdf-station

**retro pdf-station** — a personal desktop PDF studio, built by Sandy E. Quintero.
Cross-platform app (Mac + Windows, single codebase) to compose, style and export PDF
documents that are **never rasterized**: everything that leaves this station is true
vector output, razor-sharp at any zoom — Adobe-grade selectable text.

> The UI is in Spanish by design (it is a personal working tool); the codebase,
> this README and the releases are in English.

## What it does

- **Import PDFs** and pick page-by-page which sheets enter the master document.
  Imported pages are treated as *plates*: copied intact with `copyPages`, never
  re-rendered, never reflowed — the #1 way editors damage documents.
- **Write your own content** in Markdown or HTML. Own content is compiled to vector
  PDF through Chromium's print engine and **stays editable forever** — you edit the
  source and recompile, never the output.
- **Live styling per document**: base presets (sanbluedot · sage · cream · night) plus
  granular control — 12 curated embedded typefaces, size, line height, text/paper
  colors, table headers. Changing a style **recompiles the document automatically in
  any view**, so the master document and the export can never drift out of sync.
- **Full-bleed colored paper**: dark/colored sheets are painted edge to edge with an
  automatic vector layer (Chromium never paints page margins — the station does).
- **Organize**: drag & drop, rotate, duplicate, delete; grid view or an Adobe-style
  continuous reader with a synced thumbnail rail and lazy rendering (smooth at 100+ pages).
- **Per-page aesthetics on imported PDFs**: background color layers and **patches**
  (colored rectangles with optional text) — the original content is never rewritten.
- **Insert images** with one click: the editor generates the correctly encoded
  absolute `file://` URL for you (relative paths don't survive compilation).
- **Export** the whole master document to a single vector PDF — or convert just the
  current MD/HTML document straight to PDF from the editor (quick-convert).
- **Project files**: save everything as `.sbstation` (Cmd+S / Cmd+O) and resume later.
- **Work protection**: dirty-state tracking, unsaved-changes guards on open/close,
  and debounced editor sync — nothing lives only in a text box.

The sanblueᵈᵒᵗ signature lives **inside each document's content** (masthead + footer
in the MD/HTML itself) — the app never injects it.

### Known limitation

If an imported PDF page carries internal rotation (`/Rotate`) **and** you apply a
background or patch to it, the embedded layer may not honor that rotation
(`embedPdf` behavior in pdf-lib). The pure path (no background/patches) is unaffected.
Workaround: remove the background on that page, or rotate it from the organizer.

## Principles (the project's law — see `framework.md`)

1. **Never rasterize.** 2. **Own content stays editable forever.**
3. **Foreign PDFs are plates** — organized, layered, never rewritten.
4. **Zero distortion** — mixed page sizes coexist untouched. 5. **Offline & local** — nothing leaves the machine.

## Development

```bash
npm install
npm run dev        # electron-vite dev --watch (hot reload)
npm run lint       # tsc --noEmit (web + node) — verification is typecheck + running the app
```

## Packaging

```bash
npm run dist:mac   # → release/sanblueᵈᵒᵗ pdf-station-<version>-arm64.dmg
npm run dist:win   # → release/ NSIS installer (run on Windows)
```

The app is not Apple-signed (personal use): on first launch, **right-click → Open**,
or System Settings → Privacy & Security → "Open Anyway".

## Stack

Electron + electron-vite · React 19 + TypeScript · Tailwind 4 ·
pdf-lib (vector engine) · pdfjs-dist (on-screen thumbnails only) ·
marked (MD→HTML) · 12 embedded @fontsource typefaces — serif (Charter*, Instrument
Serif, Lora, Merriweather, IBM Plex Serif, Georgia*), sans (Outfit, Space Grotesk,
Inter, Helvetica*), mono (Fira Code, IBM Plex Mono) — all offline, embedded as real
vector glyphs in the PDF. (*system fonts)

## Structure

```
src/main/       window, IPC, htmlToPdf (vector printToPDF)
src/preload/    contextBridge bridge (window.station)
src/renderer/   React UI — components/ engine/ state/
src/shared/     data model types + base64
```

## License

[MIT](LICENSE) — the code is free to use. The **sanblueᵈᵒᵗ** name, wordmark and brand
identity are not covered by the license.

---
© 2026 Sandy E. Quintero — sanblueᵈᵒᵗ · retro dev-station
