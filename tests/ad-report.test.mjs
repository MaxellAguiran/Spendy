import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildAdReportView,
  validateAdReportEvidence,
  verifyAdReportDataset
} from "../scripts/ad-report.mjs";


const artifactPath = new URL("../labs/data/monthly-ad-report.json", import.meta.url);
const datasetPath = new URL("../labs/data/monthly-ad-report.csv", import.meta.url);


async function checkedArtifact() {
  return JSON.parse(await readFile(artifactPath, "utf8"));
}


function clone(value) {
  return structuredClone(value);
}


async function assertRejected(mutate, pattern) {
  const artifact = clone(await checkedArtifact());
  mutate(artifact);
  const result = buildAdReportView(artifact);
  assert.equal(result.ok, false);
  assert.equal("view" in result, false);
  if (pattern) assert.match(result.errors.join(" "), pattern);
}


test("builds the ad report view only from checked evidence", async () => {
  const artifact = await checkedArtifact();
  const result = buildAdReportView(artifact);
  assert.equal(result.ok, true);
  assert.equal(result.view.suppliedBudgetCents, result.view.recommendedTotalCents);
  assert.equal(result.view.reconciliationDifferenceCents, 0);
  assert.equal(result.view.ads.length, 12);
  assert.equal(result.view.recommendationStatus, "shown");
  assert.ok(result.view.ads.every((ad) => ["Cut", "Reduce", "Keep", "Increase"].includes(ad.action)));
  assert.ok(result.view.ads.every((ad) => Number.isSafeInteger(ad.currentSpendCents)));
  assert.ok(result.view.ads.every((ad) => Number.isSafeInteger(ad.recommendedSpendCents)));
});


test("accepts the checked artifact and its exact dataset bytes", async () => {
  const artifact = await checkedArtifact();
  assert.deepEqual(validateAdReportEvidence(artifact), { ok: true, errors: [] });
  const bytes = await readFile(datasetPath);
  assert.deepEqual(await verifyAdReportDataset(artifact, bytes), { ok: true, errors: [] });
});


test("rejects an unknown schema", async () => {
  await assertRejected((artifact) => { artifact.schema = "ad-report-evidence/v2"; }, /schema/i);
});


test("rejects a missing generated-data disclosure", async () => {
  await assertRejected((artifact) => { delete artifact.disclosure; }, /disclosure/i);
});


test("rejects non-finite evidence", async () => {
  await assertRejected((artifact) => { artifact.model.metrics.mae = Number.NaN; }, /finite/i);
});


test("rejects missing simple-comparison error", async () => {
  await assertRejected((artifact) => { delete artifact.baseline.metrics.mae; }, /comparison|baseline|MAE/i);
});


test("rejects zero, negative, and unsafe-integer budgets", async () => {
  await assertRejected((artifact) => { artifact.budget.suppliedMonthlyBudgetCents = 0; }, /positive|budget/i);
  await assertRejected((artifact) => { artifact.ads[0].currentSpendCents = -1; }, /negative|cents|spend/i);
  await assertRejected((artifact) => { artifact.ads[0].currentSpendCents = Number.MAX_SAFE_INTEGER + 1; }, /safe integer|cents/i);
});


test("rejects duplicate ads and unknown public categories", async () => {
  await assertRejected((artifact) => { artifact.ads[1].adId = artifact.ads[0].adId; }, /duplicate/i);
  await assertRejected((artifact) => { artifact.ads[0].platform = "Unknown Ads"; }, /platform/i);
  await assertRejected((artifact) => { artifact.ads[0].action = "Pause maybe"; }, /action/i);
});


test("rejects malformed and non-chronological time splits", async () => {
  await assertRejected((artifact) => { artifact.split.holdoutStart = "August 2"; }, /date/i);
  await assertRejected((artifact) => { artifact.split.developmentEnd = artifact.split.holdoutEnd; }, /chronological|later|date/i);
});


test("rejects a losing model that claims a released recommendation", async () => {
  await assertRejected((artifact) => {
    artifact.model.metrics.mae = artifact.baseline.metrics.mae + 0.1;
  }, /gate|recommendation|MAE/i);
});


test("rejects a winning model that withholds or removes recommendations", async () => {
  await assertRejected((artifact) => { artifact.model.recommendationStatus = "withheld"; }, /status|recommendation/i);
  await assertRejected((artifact) => { artifact.ads[0].recommendedSpendCents = null; }, /recommendation|cents/i);
});


test("rejects line-item and one-cent total contradictions", async () => {
  await assertRejected((artifact) => { artifact.ads[0].recommendedSpendCents += 1; }, /line items|total|reconcile/i);
  await assertRejected((artifact) => {
    artifact.budget.recommendedTotalCents -= 1;
    artifact.budget.reconciliationDifferenceCents = -1;
  }, /supplied|total|reconcile/i);
});


test("rejects reversed forecast intervals and inconsistent break-even values", async () => {
  await assertRejected((artifact) => { artifact.ads[0].forecastLow = artifact.ads[0].forecastHigh + 1; }, /interval|forecast/i);
  await assertRejected((artifact) => { artifact.ads[0].breakEvenRoas += 0.01; }, /break-even/i);
});


test("rejects chart values that contradict ad rows", async () => {
  await assertRejected((artifact) => { artifact.chartSeries[0].series[0].values[0] += 1; }, /chart/i);
});


test("rejects malformed hashes and dataset bytes that do not match the artifact", async () => {
  await assertRejected((artifact) => { artifact.artifactHashes.datasetSha256 = "not-a-hash"; }, /hash/i);
  const artifact = await checkedArtifact();
  const result = await verifyAdReportDataset(artifact, new TextEncoder().encode("wrong dataset"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /hash|dataset/i);
});
