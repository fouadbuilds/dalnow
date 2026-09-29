const root = document.documentElement;
const themeToggle = document.querySelector(".theme-toggle");
const toast = document.querySelector(".toast");
let toastTimeout;

function setTheme(theme) {
  root.dataset.theme = theme;
  const isDark = theme === "dark";
  themeToggle?.setAttribute("aria-pressed", String(isDark));
  themeToggle?.setAttribute(
    "aria-label",
    `Switch to ${isDark ? "light" : "dark"} mode`,
  );
  localStorage.setItem("dalnow-site-theme", theme);
}

const savedTheme = localStorage.getItem("dalnow-site-theme");
if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);

themeToggle?.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

for (const link of document.querySelectorAll("[data-placeholder-link]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    if (!toast) return;
    toast.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.hidden = true;
    }, 3600);
  });
}

for (const range of document.querySelectorAll("[data-reminder-range]")) {
  const label = range.closest(".reminder-control");
  const output = label?.querySelector("output");
  const notificationOutput = document.querySelector("[data-reminder-output]");
  const update = () => {
    const days = Number(range.value);
    const labelText = days === 0 ? "Morning of" : `${days} day${days === 1 ? "" : "s"} before`;
    if (output) output.textContent = labelText;
    if (range.getAttribute("aria-label")?.startsWith("Assignments") && notificationOutput) {
      notificationOutput.textContent = days === 0 ? "this morning" : `${days} day${days === 1 ? "" : "s"}`;
    }
  };
  range.addEventListener("input", update);
  update();
}
