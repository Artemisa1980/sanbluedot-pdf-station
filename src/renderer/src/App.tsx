import { useEffect, useState } from "react";
import { DocEditor } from "./components/DocEditor";
import { Inspector } from "./components/Inspector";
import { Organizer } from "./components/Organizer";
import { Sidebar } from "./components/Sidebar";

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
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);

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
          <button
            className="btn-ghost"
            style={showLeft ? { borderColor: "var(--accent)" } : undefined}
            onClick={() => setShowLeft((v) => !v)}
            title="Mostrar/ocultar FUENTES"
          >
            ◧
          </button>
          <button
            className="btn-ghost"
            style={showRight ? { borderColor: "var(--accent)" } : undefined}
            onClick={() => setShowRight((v) => !v)}
            title="Mostrar/ocultar ESTÉTICA"
          >
            ◨
          </button>
          <button className="btn-ghost" onClick={toggle} title="Cambiar tema">
            {dark ? "◑ oscuro" : "◐ claro"}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {showLeft && <Sidebar onOpenDoc={setEditingDocId} />}

        {editingDocId ? (
          <DocEditor docId={editingDocId} onClose={() => setEditingDocId(null)} />
        ) : (
          <Organizer />
        )}

        {showRight && !editingDocId && <Inspector />}
      </main>
    </div>
  );
}
