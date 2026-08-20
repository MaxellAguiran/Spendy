import { validateLabEvidence } from "./lab-evidence.mjs";


const CHANNELS = [
  { key: "search", label: "Search" },
  { key: "social", label: "Social" },
  { key: "email", label: "Email" },
  { key: "partner", label: "Partner" }
];
const MONEY_TOLERANCE = 0.02;


function roundedMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}


function allocationValues(record, label, errors) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    errors.push(`${label} allocation is missing.`);
    return null;
  }
  const values = {};
  CHANNELS.forEach(({ key, label: channelLabel }) => {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push(`${label} ${channelLabel} allocation is missing or invalid.`);
      return;
    }
    values[key] = value;
  });
  return Object.keys(values).length === CHANNELS.length ? values : null;
}


function allocationChart(artifact, errors) {
  const chart = artifact.chartSeries?.find((candidate) => candidate?.id === "allocation");
  const expectedLabels = CHANNELS.map(({ label }) => label);
  if (!chart || JSON.stringify(chart.labels) !== JSON.stringify(expectedLabels)) {
    errors.push("Allocation chart labels do not match the required channels.");
    return null;
  }
  const current = chart.series?.find((series) => series?.name === "Current")?.values;
  const recommended = chart.series?.find((series) => series?.name === "Recommended")?.values;
  if (!Array.isArray(current) || !Array.isArray(recommended)) {
    errors.push("Allocation chart is missing current or recommended values.");
    return null;
  }
  return { current, recommended };
}


function matchesChart(allocation, values) {
  return CHANNELS.every(({ key }, index) => Math.abs(allocation[key] - values[index]) <= MONEY_TOLERANCE);
}


export function buildFeaturedCaseView(artifact) {
  const validation = validateLabEvidence(artifact);
  const errors = [...validation.errors];
  if (artifact?.lab !== "marketing-allocation") {
    errors.push("Featured evidence must be the marketing-allocation lab.");
  }
  if (errors.length) return { ok: false, errors };

  const recommendation = artifact.model.recommendation;
  const current = allocationValues(recommendation.currentWeeklyAllocation, "Current", errors);
  const shown = recommendation.status === "shown" && artifact.metrics.evidenceGatePassed === true;
  const recommended = shown
    ? allocationValues(recommendation.recommendedWeeklyAllocation, "Recommended", errors)
    : null;
  const chart = allocationChart(artifact, errors);

  if (current && chart && !matchesChart(current, chart.current)) {
    errors.push("Current allocation chart values contradict the recommendation evidence.");
  }
  if (recommended && chart && !matchesChart(recommended, chart.recommended)) {
    errors.push("Recommended allocation chart values contradict the recommendation evidence.");
  }

  const currentTotal = current
    ? roundedMoney(Object.values(current).reduce((total, value) => total + value, 0))
    : null;
  const recommendedTotal = recommended
    ? roundedMoney(Object.values(recommended).reduce((total, value) => total + value, 0))
    : null;
  if (currentTotal !== null && currentTotal <= 0) {
    errors.push("Current allocation must have a strictly positive fixed budget.");
  }
  if (shown && recommendedTotal !== null && recommendedTotal <= 0) {
    errors.push("Recommended allocation must preserve a strictly positive fixed budget.");
  }
  if (currentTotal !== null && recommendedTotal !== null && Math.abs(currentTotal - recommendedTotal) > MONEY_TOLERANCE) {
    errors.push("Recommended allocation changes the fixed total budget.");
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    view: {
      channels: CHANNELS.map(({ key, label }) => ({
        key,
        label,
        current: current[key],
        recommended: recommended?.[key] ?? null
      })),
      currentTotal,
      recommendedTotal,
      baselineMae: artifact.baseline.metrics.mae,
      modelMae: artifact.model.metrics.mae,
      reductionPercent: artifact.metrics.maeReductionPercent,
      recommendationStatus: shown ? "shown" : "withheld",
      developmentRows: artifact.split.developmentRows,
      holdoutRows: artifact.split.holdoutRows
    }
  };
}


function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}


function setCaseValue(root, key, value) {
  root.querySelectorAll(`[data-case-value="${key}"]`).forEach((element) => {
    element.textContent = value;
  });
}


function renderSummary(view) {
  document.querySelectorAll("[data-case-summary]").forEach((summary) => {
    summary.dataset.state = "ready";
    const status = summary.querySelector("[data-case-summary-status]");
    const test = summary.querySelector("[data-case-summary-test]");
    if (status) status.textContent = view.recommendationStatus === "shown"
      ? "Recommendation shown · the analysis beat the simple comparison"
      : "No recommendation · the analysis did not beat the simple comparison";
    if (test) test.textContent = `Learned from ${view.developmentRows} earlier weeks · checked against ${view.holdoutRows} later weeks`;
  });
}


function renderSummaryUnavailable() {
  document.querySelectorAll("[data-case-summary]").forEach((summary) => {
    summary.dataset.state = "unavailable";
    const status = summary.querySelector("[data-case-summary-status]");
    if (status) status.textContent = "Evidence unavailable";
  });
}


function renderAllocationRows(root, view) {
  const chart = root.querySelector('[data-chart="allocation-comparison"]');
  if (!chart) return;
  chart.replaceChildren();
  const maximumValue = Math.max(...view.channels.flatMap((channel) => [channel.current, channel.recommended ?? 0]));
  const maximum = Number.isFinite(maximumValue) && maximumValue > 0 ? maximumValue : 1;
  view.channels.forEach((channel) => {
    const row = document.createElement("div");
    row.className = "allocation-row";
    row.dataset.allocationChannel = channel.key;

    const label = document.createElement("strong");
    label.className = "allocation-label";
    label.textContent = channel.label;
    const tracks = document.createElement("div");
    tracks.className = "allocation-tracks";

    const current = document.createElement("span");
    current.className = "allocation-bar allocation-bar-current";
    current.dataset.series = "current";
    current.style.setProperty("--allocation-percent", `${100 * channel.current / maximum}%`);
    current.setAttribute("aria-label", `Current ${channel.label} allocation ${formatMoney(channel.current)}`);
    const currentValue = document.createElement("span");
    currentValue.textContent = formatMoney(channel.current);
    current.append(currentValue);
    tracks.append(current);

    if (channel.recommended !== null) {
      const recommended = document.createElement("span");
      recommended.className = "allocation-bar allocation-bar-recommended";
      recommended.dataset.series = "recommended";
      recommended.style.setProperty("--allocation-percent", `${100 * channel.recommended / maximum}%`);
      recommended.setAttribute("aria-label", `Recommended ${channel.label} allocation ${formatMoney(channel.recommended)}`);
      const recommendedValue = document.createElement("span");
      recommendedValue.textContent = formatMoney(channel.recommended);
      recommended.append(recommendedValue);
      tracks.append(recommended);
    }
    row.append(label, tracks);
    chart.append(row);
  });
}


function setAllocationView(root, viewName, evidence) {
  root.querySelectorAll("[data-allocation-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.allocationView === viewName));
  });
  root.querySelectorAll("[data-series='current']").forEach((element) => {
    element.hidden = viewName === "recommended";
  });
  root.querySelectorAll("[data-series='recommended']").forEach((element) => {
    element.hidden = viewName === "current";
  });
  const narration = root.querySelector("[data-case-narration]");
  if (!narration) return;
  if (viewName === "current") {
    narration.textContent = `Current view: this is how the ${formatMoney(evidence.currentTotal)} weekly budget is split across four channels today.`;
  } else if (viewName === "recommended") {
    narration.textContent = `Suggested view: the same ${formatMoney(evidence.currentTotal)} weekly budget is split differently; the total does not increase.`;
  } else {
    narration.textContent = `Compare view: the same ${formatMoney(evidence.currentTotal)} weekly budget is split two ways. Brown-orange bars show today’s split; green bars show the suggested split.`;
  }
}


function renderFeaturedCase(root, view) {
  root.dataset.state = "ready";
  root.querySelectorAll("[data-case-loading], [data-case-unavailable]").forEach((element) => { element.hidden = true; });
  root.querySelectorAll("[data-case-content]").forEach((element) => { element.hidden = false; });
  setCaseValue(root, "current-total", formatMoney(view.currentTotal));
  setCaseValue(root, "recommended-total", view.recommendedTotal === null ? "Withheld" : formatMoney(view.recommendedTotal));
  setCaseValue(root, "baseline-mae", formatMoney(view.baselineMae));
  setCaseValue(root, "model-mae", formatMoney(view.modelMae));
  setCaseValue(root, "reduction", `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(view.reductionPercent)}%`);
  setCaseValue(root, "development-rows", String(view.developmentRows));
  setCaseValue(root, "holdout-rows", String(view.holdoutRows));
  renderAllocationRows(root, view);

  const controls = [...root.querySelectorAll("[data-allocation-view]")];
  if (view.recommendationStatus !== "shown") {
    controls.filter((button) => button.dataset.allocationView !== "current").forEach((button) => { button.disabled = true; });
    setAllocationView(root, "current", view);
  } else {
    controls.forEach((button) => button.addEventListener("click", () => setAllocationView(root, button.dataset.allocationView, view)));
    setAllocationView(root, "compare", view);
  }
  renderSummary(view);
}


function renderFeaturedUnavailable(root, errors) {
  root.dataset.state = "unavailable";
  root.querySelectorAll("[data-case-loading], [data-case-content]").forEach((element) => { element.hidden = true; });
  const unavailable = root.querySelector("[data-case-unavailable]");
  if (unavailable) {
    unavailable.hidden = false;
    const details = unavailable.querySelector("[data-case-errors]");
    if (details) details.textContent = "The file may be missing, incomplete, or inconsistent.";
  }
  renderSummaryUnavailable();
}


export async function loadFeaturedCase(root) {
  const source = root?.dataset.evidenceSrc;
  if (!root || !source) return;
  try {
    const response = await fetch(source, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Evidence request failed with ${response.status}.`);
    const artifact = await response.json();
    const result = buildFeaturedCaseView(artifact);
    if (!result.ok) {
      renderFeaturedUnavailable(root, result.errors);
      return;
    }
    renderFeaturedCase(root, result.view);
  } catch (error) {
    renderFeaturedUnavailable(root, [error instanceof Error ? error.message : "Evidence request failed."]);
  }
}


if (typeof document !== "undefined") {
  document.querySelectorAll("[data-featured-case]").forEach((root) => loadFeaturedCase(root));
}
