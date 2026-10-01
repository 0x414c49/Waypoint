import { useEffect, useState } from "react";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";

type Theme = "light" | "dark";

function preferredTheme(): Theme {
  const stored = localStorage.getItem("journey-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(preferredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("journey-theme", theme);
  }, [theme]);

  const next = theme === "light" ? "dark" : "light";

  return (
    <Button
      aria-label={`Use ${next} appearance`}
      onClick={() => setTheme(next)}
      type="button"
      variant="ghost"
    >
      <Icon name={theme === "light" ? "moon" : "sun"} />
    </Button>
  );
}
