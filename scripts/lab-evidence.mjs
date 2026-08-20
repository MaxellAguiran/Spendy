const ALLOWED_LABS = new Set(["marketing-allocation", "churn-risk"]);


function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


function hasFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(hasFiniteNumber);
  }
  if (isRecord(value)) {
    return Object.values(value).every(hasFiniteNumber);
  }
  return true;
}


function hasMetric(record) {
  return isRecord(record) && Object.values(record).some((value) => (
    typeof value === "number" && Number.isFinite(value)
  ));
}


function finiteMetric(record, key, label, errors, { min = -Infinity, max = Infinity } = {}) {
  const value = record?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label} is missing or non-finite.`);
    return null;
  }
  if (value < min || value > max) {
    errors.push(`${label} is outside its valid range.`);
    return null;
  }
  return value;
}


function validateReduction(published, baseline, model, label, errors) {
  if (published === null || baseline === null || model === null) return;
  if (baseline <= 0) {
    errors.push(`${label} cannot be checked because the baseline must be greater than zero.`);
    return;
  }
  const expected = 100 * (baseline - model) / baseline;
  if (Math.abs(published - expected) > 0.11) {
    errors.push(`${label} contradicts the published baseline and model metrics.`);
  }
}


function validateGate(published, expected, metricName, errors) {
  if (typeof published !== "boolean") {
    errors.push("Evidence gate must be a boolean.");
    return;
  }
  if (published !== expected) {
    errors.push(`Evidence gate contradicts the published ${metricName} comparison.`);
  }
}


function validateLabSemantics(artifact, errors) {
  if (!isRecord(artifact.baseline) || !isRecord(artifact.model) || !isRecord(artifact.metrics)) return;

  if (artifact.lab === "marketing-allocation") {
    if (artifact.metrics.primary !== "mae") {
      errors.push("Marketing evidence must declare MAE as its primary metric.");
    }
    const baselineMae = finiteMetric(artifact.baseline.metrics, "mae", "Baseline MAE", errors, { min: 0 });
    const modelMae = finiteMetric(artifact.model.metrics, "mae", "Model MAE", errors, { min: 0 });
    const reduction = finiteMetric(artifact.metrics, "maeReductionPercent", "MAE reduction", errors);
    if (baselineMae !== null && modelMae !== null) {
      const gatePassed = modelMae < baselineMae;
      validateGate(artifact.metrics.evidenceGatePassed, gatePassed, "MAE", errors);
      const recommendation = artifact.model.recommendation;
      if (!isRecord(recommendation)) {
        errors.push("Marketing recommendation metadata is missing.");
      } else if (recommendation.status !== (gatePassed ? "shown" : "withheld")) {
        errors.push("Marketing recommendation status contradicts the evidence gate.");
      }
    }
    validateReduction(reduction, baselineMae, modelMae, "MAE reduction", errors);
  }

  if (artifact.lab === "churn-risk") {
    if (artifact.metrics.primary !== "brierScore") {
      errors.push("Churn evidence must declare Brier score as its primary metric.");
    }
    const baselineBrier = finiteMetric(artifact.baseline.metrics, "brierScore", "Baseline Brier score", errors, { min: 0, max: 1 });
    const modelBrier = finiteMetric(artifact.model.metrics, "brierScore", "Model Brier score", errors, { min: 0, max: 1 });
    const reduction = finiteMetric(artifact.metrics, "brierReductionPercent", "Brier reduction", errors);
    finiteMetric(artifact.model.metrics, "topDecileLift", "Top-decile lift", errors, { min: 0 });
    finiteMetric(artifact.model.metrics, "topDecilePrecision", "Top-decile precision", errors, { min: 0, max: 1 });
    finiteMetric(artifact.model.metrics, "expectedMonthlyRevenueAtRisk", "Expected monthly revenue at risk", errors, { min: 0 });
    if (baselineBrier !== null && modelBrier !== null) {
      validateGate(artifact.metrics.evidenceGatePassed, modelBrier < baselineBrier, "Brier score", errors);
    }
    validateReduction(reduction, baselineBrier, modelBrier, "Brier reduction", errors);
  }
}


export function validateLabEvidence(artifact) {
  const errors = [];

  if (!isRecord(artifact)) {
    return { ok: false, errors: ["Evidence must be a JSON object."] };
  }
  if (artifact.schema !== "lab-evidence/v1") {
    errors.push("Unsupported evidence schema; expected lab-evidence/v1.");
  }
  if (!ALLOWED_LABS.has(artifact.lab)) {
    errors.push("Evidence names an unsupported laboratory.");
  }
  if (artifact.disclosure !== "synthetic-demonstration") {
    errors.push("Required synthetic-demonstration disclosure is missing.");
  }
  for (const key of [
    "dataset",
    "split",
    "baseline",
    "model",
    "metrics",
    "artifactHashes"
  ]) {
    if (!isRecord(artifact[key])) {
      errors.push(`Evidence field ${key} must be an object.`);
    }
  }
  if (!hasMetric(artifact.baseline?.metrics)) {
    errors.push("Baseline metrics are missing.");
  }
  if (!hasMetric(artifact.model?.metrics)) {
    errors.push("Model metrics are missing.");
  }
  if (!Array.isArray(artifact.limitations) || artifact.limitations.length === 0) {
    errors.push("Evidence limitations are missing.");
  }
  if (!Array.isArray(artifact.chartSeries) || artifact.chartSeries.length === 0) {
    errors.push("Chart series are missing.");
  } else {
    artifact.chartSeries.forEach((chart, chartIndex) => {
      if (!Array.isArray(chart?.labels) || !Array.isArray(chart?.series)) {
        errors.push(`Chart ${chartIndex + 1} is malformed.`);
        return;
      }
      chart.series.forEach((series, seriesIndex) => {
        if (!Array.isArray(series?.values) || series.values.length !== chart.labels.length) {
          errors.push(`Chart ${chartIndex + 1}, series ${seriesIndex + 1} has a mismatched length.`);
        }
      });
    });
  }
  if (!hasFiniteNumber(artifact)) {
    errors.push("Evidence contains a non-finite number.");
  }
  validateLabSemantics(artifact, errors);

  return { ok: errors.length === 0, errors };
}


export function evidenceUnavailable(container, errors = []) {
  if (!container) return;
  container.replaceChildren();
  const panel = document.createElement("section");
  panel.className = "evidence-unavailable";
  panel.setAttribute("role", "status");
  const heading = document.createElement("h2");
  heading.textContent = "Evidence unavailable";
  const copy = document.createElement("p");
  copy.textContent = "The evidence artifact did not pass its publication contract, so no result has been rendered.";
  panel.append(heading, copy);
  if (errors.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Technical validation details";
    const list = document.createElement("ul");
    errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    });
    details.append(summary, list);
    panel.append(details);
  }
  container.append(panel);
}


const SVG_NS = "http://www.w3.org/2000/svg";


function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}


function formatNumber(value, options = {}) {
  return new Intl.NumberFormat("en-US", options).format(value);
}


function money(value, compact = false) {
  return formatNumber(value, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard"
  });
}


function percent(value, digits = 1) {
  return `${formatNumber(value * 100, { maximumFractionDigits: digits })}%`;
}


function metricCards(artifact) {
  if (artifact.lab === "marketing-allocation") {
    return [
      ["Baseline prediction error · MAE", money(artifact.baseline.metrics.mae, true)],
      ["Model prediction error · MAE", money(artifact.model.metrics.mae, true)],
      ["Relative error reduction", `${formatNumber(artifact.metrics.maeReductionPercent, { maximumFractionDigits: 1 })}%`],
      ["Recommendation status", artifact.metrics.evidenceGatePassed ? "Released" : "Withheld"]
    ];
  }
  return [
    ["Baseline probability error · Brier score", formatNumber(artifact.baseline.metrics.brierScore, { minimumFractionDigits: 3, maximumFractionDigits: 3 })],
    ["Model probability error · Brier score", formatNumber(artifact.model.metrics.brierScore, { minimumFractionDigits: 3, maximumFractionDigits: 3 })],
    ["Precision among the first 100 accounts", percent(artifact.model.metrics.topDecilePrecision, 0)],
    ["Revenue exposed—not revenue retained", money(artifact.model.metrics.expectedMonthlyRevenueAtRisk, true)]
  ];
}


function chartSummary(artifact, chart) {
  const summaries = {
    allocation: artifact.metrics.evidenceGatePassed
      ? "The constrained recommendation redistributes the same weekly budget only after the holdout gate passed. It is a model scenario, not realised return."
      : "The recommendation is withheld because the model did not beat the declared baseline.",
    "response-curves": "Every channel curve flattens as spend rises, expressing diminishing marginal response inside the observed range.",
    "held-out-revenue": "Actual and predicted revenue are shown only for the final chronological holdout; the outer series form the model's 90% interval.",
    "error-comparison": "Lower is better. The model is compared with the same-week-one-year-earlier baseline on identical held-out weeks.",
    calibration: "A calibrated model places predicted risk near the observed event rate. Sparse high-risk bins should be interpreted cautiously.",
    capacity: "Precision declines as a larger share of accounts is contacted, making outreach capacity part of the decision. Lift remains available in the evidence table below.",
    "lead-time": "Lead time describes how far in advance the synthetic risk signals appear among held-out churn events; it does not prove intervention success.",
    "loss-comparison": "Lower is better. Brier score is the primary probabilistic metric; log loss is shown as a second view of probability quality."
  };
  return summaries[chart.id] || `${chart.title} is rendered from the checked evidence artifact.`;
}


function chartValue(value) {
  if (Math.abs(value) >= 1000) return formatNumber(value, { maximumFractionDigits: 0 });
  return formatNumber(value, { maximumFractionDigits: 4 });
}


function renderTable(chart) {
  const wrapper = document.createElement("div");
  wrapper.className = "data-table-wrap";
  const details = document.createElement("details");
  details.dataset.disclosure = "";
  const summary = document.createElement("summary");
  summary.textContent = "View accessible data table";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent = chart.title;
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Period or band", ...chart.series.map((series) => series.name)].forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headerRow.append(cell);
  });
  head.append(headerRow);
  const body = document.createElement("tbody");
  chart.labels.forEach((label, index) => {
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = label;
    row.append(heading);
    chart.series.forEach((series) => {
      const cell = document.createElement("td");
      cell.textContent = chartValue(series.values[index]);
      row.append(cell);
    });
    body.append(row);
  });
  table.append(caption, head, body);
  details.append(summary, table);
  wrapper.append(details);
  return wrapper;
}


function linePath(values, min, max, dimensions) {
  const { left, top, width, height } = dimensions;
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = left + (values.length === 1 ? width / 2 : index * width / (values.length - 1));
    const y = top + height - ((value - min) / range) * height;
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}


function addSvgText(svg, value, attributes) {
  const label = svgElement("text", { ...attributes, class: "chart-tick", "aria-hidden": "true" });
  label.textContent = value;
  svg.append(label);
}


function renderLineSvg(chart) {
  const svg = svgElement("svg", { viewBox: "0 0 620 300", role: "img", "aria-label": chart.title });
  const dimensions = { left: 44, top: 22, width: 548, height: 226 };
  const values = chart.series.flatMap((series) => series.values);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue || 1) * 0.08;
  const min = Math.min(0, minValue - padding);
  const max = maxValue + padding;
  for (let grid = 0; grid <= 4; grid += 1) {
    const y = dimensions.top + grid * dimensions.height / 4;
    svg.append(svgElement("line", { x1: dimensions.left, x2: dimensions.left + dimensions.width, y1: y, y2: y, class: "chart-gridline" }));
  }
  chart.series.forEach((series, index) => {
    const path = svgElement("path", { d: linePath(series.values, min, max, dimensions), class: `chart-line ${index === 1 ? "secondary" : index > 1 ? "tertiary" : ""}`.trim() });
    path.dataset.drawPath = "";
    svg.append(path);
  });
  svg.append(svgElement("line", { x1: dimensions.left, x2: dimensions.left + dimensions.width, y1: dimensions.top + dimensions.height, y2: dimensions.top + dimensions.height, class: "chart-axis" }));
  addSvgText(svg, chartValue(max), { x: dimensions.left - 7, y: dimensions.top + 4, "text-anchor": "end" });
  addSvgText(svg, chartValue(min), { x: dimensions.left - 7, y: dimensions.top + dimensions.height + 3, "text-anchor": "end" });
  [...new Set([0, Math.floor((chart.labels.length - 1) / 2), chart.labels.length - 1])].forEach((index) => {
    const x = dimensions.left + (chart.labels.length === 1 ? dimensions.width / 2 : index * dimensions.width / (chart.labels.length - 1));
    addSvgText(svg, chart.labels[index], { x, y: dimensions.top + dimensions.height + 24, "text-anchor": index === 0 ? "start" : index === chart.labels.length - 1 ? "end" : "middle" });
  });
  return svg;
}


function renderBarSvg(chart) {
  const svg = svgElement("svg", { viewBox: "0 0 620 300", role: "img", "aria-label": chart.title });
  const left = 44;
  const top = 22;
  const width = 548;
  const height = 226;
  const max = Math.max(...chart.series.flatMap((series) => series.values), 1);
  const groupWidth = width / chart.labels.length;
  const barWidth = Math.max(5, Math.min(28, (groupWidth - 10) / chart.series.length));
  for (let grid = 0; grid <= 4; grid += 1) {
    const y = top + grid * height / 4;
    svg.append(svgElement("line", { x1: left, x2: left + width, y1: y, y2: y, class: "chart-gridline" }));
  }
  chart.labels.forEach((label, labelIndex) => {
    chart.series.forEach((series, seriesIndex) => {
      const value = series.values[labelIndex];
      const barHeight = value / max * height;
      const groupStart = left + labelIndex * groupWidth;
      const totalBarsWidth = chart.series.length * barWidth + (chart.series.length - 1) * 5;
      const x = groupStart + (groupWidth - totalBarsWidth) / 2 + seriesIndex * (barWidth + 5);
      const fill = chart.id === "allocation"
        ? (series.name === "Current" ? "#C45A49" : "#197A55")
        : (seriesIndex === 0 ? "#8EAA9B" : seriesIndex === 1 ? "#197A55" : "#C45A49");
      const bar = svgElement("rect", {
        x, y: top + height - barHeight, width: barWidth, height: barHeight,
        rx: 4, fill
      });
      svg.append(bar);
    });
    addSvgText(svg, label, { x: left + labelIndex * groupWidth + groupWidth / 2, y: top + height + 24, "text-anchor": "middle" });
  });
  svg.append(svgElement("line", { x1: left, x2: left + width, y1: top + height, y2: top + height, class: "chart-axis" }));
  addSvgText(svg, chartValue(max), { x: left - 7, y: top + 4, "text-anchor": "end" });
  addSvgText(svg, "0", { x: left - 7, y: top + height + 3, "text-anchor": "end" });
  return svg;
}


function renderChart(artifact, chart) {
  const visualChart = chart.id === "capacity"
    ? { ...chart, title: "Precision at outreach capacity", series: chart.series.filter((series) => series.name === "Precision") }
    : chart;
  const article = document.createElement("article");
  article.className = "evidence-chart";
  article.dataset.chart = chart.id;
  const heading = document.createElement("h3");
  heading.textContent = visualChart.title;
  const canvas = document.createElement("div");
  canvas.className = "chart-canvas";
  const barCharts = new Set(["allocation", "error-comparison", "lead-time", "loss-comparison"]);
  canvas.append(barCharts.has(chart.id) ? renderBarSvg(visualChart) : renderLineSvg(visualChart));
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  visualChart.series.forEach((series) => {
    const key = document.createElement("span");
    key.className = "legend-key";
    key.textContent = series.name;
    legend.append(key);
  });
  const narration = document.createElement("p");
  narration.className = "chart-summary";
  narration.textContent = chartSummary(artifact, chart);
  article.append(heading, canvas, legend, narration, renderTable(chart));
  return article;
}


function setupChartDraw(container) {
  const charts = [...container.querySelectorAll("[data-chart]")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveal = (chart) => {
    chart.querySelectorAll("[data-draw-path]").forEach((path) => {
      if (!reduceMotion) {
        const length = path.getTotalLength();
        path.style.setProperty("--path-length", String(length));
        path.classList.add("is-drawing");
      }
    });
  };
  if (reduceMotion || !("IntersectionObserver" in window)) {
    charts.forEach(reveal);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.2 });
  charts.forEach((chart) => observer.observe(chart));
}


export function renderLabEvidence(container, artifact) {
  container.replaceChildren();
  const stats = document.createElement("div");
  stats.className = "stat-grid";
  metricCards(artifact).forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat";
    const small = document.createElement("span");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(small, strong);
    stats.append(card);
  });
  const businessOrder = artifact.lab === "marketing-allocation"
    ? ["allocation", "response-curves", "held-out-revenue", "error-comparison"]
    : ["capacity", "calibration", "lead-time", "loss-comparison"];
  const rank = new Map(businessOrder.map((id, index) => [id, index]));
  const orderedCharts = [...artifact.chartSeries]
    .sort((left, right) => (rank.get(left.id) ?? businessOrder.length) - (rank.get(right.id) ?? businessOrder.length));
  const primaryChart = document.createElement("div");
  primaryChart.className = "chart-grid primary-chart-grid";
  const supportingCharts = document.createElement("div");
  supportingCharts.className = "chart-grid";
  orderedCharts.forEach((chart, index) => {
    (index === 0 ? primaryChart : supportingCharts).append(renderChart(artifact, chart));
  });
  container.append(primaryChart, stats, supportingCharts);
  setupChartDraw(container);
}


export async function loadLabEvidence(container) {
  const source = container?.dataset.evidenceSrc;
  if (!container || !source) return;
  try {
    const response = await fetch(source, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Evidence request failed with ${response.status}.`);
    const artifact = await response.json();
    const validation = validateLabEvidence(artifact);
    if (!validation.ok) {
      evidenceUnavailable(container, validation.errors);
      return;
    }
    renderLabEvidence(container, artifact);
  } catch (error) {
    evidenceUnavailable(container, [error instanceof Error ? error.message : "Evidence request failed."]);
  }
}


if (typeof document !== "undefined") {
  document.querySelectorAll("[data-evidence-src]:not([data-featured-case])").forEach((container) => loadLabEvidence(container));
}
