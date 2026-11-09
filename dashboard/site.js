export function bindThemeToggle({ document, button, preferences }) {
  function setTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    button.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme",
    );
  }

  setTheme(preferences.read("isobar-theme", "light"));
  button.addEventListener("click", () => {
    const nextTheme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    preferences.save("isobar-theme", nextTheme);
  });
  return setTheme;
}
