import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

/**
 * Cuántos diálogos hay abiertos. Organizer (Supr / Cmd+A), los atajos de proyecto de App
 * y el Esc de la vista lectura lo leen para no actuar "por debajo" de un modal.
 */
interface ModalRegistry {
  open: boolean;
  register: () => () => void;
}

const ModalContext = createContext<ModalRegistry>({ open: false, register: () => () => {} });

export function ModalProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const register = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => Math.max(0, n - 1));
  }, []);
  const value = useMemo(() => ({ open: count > 0, register }), [count, register]);
  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

/** true mientras haya algún modal abierto. */
export function useModalOpen(): boolean {
  return useContext(ModalContext).open;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pila de modales abiertos: solo el de arriba atiende Escape y el atrapa-foco
const stack: symbol[] = [];

interface ModalProps {
  /** Nombre accesible (aria-label) — alternativa a `labelledBy` */
  label?: string;
  /** id del elemento que titula el diálogo */
  labelledBy?: string;
  onClose: () => void;
  overlayClassName?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  children: ReactNode;
}

/**
 * Cascarón único de los diálogos: role="dialog", aria-modal, foco inicial dentro,
 * Tab atrapado, Escape cierra y el foco vuelve a quien lo tenía al abrir.
 */
export function Modal({
  label,
  labelledBy,
  onClose,
  overlayClassName = "fixed inset-0 z-50 flex items-center justify-center p-8",
  panelClassName,
  panelStyle,
  children
}: ModalProps) {
  const { register } = useContext(ModalContext);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const downOnOverlay = useRef(false);

  useEffect(() => register(), [register]);

  useEffect(() => {
    const me = Symbol("modal");
    stack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stack.indexOf(me);
      if (i !== -1) stack.splice(i, 1);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  return createPortal(
    <div
      className={overlayClassName}
      style={{ background: "rgba(0,0,0,0.45)" }}
      // Solo cierra un click que empezó Y terminó en el fondo (arrastrar dentro y soltar fuera no)
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnOverlay.current && e.target === e.currentTarget) onClose();
        downOnOverlay.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={panelClassName}
        style={panelStyle}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
