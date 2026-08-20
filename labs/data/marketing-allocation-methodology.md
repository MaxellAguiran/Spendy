# Marketing allocation synthetic laboratory

This laboratory is a deterministic synthetic demonstration. It is not a client engagement or evidence of realised business performance.

## Decision

Reallocate a fixed weekly marketing budget across search, social, email, and partnerships while respecting diminishing marginal response.

## Data-generating process

`tools/generate_lab_evidence.py` creates 156 weekly observations with channel spend, annual and shorter seasonality, organic demand, lagged channel carryover, saturating response, and seeded Gaussian noise. The seed is recorded in the evidence artifact.

## Evaluation

The first 130 weeks form the development period. The final 26 weeks are a chronological holdout. The model is a regularized regression over trend, annual seasonality, and logged adstock features. Its declared baseline is revenue from the same week one year earlier. Both are scored on the same holdout using mean absolute error and root mean squared error.

The allocation recommendation is emitted only when holdout model MAE is lower than baseline MAE. If the baseline wins, the artifact records `withheld` and retains the current allocation.

## Limits

The simulation is more regular than a live market, attribution is not causal proof, response curves are unsupported outside the observed spend range, and the recommendation assumes the historical response process and budget constraints remain stable.
