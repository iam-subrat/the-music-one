import {
  useState,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((message) => {
    setMsg(message);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: `translateX(-50%) translateY(${visible ? 0 : 80}px)`,
          opacity: visible ? 1 : 0,
          background: "#2a2a3a",
          border: "1px solid var(--border)",
          color: "var(--text)",
          padding: "10px 20px",
          borderRadius: 99,
          fontSize: "0.85rem",
          transition: "transform 0.3s ease, opacity 0.3s ease",
          pointerEvents: "none",
          zIndex: 999,
        }}
      >
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
