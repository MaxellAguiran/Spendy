import test from "node:test";
import assert from "node:assert/strict";

import { validateLabEvidence } from "../scripts/lab-evidence.mjs";


function validArtifact() {
  return {
    schema: "lab-evidence/v1",
    lab: "marketing-allocation",
    generatedAt: "2026-08-20T00:00:00Z",
    seed: 7319,
    disclosure: "synthetic-demonstration",
    dataset: { rows: 156, download: "data/marketing-allocation.csv" },
    split: { strategy: "chronological", developmentRows: 130, holdoutRows: 26 },
    baseline: { name: "13-week seasonal mean", metrics: { mae: 100 } },
    model: {
      name: "regularized response model",
      metrics: { mae: 80 },
      recommendation: { status: "shown" }
    },
    metrics: { primary: "mae", evidenceGatePassed: true, maeReductionPercent: 20 },
    chartSeries: [
      {
        id: "held-out-revenue",
        labels: ["2026-W01", "2026-W02"],
        series: [
          { name: "Actual", values: [1000, 1200] },
          { name: "Model", values: [980, 1175] }
        ]
      }
    ],
    limitations: ["Synthetic demand is simpler than a live market."],
    artifactHashes: { datasetSha256: "a".repeat(64) }
  };
}


test("accepts a complete lab-evidence/v1 artifact", () => {
  const result = validateLabEvidence(validArtifact());
  assert.deepEqual(result, { ok: true, errors: [] });
});


test("rejects unknown schema versions instead of rendering stale semantics", () => {
  const artifact = validArtifact();
  artifact.schema = "lab-evidence/v2";
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /schema/i);
});


test("rejects artifacts without the synthetic disclosure", () => {
  const artifact = validArtifact();
  delete artifact.disclosure;
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /disclosure/i);
});


test("rejects artifacts without baseline metrics", () => {
  const artifact = validArtifact();
  artifact.baseline.metrics = {};
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /baseline metrics/i);
});


test("rejects non-finite numeric evidence", () => {
  const artifact = validArtifact();
  artifact.model.metrics.mae = Number.NaN;
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /finite/i);
});


test("rejects chart series whose label and value lengths disagree", () => {
  const artifact = validArtifact();
  artifact.chartSeries[0].series[1].values.pop();
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /length/i);
});


test("rejects a marketing gate that claims a losing model beat the baseline", () => {
  const artifact = validArtifact();
  artifact.model.metrics.mae = 120;
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /gate.*MAE|MAE.*gate/i);
});


test("rejects a marketing recommendation whose status contradicts the evidence gate", () => {
  const artifact = validArtifact();
  artifact.model.recommendation.status = "withheld";
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /recommendation status/i);
});


test("rejects a marketing reduction metric that contradicts the published MAE values", () => {
  const artifact = validArtifact();
  artifact.metrics.maeReductionPercent = 99;
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /MAE reduction/i);
});


test("rejects a churn gate that claims a worse Brier score beat the baseline", () => {
  const artifact = validArtifact();
  artifact.lab = "churn-risk";
  artifact.baseline.metrics = { brierScore: 0.11 };
  artifact.model.metrics = {
    brierScore: 0.13,
    topDecileLift: 1.1,
    topDecilePrecision: 0.2,
    expectedMonthlyRevenueAtRisk: 1000
  };
  artifact.metrics = {
    primary: "brierScore",
    evidenceGatePassed: true,
    brierReductionPercent: -18.2
  };
  delete artifact.model.recommendation;
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /gate.*Brier|Brier.*gate/i);
});


test("rejects churn evidence without precision at the declared top-decile capacity", () => {
  const artifact = validArtifact();
  artifact.lab = "churn-risk";
  artifact.baseline.metrics = { brierScore: 0.13 };
  artifact.model.metrics = {
    brierScore: 0.1,
    topDecileLift: 2,
    expectedMonthlyRevenueAtRisk: 1000
  };
  artifact.metrics = {
    primary: "brierScore",
    evidenceGatePassed: true,
    brierReductionPercent: 23.1
  };
  delete artifact.model.recommendation;
  const result = validateLabEvidence(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /precision/i);
});
