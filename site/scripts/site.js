const root = document.documentElement;
const themeToggle = document.querySelector(".theme-toggle");

function setTheme(theme) {
  root.dataset.theme = theme;
  const isDark = theme === "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    isDark ? "#1a1e2c" : "#dde6f3",
  );
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

const heroVideo = document.querySelector("[data-hero-video]");
const heroVideoStage = document.querySelector("[data-hero-video-stage]");
const videoToggle = document.querySelector("[data-video-toggle]");
const videoReplay = document.querySelector("[data-video-replay]");
const videoFullscreen = document.querySelector("[data-video-fullscreen]");

function updateVideoState() {
  if (!heroVideo || !heroVideoStage || !videoToggle) return;
  const isPaused = heroVideo.paused;
  heroVideoStage.dataset.videoPaused = String(isPaused);
  videoToggle.setAttribute(
    "aria-label",
    isPaused ? "Play demo video" : "Pause demo video",
  );
  videoToggle.title = isPaused ? "Play demo video" : "Pause demo video";
}

function setVideoControlsEnabled(enabled) {
  for (const control of [videoToggle, videoReplay, videoFullscreen]) {
    if (control) control.disabled = !enabled;
  }
}

if (heroVideo && heroVideoStage) {
  const showVideo = () => {
    heroVideoStage.dataset.videoReady = "true";
    setVideoControlsEnabled(true);
    updateVideoState();
    heroVideo.play().catch(() => updateVideoState());
  };

  heroVideo.addEventListener("canplay", showVideo, { once: true });
  heroVideo.addEventListener("play", updateVideoState);
  heroVideo.addEventListener("pause", updateVideoState);
  heroVideo.querySelector("source")?.addEventListener("error", () => {
    heroVideoStage.dataset.videoReady = "false";
    setVideoControlsEnabled(false);
  });

  videoToggle?.addEventListener("click", () => {
    if (heroVideo.paused) {
      heroVideo.play().catch(() => updateVideoState());
    } else {
      heroVideo.pause();
    }
  });

  videoReplay?.addEventListener("click", () => {
    heroVideo.currentTime = 0;
    heroVideo.play().catch(() => updateVideoState());
  });

  videoFullscreen?.addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      heroVideoStage.requestFullscreen?.();
    }
  });
}
