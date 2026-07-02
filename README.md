# sanblueᵈᵒᵗ pdf-station

**retro pdf-station** — la estación PDF personal de Sandy E. Quintero.
App de escritorio (Mac + Windows) para armar, editar y exportar documentos PDF
**sin rasterizar jamás**: todo lo que sale de aquí es vectorial, nítido como Adobe.

## Qué hace

- **Importar PDFs** y elegir hoja por hoja cuáles entran al documento (las páginas
  ajenas son *láminas*: se copian intactas con `copyPages`, nunca se re-renderizan).
- **Escribir documentos propios** en Markdown o HTML con presets de estilo
  (sanbluedot · sage · crema · noche) y compilarlos a PDF vectorial vía Chromium.
- **Organizar**: arrastrar, rotar, duplicar, eliminar páginas; vista en cuadrícula
  o vista individual estilo Adobe (doble clic sobre una página).
- **Estética por página**: color de fondo (capa debajo del contenido, el original
  no se toca) y **parches** (rectángulos de color con texto opcional encima).
- **Exportar** todo a un solo PDF vectorial.
- **Guardar el proyecto** completo como `.sbstation` (Cmd+S / Cmd+O) y retomarlo después.

La firma sanblueᵈᵒᵗ vive **dentro del contenido** de cada documento (masthead +
footer en el propio MD/HTML) — la app no la inyecta.

### Limitación conocida (v1)

Si un PDF importado trae rotación interna (`/Rotate` en la página) **y además** se le
aplica fondo o parche, la capa incrustada puede no respetar esa rotación (comportamiento
de `embedPdf` en pdf-lib). El camino puro (sin fondo/parches) no tiene este problema.
Solución si aparece: quitar el fondo de esa página o rotarla desde el organizador.

## Principios (framework.md en la carpeta padre)

1. Nunca rasterizar. 2. El contenido propio es editable para siempre.
3. Los PDFs ajenos son láminas. 4. Cero distorsión. 5. Offline y local — nada sale de la máquina.

## Desarrollo

```bash
npm install
npm run dev        # electron-vite dev --watch (recarga sola)
npm run lint       # tsc --noEmit (web + node) — no hay suite de tests
```

## Empaquetar

```bash
npm run dist:mac   # → release/sanblueᵈᵒᵗ pdf-station-1.0.0-arm64.dmg
npm run dist:win   # → release/ instalador NSIS (correr en Windows)
```

La app no está firmada por Apple (uso personal): la primera vez, **clic derecho →
Abrir**, o Ajustes del Sistema → Privacidad y seguridad → "Abrir igualmente".

## Stack

Electron + electron-vite · React 19 + TypeScript · Tailwind 4 ·
pdf-lib (motor vectorial) · pdfjs-dist (solo miniaturas de pantalla) ·
marked (MD→HTML) · @fontsource Fira Code / Outfit / Instrument Serif (offline).

## Estructura

```
src/main/       ventana, IPC, htmlToPdf (printToPDF vectorial)
src/preload/    puente contextBridge (window.station)
src/renderer/   UI React — components/ engine/ state/
src/shared/     tipos del modelo + base64
```

---
© Sandy E. Quintero — sanblueᵈᵒᵗ · retro dev-station
