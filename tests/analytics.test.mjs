import test from "node:test";
import assert from "node:assert/strict";
import { prepareAnalyticsEvent } from "../scripts/analytics.mjs";

test("prepareAnalyticsEvent retains only approved conversion context", () => {
  assert.deepEqual(
    prepareAnalyticsEvent("primary_cta_click", {
      cta_location: "hero",
      page_type: "landing",
      email: "ana@example.com",
      company: "Northstar Studio",
      decision_needed: "Move budget",
    }),
    {
      name: "primary_cta_click",
      props: { cta_location: "hero", page_type: "landing" },
    },
  );
});

test("prepareAnalyticsEvent refuses unknown events and unsafe property values", () => {
  assert.equal(prepareAnalyticsEvent("unknown_event", { cta_location: "hero" }), null);
  assert.deepEqual(
    prepareAnalyticsEvent("faq_open", { cta_location: "free-text", page_type: "fit_check" }),
    { name: "faq_open", props: { page_type: "fit_check" } },
  );
});
