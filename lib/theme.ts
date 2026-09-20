export type Theme = "light" | "dark";

const listeners = new Set<() => void>();
let preference: Theme | null = null;
let media: MediaQueryList | null = null;

function readPreference(): Theme | null {
  try {
    const value = window.localStorage.getItem("theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function publish(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  listeners.forEach((listener) => listener());
}

function followSystem() {
  if (!preference) publish(media?.matches ? "dark" : "light");
}

function followStorage(event: StorageEvent) {
  if (event.key !== "theme" && event.key !== null) return;
  preference = readPreference();
  publish(preference ?? (media?.matches ? "dark" : "light"));
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    preference = readPreference();
    media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", followSystem);
    window.addEventListener("storage", followStorage);
    publish(preference ?? (media.matches ? "dark" : "light"));
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      media?.removeEventListener("change", followSystem);
      window.removeEventListener("storage", followStorage);
      media = null;
    }
  };
}

export function toggleTheme(): void {
  preference = getTheme() === "dark" ? "light" : "dark";
  try {
    window.localStorage.setItem("theme", preference);
  } catch {
    // A manual selection still applies for this page when storage is blocked.
  }
  publish(preference);
}
