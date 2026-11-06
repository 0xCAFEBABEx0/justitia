// The light/dark switch in the header: daisyUI's theme controller (a checkbox whose value is the
// dark theme) shown as a swap of the sun and moon icons.
//
// The choice is kept in localStorage and set as data-theme on <html> by an inline script in the
// layout's <head>, so it holds on every page without a flash. Until the switch is used, the page
// follows the OS setting, and the switch follows it too.

export const THEME_KEY = "justitia:theme";

const prefersDark = matchMedia("(prefers-color-scheme: dark)");

function current(): "light" | "dark" {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return prefersDark.matches ? "dark" : "light";
}

export function initThemeSwitch(input: HTMLInputElement): void {
  input.checked = current() === "dark";
  input.addEventListener("change", () => {
    const theme = input.checked ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable: the choice lasts until the next page */
    }
  });
  prefersDark.addEventListener("change", () => {
    input.checked = current() === "dark";
  });
}
