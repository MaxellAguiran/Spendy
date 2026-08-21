const ALLOWED_PLATFORMS = new Set(["Meta Ads", "Google Ads", "TikTok Ads"]);
const ALLOWED_ACTIONS = new Set(["Cut", "Reduce", "Keep", "Increase"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;


function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


function hasFiniteNumbers(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasFiniteNumbers);
  if (isRecord(value)) return Object.values(value).every(hasFiniteNumbers);
  return true;
}


function finiteNumber(value, label, errors, { minimum = -Infinity, maximum = Infinity } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label} must be a finite number.`);
    return null;
  }
  if (value < minimum || value > maximum) {
    errors.push(`${label} is outside its valid range.`);
    return null;
  }
  return value;
}


function safeCents(value, label, errors, { positive = false, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value)) {
    errors.push(`${label} must be a safe integer number of cents.`);
    return null;
  }
  if (value < 0 || (positive && value === 0)) {
    errors.push(`${label} must be ${positive ? "strictly positive" : "non-negative"}.`);
    return null;
  }
  return value;
}


function isoDate(value, label, errors) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    errors.push(`${label} must be an ISO date.`);
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    errors.push(`${label} must be a real ISO date.`);
    return null;
  }
  return value;
}


function validateTopLevel(artifact, errors) {
  if (artifact.schema !== "ad-report-evidence/v1") {
    errors.push("Unsupported evidence schema; expected ad-report-evidence/v1.");
  }
  if (artifact.report !== "monthly-ad-forecast") {
    errors.push("Unsupported report type; expected monthly-ad-forecast.");
  }
  if (artifact.disclosure !== "synthetic-demonstration") {
    errors.push("Required synthetic-demonstration disclosure is missing.");
  }
  if (artifact.currency !== "USD") errors.push("Report currency must be USD.");
  if (typeof artifact.forecastMonth !== "string" || !/^\d{4}-\d{2}$/.test(artifact.forecastMonth)) {
    errors.push("Forecast month must use YYYY-MM.");
  }
  for (const key of ["dataset", "split", "breakEven", "baseline", "model", "metrics", "budget", "artifactHashes"]) {
    if (!isRecord(artifact[key])) errors.push(`Evidence field ${key} must be an object.`);
  }
  if (!Array.isArray(artifact.ads) || artifact.ads.length === 0) errors.push("Ad evidence is missing.");
  if (!Array.isArray(artifact.limitations) || artifact.limitations.length === 0) errors.push("Limitations are missing.");
  if (!Array.isArray(artifact.chartSeries) || artifact.chartSeries.length === 0) errors.push("Chart evidence is missing.");
  for (const key of ["datasetSha256", "generatorSha256"]) {
    if (!HASH_PATTERN.test(artifact.artifactHashes?.[key] ?? "")) errors.push(`${key} must be a SHA-256 hash.`);
  }
}


function validateSplit(split, errors) {
  if (!isRecord(split)) return;
  if (split.strategy !== "chronological") errors.push("Report split must be chronological.");
  const developmentDays = safeCents(split.developmentDays, "Development days", errors, { positive: true });
  const holdoutDays = safeCents(split.holdoutDays, "Holdout days", errors, { positive: true });
  const developmentStart = isoDate(split.developmentStart, "Development start date", errors);
  const developmentEnd = isoDate(split.developmentEnd, "Development end date", errors);
  const holdoutStart = isoDate(split.holdoutStart, "Holdout start date", errors);
  const holdoutEnd = isoDate(split.holdoutEnd, "Holdout end date", errors);
  if (developmentStart && developmentEnd && developmentStart > developmentEnd) {
    errors.push("Development dates are not chronological.");
  }
  if (developmentEnd && holdoutStart && developmentEnd >= holdoutStart) {
    errors.push("The later holdout period must begin after development ends.");
  }
  if (holdoutStart && holdoutEnd && holdoutStart > holdoutEnd) {
    errors.push("Holdout dates are not chronological.");
  }
  if (developmentDays === null || holdoutDays === null) return;
}


function validateMetrics(artifact, errors) {
  if (!isRecord(artifact.baseline) || !isRecord(artifact.model) || !isRecord(artifact.metrics)) return null;
  if (artifact.metrics.primary !== "mae") errors.push("The primary report metric must be MAE.");
  const baselineMae = finiteNumber(artifact.baseline.metrics?.mae, "Simple-comparison MAE", errors, { minimum: 0 });
  const modelMae = finiteNumber(artifact.model.metrics?.mae, "Model MAE", errors, { minimum: 0 });
  const publishedReduction = finiteNumber(artifact.metrics.maeReductionPercent, "MAE reduction", errors);
  if (baselineMae === null || modelMae === null) return null;
  const expectedGate = modelMae < baselineMae;
  if (typeof artifact.metrics.evidenceGatePassed !== "boolean" || artifact.metrics.evidenceGatePassed !== expectedGate) {
    errors.push("Evidence gate contradicts the held-out MAE comparison.");
  }
  const expectedStatus = expectedGate ? "shown" : "withheld";
  if (artifact.model.recommendationStatus !== expectedStatus) {
    errors.push("Recommendation status contradicts the held-out MAE comparison.");
  }
  if (baselineMae <= 0) {
    errors.push("Simple-comparison MAE must be greater than zero.");
  } else if (publishedReduction !== null) {
    const expectedReduction = 100 * (baselineMae - modelMae) / baselineMae;
    if (Math.abs(publishedReduction - expectedReduction) > 0.011) {
      errors.push("Published MAE reduction contradicts the comparison metrics.");
    }
  }
  return expectedGate;
}


function validateAdsAndBudget(artifact, expectedGate, errors) {
  if (!Array.isArray(artifact.ads) || !isRecord(artifact.budget) || !isRecord(artifact.breakEven)) return;
  const supplied = safeCents(artifact.budget.suppliedMonthlyBudgetCents, "Supplied monthly budget", errors, { positive: true });
  const currentPublished = safeCents(artifact.budget.currentTotalCents, "Current total", errors, { positive: true });
  const recommendedPublished = safeCents(
    artifact.budget.recommendedTotalCents,
    "Recommended total",
    errors,
    { positive: true, nullable: expectedGate === false }
  );
  const differencePublished = safeCents(
    artifact.budget.reconciliationDifferenceCents,
    "Reconciliation difference",
    errors,
    { nullable: expectedGate === false }
  );
  const breakEven = finiteNumber(artifact.breakEven.roas, "Break-even ROAS", errors, { minimum: 0.000001 });
  const identifiers = new Set();
  let currentSum = 0;
  let recommendedSum = 0;

  artifact.ads.forEach((ad, index) => {
    const label = `Ad ${index + 1}`;
    if (!isRecord(ad)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (typeof ad.adId !== "string" || !ad.adId.trim()) {
      errors.push(`${label} has no stable identifier.`);
    } else if (identifiers.has(ad.adId)) {
      errors.push(`Duplicate ad identifier ${ad.adId}.`);
    } else {
      identifiers.add(ad.adId);
    }
    if (typeof ad.adName !== "string" || !ad.adName.trim()) errors.push(`${label} has no name.`);
    if (!ALLOWED_PLATFORMS.has(ad.platform)) errors.push(`${label} names an unsupported platform.`);
    if (!ALLOWED_ACTIONS.has(ad.action)) errors.push(`${label} names an unsupported action.`);
    const current = safeCents(ad.currentSpendCents, `${label} current spend`, errors);
    const recommended = safeCents(
      ad.recommendedSpendCents,
      `${label} recommended spend`,
      errors,
      { nullable: expectedGate === false }
    );
    const change = ad.changeCents;
    if (expectedGate) {
      if (!Number.isSafeInteger(change)) errors.push(`${label} change must be a safe integer number of cents.`);
      if (current !== null && recommended !== null && Number.isSafeInteger(change) && recommended - current !== change) {
        errors.push(`${label} change contradicts current and recommended spend.`);
      }
    } else if (change !== null || recommended !== null) {
      errors.push(`${label} exposes a recommendation even though the report is withheld.`);
    }
    const point = finiteNumber(ad.forecastRoas, `${label} forecast`, errors, { minimum: 0 });
    const low = finiteNumber(ad.forecastLow, `${label} forecast interval low`, errors, { minimum: 0 });
    const high = finiteNumber(ad.forecastHigh, `${label} forecast interval high`, errors, { minimum: 0 });
    if (low !== null && point !== null && high !== null && (low > point || point > high)) {
      errors.push(`${label} forecast interval is reversed.`);
    }
    if (breakEven !== null && ad.breakEvenRoas !== breakEven) errors.push(`${label} has an inconsistent break-even value.`);
    if (low !== null && point !== null && high !== null && breakEven !== null) {
      const expectedAction = high < breakEven ? "Cut" : point < breakEven ? "Reduce" : low > breakEven ? "Increase" : "Keep";
      if (ad.action !== expectedAction) errors.push(`${label} action contradicts its forecast and break-even point.`);
    }
    if (expectedGate && current !== null && recommended !== null) {
      const directionMatches = (
        ((ad.action === "Cut" || ad.action === "Reduce") && recommended < current)
        || (ad.action === "Keep" && recommended === current)
        || (ad.action === "Increase" && recommended > current)
      );
      if (!directionMatches) errors.push(`${label} action contradicts its current and recommended spend.`);
    }
    if (current !== null) currentSum += current;
    if (recommended !== null) recommendedSum += recommended;
  });

  if (currentPublished !== null && currentSum !== currentPublished) errors.push("Current line items contradict the published total.");
  if (supplied !== null && currentPublished !== null && currentPublished !== supplied) errors.push("Current total must equal the supplied fixed budget.");
  if (expectedGate) {
    if (recommendedPublished !== null && recommendedSum !== recommendedPublished) errors.push("Recommended line items contradict the published total.");
    if (supplied !== null && recommendedPublished !== null && recommendedPublished !== supplied) {
      errors.push("Recommended total does not reconcile to the supplied fixed budget.");
    }
    if (differencePublished !== 0) errors.push("Reconciliation difference must be zero cents.");
  } else if (artifact.budget.recommendedTotalCents !== null || artifact.budget.reconciliationDifferenceCents !== null) {
    errors.push("Withheld evidence must not publish recommendation totals.");
  }
}


function validateChart(artifact, expectedGate, errors) {
  if (!Array.isArray(artifact.chartSeries) || !Array.isArray(artifact.ads)) return;
  const chart = artifact.chartSeries.find((candidate) => candidate?.id === "ad-budget-comparison");
  if (!isRecord(chart)) {
    errors.push("Ad budget comparison chart is missing.");
    return;
  }
  const expectedLabels = artifact.ads.map((ad) => ad.adId);
  if (JSON.stringify(chart.labels) !== JSON.stringify(expectedLabels)) {
    errors.push("Ad budget chart labels contradict the ad rows.");
    return;
  }
  const current = chart.series?.find((series) => series?.name === "Current")?.values;
  const recommended = chart.series?.find((series) => series?.name === "Recommended")?.values;
  if (!Array.isArray(current) || !Array.isArray(recommended) || current.length !== expectedLabels.length || recommended.length !== expectedLabels.length) {
    errors.push("Ad budget chart series are malformed.");
    return;
  }
  artifact.ads.forEach((ad, index) => {
    if (current[index] !== ad.currentSpendCents) errors.push(`Current chart value contradicts ${ad.adId}.`);
    if (expectedGate && recommended[index] !== ad.recommendedSpendCents) errors.push(`Recommended chart value contradicts ${ad.adId}.`);
    if (!expectedGate && recommended[index] !== null) errors.push(`Withheld chart exposes a recommendation for ${ad.adId}.`);
  });
}


export function validateAdReportEvidence(artifact) {
  const errors = [];
  if (!isRecord(artifact)) return { ok: false, errors: ["Evidence must be a JSON object."] };
  validateTopLevel(artifact, errors);
  if (!hasFiniteNumbers(artifact)) errors.push("Evidence contains a non-finite number.");
  validateSplit(artifact.split, errors);
  const expectedGate = validateMetrics(artifact, errors);
  validateAdsAndBudget(artifact, expectedGate, errors);
  validateChart(artifact, expectedGate, errors);
  return { ok: errors.length === 0, errors };
}


function bytesView(bytes) {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  throw new TypeError("Dataset bytes must be an ArrayBuffer or typed array.");
}


export async function verifyAdReportDataset(artifact, bytes) {
  const errors = [];
  if (!HASH_PATTERN.test(artifact?.artifactHashes?.datasetSha256 ?? "")) {
    return { ok: false, errors: ["Dataset hash is missing or malformed."] };
  }
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytesView(bytes));
    const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    if (actual !== artifact.artifactHashes.datasetSha256) errors.push("Dataset hash does not match the checked artifact.");
  } catch {
    errors.push("Dataset hash could not be checked.");
  }
  return { ok: errors.length === 0, errors };
}


export function buildAdReportView(artifact) {
  const validation = validateAdReportEvidence(artifact);
  if (!validation.ok) return validation;
  return {
    ok: true,
    view: {
      currency: artifact.currency,
      forecastMonth: artifact.forecastMonth,
      suppliedBudgetCents: artifact.budget.suppliedMonthlyBudgetCents,
      currentTotalCents: artifact.budget.currentTotalCents,
      recommendedTotalCents: artifact.budget.recommendedTotalCents,
      reconciliationDifferenceCents: artifact.budget.reconciliationDifferenceCents,
      baselineMae: artifact.baseline.metrics.mae,
      modelMae: artifact.model.metrics.mae,
      errorReductionPercent: artifact.metrics.maeReductionPercent,
      recommendationStatus: artifact.model.recommendationStatus,
      breakEvenRoas: artifact.breakEven.roas,
      developmentDays: artifact.split.developmentDays,
      holdoutDays: artifact.split.holdoutDays,
      ads: artifact.ads.map((ad) => ({ ...ad }))
    }
  };
}


function moneyFromCents(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}


function number(value, digits = 2) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}


function setReportValue(root, key, value) {
  const page = root.ownerDocument ?? document;
  page.querySelectorAll(`[data-report-value="${key}"]`).forEach((element) => { element.textContent = value; });
}


function renderRows(root, view) {
  const body = root.querySelector("[data-report-rows]");
  if (!body) return;
  body.replaceChildren();
  view.ads.forEach((ad) => {
    const row = document.createElement("tr");
    row.dataset.reportAd = ad.adId;
    const breakEvenRelation = ad.forecastHigh < ad.breakEvenRoas
      ? "below"
      : ad.forecastLow > ad.breakEvenRoas ? "above" : "spans";
    const values = [
      ad.platform,
      `${ad.adName} · ${ad.adId}`,
      moneyFromCents(ad.currentSpendCents),
      `Forecast return: $${number(ad.forecastLow)}–$${number(ad.forecastHigh)} per $1 spent · ${breakEvenRelation} the $${number(ad.breakEvenRoas)} break-even`,
      ad.action,
      ad.recommendedSpendCents === null ? "Withheld" : moneyFromCents(ad.recommendedSpendCents)
    ];
    values.forEach((value, index) => {
      const cell = document.createElement(index === 1 ? "th" : "td");
      if (index === 1) cell.scope = "row";
      cell.textContent = value;
      if (index === 4) {
        cell.dataset.reportAction = ad.action.toLowerCase();
        cell.dataset.reportRecommendation = "";
      }
      if (index === 5) cell.dataset.reportRecommendation = "";
      row.append(cell);
    });
    body.append(row);
  });
}


function renderBudgetChart(root, view) {
  const chart = root.querySelector('[data-chart="ad-budget-comparison"]');
  if (!chart) return;
  chart.replaceChildren();
  const maximum = Math.max(1, ...view.ads.flatMap((ad) => [ad.currentSpendCents, ad.recommendedSpendCents ?? 0]));
  view.ads.forEach((ad) => {
    const row = document.createElement("div");
    row.className = "ad-budget-row";
    row.dataset.reportAd = ad.adId;
    const label = document.createElement("strong");
    label.textContent = `${ad.platform.replace(" Ads", "")} · ${ad.adId.slice(-2)}`;
    const tracks = document.createElement("div");
    tracks.className = "ad-budget-tracks";
    const series = [
      ["current", ad.currentSpendCents, "Current"],
      ["recommended", ad.recommendedSpendCents, "Recommended"]
    ];
    series.forEach(([name, cents, seriesLabel]) => {
      if (cents === null) return;
      const bar = document.createElement("span");
      bar.className = `ad-budget-bar ad-budget-bar-${name}`;
      bar.dataset.series = name;
      bar.style.setProperty("--ad-budget-width", `${100 * cents / maximum}%`);
      bar.setAttribute("aria-label", `${seriesLabel} ${ad.adName}: ${moneyFromCents(cents)}`);
      const value = document.createElement("span");
      value.textContent = moneyFromCents(cents);
      bar.append(value);
      tracks.append(bar);
    });
    row.append(label, tracks);
    chart.append(row);
  });
}


function setBudgetView(root, viewName, view) {
  root.querySelectorAll("[data-budget-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.budgetView === viewName));
  });
  root.querySelectorAll('[data-series="current"]').forEach((element) => { element.hidden = viewName === "recommended"; });
  root.querySelectorAll('[data-series="recommended"]').forEach((element) => { element.hidden = viewName === "current"; });
  const narration = root.querySelector("[data-report-narration]");
  if (!narration) return;
  const total = moneyFromCents(view.suppliedBudgetCents);
  if (viewName === "current") narration.textContent = `Current view: the supplied ${total} monthly budget using the generated current ad mix.`;
  if (viewName === "recommended") narration.textContent = `Recommended view: the same ${total} monthly budget, reallocated across individual ads.`;
  if (viewName === "compare") narration.textContent = `Compare view: terracotta shows current spend and green shows recommended spend. Both totals equal ${total}.`;
}


function renderReport(root, view) {
  root.dataset.state = "ready";
  root.querySelectorAll("[data-report-loading], [data-report-unavailable]").forEach((element) => { element.hidden = true; });
  root.querySelectorAll("[data-report-content]").forEach((element) => { element.hidden = false; });
  setReportValue(root, "forecast-month", view.forecastMonth);
  setReportValue(root, "supplied-budget", moneyFromCents(view.suppliedBudgetCents));
  setReportValue(root, "current-total", moneyFromCents(view.currentTotalCents));
  setReportValue(root, "recommended-total", view.recommendedTotalCents === null ? "Withheld" : moneyFromCents(view.recommendedTotalCents));
  setReportValue(root, "budget-difference", view.reconciliationDifferenceCents === null ? "Withheld" : moneyFromCents(view.reconciliationDifferenceCents));
  setReportValue(root, "baseline-mae", number(view.baselineMae, 4));
  setReportValue(root, "model-mae", number(view.modelMae, 4));
  setReportValue(root, "error-reduction", `${number(view.errorReductionPercent, 2)}%`);
  setReportValue(root, "development-days", String(view.developmentDays));
  setReportValue(root, "holdout-days", String(view.holdoutDays));
  renderRows(root, view);
  renderBudgetChart(root, view);
  const controls = [...root.querySelectorAll("[data-budget-view]")];
  if (view.recommendationStatus === "shown") {
    controls.forEach((button) => button.addEventListener("click", () => setBudgetView(root, button.dataset.budgetView, view)));
    setBudgetView(root, "compare", view);
  } else {
    root.querySelectorAll("[data-report-recommendation]").forEach((element) => { element.hidden = true; });
    controls.filter((button) => button.dataset.budgetView !== "current").forEach((button) => { button.disabled = true; });
    setBudgetView(root, "current", view);
  }
}


function renderUnavailable(root, errors) {
  root.dataset.state = "unavailable";
  root.querySelectorAll("[data-report-loading], [data-report-content]").forEach((element) => { element.hidden = true; });
  const unavailable = root.querySelector("[data-report-unavailable]");
  if (!unavailable) return;
  unavailable.hidden = false;
  const details = unavailable.querySelector("[data-report-errors]");
  if (details) details.textContent = errors.length ? "The evidence file is missing, incomplete, or inconsistent." : "The evidence could not be checked.";
}


async function loadReport(root) {
  const evidenceSource = root.dataset.evidenceSrc;
  if (!evidenceSource) return;
  try {
    const evidenceResponse = await fetch(evidenceSource, { headers: { Accept: "application/json" } });
    if (!evidenceResponse.ok) throw new Error(`Evidence request failed with ${evidenceResponse.status}.`);
    const artifact = await evidenceResponse.json();
    const result = buildAdReportView(artifact);
    if (!result.ok) {
      renderUnavailable(root, result.errors);
      return;
    }
    const datasetSource = root.dataset.datasetSrc;
    if (datasetSource) {
      const datasetResponse = await fetch(datasetSource);
      if (!datasetResponse.ok) throw new Error(`Dataset request failed with ${datasetResponse.status}.`);
      const datasetCheck = await verifyAdReportDataset(artifact, await datasetResponse.arrayBuffer());
      if (!datasetCheck.ok) {
        renderUnavailable(root, datasetCheck.errors);
        return;
      }
    }
    renderReport(root, result.view);
  } catch (error) {
    renderUnavailable(root, [error instanceof Error ? error.message : "Evidence request failed."]);
  }
}


export async function loadAdReports() {
  const loads = [...document.querySelectorAll("[data-ad-report]")].map((root) => {
    if (!root.hasAttribute("data-load-deferred")) return loadReport(root);
    return new Promise((resolve) => {
      if (typeof window.IntersectionObserver !== "function") {
        loadReport(root).finally(resolve);
        return;
      }
      const observer = new window.IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadReport(root).finally(resolve);
      }, { rootMargin: "0px 0px -45% 0px" });
      observer.observe(root);
    });
  });
  await Promise.all(loads);
}


if (typeof document !== "undefined") loadAdReports();
