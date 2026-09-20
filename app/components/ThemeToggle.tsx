"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getTheme, subscribeTheme, toggleTheme } from "../../lib/theme";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => null);

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "切換至淺色模式" : "切換至深色模式"}
      title={theme === "dark" ? "切換至淺色模式" : "切換至深色模式"}
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}
    </button>
  );
}
