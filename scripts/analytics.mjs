const allowedEvents = new Set([
  "landing_view",
  "primary_cta_click",
  "fit_check_start",
  "fit_check_submit",
  "sample_report_open",
  "methodology_open",
  "faq_open",
  "secondary_cta_click",
]);

const allowedPropertyValues = {
  cta_location: new Set(["hero", "deliverable", "price", "navigation", "fallback"]),
  page_type: new Set(["landing", "fit_check", "thanks", "evidence", "sample"]),
};

export function prepareAnalyticsEvent(name, properties = {}) {
  if (!allowedEvents.has(name)) return null;
  const props = {};
  for (const [key, allowed] of Object.entries(allowedPropertyValues)) {
    if (allowed.has(properties[key])) props[key] = properties[key];
  }
  return { name, props };
}

export function trackSpendyEvent(name, properties = {}) {
  const event = prepareAnalyticsEvent(name, properties);
  if (!event || typeof window === "undefined" || typeof window.plausible !== "function") return false;
  window.plausible(event.name, { props: event.props });
  return true;
}

export function setupSpendyAnalytics() {
  if (typeof document === "undefined" || document.documentElement.dataset.spendyAnalyticsReady === "true") return;
  document.documentElement.dataset.spendyAnalyticsReady = "true";

  const pageType = document.body?.dataset.pageType;
  if (pageType === "landing") trackSpendyEvent("landing_view", { page_type: pageType });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-analytics-event]");
    if (!trigger) return;
    trackSpendyEvent(trigger.dataset.analyticsEvent, {
      cta_location: trigger.dataset.ctaLocation,
      page_type: pageType,
    });
  });

  document.querySelectorAll("details[data-disclosure]").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (details.open) trackSpendyEvent("faq_open", { page_type: pageType });
    });
  });
}

if (typeof document !== "undefined") setupSpendyAnalytics();
