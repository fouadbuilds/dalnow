(() => {
  const ROOT_ID = "dalnow-universal-search-root";
  const MAX_RESULTS = 7;
  let host;
  let shadow;
  let previousFocus;
  let input;
  let results;
  let status;
  let currentResults = [];
  let selectedIndex = -1;
  let fuse;
  let courseOverrides = {};

  function createOverlay() {
    if (host) return;
    host = document.createElement("div");
    host.id = ROOT_ID;
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    const dmSansUrl = chrome.runtime.getURL("assets/DM-Sans-latin.woff2");
    style.textContent = `
      :host { all: initial; }
      @font-face { font-family: "DM Sans"; font-style: normal; font-weight: 400 700; font-display: swap; src: url("${dmSansUrl}") format("woff2"); }
      *, *::before, *::after { box-sizing: border-box; }
      .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; align-items: start; justify-items: center; padding: min(19vh, 11rem) 1rem 2rem; background: transparent; color: #1a2433; font-family: "DM Sans", Arial, sans-serif; font-synthesis: none; }
      .palette { width: min(45vw, 52rem); }
      .search-shell { display: flex; align-items: center; gap: .75rem; min-height: 4.25rem; padding: 0 1.35rem; border: 1px solid #1a1a1a; border-radius: 999px; background: #fff; box-shadow: 0 .75rem 2.25rem rgba(9, 20, 38, .14); }
      .search-shell.has-results { border-bottom: 0; border-radius: 2.125rem 2.125rem 0 0; }
      .search-icon { width: 1.45rem; height: 1.45rem; flex: none; fill: #d6d6d6; }
      input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #253041; font: inherit; font-size: 1.05rem; letter-spacing: -.01em; }
      input::placeholder { color: #d6d6d6; opacity: 1; }
      .results { overflow: hidden; max-height: min(28rem, 58vh); margin-top: 0; padding: .45rem; border: 1px solid #1a1a1a; border-top: 0; border-radius: 0 0 2.125rem 2.125rem; background: #fff; box-shadow: 0 .75rem 2.25rem rgba(9, 20, 38, .14); overflow-y: auto; scrollbar-width: none; }
      .results::-webkit-scrollbar { display: none; }
      .result { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; width: 100%; padding: .8rem .9rem; border: 0; border-radius: .9rem; background: transparent; color: inherit; cursor: pointer; font: inherit; text-align: left; }
      .result:hover, .result[data-selected="true"], .result:focus-visible { background: #e2e2e2; outline: 0; }
      .title { overflow: hidden; color: #1a2433; font-size: .93rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .course { overflow: hidden; max-width: 10ch; justify-self: end; color: #4b5565; font-size: .84rem; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
      .status { margin: .65rem 0 0; padding: .9rem; border: 1px solid rgba(217, 220, 226, .9); border-radius: 1.25rem; background: #fff; box-shadow: 0 1.25rem 3.5rem rgba(9, 20, 38, .16); color: #657187; font-size: .88rem; line-height: 1.4; text-align: center; }
      [hidden] { display: none !important; }
      @media (max-width: 48rem) { .palette { width: calc(100vw - 2rem); } }
      @media (max-width: 28rem) { .backdrop { padding-top: 4.5rem; } .search-shell { min-height: 3.8rem; padding: 0 1rem; } input { font-size: 1rem; } }
    `;
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeOverlay();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...shadow.querySelectorAll("input, button:not([disabled])")];
      const activeIndex = focusable.indexOf(shadow.activeElement);
      const nextIndex = event.shiftKey
        ? (activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1)
        : (activeIndex === focusable.length - 1 ? 0 : activeIndex + 1);
      event.preventDefault();
      focusable[nextIndex]?.focus();
    });
    const palette = document.createElement("section");
    palette.className = "palette";
    palette.setAttribute("role", "dialog");
    palette.setAttribute("aria-label", "DALnow universal search");
    palette.setAttribute("aria-modal", "true");
    palette.addEventListener("mousedown", (event) => event.stopPropagation());
    const shell = document.createElement("div");
    shell.className = "search-shell";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "search-icon");
    icon.setAttribute("viewBox", "0 0 256 256");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z");
    icon.append(path);
    input = document.createElement("input");
    input.type = "text";
    input.inputMode = "search";
    input.placeholder = "Search...";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Search Brightspace");
    input.setAttribute("aria-controls", "dalnow-search-results");
    input.addEventListener("input", renderSearch);
    input.addEventListener("keydown", handleKeydown);
    shell.append(input, icon);
    results = document.createElement("div");
    results.id = "dalnow-search-results";
    results.className = "results";
    results.setAttribute("role", "listbox");
    results.hidden = true;
    status = document.createElement("p");
    status.className = "status";
    status.hidden = true;
    palette.append(shell, results, status);
    backdrop.append(palette);
    shadow.append(style, backdrop);
    document.documentElement.append(host);
  }

  async function openOverlay() {
    if (host) {
      closeOverlay();
      return;
    }
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    createOverlay();
    input.focus();
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_SEARCH_INDEX" });
      const index = Array.isArray(response?.searchIndex) ? response.searchIndex : [];
      courseOverrides = response?.courseOverrides && typeof response.courseOverrides === "object"
        ? response.courseOverrides
        : {};
      fuse = new Fuse(index, {
        includeScore: true,
        threshold: 0.35,
        ignoreLocation: true,
        keys: [
          { name: "title", weight: 0.75 },
          { name: "courseName", weight: 0.17 },
          { name: "courseCode", weight: 0.08 },
        ],
      });
      if (!index.length) {
        status.textContent = response?.status === "preparing"
          ? "Your search index is being prepared. Try again in a moment."
          : "No searchable items are available yet.";
        status.hidden = false;
      }
    } catch {
      status.textContent = "Search is unavailable right now. Please try again.";
      status.hidden = false;
    }
  }

  function closeOverlay() {
    host?.remove();
    host = null;
    shadow = null;
    fuse = null;
    currentResults = [];
    selectedIndex = -1;
    courseOverrides = {};
    previousFocus?.focus?.();
    previousFocus = null;
  }

  function renderSearch() {
    const query = input.value.trim();
    currentResults = query && fuse ? fuse.search(query, { limit: MAX_RESULTS }).map((result) => result.item) : [];
    selectedIndex = currentResults.length ? 0 : -1;
    results.replaceChildren();
    results.hidden = !query || !currentResults.length;
    shadow.querySelector(".search-shell").classList.toggle("has-results", !results.hidden);
    status.hidden = true;
    if (!query) return;
    if (!currentResults.length) {
      status.textContent = "No matching Brightspace items.";
      status.hidden = false;
      return;
    }
    currentResults.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = "result";
      button.type = "button";
      button.dataset.selected = String(index === selectedIndex);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === selectedIndex));
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = item.title;
      const course = document.createElement("span");
      course.className = "course";
      course.textContent = courseDisplayName(item);
      course.title = course.textContent;
      button.append(title, course);
      button.addEventListener("click", () => openResult(item));
      results.append(button);
    });
  }

  function courseDisplayName(item) {
    const customName = courseOverrides[String(item.orgUnitId)]?.customName;
    return typeof customName === "string" && customName.trim()
      ? customName.trim()
      : item.courseName || item.courseCode || "Course";
  }

  function updateSelection(next) {
    selectedIndex = next;
    [...results.children].forEach((element, index) => {
      const selected = index === selectedIndex;
      element.dataset.selected = String(selected);
      element.setAttribute("aria-selected", String(selected));
      if (selected) element.scrollIntoView({ block: "nearest" });
    });
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
    } else if (event.key === "ArrowDown" && currentResults.length) {
      event.preventDefault();
      updateSelection((selectedIndex + 1) % currentResults.length);
    } else if (event.key === "ArrowUp" && currentResults.length) {
      event.preventDefault();
      updateSelection((selectedIndex - 1 + currentResults.length) % currentResults.length);
    } else if (event.key === "Enter" && currentResults[selectedIndex]) {
      event.preventDefault();
      openResult(currentResults[selectedIndex]);
    }
  }

  function openResult(item) {
    chrome.runtime.sendMessage({ type: "OPEN_SEARCH_RESULT", url: item.url }).catch(() => {});
    closeOverlay();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TOGGLE_UNIVERSAL_SEARCH") openOverlay();
  });
})();
