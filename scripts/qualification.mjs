import { trackSpendyEvent } from "./analytics.mjs";

export const FORM_ENDPOINT_PLACEHOLDER = "https://formspree.io/f/REPLACE_WITH_FORM_ID";

const requiredFields = [
  "email",
  "agency",
  "website",
  "monthly_spend_band",
  "shopify_status",
  "ad_count_band",
  "privacy_acknowledged",
];

function clean(value) {
  return String(value ?? "").trim();
}

function cleanPlatforms(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(clean).filter(Boolean).join(", ");
}

export function createFitCheckPayload(fields) {
  const payload = {};
  for (const field of requiredFields) {
    const value = clean(fields[field]);
    if (value) payload[field] = value;
  }

  const platforms = cleanPlatforms(fields.platforms);
  if (platforms) payload.platforms = platforms;

  const decisionNeeded = clean(fields.decision_needed);
  if (decisionNeeded) payload.decision_needed = decisionNeeded;
  return payload;
}

export function hasConfiguredFormEndpoint(endpoint) {
  try {
    const url = new URL(clean(endpoint));
    return url.protocol === "https:" && url.hostname === "formspree.io" && /^\/f\/[A-Za-z0-9_-]+$/.test(url.pathname) && url.href !== FORM_ENDPOINT_PLACEHOLDER;
  } catch {
    return false;
  }
}

function formFields(form) {
  const formData = new FormData(form);
  const fields = Object.fromEntries(formData.entries());
  fields.platforms = [...form.querySelectorAll("input[data-platform]:checked")].map((control) => control.dataset.platform);
  return fields;
}

function showStatus(status, message, kind = "") {
  if (!status) return;
  status.textContent = message;
  status.dataset.status = kind;
}

function validatePlatforms(form) {
  const controls = [...form.querySelectorAll("input[data-platform]")];
  const first = controls[0];
  if (!first) return true;
  const valid = controls.some((control) => control.checked);
  first.setCustomValidity(valid ? "" : "Select at least one advertising platform.");
  return valid;
}

function setupQualificationForm() {
  const form = document.querySelector("#spendy-fit-check");
  if (!form) return;
  const status = form.querySelector("[data-fit-check-status]");
  const submit = form.querySelector('[type="submit"]');
  const endpoint = form.getAttribute("action");
  let started = false;

  const trackStart = () => {
    if (started) return;
    started = true;
    trackSpendyEvent("fit_check_start", { page_type: "fit_check" });
  };

  form.addEventListener("focusin", trackStart, { once: true });
  form.addEventListener("invalid", () => {
    form.classList.add("was-validated");
    showStatus(status, "Complete the required fit-check fields before sending.", "error");
  }, true);
  form.addEventListener("change", (event) => {
    if (event.target.matches("input[data-platform]")) validatePlatforms(form);
  });

  form.addEventListener("submit", async (event) => {
    validatePlatforms(form);
    if (!form.reportValidity()) {
      event.preventDefault();
      return;
    }
    trackStart();
    if (!hasConfiguredFormEndpoint(endpoint)) {
      event.preventDefault();
      showStatus(status, "Fit-check submissions are being configured. Use the direct email link below for now; do not attach files.", "error");
      return;
    }

    event.preventDefault();
    if (submit) submit.disabled = true;
    showStatus(status, "Sending your fit check…", "pending");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(createFitCheckPayload(formFields(form))),
      });
      if (!response.ok) throw new Error(`Form endpoint returned ${response.status}`);
      trackSpendyEvent("fit_check_submit", { page_type: "fit_check" });
      window.location.assign("fit-check-thanks.html");
    } catch {
      if (submit) submit.disabled = false;
      showStatus(status, "We could not send the fit check. Please try again or use the direct email link below without attaching files.", "error");
    }
  });
}

if (typeof document !== "undefined") setupQualificationForm();
