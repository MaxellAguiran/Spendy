document.documentElement.classList.add("js");


function setupNavigation() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const navigation = toggle && document.getElementById(toggle.getAttribute("aria-controls"));
  if (!toggle || !navigation) return;

  const setOpen = (open, returnFocus = false) => {
    toggle.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
    if (!open && returnFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false, true);
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) setOpen(false);
  });
}


async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy command was rejected");
}


function setupCopyEmail() {
  document.querySelectorAll("[data-copy-email]").forEach((button) => {
    const statusId = button.getAttribute("aria-describedby");
    const status = statusId ? document.getElementById(statusId) : null;
    button.addEventListener("click", async () => {
      try {
        await copyText(button.dataset.copyEmail);
        if (status) status.textContent = "Email copied to clipboard.";
      } catch {
        if (status) status.textContent = "Copy failed. Select the email link instead.";
      }
    });
  });
}


function setupReadingProgress() {
  const indicator = document.querySelector("[data-reading-progress]");
  const article = document.querySelector(".article-body");
  if (!indicator || !article) return;
  let scheduled = false;
  const update = () => {
    const articleTop = article.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(1, article.offsetHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, (window.scrollY - articleTop) / distance));
    indicator.value = progress * 100;
    scheduled = false;
  };
  window.addEventListener("scroll", () => {
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(update);
    }
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
}


function setupDisclosures() {
  document.querySelectorAll("details[data-disclosure]").forEach((details) => {
    const summary = details.querySelector("summary");
    if (!summary) return;
    summary.setAttribute("aria-expanded", String(details.open));
    details.addEventListener("toggle", () => {
      summary.setAttribute("aria-expanded", String(details.open));
    });
  });
}


setupNavigation();
setupCopyEmail();
setupReadingProgress();
setupDisclosures();
