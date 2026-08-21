const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_SOURCE_FIELDS = ["title", "authors", "doi", "url", "license"];


function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}


function safeCents(value, label, errors, { positive = false, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value)) {
    errors.push(`${label} must be a safe integer number of cents.`);
    return null;
  }
  if (positive && value <= 0) {
    errors.push(`${label} must be positive.`);
    return null;
  }
  return value;
}


function nonemptyString(value, label, errors) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} must be a non-empty string.`);
    return null;
  }
  return value;
}


function readPeriod(row, index, errors) {
  const label = `Period ${index + 1}`;
  if (!isRecord(row)) {
    errors.push(`${label} must be an object.`);
    return null;
  }
  const periodId = nonemptyString(String(row.period_id ?? ""), `${label} id`, errors);
  const periodLabel = nonemptyString(String(row.label ?? ""), `${label} label`, errors);
  const equalProfit = safeCents(Number(row.equal_profit_cents), `${label} equal profit`, errors);
  const spendyProfit = safeCents(Number(row.spendy_profit_cents), `${label} guided-plan profit`, errors);
  const difference = safeCents(Number(row.difference_cents), `${label} difference`, errors);
  if (equalProfit !== null && spendyProfit !== null && difference !== null && spendyProfit - equalProfit !== difference) {
    errors.push(`${label} difference contradicts its two profit values.`);
  }
  return periodId && periodLabel && equalProfit !== null && spendyProfit !== null && difference !== null
    ? { equalProfit, spendyProfit, difference }
    : null;
}


function validateTopLevel(artifact, errors) {
  addError(errors, isRecord(artifact), "Evidence must be a JSON object.");
  if (!isRecord(artifact)) return false;
  addError(errors, artifact.schema === "spendy-case-study-evidence/v1", "Unsupported case-study evidence schema.");
  addError(errors, isRecord(artifact.engagement), "Engagement evidence must be an object.");
  addError(errors, isRecord(artifact.source), "Source evidence must be an object.");
  addError(errors, isRecord(artifact.simulation), "Simulation evidence must be an object.");
  addError(errors, isRecord(artifact.artifacts), "Artifact references must be an object.");
  addError(errors, Array.isArray(artifact.limitations) && artifact.limitations.length > 0, "Case-study limitations are required.");
  return true;
}


function validateEngagement(engagement, errors) {
  if (!isRecord(engagement)) return;
  addError(errors, engagement.kind === "real-client-engagement", "The real-client engagement disclosure is missing.");
  addError(errors, engagement.displayName === "Anonymous e-commerce advertiser", "The approved anonymous client label is required.");
  addError(errors, engagement.identity === "withheld", "Client identity must be withheld.");
}


function validateSource(source, errors) {
  if (!isRecord(source)) return;
  addError(errors, source.kind === "licensed-public-research", "The licensed public-research source disclosure is missing.");
  for (const field of REQUIRED_SOURCE_FIELDS) nonemptyString(source[field], `Source ${field}`, errors);
  addError(errors, source.weekCount === 52, "Source coverage must name 52 historical weeks.");
  addError(errors, source.setupCount === 36, "Source coverage must name 36 campaign setups.");
  addError(errors, source.nativeClientExportVerified === false, "The source must not be represented as a native client export.");
}


function validateSimulation(simulation, source, periodRows, errors) {
  if (!isRecord(simulation) || !isRecord(source)) return;
  addError(errors, simulation.kind === "historical-simulation", "The result must be identified as a historical simulation.");
  addError(errors, simulation.comparison === "equal-budget-split", "The comparison must be an equal budget split.");
  addError(errors, Number.isSafeInteger(simulation.periodCount) && simulation.periodCount > 0, "Historical period count must be a positive integer.");
  addError(errors, isRecord(simulation.coverage), "Decision coverage must be an object.");
  const covered = safeCents(simulation.coverage?.covered, "Decision coverage", errors, { positive: true });
  const total = safeCents(simulation.coverage?.total, "Decision coverage total", errors, { positive: true });
  if (covered !== null && total !== null) {
    addError(errors, covered === total, "Decision coverage must be complete.");
    addError(errors, covered === simulation.periodCount * source.setupCount, "Decision coverage contradicts the period and setup counts.");
  }
  const illustrativeBudget = safeCents(simulation.illustrativeBudgetCents, "Illustrative budget", errors, { positive: true });
  const margin = simulation.illustrativeMarginBasisPoints;
  addError(errors, Number.isSafeInteger(margin) && margin > 0 && margin <= 10000, "Illustrative margin must be basis points between 1 and 10000.");
  const equalProfit = safeCents(simulation.equalProfitCents, "Equal-split profit", errors, { positive: true });
  const spendyProfit = safeCents(simulation.spendyProfitCents, "Guided-plan profit", errors, { positive: true });
  const advantage = safeCents(simulation.advantageCents, "Simulated advantage", errors, { positive: true });
  if (equalProfit !== null && spendyProfit !== null && advantage !== null) {
    addError(errors, spendyProfit - equalProfit === advantage, "Simulated advantage contradicts published profit totals.");
  }
  addError(errors, simulation.realizedClientSavingsCents === null, "Realized client savings must remain unavailable.");
  addError(errors, Array.isArray(periodRows), "Period evidence must be an array.");
  if (!Array.isArray(periodRows)) return;
  addError(errors, periodRows.length === simulation.periodCount, "Period evidence count contradicts the simulation.");
  const periodValues = periodRows.map((row, index) => readPeriod(row, index, errors)).filter(Boolean);
  if (periodValues.length !== periodRows.length) return;
  const periodEqual = periodValues.reduce((sum, row) => sum + row.equalProfit, 0);
  const periodSpendy = periodValues.reduce((sum, row) => sum + row.spendyProfit, 0);
  const periodDifference = periodValues.reduce((sum, row) => sum + row.difference, 0);
  if (equalProfit !== null) addError(errors, periodEqual === equalProfit, "Period evidence contradicts equal-split profit.");
  if (spendyProfit !== null) addError(errors, periodSpendy === spendyProfit, "Period evidence contradicts guided-plan profit.");
  if (advantage !== null) addError(errors, periodDifference === advantage, "Period evidence contradicts simulated advantage.");
  if (illustrativeBudget !== null) addError(errors, illustrativeBudget === 500000, "Illustrative monthly budget must remain €5,000.");
}


function validateArtifacts(artifacts, errors) {
  if (!isRecord(artifacts)) return;
  addError(errors, artifacts.periodsPath === "data/case-study-periods.csv", "Case-study period path is invalid.");
  addError(errors, HASH_PATTERN.test(artifacts.periodsSha256 ?? ""), "Case-study period hash is invalid.");
}


export function validateCaseStudyEvidence(artifact, periodRows) {
  const errors = [];
  if (!validateTopLevel(artifact, errors)) return { ok: false, errors };
  validateEngagement(artifact.engagement, errors);
  validateSource(artifact.source, errors);
  validateSimulation(artifact.simulation, artifact.source, periodRows, errors);
  validateArtifacts(artifact.artifacts, errors);
  if (Array.isArray(artifact.limitations)) {
    artifact.limitations.forEach((limitation, index) => nonemptyString(limitation, `Limitation ${index + 1}`, errors));
  }
  return { ok: errors.length === 0, errors };
}


export function parseCaseStudyPeriods(periodText) {
  const lines = periodText.trim().split(/\r?\n/);
  const [header, ...rows] = lines;
  const expected = "period_id,label,equal_profit_cents,spendy_profit_cents,difference_cents";
  if (header !== expected) throw new Error("Case-study period CSV has an unsupported header.");
  return rows.map((line) => {
    const [period_id, label, equal_profit_cents, spendy_profit_cents, difference_cents] = line.split(",");
    return {
      period_id,
      label,
      equal_profit_cents: Number(equal_profit_cents),
      spendy_profit_cents: Number(spendy_profit_cents),
      difference_cents: Number(difference_cents)
    };
  });
}


async function sha256Text(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}


export async function verifyCaseStudyEvidence(artifact, periodText) {
  let periodRows;
  try {
    periodRows = parseCaseStudyPeriods(periodText);
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
  const validation = validateCaseStudyEvidence(artifact, periodRows);
  if (!validation.ok) return validation;
  const periodHash = await sha256Text(periodText);
  if (periodHash !== artifact.artifacts.periodsSha256) {
    return { ok: false, errors: ["Case-study period hash does not match the evidence artifact."] };
  }
  return { ok: true, errors: [] };
}


function formatEuro(cents) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}


function renderMetric(root, key, value) {
  root.querySelectorAll(`[data-case-value="${key}"]`).forEach((node) => {
    node.textContent = value;
  });
}


function renderChart(root, periodRows) {
  const container = root.querySelector("[data-case-chart]");
  if (!container) return;
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  const title = document.createElementNS(namespace, "title");
  const description = document.createElementNS(namespace, "desc");
  const maximum = Math.max(...periodRows.flatMap((row) => [row.equal_profit_cents, row.spendy_profit_cents]));
  const width = 760;
  const height = 290;
  const chartHeight = 205;
  const gap = 12;
  const groupWidth = (width - 54 - gap * (periodRows.length - 1)) / periodRows.length;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", "case-chart-title case-chart-description");
  title.id = "case-chart-title";
  title.textContent = "Historical simulation: guided plan compared with an even budget split";
  description.id = "case-chart-description";
  description.textContent = "Each period has a pale bar for an even budget split and a purple bar for the Spendy-guided plan. The guided plan totals €4,304 more simulated profit across twelve historical periods.";
  svg.append(title, description);
  const baseline = document.createElementNS(namespace, "line");
  baseline.setAttribute("x1", "40"); baseline.setAttribute("x2", String(width - 10));
  baseline.setAttribute("y1", String(chartHeight + 20)); baseline.setAttribute("y2", String(chartHeight + 20));
  baseline.setAttribute("class", "case-chart-axis");
  svg.append(baseline);
  periodRows.forEach((row, index) => {
    const x = 42 + index * (groupWidth + gap);
    const equalHeight = Math.round((row.equal_profit_cents / maximum) * chartHeight);
    const spendyHeight = Math.round((row.spendy_profit_cents / maximum) * chartHeight);
    const equal = document.createElementNS(namespace, "rect");
    equal.setAttribute("x", String(x)); equal.setAttribute("y", String(chartHeight + 20 - equalHeight));
    equal.setAttribute("width", String(Math.max(6, groupWidth / 2 - 3))); equal.setAttribute("height", String(equalHeight));
    equal.setAttribute("rx", "5"); equal.setAttribute("class", "case-chart-even");
    const guided = document.createElementNS(namespace, "rect");
    guided.setAttribute("x", String(x + groupWidth / 2 + 3)); guided.setAttribute("y", String(chartHeight + 20 - spendyHeight));
    guided.setAttribute("width", String(Math.max(6, groupWidth / 2 - 3))); guided.setAttribute("height", String(spendyHeight));
    guided.setAttribute("rx", "5"); guided.setAttribute("class", "case-chart-guided");
    const label = document.createElementNS(namespace, "text");
    label.setAttribute("x", String(x + groupWidth / 2)); label.setAttribute("y", String(chartHeight + 45));
    label.setAttribute("text-anchor", "middle"); label.setAttribute("class", "case-chart-label");
    label.textContent = String(index + 1);
    svg.append(equal, guided, label);
  });
  container.replaceChildren(svg);
}


function showFailure(root, errors) {
  root.dataset.state = "unavailable";
  root.querySelector("[data-case-loading]")?.setAttribute("hidden", "");
  root.querySelector("[data-case-content]")?.setAttribute("hidden", "");
  const unavailable = root.querySelector("[data-case-unavailable]");
  if (unavailable) {
    unavailable.hidden = false;
    const details = unavailable.querySelector("[data-case-errors]");
    if (details) details.textContent = errors.join(" ");
  }
}


export function renderCaseStudy(root, artifact, periodRows) {
  const validation = validateCaseStudyEvidence(artifact, periodRows);
  if (!validation.ok) {
    showFailure(root, validation.errors);
    return validation;
  }
  const { simulation } = artifact;
  renderMetric(root, "period-count", String(simulation.periodCount));
  renderMetric(root, "decision-coverage", `${simulation.coverage.covered}/${simulation.coverage.total}`);
  renderMetric(root, "advantage", formatEuro(simulation.advantageCents));
  renderMetric(root, "equal-profit", formatEuro(simulation.equalProfitCents));
  renderMetric(root, "guided-profit", formatEuro(simulation.spendyProfitCents));
  renderMetric(root, "budget", formatEuro(simulation.illustrativeBudgetCents));
  renderChart(root, periodRows);
  root.querySelector("[data-case-loading]")?.setAttribute("hidden", "");
  root.querySelector("[data-case-content]")?.removeAttribute("hidden");
  root.dataset.state = "ready";
  return { ok: true, errors: [] };
}


export async function loadCaseStudy(root) {
  try {
    const [artifactResponse, periodsResponse] = await Promise.all([
      fetch(root.dataset.evidenceSrc, { cache: "no-store" }),
      fetch(root.dataset.periodsSrc, { cache: "no-store" })
    ]);
    if (!artifactResponse.ok || !periodsResponse.ok) throw new Error("Case-study evidence could not be loaded.");
    const [artifact, periodText] = await Promise.all([artifactResponse.json(), periodsResponse.text()]);
    const verification = await verifyCaseStudyEvidence(artifact, periodText);
    if (!verification.ok) {
      showFailure(root, verification.errors);
      return verification;
    }
    return renderCaseStudy(root, artifact, parseCaseStudyPeriods(periodText));
  } catch (error) {
    const errors = [error instanceof Error ? error.message : "Case-study evidence could not be loaded."];
    showFailure(root, errors);
    return { ok: false, errors };
  }
}


if (typeof document !== "undefined") {
  document.querySelectorAll("[data-case-study]").forEach((root) => { loadCaseStudy(root); });
}
