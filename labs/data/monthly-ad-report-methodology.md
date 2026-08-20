# Monthly ad report methodology

## What this is

This is a deterministic synthetic demonstration, not client work or a claim of realised advertising performance. It shows the format, testing rule, and budget-reconciliation standard used by the public example.

## Generated inputs

- Seed: `19247`
- Platforms: Meta Ads, Google Ads, and TikTok Ads (names describe generated export formats and do not imply affiliation)
- Ads: 12 generated ads, four per platform
- History: 240 daily observations per ad
- Outcome: generated Shopify-style attributed revenue divided by advertising spend
- Break-even definition: revenue-to-spend ratio of 1.45

The process includes different ad strengths, platform effects, weekly and monthly patterns, slow movement, saturation, lagged performance, and seeded noise. The generated data is cleaner than real advertising and sales exports.

## Forecast check

The regularized regression uses only the first 210 days. It is compared with each ad's trailing 30-day average using the final 30 days, which are not used to fit the model. Both are measured by mean absolute error (MAE) in revenue-to-spend ratio units.

- Simple comparison MAE: 0.0674
- Model MAE: 0.0465
- Recommendation status: shown

A recommendation is released only when model MAE is lower than simple-comparison MAE. Forecast ranges use a 90% residual-based interval from the development period; they are estimates, not guarantees.

## Exact-cent budget allocation

The example starts with a fixed total monthly budget of $125,000.00. Cut, Reduce, Keep, and Increase factors change the relative continuous weights. The weights are scaled back to the fixed total, floored to integer cents, and remaining cents are assigned by largest fractional remainder with stable ad IDs as the final tie-breaker.

Exact-cent reconciliation means the recommended line items add to the supplied budget. It does not mean the performance forecast is exact.

## Limits

- Attributed revenue does not establish causal incrementality.
- Generated platform data does not represent an integration or relationship with Meta, Google, TikTok, or Shopify.
- The example does not support spending outside its generated range.
- Real ad identity, tracking, promotions, inventory, prices, attribution, and market conditions can change.
- A real report can be withheld when history or later-period evidence is inadequate.

## Reproduce

```bash
python3 tools/generate_ad_report.py --output-dir labs/data
```
