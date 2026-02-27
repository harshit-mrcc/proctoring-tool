import { useRef, useState } from "react";

export function useToast() {
  const [message, setMessage] = useState("");
  const timerRef = useRef<number | null>(null);

  function show(text: string, durationMs = 3200) {
    setMessage(text);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setMessage(""), durationMs);
  }

  function clear() {
    setMessage("");
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  return { message, show, clear };
}
