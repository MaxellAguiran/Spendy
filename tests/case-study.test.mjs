import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  validateCaseStudyEvidence,
  verifyCaseStudyEvidence
} from "../scripts/case-study.mjs";


const periodText = [
  "period_id,label,equal_profit_cents,spendy_profit_cents,difference_cents",
  "1,Weeks 5-8,210000,230000,20000",
  "2,Weeks 9-12,220000,240000,20000"
].join("\n") + "\n";

const periodRows = [
  { period_id: "1", label: "Weeks 5-8", equal_profit_cents: 210000, spendy_profit_cents: 230000, difference_cents: 20000 },
  { period_id: "2", label: "Weeks 9-12", equal_profit_cents: 220000, spendy_profit_cents: 240000, difference_cents: 20000 }
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function checkedArtifact() {
  return {
    schema: "spendy-case-study-evidence/v1",
    engagement: {
      kind: "real-client-engagement",
      displayName: "Anonymous e-commerce advertiser",
      identity: "withheld"
    },
    source: {
      kind: "licensed-public-research",
      title: "Advertising Performance Based on Personalization Breadth and Depth",
      authors: "Semeradova and Weinlich",
      doi: "10.17632/hh7xps83z5.1",
      url: "https://data.mendeley.com/datasets/hh7xps83z5/1",
      license: "CC BY 4.0",
      weekCount: 52,
      setupCount: 36,
      nativeClientExportVerified: false
    },
    simulation: {
      kind: "historical-simulation",
      comparison: "equal-budget-split",
      periodCount: 2,
      coverage: { covered: 72, total: 72 },
      illustrativeBudgetCents: 500000,
      illustrativeMarginBasisPoints: 6000,
      equalProfitCents: 430000,
      spendyProfitCents: 470000,
      advantageCents: 40000,
      realizedClientSavingsCents: null
    },
    artifacts: {
      periodsPath: "data/case-study-periods.csv",
      periodsSha256: sha256(periodText)
    },
    limitations: [
      "The budget and margin assumptions are illustrative.",
      "This is a historical simulation, not realized client savings."
    ]
  };
}


test("accepts an internally consistent anonymous client case study", async () => {
  const artifact = checkedArtifact();
  assert.deepEqual(validateCaseStudyEvidence(artifact, periodRows), { ok: true, errors: [] });
  assert.deepEqual(await verifyCaseStudyEvidence(artifact, periodText), { ok: true, errors: [] });
});


test("rejects a positive result whose arithmetic contradicts the period evidence", () => {
  const artifact = checkedArtifact();
  artifact.simulation.advantageCents = 40001;
  const result = validateCaseStudyEvidence(artifact, periodRows);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /advantage|difference|profit/i);
});


test("rejects any artifact that turns simulated value into realized client savings", () => {
  const artifact = checkedArtifact();
  artifact.simulation.realizedClientSavingsCents = 40000;
  const result = validateCaseStudyEvidence(artifact, periodRows);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /realized|savings/i);
});


test("rejects changed period bytes before a case-study metric can render", async () => {
  const result = await verifyCaseStudyEvidence(checkedArtifact(), `${periodText}# changed\n`);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /hash|period/i);
});
