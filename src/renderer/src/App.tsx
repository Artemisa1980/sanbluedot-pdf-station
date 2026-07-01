import { useEffect, useState } from "react";
import { useStation } from "./state/store";

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem("station-theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("station-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export default function App() {
  const { dark, toggle } = useTheme();
  const { project } = useStation();
  const sourceCount = project.pdfs.length + project.docs.length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header
        className="flex h-[52px] shrink-0 items-center justify-between border-b px-5"
        style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
      >
        <div className="flex items-baseline gap-3">
          <span className="brand text-[15px]">
            sanblue<sup>dot</sup>
          </span>
          <span className="section-label">retro PDF station</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Botón temporal de smoke test — se elimina en la Task 4 */}
          <button
            className="btn-ghost"
            onClick={async () => {
              const b64 = await window.station.htmlToPdf(
                `<h1 style="color:#16213E;font-family:Georgia,serif">hola station</h1>
                 <p style="font-family:Georgia,serif">Texto de prueba vectorial — si puedes seleccionarme en Preview, el motor funciona.</p>`,
                { pageSize: "letter", margins: "compact", pageNumbers: true }
              );
              await window.station.exportPdfDialog("test-station.pdf", b64);
            }}
          >
            TEST PDF
          </button>
          <button className="btn-ghost" onClick={toggle} title="Cambiar tema">
            {dark ? "◑ oscuro" : "◐ claro"}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <aside
          className="w-[290px] shrink-0 border-r p-4"
          style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
        >
          <div className="section-label mb-3">Fuentes</div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {sourceCount === 1 ? "1 fuente" : `${sourceCount} fuentes`}
          </p>
        </aside>

        <section className="min-w-0 flex-1 p-4">
          <div className="section-label mb-3">Organizador</div>
        </section>

        <aside
          className="w-[300px] shrink-0 border-l p-4"
          style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
        >
          <div className="section-label mb-3">Estética</div>
        </aside>
      </main>
    </div>
  );
}
