# Dragon Analytics Monthly Ad Forecasting Redesign

**Status:** Approved direction, ready for implementation planning
**Date:** 2026-08-21
**Branch:** `codex/quietly-exceptional-redesign`
**Publication boundary:** Local preview only until Maxell approves publication

## 1. Executive decision

The current site is technically credible but still makes a business owner work too hard to understand what Dragon Analytics sells. The next rebuild will stop presenting a broad analytics practice and sell one concrete, easy-to-repeat service:

> Dragon Analytics helps marketing agencies decide which individual ads to cut, reduce, keep, or increase next month—and how much of a fixed monthly advertising budget to assign to each ad.

The agency supplies historical advertising-platform data, Shopify or equivalent sales-performance data, its break-even definition, and the fixed total advertising budget for the coming month. Maxell analyzes the history with a machine-learning forecasting model, checks the model against a simple comparison on later data that was not used to fit it, and delivers a paid monthly report.

The report contains:

- a forecast of which ads may move below or above break-even during the coming month;
- a plain-language action for each ad: **Cut**, **Reduce**, **Keep**, or **Increase**;
- an exact recommended spend for each ad for the coming month; and
- an allocation whose line items reconcile exactly, in integer cents, to the fixed total budget supplied by the agency.

Customer-churn prediction will no longer be marketed as a current service. Equity research remains a separate body of supporting evidence.

## 2. Positioning and audience

### Primary buyer

The primary buyer is a marketing-agency owner, performance lead, or media buyer managing recurring paid-advertising budgets across platforms such as Meta Ads, Google Ads, and TikTok Ads for ecommerce clients.

The site may also be understandable to an ecommerce operator managing advertising directly, but agency work is the explicit lead positioning. It must not imply a formal affiliation, integration partnership, certification, or endorsement from Meta, Google, TikTok, Shopify, or any other platform.

### Hireable offer

The hireable unit is one report covering the next calendar or agreed 30-day month. The site will not introduce subscriptions, retainers, prices, guaranteed turnaround times, or automated platform integrations unless Maxell separately approves real commercial terms.

### Desired five-second understanding

A business owner should be able to answer all four questions immediately:

1. **Who is this for?** Marketing agencies.
2. **What does Maxell do?** Forecasts individual ad performance for the coming month.
3. **What decision does the report support?** Which ads to cut, reduce, keep, or increase.
4. **What is the concrete output?** An exact per-ad budget plan that equals the agency's fixed total monthly budget.

### Plain-language rule

Commercial copy leads with the decision and deliverable. Terms such as model, baseline, holdout, calibration, MAE, schema, artifact, and validation may appear only where they help substantiate the work, and must be translated immediately into ordinary business language.

Examples:

- Prefer **“tested on later data it had not seen”** to **“chronological holdout validation.”**
- Prefer **“simple comparison”** to **“baseline”** in sales copy.
- Prefer **“average forecast error”**, followed by **“MAE”** in evidence details.
- Prefer **“the report is withheld when the model does not improve on the simple comparison”** to **“the evidence gate failed.”**

## 3. Claims and honesty boundaries

The site may claim that the report is designed to forecast next-month break-even position and produce an exact budget allocation. It may not claim that the forecast knows future performance exactly.

The following distinction must remain explicit:

- Forecast probabilities, ranges, and break-even classifications are estimates with uncertainty.
- Recommended spend is operationally precise because integer-cent line items are reconciled to the supplied fixed budget.

The public site must not claim or imply:

- guaranteed profitability, revenue, return on ad spend, or performance improvement;
- exact foreknowledge of ad results;
- causal incrementality from observational platform data alone;
- realised client results or a client engagement when demonstrating generated data;
- proprietary access to advertising platforms or Shopify;
- a relationship with named platforms, employers, clients, private research systems, or private projects; or
- performance from betting, private alpha work, or unpublished forecasting systems.

If the available history, outcome definition, or test evidence cannot support a responsible recommendation, the public example and the intended service workflow must allow **No recommendation** instead of manufacturing an allocation.

## 4. Homepage experience

The homepage will become a short, founder-led sales page in this order:

1. Hero
2. Sample monthly report (`#proof`)
3. How the report works (`#services`)
4. Why work with Maxell (`#about`)
5. Compact research proof
6. Request a report (`#contact`)

Existing fragment IDs remain valid even though their visible labels change.

### Hero

Use this copy as the fixed anchor:

**Eyebrow**

> Ad forecasting for marketing agencies

**Headline**

> Know which ads to cut—and exactly where next month's budget should go.

**Supporting copy**

> Send me your Meta Ads, Google Ads, TikTok Ads, Shopify performance data, and fixed monthly ad budget. I use machine-learning models to estimate which ads may fall below or move above break-even next month, then recommend an exact spend for every ad—down to the cent.

**Actions**

- Primary: **See a sample report**
- Secondary: **Request a report**

**Honesty note**

> Forecasts are estimates. Recommended ad budgets are reconciled exactly to the total budget you provide.

The desktop hero includes a compact report-summary panel with only three ideas:

- Cut · Reduce · Keep · Increase
- Exact recommended spend for every ad
- Recommended total equals supplied budget

The current evidence-heavy hero panel, mascot, biography, research cards, and technical chart are removed from the first screen.

On a 390×844 viewport, the written name, audience, complete offer, explanation, and both actions must appear within or immediately adjacent to the first viewport. The first action must be visible without scrolling.

### Sample monthly report

This is the sole dominant proof story and the only dark, high-contrast homepage band.

Use this disclosure once before favorable figures:

> Generated example using synthetic advertising and sales data. It shows the report format and testing standard—not client performance.

The sample table contains:

| Field | Requirement |
| --- | --- |
| Platform | Meta Ads, Google Ads, or TikTok Ads in the generated example |
| Ad | Human-readable generated ad name or stable generated identifier |
| Current monthly spend | Exact currency value derived from the checked artifact |
| Forecast relative to break-even | Plain-language range or status, with uncertainty available |
| Action | Cut, Reduce, Keep, or Increase |
| Next-month recommended spend | Exact currency value derived from integer cents |

The section also states the supplied total budget, the recommended total, and their zero-cent difference. It may show the exact change by ad. Color is supportive only:

- muted terracotta for Cut and Reduce;
- interactive green for Keep and Increase; and
- text and symbols for every status.

The default view is a readable table. A restrained chart may compare current and recommended spend, but cannot replace exact values. The section provides direct downloads for generated CSV data, checked evidence JSON, and methodology.

No recommendation or favorable metric appears in the HTML fallback before browser validation. With JavaScript disabled, visitors still see the business question, generated-data disclosure, test design, and download links.

### How the report works

Use three steps, with no separate methodology-card grid:

1. **Send the history and the budget.** The agency supplies Meta Ads, Google Ads, TikTok Ads, or similar exports; Shopify or equivalent sales data; its break-even definition; and the fixed total budget for the next month.
2. **I forecast and check.** Maxell estimates next-month break-even position for each ad and checks whether the model improves on a simple comparison using later data it did not train on.
3. **Receive the monthly plan.** The agency receives Cut, Reduce, Keep, or Increase for each ad; exact per-ad budget amounts; forecast uncertainty; assumptions; limits; and reproducible input/output files.

A short suitability note explains that useful history needs consistent ad identity, spend and outcome records, and enough time coverage to test later periods honestly.

### Why work with Maxell

Use this founder statement:

> I build every report myself. There is no sales handoff and no black-box recommendation without an explanation. If the available history cannot support a responsible forecast, I will say so rather than manufacture an answer.

The section may briefly mention years spent studying prediction across markets, quantitative research, sports forecasting, company analysis, and business modeling, but it must remain secondary to the commercial offer. Three standards are integrated into the prose rather than displayed as another card grid:

- a simple comparison gets the first chance to win;
- later periods stay out of model fitting; and
- uncertainty and failure conditions remain in the handover.

### Research proof

Research is introduced as one compact secondary proof layer:

> I also publish independent company research built from original sources, explicit assumptions, valuation scenarios, and clear reasons a thesis could be wrong.

Show no more than three compact report links plus one link to the five-report library. Do not give research equal visual weight with the sample advertising report. Existing research facts, article bodies, URLs, hashes, conclusions, and disclosures remain frozen.

### Contact

Use this heading:

> Request next month's ad forecast and budget plan.

Ask the visitor to include:

- advertising platforms in scope;
- whether Shopify or equivalent sales data is available;
- approximate number of active ads;
- historical date range available;
- fixed total budget for the coming month; and
- how break-even is currently defined.

Retain direct email, accessible Copy email feedback, and the no-form/no-tracking approach. The initial email begins scoping only. The public site will not request confidential exports through a web form or provide an upload mechanism.

## 5. Dragon Analytics page

`dragon-analytics.html` becomes the focused **work with me** and report-detail page rather than a broad services page.

Use this structure:

1. Direct monthly-ad-forecasting proposition
2. What the agency provides
3. What the report contains
4. Sample report link or compact preview
5. How the forecast is checked
6. Stop conditions
7. Five short FAQs
8. Request-report contact

The first viewport identifies marketing agencies, one-month ad forecasting, exact per-ad allocation, and the primary **Request a report** action.

The page retains existing fragment destinations:

- `#marketing` points to the report offer;
- `#process` points to the three-step workflow;
- `#contact` points to request-a-report contact;
- `#faq` points to the compact FAQ; and
- `#churn` remains as a compatibility anchor attached to a short legacy-work notice, without presenting churn as a current service.

The existing mascot appears once as a small editorial signature beside the process or founder note. It is not used in the homepage hero, sample report, repeated cards, or social imagery unless it is already part of an established site-wide composition.

FAQ topics are limited to:

1. What data is required?
2. How much history is useful?
3. How is break-even defined?
4. What happens if the model does not beat the simple comparison?
5. How are confidential exports handled?

Public copy will not promise security, retention, deletion, turnaround, or contractual handling practices that have not been established as real policy.

## 6. Worked-example routes and route compatibility

### New canonical sales proof

Add:

- `/labs/monthly-ad-report.html`

This is the canonical generated example for the current service. It leads with:

> Which ads should receive next month's fixed budget?

Its reading order is:

1. decision and fixed-budget constraint;
2. generated-data disclosure;
3. current versus recommended per-ad allocation;
4. forecast status relative to break-even;
5. simple-comparison versus model evidence;
6. assumptions, uncertainty, and stop conditions;
7. downloadable CSV, JSON, methodology, and source links.

### Existing marketing route

Preserve `/labs/marketing-allocation.html`. It becomes a compatibility page for the older channel-level generated demonstration, clearly marked as an earlier analytics example and linked to the new ad-level monthly report. It is removed from primary commercial navigation. Its existing evidence remains available and is not rewritten to impersonate the new service.

### Existing churn route

Preserve `/labs/churn-risk.html` to avoid breaking links. Remove it from current sales navigation and service positioning. Label it an older generated analytics demonstration and add `noindex,follow`. Do not delete its evidence, downloads, or accessible explanations.

### Research routes

Preserve the research hub and all five article URLs. No normalized `.article-body` text, rating, target, date, reference price, valuation method, scenario range, conclusion, source-review marker, structured data, or disclaimer changes are authorized by this redesign.

## 7. Evidence and reproducibility design

The ad-level monthly report has a different semantic contract from the existing channel-level `lab-evidence/v1` artifact. It therefore uses a new versioned interface rather than weakening or overloading the current validator.

### Artifact interface

```json
{
  "schema": "ad-report-evidence/v1",
  "report": "monthly-ad-forecast",
  "generatedAt": "ISO-8601 timestamp",
  "seed": 0,
  "disclosure": "synthetic-demonstration",
  "currency": "USD",
  "forecastMonth": "YYYY-MM",
  "dataset": {},
  "split": {},
  "breakEven": {},
  "baseline": {},
  "model": {},
  "metrics": {},
  "budget": {},
  "ads": [],
  "limitations": [],
  "artifactHashes": {}
}
```

Required semantics include:

- deterministic generated ad histories across Meta Ads, Google Ads, and TikTok Ads;
- generated Shopify-style sales outcome data joined through stable generated identifiers;
- spend and budget stored as integer cents wherever exact reconciliation matters;
- an explicit definition of break-even used in the example;
- a chronological development/test split, with later observations excluded from fitting;
- a transparent simple comparison, such as recent or seasonal historical performance;
- a deterministic machine-learning forecasting model produced by checked-in Python tooling with no runtime backend;
- model and simple-comparison metrics calculated from the held-out period;
- an evidence decision derived from the metrics, not trusted as an independent favorable flag;
- per-ad forecast interval or uncertainty field;
- only four allowed public actions: Cut, Reduce, Keep, and Increase;
- current spend, recommended spend, and change in integer cents for each ad;
- a supplied total monthly budget in cents; and
- a recommended total that equals the supplied total exactly when recommendations are released.

The generator must not tune or regenerate synthetic evidence merely to manufacture a favorable result. If the first fixed generated process does not beat its declared simple comparison, the example publishes **No recommendation** and the result remains useful as evidence of the stop rule.

### Exact-cent allocation

The allocation starts from a continuous constrained recommendation but is published in integer cents. Deterministic largest-remainder reconciliation, with stable ad identifiers as the final tie-breaker, assigns any remaining cents. The following invariant must hold:

```text
sum(recommendedSpendCents for every ad) == suppliedMonthlyBudgetCents
```

Exact-cent reconciliation does not make the underlying forecast exact. The UI must keep those two ideas separate.

### Fail-closed validator

Add a dedicated validator and homepage/report renderer using stable data hooks. Evidence is rejected when any of the following occurs:

- unknown schema or report type;
- missing or incorrect generated-data disclosure;
- missing, negative, unsafe-integer, or non-finite monetary/metric value;
- empty or duplicated ad identifiers;
- unknown platform or action;
- inconsistent chronological split;
- missing simple-comparison metric;
- model result that does not actually beat the declared comparison while claiming release;
- passing evidence with a withheld/absent recommendation, or failing evidence with a shown recommendation;
- inconsistent ad lists or series lengths;
- a non-positive supplied budget;
- any current or recommended total inconsistent with its line items;
- recommended total differing from the supplied total by even one cent;
- a required hash mismatch; or
- network or asset failure.

Rejected evidence renders **Evidence unavailable**, suppresses all recommended amounts and favorable model figures, and retains raw JSON, CSV, methodology, and source-code links. It never silently substitutes hand-written example numbers.

### Stable DOM interfaces

Use behavior hooks independent of visual class names:

- `data-ad-report`
- `data-report-value`
- `data-report-action`
- `data-budget-view`
- `data-chart="ad-budget-comparison"`
- existing `data-copy-email`, `data-nav-toggle`, and disclosure hooks

Chart dimensions are reserved before evidence loads. Accessible narration and a complete data table remain available. Keyboard controls, if used, provide **Current**, **Recommended**, and **Compare** views with correct pressed/selected state.

## 8. Visual and interaction direction

Retain the established warm-white, sage, deep-forest, terracotta, Fraunces, Manrope, angular dragon mark, and refined editorial tone.

Change the visual hierarchy as follows:

- Fraunces is reserved for the homepage hero, sample-report headline, founder pull quote, and research article display titles.
- Manrope handles all service headings, report labels, controls, navigation, metrics, and body copy.
- The sample-report section is the only dominant dark-forest band on the homepage.
- Terracotta represents Cut, Reduce, and warnings.
- Green represents Keep, Increase, confirmed reconciliation, and primary actions.
- Every action uses text and/or an icon in addition to color.
- General surfaces use 12–16 pixel radii; the sample report and contact panel may be larger.
- Dividers and spacing replace unnecessary nested cards.
- Section spacing stays at or below roughly 72 pixels desktop and 56 pixels mobile.
- The homepage mobile height target is below approximately 4,800 pixels.
- Primary copy is immediately visible; it does not depend on intersection-reveal fades.
- Motion is limited to one-time chart drawing and 2–3 pixel hover movement.
- Reduced-motion users receive final chart states with no smooth scroll or timed transition.

The site continues to provide strong two-color `:focus-visible` styling, semantic headings, keyboard navigation, chart summaries, accessible tables, and no horizontal overflow at 390×844, 430×932, 768×1024, 1280×720, and 1440×900.

## 9. Navigation and metadata

Primary navigation becomes:

- Work
- Sample report
- Research
- About
- Request a report

On the homepage:

- Work targets `#services`;
- Sample report targets `#proof`;
- About targets `#about`; and
- Request a report targets `#contact`.

Page titles, descriptions, Open Graph metadata, X metadata, JSON-LD, deterministic social cards, and sitemap entries must describe the visible ad-forecasting offer accurately.

Recommended exact social-card headlines:

- Homepage: **Know which ads to cut—and exactly where next month's budget should go.**
- Dragon Analytics: **Monthly ad forecasting and exact budget plans for marketing agencies.**
- Sample report: **Which ads should receive next month's fixed budget?**
- Research: retain the existing five-report valuation-and-falsifier positioning.

The homepage retains truthful Person/ProfilePage data. The generated report uses Dataset structured data and makes its synthetic nature visible. Existing Article structured data remains intact. Canonicals continue to use the existing GitHub Pages domain until a custom domain is supplied.

## 10. Test and acceptance contract

Implementation begins with failing contracts, then production code.

### Five-second proposition

- At 390×844, the first screen contains **marketing agencies**, **next month**, **ads**, **break-even**, **exact spend**, **fixed monthly budget**, and both actions.
- The written Maxell Aguiran / Dragon Analytics identity remains recognizable.
- No churn, generic AI pitch, equity-research card, mascot, or technical chart competes with the opening offer.

### Evidence integrity

- Every rendered sample-report value equals the validated `ad-report-evidence/v1` artifact.
- Every monetary line item uses integer cents.
- Recommended line items sum exactly to the supplied budget.
- Recommendation is suppressed for wrong schema, missing disclosure, non-finite or unsafe values, missing comparison metrics, losing model with claimed release, passing model with contradictory withholding, failing model with shown allocation, zero budget, mismatched totals, malformed ads, bad hashes, or network failure.
- Invalid evidence displays **Evidence unavailable** and no recommended per-ad value.
- With JavaScript disabled, no unvalidated favorable value appears.
- Generated-data disclosure precedes results.

### Content and route integrity

- Current commercial pages do not sell churn.
- Public copy contains no client results, testimonial, performance guarantee, platform affiliation, private employer/project/platform name, betting result, proprietary alpha logic, or submission identifier.
- All existing public files and fragments resolve, including the compatibility `#churn` anchor.
- `/labs/monthly-ad-report.html` resolves and is included in sitemap and metadata tests.
- Legacy marketing and churn routes remain available and are absent from primary sales navigation.
- The five normalized article-body SHA-256 values match their checked immutable fixtures.
- Existing research facts, metadata, sources, and disclosures remain present.

### Usability and accessibility

- No horizontal overflow at all required viewports.
- Homepage mobile height is below approximately 4,800 pixels unless a documented accessibility requirement justifies a small variance.
- Keyboard-only navigation reaches every action, report control, disclosure, email control, and download.
- Focus appearance meets the established two-color treatment.
- Tables and chart narration expose all decision-relevant information without color.
- Mobile navigation maintains `aria-expanded` and returns focus.
- Copy-email feedback uses a non-disruptive live region.
- JavaScript-disabled, reduced-motion, failed-mascot, slow-network, and failed-evidence states remain usable.
- Representative pages pass automated WCAG 2.2 AA checks and manual keyboard review with no browser-console errors.

### Performance and visual QA

- Initial homepage transfer remains below 500 KB where practical.
- Representative Lighthouse targets remain at least 95 for performance, accessibility, best practices, and SEO.
- The homepage, Dragon Analytics page, new report, both legacy labs, research hub, and two articles are visually inspected on mobile and desktop.
- The sample report is the only dominant high-contrast homepage section.
- The mascot appears once on the Dragon Analytics page and nowhere else in normal content.
- Metadata, social cards, canonicals, downloads, and internal links are tested.

### Independent review and publication

After implementation and local verification, an independent adversarial review checks claim safety, evidence validation, integer-cent reconciliation, route compatibility, accessibility, and visual hierarchy. Material findings are fixed and re-tested.

No merge, push, GitHub Pages publication, client-data integration, external message, or third-party service is authorized by this design. Publication is a separate user-approved gate after the local preview is accepted.

## 11. Explicit non-goals

This release does not add:

- churn prediction as a current service;
- live Meta, Google, TikTok, or Shopify API connections;
- a data-upload form, account system, backend, database, scheduler, analytics, cookies, or trackers;
- automated monthly billing, subscription language, a price list, or contractual service promises;
- a framework, CMS, SPA, or runtime dependency;
- a new mascot or portrait;
- invented case studies, testimonials, clients, or realized outcomes; or
- factual edits to the existing equity-research articles.

## 12. Locked implementation decisions

- The audience is marketing agencies.
- The commercial unit is one next-month report per hire.
- The input includes platform exports, sales-performance data, break-even definition, and fixed total budget.
- The output is Cut/Reduce/Keep/Increase plus exact per-ad monthly spend.
- The exact-cent allocation must equal the supplied total exactly.
- Forecasts remain estimates and include uncertainty.
- Recommendations are withheld when evidence does not beat the simple comparison.
- The sample uses deterministic generated data and never presents client performance.
- The new evidence contract is `ad-report-evidence/v1`; existing `lab-evidence/v1` artifacts remain intact.
- Churn is removed from current commercial positioning but its public route is preserved as a noindexed legacy demonstration.
- Research remains secondary proof and article bodies remain frozen.
- The site remains static, dependency-light, accessible, and unpublished until preview approval.
