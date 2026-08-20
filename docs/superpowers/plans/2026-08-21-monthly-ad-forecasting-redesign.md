# Monthly Ad Forecasting Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Dragon Analytics around one plain-language paid monthly report that forecasts individual ad break-even position for marketing agencies and allocates a supplied fixed monthly budget exactly, in cents, across those ads.

**Architecture:** Keep the deployed site as static HTML, CSS, JavaScript, JSON, CSV, Markdown, fonts, and images. Add a standalone deterministic Python generator for the new `ad-report-evidence/v1` artifact and a dedicated dependency-free JavaScript validator/renderer; retain the existing `lab-evidence/v1` generator and renderer only for legacy examples. Rebuild the homepage and Dragon Analytics page around the validated report, while freezing article bodies and preserving all existing routes and fragments.

**Tech Stack:** Semantic HTML5, consolidated CSS, ES modules, Python 3 standard library, Node.js test runner, Python `unittest`, Playwright, Axe, html-validate, Lighthouse, deterministic Playwright social-card generation.

**Spec:** `docs/superpowers/specs/2026-08-21-monthly-ad-forecasting-redesign-design.md`

## Global Constraints

- Work only in `.worktrees/quietly-exceptional-redesign` on `codex/quietly-exceptional-redesign`.
- Do not merge, push, publish, upload data, message third parties, or add a backend.
- The audience is marketing agencies; the commercial unit is one report for the next agreed month.
- The public deliverable is Cut, Reduce, Keep, or Increase plus exact per-ad monthly spend.
- Forecasts are estimates; only the budget reconciliation is exact.
- Recommendation line items must sum exactly to the supplied budget in integer cents.
- Recommendations are withheld when the model does not beat the declared simple comparison on later data it did not train on.
- Generated examples must be visibly synthetic and must never be described as client performance.
- Remove churn from current sales positioning while preserving `/labs/churn-risk.html` as a noindexed legacy demonstration.
- Keep `/labs/marketing-allocation.html` as an available legacy channel-level demonstration.
- Preserve all existing research URLs and the five frozen normalized `.article-body` SHA-256 hashes.
- Keep the site framework-free, dependency-light, keyboard accessible, usable without JavaScript, and compliant with reduced-motion preferences.
- Use stable `data-*` behavior hooks; JavaScript must not depend on visual class names.

## File Structure

### New files

- `tools/generate_ad_report.py` — deterministic generated ad histories, time split, baseline/model evaluation, exact-cent allocation, CSV/JSON/methodology output.
- `scripts/ad-report.mjs` — `ad-report-evidence/v1` validation, view-model construction, fail-closed loading, and accessible report rendering.
- `labs/monthly-ad-report.html` — canonical generated monthly report route and Dataset structured data.
- `labs/data/monthly-ad-report.csv` — generated day/ad-level public dataset.
- `labs/data/monthly-ad-report.json` — checked `ad-report-evidence/v1` artifact.
- `labs/data/monthly-ad-report-methodology.md` — plain-language and technical reproduction notes.
- `tests/test_ad_report_generation.py` — deterministic-generation, chronology, gate, hashes, and integer-cent contracts.
- `tests/ad-report.test.mjs` — adversarial schema and semantic validator coverage.
- `assets/social/monthly-ad-report.png` — deterministic social preview.

### Modified files

- `package.json` — add ad-report generation and unit-test commands.
- `tests/test_site_contract.py` — new route, proposition, legacy/noindex, metadata, fragment, and no-client-claim contracts.
- `tests/browser.test.mjs` — new five-second hero, report rendering, no-JS, responsive, accessibility, and fail-closed flows.
- `index.html` — new marketing-agency hero, generated sample report, three-step process, founder proof, compact research, report contact.
- `dragon-analytics.html` — focused report-detail/work-with-me page, compatibility anchors, five FAQs, one mascot.
- `labs/marketing-allocation.html` — legacy label and link to the current monthly report.
- `labs/churn-risk.html` — noindex legacy label; remove current-service calls to action.
- `styles.css` — decisive report hierarchy, responsive hero/table/chart/contact styling, reduced card use.
- `tools/social-cards.json` — exact new homepage, Dragon Analytics, and report copy.
- `sitemap.xml` — include the new report and preserve existing routes.
- `404.html`, `writing.html`, and the five article shells — navigation/footer wording only where required; article-body text remains untouched.

### Removed files after migration

- `scripts/featured-case.mjs` — obsolete channel-level homepage renderer.
- `tests/featured-case.test.mjs` — replaced by `tests/ad-report.test.mjs`.

---

### Task 1: Lock the commercial, route, and content contracts

**Files:**
- Modify: `tests/test_site_contract.py`
- Modify: `tests/browser.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `ContractParser`, `parse_page()`, Playwright `openCheckedPage()`.
- Produces: failing contracts for `/labs/monthly-ad-report.html`, the homepage offer, the page order, legacy/noindex treatment, and article immutability.

- [ ] **Step 1: Add the new route and sales-surface text contracts**

Add `"labs/monthly-ad-report.html"` to `PUBLIC_PAGES`. Add a test whose exact assertions are:

```python
def test_current_sales_surfaces_state_the_monthly_ad_report_offer(self):
    homepage = (ROOT / "index.html").read_text(encoding="utf-8")
    work_page = (ROOT / "dragon-analytics.html").read_text(encoding="utf-8")
    combined = f"{homepage}\n{work_page}".casefold()
    for phrase in (
        "marketing agencies",
        "meta ads",
        "google ads",
        "tiktok ads",
        "shopify",
        "fixed monthly ad budget",
        "cut",
        "reduce",
        "keep",
        "increase",
        "down to the cent",
    ):
        self.assertIn(phrase, combined)
    for phrase in ("churn prediction", "customer retention", "accounts to contact"):
        self.assertNotIn(phrase, combined)

def test_legacy_labs_are_preserved_but_not_sold_as_current_services(self):
    churn = (ROOT / "labs/churn-risk.html").read_text(encoding="utf-8")
    marketing = (ROOT / "labs/marketing-allocation.html").read_text(encoding="utf-8")
    self.assertIn('name="robots" content="noindex,follow"', churn)
    self.assertIn("Older generated analytics demonstration", churn)
    self.assertIn("Earlier channel-level generated demonstration", marketing)
    for page in ("index.html", "dragon-analytics.html"):
        source = (ROOT / page).read_text(encoding="utf-8")
        self.assertNotIn('href="labs/churn-risk.html"', source)
```

- [ ] **Step 2: Replace the old homepage browser contract with the five-second contract**

Use these exact required visible phrases and actions:

```js
test("the first screen explains the paid monthly ad report within five seconds", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    const { page } = await openCheckedPage(context, "index.html");
    const hero = page.locator(".hero-copy");
    const text = await hero.innerText();
    assert.match(text, /marketing agencies/i);
    assert.match(text, /Meta Ads/i);
    assert.match(text, /Google Ads/i);
    assert.match(text, /TikTok Ads/i);
    assert.match(text, /Shopify/i);
    assert.match(text, /next month/i);
    assert.match(text, /break-even/i);
    assert.match(text, /exact spend for every ad/i);
    assert.match(text, /fixed monthly ad budget/i);
    assert.deepEqual(await hero.locator(".hero-actions a").allInnerTexts(), ["See a sample report", "Request a report"]);
    const firstAction = await hero.locator(".hero-actions a").first().boundingBox();
    assert.ok(firstAction.y + firstAction.height <= viewport.height);
    await context.close();
  }
});
```

- [ ] **Step 3: Add page-order, no-churn, report-route, and mobile-height assertions**

Update the homepage order expectation to `hero → proof → services → about → research → contact`, retain IDs `proof`, `services`, `about`, and `contact`, require the new report link, and lower the mobile height ceiling:

```js
assert.deepEqual(structure.ids, ["", "proof", "services", "about", "research", "contact"]);
assert.ok(structure.height < (expected.viewport.width === 390 ? 4800 : 3600));
assert.equal(await page.locator("a[href='labs/monthly-ad-report.html']").count() > 0, true);
assert.equal(await page.locator("main").getByText(/churn prediction|customer retention/i).count(), 0);
```

Add the new report to all representative route arrays and assert the Dragon page keeps `#marketing`, `#churn`, `#process`, `#contact`, and `#faq`.

- [ ] **Step 4: Run the focused contracts and confirm they fail for the intended reasons**

Run:

```bash
python3 -m unittest tests.test_site_contract.SiteContractTests.test_current_sales_surfaces_state_the_monthly_ad_report_offer tests.test_site_contract.SiteContractTests.test_legacy_labs_are_preserved_but_not_sold_as_current_services
node --test --test-name-pattern='first screen|homepage presents' tests/browser.test.mjs
```

Expected: FAIL because the new route/copy do not exist, churn remains on current sales pages, and the hero still describes the old two-service offer.

- [ ] **Step 5: Add the future tests to the unit-test command**

Change `test:unit` to:

```json
"test:unit": "node --test tests/lab-evidence.test.mjs tests/ad-report.test.mjs && python3 -m unittest discover -s tests -p 'test_*.py'"
```

Do not run the whole command until `tests/ad-report.test.mjs` exists in Task 3.

- [ ] **Step 6: Commit the red contracts**

```bash
git add tests/test_site_contract.py tests/browser.test.mjs package.json
git commit -m "test: lock monthly ad report positioning"
```

---

### Task 2: Generate deterministic ad-level evidence and exact-cent allocations

**Files:**
- Create: `tools/generate_ad_report.py`
- Create: `tests/test_ad_report_generation.py`
- Create: `labs/data/monthly-ad-report.csv`
- Create: `labs/data/monthly-ad-report.json`
- Create: `labs/data/monthly-ad-report-methodology.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `generate_report(output_dir: Path) -> None`; `reconcile_cents(raw_allocations: dict[str, float], total_cents: int) -> dict[str, int]`; `ad-report-evidence/v1` JSON.
- Consumes: Python 3 standard library only; no network access or client data.

- [ ] **Step 1: Write generator tests before the generator**

Create `tests/test_ad_report_generation.py` with tests that run the generator twice and assert byte-for-byte equality for all three outputs. Lock these semantic assertions:

```python
self.assertEqual(evidence["schema"], "ad-report-evidence/v1")
self.assertEqual(evidence["report"], "monthly-ad-forecast")
self.assertEqual(evidence["disclosure"], "synthetic-demonstration")
self.assertEqual(evidence["split"]["strategy"], "chronological")
self.assertGreater(evidence["split"]["developmentDays"], 0)
self.assertGreater(evidence["split"]["holdoutDays"], 0)
self.assertEqual(evidence["metrics"]["primary"], "mae")
self.assertEqual(
    evidence["metrics"]["evidenceGatePassed"],
    evidence["model"]["metrics"]["mae"] < evidence["baseline"]["metrics"]["mae"],
)
self.assertGreater(evidence["budget"]["suppliedMonthlyBudgetCents"], 0)
if evidence["model"]["recommendationStatus"] == "shown":
    self.assertEqual(
        sum(ad["recommendedSpendCents"] for ad in evidence["ads"]),
        evidence["budget"]["suppliedMonthlyBudgetCents"],
    )
    self.assertEqual(
        evidence["budget"]["recommendedTotalCents"],
        evidence["budget"]["suppliedMonthlyBudgetCents"],
    )
```

Also assert unique ad IDs, allowed platforms/actions, integer non-negative cents, later holdout dates, CSV/hash agreement, generator/hash agreement, finite metrics, and that generated output contains no client names.

- [ ] **Step 2: Run the generator test and verify the missing-generator failure**

Run:

```bash
python3 -m unittest tests.test_ad_report_generation -v
```

Expected: ERROR because `tools/generate_ad_report.py` does not exist.

- [ ] **Step 3: Implement deterministic generated histories and chronological evaluation**

Use these fixed public constants:

```python
GENERATED_AT = "2026-08-21T00:00:00Z"
REPORT_SEED = 19247
FORECAST_MONTH = "2026-09"
PLATFORMS = ("Meta Ads", "Google Ads", "TikTok Ads")
ACTIONS = ("Cut", "Reduce", "Keep", "Increase")
DEVELOPMENT_DAYS = 210
HOLDOUT_DAYS = 30
SUPPLIED_BUDGET_CENTS = 12_500_000
BREAK_EVEN_ROAS = 1.45
```

Implement the exact function boundaries `generate_histories(rng)`, `ridge_fit(features, targets, penalty=0.45)`, `evaluate_forecasts(rows, split_index)`, `classify_action(forecast_low, forecast_point, forecast_high, break_even)`, `reconcile_cents(raw_allocations, total_cents)`, and `generate_report(output_dir)`. The command-line entry point parses `--output-dir` as a `Path`, creates that directory, and calls `generate_report()` once.

Generate 12 stable ads—four per platform—and 240 daily observations per ad. Include `date`, `ad_id`, `ad_name`, `platform`, `spend_cents`, `impressions`, `clicks`, `conversions`, `attributed_revenue_cents`, `observed_roas`, and `cohort`. Use generated platform/ad effects, day-of-week seasonality, slow trend, saturation, lagged performance, and seeded noise.

Fit a regularized regression using only the first 210 days per ad. Compare its holdout ROAS error on the final 30 days with a simple per-ad trailing-average forecast calculated from development data only. Set:

```python
gate_passed = model_mae < baseline_mae
recommendation_status = "shown" if gate_passed else "withheld"
```

Do not alter the seed or process after seeing whether the gate passes. A losing result is published with withheld recommendations.

- [ ] **Step 4: Implement deterministic action and budget rules**

Classify actions from the forecast interval relative to `BREAK_EVEN_ROAS`:

```python
if forecast_high < break_even:
    return "Cut"
if forecast_point < break_even:
    return "Reduce"
if forecast_low > break_even:
    return "Increase"
return "Keep"
```

Build non-negative continuous weights from forecast margin and recent spend, apply zero/minimum/maximum constraints by action, then reconcile the final amounts using integer cents and stable ad IDs as the tie-breaker:

```python
floors = {ad_id: math.floor(value) for ad_id, value in raw_allocations.items()}
remaining = total_cents - sum(floors.values())
order = sorted(raw_allocations, key=lambda ad_id: (-(raw_allocations[ad_id] - floors[ad_id]), ad_id))
for ad_id in order[:remaining]:
    floors[ad_id] += 1
assert sum(floors.values()) == total_cents
```

When the gate fails, write `recommendedSpendCents: null`, `changeCents: null`, and `recommendedTotalCents: null` for all public recommendations.

- [ ] **Step 5: Write the exact artifact and methodology surfaces**

The JSON must include all spec fields plus:

```json
{
  "budget": {
    "suppliedMonthlyBudgetCents": 12500000,
    "currentTotalCents": 12500000,
    "recommendedTotalCents": 12500000,
    "reconciliationDifferenceCents": 0
  },
  "ads": [{
    "adId": "SYN-META-01",
    "adName": "Generated prospecting concept A",
    "platform": "Meta Ads",
    "currentSpendCents": 0,
    "forecastRoas": 0.0,
    "forecastLow": 0.0,
    "forecastHigh": 0.0,
    "breakEvenRoas": 1.45,
    "action": "Cut",
    "recommendedSpendCents": 0,
    "changeCents": 0
  }]
}
```

Values shown as zero in this interface example are generated values in the real artifact, never copied constants. The methodology document must state the seed, generated nature, features, split, comparison, metric definition, gate rule, allocation constraint, cent-reconciliation method, limitations, and exact reproduction command.

- [ ] **Step 6: Generate artifacts and run the focused tests**

Add:

```json
"generate:ad-report": "python3 tools/generate_ad_report.py --output-dir labs/data",
"generate:labs": "python3 tools/generate_lab_evidence.py --output-dir labs/data && python3 tools/generate_ad_report.py --output-dir labs/data"
```

Run:

```bash
npm run generate:ad-report
python3 -m unittest tests.test_ad_report_generation -v
```

Expected: all generation tests PASS and the checked JSON contains only finite JSON numbers.

- [ ] **Step 7: Commit the generator and artifacts**

```bash
git add package.json tools/generate_ad_report.py tests/test_ad_report_generation.py labs/data/monthly-ad-report.csv labs/data/monthly-ad-report.json labs/data/monthly-ad-report-methodology.md
git commit -m "feat: generate monthly ad report evidence"
```

---

### Task 3: Add a fail-closed ad-report validator and renderer

**Files:**
- Create: `scripts/ad-report.mjs`
- Create: `tests/ad-report.test.mjs`
- Remove: `scripts/featured-case.mjs`
- Remove: `tests/featured-case.test.mjs`

**Interfaces:**
- Produces: `validateAdReportEvidence(artifact) -> {ok, errors}`; `buildAdReportView(artifact) -> {ok, errors?, view?}`; `loadAdReports() -> Promise<void>`.
- Consumes: `ad-report-evidence/v1`; DOM roots with `data-ad-report` and `data-evidence-src`.

- [ ] **Step 1: Write a valid fixture and adversarial unit tests**

Load the checked JSON as the valid fixture. Assert the view exposes only validated data:

```js
const result = buildAdReportView(await checkedArtifact());
assert.equal(result.ok, true);
assert.equal(result.view.suppliedBudgetCents, result.view.recommendedTotalCents);
assert.equal(result.view.reconciliationDifferenceCents, 0);
assert.equal(result.view.ads.length, 12);
assert.ok(result.view.ads.every((ad) => ["Cut", "Reduce", "Keep", "Increase"].includes(ad.action)));
```

Clone and mutate the fixture in separate tests for: wrong schema, missing disclosure, `NaN`, missing baseline MAE, zero budget, negative cents, unsafe integer cents, duplicate ad IDs, unknown platform, unknown action, malformed dates, non-chronological split, losing model with `shown`, winning model with `withheld`, missing recommendation with a passing gate, line-item total mismatch, one-cent budget mismatch, forecast interval out of order, per-ad break-even mismatch, dataset-hash mismatch, and generator-hash mismatch.

Every invalid case must assert:

```js
assert.equal(result.ok, false);
assert.equal("view" in result, false);
```

- [ ] **Step 2: Run the tests and confirm the module-not-found failure**

Run:

```bash
node --test tests/ad-report.test.mjs
```

Expected: FAIL because `scripts/ad-report.mjs` does not exist.

- [ ] **Step 3: Implement structural and semantic validation**

Use these exact exports and constants:

```js
const ALLOWED_PLATFORMS = new Set(["Meta Ads", "Google Ads", "TikTok Ads"]);
const ALLOWED_ACTIONS = new Set(["Cut", "Reduce", "Keep", "Increase"]);

export function validateAdReportEvidence(artifact) { /* return { ok, errors } */ }
export function buildAdReportView(artifact) { /* validate first; never return view on error */ }
export async function loadAdReports() { /* load every [data-ad-report] root */ }
```

Derive the expected gate from `model.metrics.mae < baseline.metrics.mae`; never trust `metrics.evidenceGatePassed` or `model.recommendationStatus` independently. Require safe integer cents and exact equality, not floating-point tolerance. Validate ISO dates by parsing and round-tripping the `YYYY-MM-DD` strings, then require `developmentEnd < holdoutStart <= holdoutEnd`.

Hash verification in the browser checks the published dataset with `crypto.subtle.digest("SHA-256", bytes)` before recommendations are rendered. The generator hash remains a static contract tested by Python because the generator source is not a page dependency.

- [ ] **Step 4: Implement view construction and accessible rendering**

The view contains:

```js
{
  currency: "USD",
  forecastMonth: "2026-09",
  suppliedBudgetCents: Number,
  currentTotalCents: Number,
  recommendedTotalCents: Number | null,
  reconciliationDifferenceCents: Number | null,
  baselineMae: Number,
  modelMae: Number,
  errorReductionPercent: Number,
  recommendationStatus: "shown" | "withheld",
  ads: Array<{ adId, adName, platform, currentSpendCents, forecastRoas, forecastLow, forecastHigh, breakEvenRoas, action, recommendedSpendCents, changeCents }>
}
```

Render exact cents with `Intl.NumberFormat` using both `minimumFractionDigits: 2` and `maximumFractionDigits: 2`. Populate `[data-report-value]`, a real `<tbody data-report-rows>`, and `[data-chart="ad-budget-comparison"]`. The chart uses text labels and values; the table remains the canonical accessible representation.

`Current`, `Recommended`, and `Compare` controls use `data-budget-view` and `aria-pressed`. On invalid evidence, hide `[data-report-content]`, show `[data-report-unavailable]`, preserve download links, and remove all recommended values. Network errors follow the same path.

- [ ] **Step 5: Run unit tests and delete the obsolete renderer**

Run:

```bash
node --test tests/ad-report.test.mjs tests/lab-evidence.test.mjs
```

Expected: PASS. Then remove the old files and ensure `rg "featured-case"` returns no production reference after Task 5 completes.

- [ ] **Step 6: Commit the evidence boundary**

```bash
git add scripts/ad-report.mjs tests/ad-report.test.mjs scripts/featured-case.mjs tests/featured-case.test.mjs
git commit -m "feat: validate and render monthly ad reports"
```

---

### Task 4: Build the canonical generated monthly report page

**Files:**
- Create: `labs/monthly-ad-report.html`
- Modify: `styles.css`
- Modify: `tests/browser.test.mjs`
- Modify: `tests/test_site_contract.py`

**Interfaces:**
- Consumes: `scripts/ad-report.mjs`, `labs/data/monthly-ad-report.json`, CSV, methodology.
- Produces: canonical `/labs/monthly-ad-report.html` sales-proof route with Dataset JSON-LD.

- [ ] **Step 1: Add page-first browser and structured-data tests**

Require the H1 and decision copy:

```js
assert.equal(await page.locator("h1").innerText(), "Which ads should receive next month's fixed budget?");
assert.match(await page.locator(".page-hero").innerText(), /marketing agency|fixed monthly budget|break-even/i);
await page.waitForFunction(() => document.querySelector("[data-ad-report]")?.dataset.state === "ready");
assert.equal(await page.locator("[data-report-rows] tr").count(), 12);
assert.equal(await page.locator("[data-report-value='budget-difference']").innerText(), "$0.00");
assert.equal(await page.locator("[data-report-rows] td").getByText(/Cut|Reduce|Keep|Increase/).count() > 0, true);
```

In Python, require one Dataset JSON-LD object whose description includes `generated`, `synthetic`, and `not client performance`.

- [ ] **Step 2: Run focused tests and verify the missing-route failure**

Run:

```bash
python3 -m unittest tests.test_site_contract -v
node --test --test-name-pattern='monthly report' tests/browser.test.mjs
```

Expected: FAIL because `labs/monthly-ad-report.html` is absent.

- [ ] **Step 3: Create semantic page markup in the approved reading order**

The page must include:

```html
<h1>Which ads should receive next month's fixed budget?</h1>
<p>Start with one total monthly budget. Forecast which individual ads may move below or above break-even, then decide what to cut, reduce, keep, or increase.</p>
<p class="generated-disclosure">Generated example using synthetic advertising and sales data. It shows the report format and testing standard—not client performance.</p>
<div data-ad-report data-evidence-src="data/monthly-ad-report.json" data-dataset-src="data/monthly-ad-report.csv" data-state="loading">
  <div data-report-loading role="status">Checking the report…</div>
  <div data-report-unavailable role="status" hidden><h2>Evidence unavailable</h2><p>No recommendation is shown because the report did not pass its checks.</p></div>
  <div data-report-content hidden>
    <table>
      <caption>Current and recommended monthly spend by generated ad</caption>
      <thead><tr><th scope="col">Platform</th><th scope="col">Ad</th><th scope="col">Current spend</th><th scope="col">Forecast relative to break-even</th><th scope="col">Action</th><th scope="col">Next-month recommended spend</th></tr></thead>
      <tbody data-report-rows></tbody>
    </table>
    <div data-chart="ad-budget-comparison" aria-label="Current and recommended monthly spend by ad"></div>
  </div>
</div>
```

Write the full six-column header specified in the design, metric translation, uncertainty note, stop condition, and download/source links. Use `<noscript>` to retain the question, disclosure, test description, and raw file links without favorable values.

- [ ] **Step 4: Add focused report styling**

Add `.report-*` and `.ad-budget-*` selectors for a reserved-height loading state, wide table wrapper, sticky first column only where it does not obscure focus, exact tabular figures, action text/badges, and responsive bar rows. Use terracotta and green according to the design, with written actions always visible.

- [ ] **Step 5: Run route, HTML, browser, no-JS, and Axe checks**

Run:

```bash
npx html-validate labs/monthly-ad-report.html
node --test --test-name-pattern='monthly report|failed.*evidence|without JavaScript|WCAG' tests/browser.test.mjs
python3 -m unittest tests.test_site_contract -v
```

Expected: PASS for the new report assertions; existing homepage/Dragon contracts may remain red until Tasks 5–6.

- [ ] **Step 6: Commit the canonical report page**

```bash
git add labs/monthly-ad-report.html styles.css tests/browser.test.mjs tests/test_site_contract.py
git commit -m "feat: add monthly ad report example"
```

---

### Task 5: Rebuild the homepage around the five-second value proposition

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `tests/browser.test.mjs`
- Modify: `tests/test_site_contract.py`

**Interfaces:**
- Consumes: `scripts/ad-report.mjs`, generated artifact/downloads, existing `scripts/site.mjs`.
- Produces: six-section homepage with `#proof`, `#services`, `#about`, `#research`, and `#contact` compatibility.

- [ ] **Step 1: Run the Task 1 homepage tests and preserve their red output**

Run:

```bash
node --test --test-name-pattern='first screen|homepage presents' tests/browser.test.mjs
python3 -m unittest tests.test_site_contract.SiteContractTests.test_current_sales_surfaces_state_the_monthly_ad_report_offer
```

Expected: FAIL on old H1, churn copy, actions, report source, and height.

- [ ] **Step 2: Replace the hero with the approved exact copy**

Use:

```html
<div class="eyebrow">Ad forecasting for marketing agencies</div>
<h1>Know which ads to cut—and exactly where next month's budget should go.</h1>
<p>Send me your Meta Ads, Google Ads, TikTok Ads, Shopify performance data, and fixed monthly ad budget. I use machine-learning models to estimate which ads may fall below or move above break-even next month, then recommend an exact spend for every ad—down to the cent.</p>
<div class="hero-actions">
  <a class="button" href="#proof">See a sample report</a>
  <a class="button secondary" href="#contact">Request a report</a>
</div>
<p class="hero-honesty">Forecasts are estimates. Recommended ad budgets are reconciled exactly to the total budget you provide.</p>
```

The adjacent desktop panel contains only the four actions, exact per-ad spend, and total-budget reconciliation. It contains no mascot, unvalidated metric, or hard-coded recommendation.

- [ ] **Step 3: Replace the flagship section with the validated ad-level report preview**

Set `data-evidence-src="labs/data/monthly-ad-report.json"` and `data-dataset-src="labs/data/monthly-ad-report.csv"`. Use the single approved generated-data disclosure before `[data-report-content]`. Render the exact table and/or compact chart from the shared module. Link to `labs/monthly-ad-report.html`, CSV, JSON, and methodology.

No recommendation number appears in source HTML. The `Evidence unavailable` branch and `<noscript>` branch preserve all download links.

- [ ] **Step 4: Replace the two-service section with the three-step report workflow**

Use the three approved steps: **Send the history and the budget**, **I forecast and check**, and **Receive the monthly plan**. Mention platform exports, sales data, break-even definition, fixed total budget, later-data check, actions, exact per-ad amounts, uncertainty, and files. Remove every current-service mention of churn.

- [ ] **Step 5: Condense founder, research, contact, footer, and navigation**

Use the fixed founder statement from the spec, integrate the three evidence standards as one short list or sentence, keep no more than three compact research links, and use:

```html
<h2>Request next month's ad forecast and budget plan.</h2>
```

The contact brief asks for platforms, Shopify/sales availability, active-ad count, historical date range, fixed monthly budget, and break-even definition. Update the email subject to `Monthly ad forecast report`. Change navigation labels to **Work**, **Sample report**, **Research**, **About**, and **Request a report**. Remove churn from the footer.

- [ ] **Step 6: Replace old homepage CSS with the concise hierarchy**

Remove `.decision-brief`, old `.case-story`, and channel-allocation-only homepage rules after no remaining selectors use them. Add a two-column hero above 980px, single column below, an explicit mobile hero font/spacing treatment at 520px, one dark report band, divider-led workflow/founder/research surfaces, and a compact contact panel. Keep the first button inside 390×844 and total mobile height below 4,800px.

- [ ] **Step 7: Run homepage unit, browser, no-JS, overflow, and Axe checks**

Run:

```bash
python3 -m unittest tests.test_site_contract -v
node --test --test-name-pattern='first screen|homepage presents|ad report|without JavaScript|overflow|WCAG|transfer' tests/browser.test.mjs
```

Expected: homepage-focused tests PASS with no hard-coded favorable values and no current-service churn text.

- [ ] **Step 8: Commit the homepage rebuild**

```bash
git add index.html styles.css tests/browser.test.mjs tests/test_site_contract.py
git commit -m "feat: make monthly ad reporting the homepage offer"
```

---

### Task 6: Rebuild the work-with-me page and demote legacy labs

**Files:**
- Modify: `dragon-analytics.html`
- Modify: `labs/marketing-allocation.html`
- Modify: `labs/churn-risk.html`
- Modify: `styles.css`
- Modify: `tests/browser.test.mjs`
- Modify: `tests/test_site_contract.py`

**Interfaces:**
- Produces: focused report-detail page; preserved `#marketing`, `#churn`, `#process`, `#contact`, `#faq`; legacy routes with honest status.
- Consumes: new report route, existing mascot, existing disclosure/navigation behavior.

- [ ] **Step 1: Add and run red Dragon/legacy browser assertions**

Require the Dragon H1 to communicate the report directly and assert the first viewport contains `marketing agencies`, `next month`, `break-even`, `exact`, and `Request a report`. Assert exactly one mascot and five FAQs. Assert `#churn` contains `Older generated analytics demonstration` but no service CTA.

Run:

```bash
node --test --test-name-pattern='Dragon Analytics|legacy' tests/browser.test.mjs
```

Expected: FAIL on the broad AI proposition, active churn engagement, and old FAQ copy.

- [ ] **Step 2: Replace Dragon Analytics with the focused report-detail sequence**

Use this hero:

```html
<div class="eyebrow">Monthly ad reports for marketing agencies</div>
<h1>Forecast next month's ads. Allocate the budget before the month begins.</h1>
<p>Give me the ad history, Shopify or equivalent sales results, your break-even definition, and the fixed monthly budget. I return a checked forecast and an exact spend plan for every ad.</p>
<a class="button" href="#contact">Request a report</a>
```

Build sections for what the agency provides, what the report contains, sample report, how the forecast is checked, stop conditions, contact, and FAQ. Use one small mascot beside the process or founder note.

- [ ] **Step 3: Preserve compatibility anchors without selling churn**

Keep `id="marketing"` on the current offer, `id="process"`, `id="contact"`, and `id="faq"`. Use:

```html
<div id="churn" class="legacy-anchor" aria-label="Older churn demonstration">
  <p><strong>Older generated analytics demonstration.</strong> Churn prediction is not part of the current monthly ad-report service.</p>
</div>
```

Do not link this notice to the churn lab from the main commercial flow.

- [ ] **Step 4: Replace FAQs and contact scope**

Use exactly five disclosure questions: required data, useful history, break-even definition, losing simple comparison, and confidential-export handling. State only that the first email scopes the work and that the website collects no project data; do not invent security or retention policy.

- [ ] **Step 5: Mark the old labs as legacy**

On `labs/marketing-allocation.html`, add **Earlier channel-level generated demonstration** above the H1 and link prominently to the current monthly ad report. Remove its commercial contact pitch.

On `labs/churn-risk.html`, add:

```html
<meta name="robots" content="noindex,follow">
```

Place **Older generated analytics demonstration** before the H1, state that it is not a current Dragon Analytics service, and replace its sales CTA with links to the new report and research. Preserve the route, existing evidence, downloads, chart renderer, and technical definitions.

- [ ] **Step 6: Run Dragon/legacy, fragment, no-jargon, Axe, and overflow tests**

Run:

```bash
python3 -m unittest tests.test_site_contract -v
node --test --test-name-pattern='Dragon Analytics|legacy|jargon|navigation|overflow|WCAG' tests/browser.test.mjs
```

Expected: PASS; contact appears before FAQ, mascot count is one, all compatibility fragments resolve, and churn is absent from current sales positioning.

- [ ] **Step 7: Commit the service-page migration**

```bash
git add dragon-analytics.html labs/marketing-allocation.html labs/churn-risk.html styles.css tests/browser.test.mjs tests/test_site_contract.py
git commit -m "feat: focus Dragon Analytics on monthly ad reports"
```

---

### Task 7: Align metadata, social previews, navigation, and discovery

**Files:**
- Modify: `tools/social-cards.json`
- Create: `assets/social/monthly-ad-report.png`
- Modify: `assets/social/home.png`
- Modify: `assets/social/dragon-analytics.png`
- Modify: `index.html`
- Modify: `dragon-analytics.html`
- Modify: `labs/monthly-ad-report.html`
- Modify: `labs/marketing-allocation.html`
- Modify: `labs/churn-risk.html`
- Modify: `writing.html`
- Modify: `404.html`
- Modify: `ibex.html`
- Modify: `firstservice.html`
- Modify: `tamboran.html`
- Modify: `rex.html`
- Modify: `nordic-american-tankers.html`
- Modify: `sitemap.xml`
- Modify: `tests/test_site_contract.py`

**Interfaces:**
- Consumes: deterministic `tools/generate_social_cards.mjs`; current GitHub Pages canonical domain.
- Produces: exact route-positioned title/description/OG/X/JSON-LD/social assets and consistent primary navigation.

- [ ] **Step 1: Add exact metadata contracts**

In `tests/test_site_contract.py`, assert the visible H1 or route proposition appears in title/description/OG/X fields where appropriate. Require `https://maxellaguiran.github.io/labs/monthly-ad-report.html` in sitemap. Require the legacy churn robots directive. Assert there is no `churn` substring in homepage/Dragon title, description, OG, X, JSON-LD, footer, or navigation.

- [ ] **Step 2: Run metadata tests and verify they fail on old positioning**

Run:

```bash
python3 -m unittest tests.test_site_contract.SiteContractTests.test_every_public_page_has_complete_discovery_metadata tests.test_site_contract.SiteContractTests.test_sitemap_robots_and_social_card_dimensions_are_launch_ready -v
```

Expected: FAIL because the new route/card/sitemap entry are absent and old pages still advertise churn.

- [ ] **Step 3: Update social-card configuration with exact copy**

Use:

```json
{"output":"home.png","kicker":"Dragon Analytics · For marketing agencies","title":"Know which ads to cut—and exactly where next month's budget should go.","subtitle":"Next-month forecast · Exact per-ad budget plan"}
{"output":"dragon-analytics.png","kicker":"Work directly with Maxell","title":"Monthly ad forecasting and exact budget plans for marketing agencies.","subtitle":"Meta · Google · TikTok · Shopify","mascot":true}
{"output":"monthly-ad-report.png","kicker":"Generated monthly report example","title":"Which ads should receive next month's fixed budget?","subtitle":"Cut · Reduce · Keep · Increase","signal":"allocation"}
```

Retain the exact five-report research card and all five article cards. Retain legacy lab cards only because their URLs remain public.

- [ ] **Step 4: Update route metadata and truthful structured data**

Homepage Person/ProfilePage `knowsAbout` becomes `Ad forecasting`, `Marketing budget allocation`, `Break-even analysis`, `Machine learning`, and `Company research`. Do not add affiliation. The report Dataset names generated ad and sales data and says it is not client performance. Existing Article objects remain unchanged.

Update legacy page descriptions to identify older generated demonstrations. Preserve self-referential canonicals and the GitHub Pages domain.

- [ ] **Step 5: Apply consistent navigation/footer labels without touching article bodies**

Across public pages, use Work, Sample report, Research, About, and Request a report. Relative links must be correct for root and `/labs/` pages. Update only headers, footers, and metadata on article pages; do not edit inside `.article-body`.

Fix any fragment mismatch found by `test_internal_links_resolve_to_files_or_page_fragments`, including the 404 home/report action.

- [ ] **Step 6: Regenerate and inspect deterministic social cards**

Run:

```bash
npm run generate:social
```

Open `assets/social/home.png`, `assets/social/dragon-analytics.png`, and `assets/social/monthly-ad-report.png`; verify exact spelling, no clipping, readable contrast, 1200×630 dimensions, and no invented text.

- [ ] **Step 7: Run discovery, link, article-hash, and HTML validation**

Run:

```bash
python3 -m unittest tests.test_site_contract tests.test_article_integrity -v
npm run validate:html
```

Expected: PASS with all local files/fragments/downloads resolving and all five article hashes unchanged.

- [ ] **Step 8: Commit the discovery layer**

```bash
git add tools/social-cards.json assets/social index.html dragon-analytics.html labs/monthly-ad-report.html labs/marketing-allocation.html labs/churn-risk.html writing.html 404.html ibex.html firstservice.html tamboran.html rex.html nordic-american-tankers.html sitemap.xml tests/test_site_contract.py
git commit -m "feat: align discovery with monthly ad forecasting"
```

---

### Task 8: Full verification, visual QA, adversarial review, and preview handoff

**Files:**
- Modify only files implicated by reproducible failures.
- Update: `docs/superpowers/plans/2026-08-21-monthly-ad-forecasting-redesign.md` checkboxes as tasks complete.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: clean local branch, verified preview, after-action report, and explicit unpublished handoff.

- [ ] **Step 1: Regenerate all deterministic artifacts and require a clean diff**

Run:

```bash
npm run generate:labs
npm run generate:social
git status --short
```

Expected: no unexpected diff. Any deterministic drift must be explained and committed only if it follows from the checked generator/configuration.

- [ ] **Step 2: Run focused unit, generation, integrity, and HTML suites**

Run:

```bash
npm run test:unit
npm run validate:html
```

Expected: PASS, including adversarial ad-report mutations and frozen article hashes.

- [ ] **Step 3: Run browser tests in bounded groups**

Run:

```bash
node --test --test-name-pattern='first screen|homepage presents|Dragon Analytics|monthly report|legacy' tests/browser.test.mjs
node --test --test-name-pattern='overflow|navigation|without JavaScript|reduced motion|WCAG' tests/browser.test.mjs
node --test --test-name-pattern='failed.*evidence|transfer|research hub|lab artifacts' tests/browser.test.mjs
```

Expected: all groups PASS without console errors.

- [ ] **Step 4: Start a local preview and inspect required pages**

Run:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Inspect homepage, Dragon Analytics, monthly report, both legacy labs, research hub, and two research articles at 390×844, 430×932, 768×1024, 1280×720, and 1440×900. Confirm the value proposition is clear within five seconds, table values are legible, no section feels duplicated, the dark report band is the sole dominant high-contrast moment, and the mascot appears once only.

- [ ] **Step 5: Run representative Lighthouse audits**

Run:

```bash
npm run audit:lighthouse
```

Expected: representative pages target at least 95 in performance, accessibility, best practices, and SEO; homepage transfer stays below 500 KB where practical. Treat a miss as a failure to investigate, not a number to hide.

- [ ] **Step 6: Request independent adversarial review**

The review prompt must ask for concrete P0–P3 findings only and specifically attack:

- misleading business or platform-affiliation claims;
- false certainty between forecast and exact-cent allocation;
- gate/recommendation contradictions;
- zero/negative/unsafe-integer budgets;
- one-cent reconciliation mismatches;
- malformed/duplicated ads;
- no-JS favorable-number leakage;
- broken legacy routes/fragments;
- mobile first-screen proposition and overflow;
- keyboard/focus/table/chart accessibility; and
- article-body changes.

Fix each reproducible material finding with a failing test first, run the focused test, then rerun the relevant broad group.

- [ ] **Step 7: Run final completion evidence**

Run:

```bash
npm test
git diff --check
git status --short --branch
git log --oneline --decorate -12
```

Expected: `npm test` PASS, no whitespace errors, clean worktree, and only the intended branch commits.

- [ ] **Step 8: Commit any bounded review fixes and prepare the after-action report**

If review fixes were needed, the worktree contains only the bounded reviewed changes because every earlier task ended in a clean commit. Stage those tracked changes and commit them:

```bash
git add -u
git commit -m "fix: harden monthly ad report release"
```

The handoff reports: what changed, exact service now communicated, evidence/gate behavior, generated artifact metrics without implying client performance, routes preserved, test commands/results, responsive/visual findings, Lighthouse results, review findings/fixes, commit list, and the explicit statement that nothing was pushed, merged, or published.

Do not publish. Ask Maxell to approve the local preview as the separate release gate.
