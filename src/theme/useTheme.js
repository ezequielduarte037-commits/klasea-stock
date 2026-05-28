import { useEffect, useState } from "react";

const STORAGE_KEY = "klasea-theme";
const VALID = new Set(["dark", "light", "hc"]);

function readInitial() {
  if (typeof window === "undefined") return "dark";
  try {
    const t = window.localStorage?.getItem(STORAGE_KEY);
    return VALID.has(t) ? t : "dark";
  } catch {
    return "dark";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(readInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage?.setItem(STORAGE_KEY, theme);
    } catch {
      // Persistencia opcional: el tema aplicado en DOM sigue funcionando.
    }
  }, [theme]);

  function setTheme(t) {
    setThemeState(VALID.has(t) ? t : "dark");
  }

  function cycleTheme() {
    setThemeState((t) => (t === "dark" ? "light" : t === "light" ? "hc" : "dark"));
  }

  return { theme, setTheme, cycleTheme };
}
