# Spendy lead-funnel operating model

This is the handoff for the evidence-qualified, agency-first funnel. It is an operating checklist, not a substitute for legal, tax, privacy, or data-processing advice.

## Before a production build

1. Create and own the Formspree project and fit-check form. Configure its recipient, anti-spam controls, retention settings, and any data-processing terms that apply to the business.
2. Do not invent a Formspree form ID. Put the real ID in the build environment as `SPENDY_FORMSPREE_FORM_ID`, without the surrounding URL.
3. Create or select the production Plausible site and put its public hostname, without a protocol or path, in `SPENDY_PLAUSIBLE_DOMAIN`.
4. Build the deployable package with `SPENDY_RELEASE_BUILD=1`. This causes the build to reject a missing or malformed form ID or analytics domain; local previews intentionally keep the placeholder and do not submit.
5. Re-read [Privacy](../privacy.html) and [Audit Terms](../audit-terms.html) after the legal entity, tax treatment, invoice process, form processor, or retention period is known. The public price says that applicable tax treatment is confirmed before invoice; do not replace that wording without an owner decision.

## What reaches the inbox

The form is designed to send only:

- business email, agency or company, and public website;
- monthly spend band, selected platform names, Shopify status, and ad-count band;
- optional allocation-decision context; and
- the privacy acknowledgement.

Do not enter raw exports, client names, credentials, API keys, customer-level Shopify records, payment data, or the original free-text submission into a shared CRM or spreadsheet. If a submitted answer contains sensitive material, handle it only through the approved private process and remove the unnecessary copy from the lead record.

## Minimal lead tracker

Create a private, access-controlled tracker with one row per fit check. Suggested columns:

| Field | Purpose |
| --- | --- |
| Received at | Timestamp from the form inbox. |
| Agency / company | Use the submitted business name. |
| Website | Public domain supplied by the lead. |
| Spend band | Triage context, not a qualification promise. |
| Platforms | Check likely compatibility. |
| Shopify status | Check likely scope. |
| Ad-count band | Check the 100-ad fixed scope. |
| Lead stage | `new`, `fit`, `needs clarification`, `not fit`, `paid`, `closed`. |
| Owner | One person accountable for the reply. |
| Next action date | Prevents unreviewed enquiries. |
| Reason / scope note | Short internal rationale; never paste raw sensitive content. |
| Consent / deletion due | Use the 90-day non-engagement review date from the privacy notice. |

## Response standard

Review each fit check within **One business day**. Reply using one of three bounded outcomes:

1. **Likely fit:** confirm the next scope-check step, then issue the invoice only after scope and tax treatment are confirmed.
2. **Needs clarification:** ask only for the missing business-context detail. Do not ask for files, credentials, or customer-level data through the public form thread.
3. **Not fit:** explain the scoped reason briefly and do not encourage an unsupported audit purchase.

After payment, send the exact accepted-data request through the agreed private channel. The three-business-day delivery clock begins only when the requested exports are accepted as complete and usable.

## Thirty-day conversion review

Review aggregate counts at least once after the first 30 days of real traffic. The configured Plausible events are deliberately limited to non-personal context: `landing_view`, `primary_cta_click`, `fit_check_start`, `fit_check_submit`, `sample_report_open`, `methodology_open`, `faq_open`, and `secondary_cta_click`.

Track these aggregate questions:

- Primary CTA click-through rate: `primary_cta_click / landing_view`.
- Fit-check start rate: `fit_check_start / landing_view`.
- Fit-check completion rate: `fit_check_submit / fit_check_start`.
- Lead quality: count of `fit` and `paid` stages relative to submitted fit checks.
- Sales friction: the reasons recorded for `needs clarification` and `not fit`.

Do not put emails, agency names, websites, decision text, or customer data into analytics event properties. Change one major funnel element at a time and retain the before/after dates and denominators before calling an outcome better.
