# Changelog

Earlier versions are described in the [GitHub Releases](https://github.com/Artemisa1980/sanbluedot-pdf-station/releases).

## 1.10.0 — unreleased

### Added

- Formulas: `$…$` inline and `$$` blocks render as MathML with KaTeX at compile time.
  Money such as `$200` stays text and `\$` prints a dollar sign.
- Base styles **Máquina de Escribir** and **Terminal Ámbar**; **Sage Orgánico** redesigned
  with a warmer paper, forest-green ink, Lora body text and Instrument Serif headings.
- Twelve background swatches for imported PDF pages; the custom picker opens on the
  current color and the panel shows its hex code.
- **Teñir la hoja**: for PDFs that paint their own opaque white sheet (Google Docs,
  letterheads), the page color is drawn above the page with the Multiply blend mode, so
  the white takes the color and black text stays black. Thumbnails show the same tint,
  and the panel warns when a dark color would hide the text.
- Full Fira Code 6.2 (SIL OFL 1.1) bundled for the Fira typeface and every code block.

### Fixed

- Editing a document and exporting without ⚡ Compilar exported the previous text. Each
  document now records what its compiled PDF was made from; the text recompiles
  automatically and export waits for it. If an update fails, export stays paused with a
  message instead of using the previous PDF.
- A project saved during the update pause kept the new text with the previous PDF. Stale
  documents now recompile when the project opens; projects saved by earlier versions
  recompile their documents once.
- Opening a copy of the open project (same document ids) started a spurious update, and
  a late result could land in the other project.
- A PDF that the preview engine could not read left the page picker on «Leyendo el PDF…»
  and stayed cached as failed; the picker now closes with a message and the next attempt
  reloads it.
- A compilation that hangs now stops after two minutes with a message.
- Error messages from the main process no longer start with Electron's English
  «Error invoking remote method…» prefix.
- Box diagrams in code blocks mixed two fonts; letters, lines, arrows and symbols now
  share Fira Code.
- Item 10 and above of a numbered list was clipped.
- Page numbers printed in Times instead of a monospace font.
- A patch containing a character outside WinAnsi (`→ ✓ ≥`, emoji) made the whole export
  fail with an English error. The patch editor now names those characters, and the
  export reports them in Spanish.
- Long patch text ran outside the patch in the PDF; it now wraps and clips like the
  patch editor preview.
- Pages with their own `/Rotate` lost that rotation, and their patches moved, when they
  had a background or patches.
- PDFs protected with a permissions password imported fine and then failed at export;
  they are now rejected at import with a message. Damaged PDFs too.
- A compilation that finished after its document was deleted, or after Nuevo/Abrir,
  added hidden pages, and the saved project could not be reopened.
- Exports with many pages from one source grew by duplicating shared fonts and images.
- The CropBox was ignored on pages with a background or patches.
- A blank page without content stopped the export when it had a background or patch.
- Size fields accepted 0 or negative values; projects saved that way now open with the
  sizes repaired.
- A new notification could be closed early by the previous one's timer.
- A recovery-draft write in progress could survive a save and ask to restore later.
- Corrupt entries in My Styles are ignored instead of reaching a document.
- Thumbnails of pages turned 90° were cropped at the sides.

### Changed

- Electron 43.1.0 → 43.7.7 (security fixes). The same documents exported with both
  versions render identically.
- `esbuild` is declared as a development dependency (the tests use it), and
  `engines` requires Node 22.18 or newer for development.
- The packaged app's content-security policy no longer allows localhost connections
  (only the development server needs them); browser permission requests and
  `<webview>` are denied in every window.
- Formulas are documented as a Markdown feature; HTML documents keep dollar signs as
  written. Link annotations of pages with a background, tint or patch are documented
  as not carried into the export.
