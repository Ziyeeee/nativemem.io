const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function updateProgress() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  const width = max > 0 ? (doc.scrollTop / max) * 100 : 0;
  $("#progress").style.width = `${width}%`;
}

function setupNav() {
  const links = $$(".nav a[href^='#']");
  const sections = links
    .map((link) => $(link.getAttribute("href")))
    .filter(Boolean);

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`);
    });
  }, {
    rootMargin: "-20% 0px -65% 0px",
    threshold: [0.05, 0.2, 0.5]
  });

  sections.forEach((section) => observer.observe(section));
}

function setupTabs() {
  $$("[data-tabs]").forEach((group) => {
    const tabs = $$("[data-tab]", group);
    const panels = $$("[data-panel]", group);
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        tabs.forEach((item) => item.classList.toggle("active", item === tab));
        panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === target));
      });
    });
  });
}

function setupCopyButtons() {
  $$("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = $(button.dataset.copy);
      if (!target) return;

      const original = button.textContent;
      const text = target.innerText.trim();
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "fixed";
          textarea.style.top = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy failed";
      }
      window.setTimeout(() => {
        button.textContent = original;
      }, 1200);
    });
  });
}

function setupMethodSync() {
  const section = $("#method");
  if (!section) return;

  const video = $(".method-video video", section);
  const grid = $(".method-grid", section);
  const steps = $$("[data-method-stage]", section);
  if (!video || !grid || steps.length === 0) return;

  let deploymentTimer = null;

  const clearDeploymentTimer = () => {
    if (!deploymentTimer) return;
    window.clearTimeout(deploymentTimer);
    deploymentTimer = null;
  };

  const setActiveStage = (stage) => {
    grid.classList.add("is-synced");
    steps.forEach((step) => {
      step.classList.toggle("is-active", step.dataset.methodStage === stage);
    });
  };

  const resetStages = () => {
    clearDeploymentTimer();
    grid.classList.remove("is-synced");
    steps.forEach((step) => step.classList.remove("is-active"));
  };

  const syncFromTime = () => {
    if (video.ended) return;
    clearDeploymentTimer();
    setActiveStage(video.currentTime < 12 ? "stage1" : "stage2");
  };

  video.addEventListener("play", syncFromTime);
  video.addEventListener("timeupdate", syncFromTime);
  video.addEventListener("seeked", syncFromTime);
  video.addEventListener("ended", () => {
    clearDeploymentTimer();
    setActiveStage("deployment");
    deploymentTimer = window.setTimeout(resetStages, 5000);
  });
}

function setupResultChartTooltips() {
  $$(".grouped-bars").forEach((chart) => {
    if ($(".axis-labels", chart)) return;

    const axis = document.createElement("span");
    axis.className = "axis-labels";
    axis.setAttribute("aria-hidden", "true");
    axis.innerHTML = "<i>20%</i><i>40%</i><i>60%</i><i>80%</i><i>100%</i>";
    chart.prepend(axis);
  });

  $$(".grouped-bars span").forEach((bar) => {
    if (bar.classList.contains("axis-labels")) return;

    const value = $("b", bar)?.textContent.trim();
    const method = $("em", bar)?.textContent.trim();
    if (!value || !method) return;

    const tooltip = `${method}: ${value}%`;
    bar.dataset.tooltip = tooltip;
    bar.setAttribute("aria-label", tooltip);
    bar.setAttribute("tabindex", "0");
  });
}

function setupResultChartToggles() {
  $$("[data-results-collapse]").forEach((card) => {
    const button = $(".chart-toggle", card);
    if (!button) return;

    button.addEventListener("click", () => {
      const expanded = card.classList.toggle("is-expanded");
      const group = card.closest(".results-charts");
      if (group) {
        group.classList.toggle("has-expanded", Boolean($(".results-chart-card.is-expanded", group)));
      }
      button.setAttribute("aria-expanded", String(expanded));
      button.textContent = expanded ? "Hide tasks" : "Show tasks";
    });
  });
}

window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress);
window.addEventListener("DOMContentLoaded", () => {
  updateProgress();
  setupNav();
  setupTabs();
  setupCopyButtons();
  setupMethodSync();
  setupResultChartTooltips();
  setupResultChartToggles();
});
