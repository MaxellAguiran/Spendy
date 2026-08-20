import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";


const artifactPath = new URL("../labs/data/marketing-allocation.json", import.meta.url);


async function checkedArtifact() {
  return JSON.parse(await readFile(artifactPath, "utf8"));
}


async function build(artifact) {
  const { buildFeaturedCaseView } = await import("../scripts/featured-case.mjs");
  return buildFeaturedCaseView(artifact);
}


test("builds the flagship allocation view from checked evidence", async () => {
  const result = await build(await checkedArtifact());
  assert.equal(result.ok, true);
  assert.deepEqual(result.view.channels, [
    { key: "search", label: "Search", current: 16240.28, recommended: 9008.98 },
    { key: "social", label: "Social", current: 12152.8, recommended: 6684.04 },
    { key: "email", label: "Email", current: 4359.8, recommended: 11397.89 },
    { key: "partner", label: "Partner", current: 8528.96, recommended: 14190.93 }
  ]);
  assert.equal(result.view.currentTotal, 41281.84);
  assert.equal(result.view.recommendedTotal, 41281.84);
  assert.equal(result.view.baselineMae, 15557.89);
  assert.equal(result.view.modelMae, 7777.87);
  assert.equal(result.view.reductionPercent, 50);
  assert.equal(result.view.recommendationStatus, "shown");
});


test("rejects a recommendation that changes the fixed total budget", async () => {
  const artifact = await checkedArtifact();
  artifact.model.recommendation.recommendedWeeklyAllocation.partner += 500;
  const result = await build(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /total budget/i);
});


test("rejects a released recommendation with a zero fixed budget", async () => {
  const artifact = await checkedArtifact();
  const recommendation = artifact.model.recommendation;
  Object.keys(recommendation.currentWeeklyAllocation).forEach((channel) => {
    recommendation.currentWeeklyAllocation[channel] = 0;
    recommendation.recommendedWeeklyAllocation[channel] = 0;
  });
  const allocation = artifact.chartSeries.find((chart) => chart.id === "allocation");
  allocation.series.forEach((series) => { series.values = series.values.map(() => 0); });
  const result = await build(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /positive|greater than zero|budget/i);
});


test("rejects allocation chart values that contradict recommendation values", async () => {
  const artifact = await checkedArtifact();
  artifact.chartSeries.find((chart) => chart.id === "allocation").series[1].values[0] += 100;
  const result = await build(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /allocation chart/i);
});


test("suppresses recommended values when valid evidence withholds the gate", async () => {
  const artifact = await checkedArtifact();
  artifact.model.metrics.mae = 17000;
  artifact.metrics.evidenceGatePassed = false;
  artifact.metrics.maeReductionPercent = -9.3;
  artifact.model.recommendation.status = "withheld";
  const result = await build(artifact);
  assert.equal(result.ok, true);
  assert.equal(result.view.recommendationStatus, "withheld");
  assert.equal(result.view.recommendedTotal, null);
  assert.ok(result.view.channels.every((channel) => channel.recommended === null));
});


test("rejects unknown evidence schemas before exposing case values", async () => {
  const artifact = await checkedArtifact();
  artifact.schema = "lab-evidence/v2";
  const result = await build(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /schema/i);
  assert.equal("view" in result, false);
});


test("rejects missing allocation channels before exposing case values", async () => {
  const artifact = await checkedArtifact();
  delete artifact.model.recommendation.currentWeeklyAllocation.partner;
  const result = await build(artifact);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /partner/i);
});
