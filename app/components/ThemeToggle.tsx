"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    });

    if (localStorage.getItem("theme")) {
      return () => window.cancelAnimationFrame(frame);
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = (event: MediaQueryListEvent) => {
      const next = event.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      setTheme(next);
    };
    media.addEventListener("change", followSystem);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", followSystem);
    };
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === "light" ? "切換至深色模式" : "切換至淺色模式"}
      title={theme === "light" ? "切換至深色模式" : "切換至淺色模式"}
    >
      {mounted && theme === "dark" ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}
    </button>
  );
}
