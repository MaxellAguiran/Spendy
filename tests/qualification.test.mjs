import test from "node:test";
import assert from "node:assert/strict";
import { buildQualificationMailto } from "../scripts/qualification.mjs";

const fields = {
  full_name: "Ana Example",
  work_email: "ana@example.com",
  company: "Northstar Studio",
  team_type: "Agency",
  website: "https://northstar.example",
  platform_one: "Meta Ads",
  platform_two: "Google Ads",
  monthly_spend: "€25,000–€49,999",
  ad_count: "51–100",
  uses_shopify: "Yes",
  primary_outcome: "ROAS",
  budget_problem: "We need a clearer allocation decision before next month."
};

test("buildQualificationMailto creates a complete encoded audit enquiry", () => {
  const href = buildQualificationMailto(fields);

  assert.equal(
    href,
    "mailto:maxell.aguiran@gmail.com?subject=Spendy%20ROAS%20audit%20qualification%20%E2%80%94%20Northstar%20Studio&body=Spendy%20ROAS%20audit%20qualification%0A%0AFull%20name%3A%20Ana%20Example%0AWork%20email%3A%20ana%40example.com%0ACompany%3A%20Northstar%20Studio%0ATeam%20type%3A%20Agency%0AWebsite%3A%20https%3A%2F%2Fnorthstar.example%0APlatform%201%3A%20Meta%20Ads%0APlatform%202%3A%20Google%20Ads%0ACombined%20monthly%20ad%20spend%3A%20%E2%82%AC25%2C000%E2%80%93%E2%82%AC49%2C999%0AApproximate%20ad%20count%3A%2051%E2%80%93100%0AUses%20Shopify%3A%20Yes%0APrimary%20outcome%3A%20ROAS%0ABudget%20problem%3A%20We%20need%20a%20clearer%20allocation%20decision%20before%20next%20month."
  );
});

test("buildQualificationMailto omits an unused second platform without leaving a blank label", () => {
  const href = buildQualificationMailto({ ...fields, platform_two: "" });
  const decoded = decodeURIComponent(href);

  assert.match(decoded, /Platform 1: Meta Ads/);
  assert.doesNotMatch(decoded, /Platform 2:/);
});
