import { useEffect } from "react";

export function useBodyClass(className: string | null) {
  useEffect(() => {
    if (!className) {
      return undefined;
    }
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }, [className]);
}
