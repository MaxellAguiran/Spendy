import test from "node:test";
import assert from "node:assert/strict";
import {
  FORM_ENDPOINT_PLACEHOLDER,
  createFitCheckPayload,
  hasConfiguredFormEndpoint,
} from "../scripts/qualification.mjs";

const completeFields = {
  email: "ana@example.com",
  agency: "Northstar Studio",
  website: "https://northstar.example",
  monthly_spend_band: "€25,000–€49,999",
  platforms: ["Meta Ads", "Google Ads"],
  shopify_status: "Yes",
  ad_count_band: "51–100",
  decision_needed: "Decide whether the current allocation has enough evidence to change next month.",
  privacy_acknowledged: "yes",
  full_name: "Ana Example",
  api_key: "must never leave the browser",
  upload: "client-export.csv",
};

test("createFitCheckPayload forwards only the approved fit-check fields", () => {
  assert.deepEqual(createFitCheckPayload(completeFields), {
    email: "ana@example.com",
    agency: "Northstar Studio",
    website: "https://northstar.example",
    monthly_spend_band: "€25,000–€49,999",
    platforms: "Meta Ads, Google Ads",
    shopify_status: "Yes",
    ad_count_band: "51–100",
    decision_needed: "Decide whether the current allocation has enough evidence to change next month.",
    privacy_acknowledged: "yes",
  });
});

test("createFitCheckPayload omits empty optional text and rejects unapproved values", () => {
  const payload = createFitCheckPayload({ ...completeFields, decision_needed: "   ", tracking_id: "do not send" });

  assert.equal("decision_needed" in payload, false);
  assert.equal("tracking_id" in payload, false);
  assert.equal("api_key" in payload, false);
  assert.equal("upload" in payload, false);
});

test("configured form endpoints must replace the checked-in placeholder", () => {
  assert.equal(hasConfiguredFormEndpoint(FORM_ENDPOINT_PLACEHOLDER), false);
  assert.equal(hasConfiguredFormEndpoint("https://formspree.io/f/abcdwxyz"), true);
  assert.equal(hasConfiguredFormEndpoint("mailto:maxell.aguiran@gmail.com"), false);
});
