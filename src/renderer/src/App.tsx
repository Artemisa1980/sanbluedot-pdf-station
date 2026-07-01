import { useEffect, useState } from "react";
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
        <button className="btn-ghost" onClick={toggle} title="Cambiar tema">
          {dark ? "◑ oscuro" : "◐ claro"}
        </button>
      </header>

      <main className="flex min-h-0 flex-1">
        <Sidebar />

        <Organizer />

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
