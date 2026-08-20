# Churn risk synthetic laboratory

This laboratory is a deterministic synthetic demonstration. It is not a client engagement or evidence of realised retention.

## Decision

Prioritise a finite account-outreach capacity using calibrated churn probabilities while keeping model quality separate from intervention effectiveness.

## Data-generating process

`tools/generate_lab_evidence.py` creates 5,000 synthetic account histories containing tenure, 90-day usage change, communication gap, billing change, delivered-performance index, support contacts, monthly revenue, churn outcome, and lead time. The seed is recorded in the evidence artifact.

## Evaluation

Accounts `SYN-00001` through `SYN-04000` form the development cohort. Accounts `SYN-04001` through `SYN-05000` remain untouched until evaluation. A regularized logistic risk model is compared with a constant development-cohort churn-rate baseline using Brier score and log loss. Calibration, precision and lift at finite capacities, expected revenue at risk, and lead-time distribution are reported on the held-out cohort.

## Limits

Risk discrimination does not prove an outreach intervention will prevent churn. Expected revenue at risk is probability-weighted exposure, not saved revenue. False positives impose cost and can create customer fatigue. Calibration requires rechecking after product, pricing, or customer-mix changes.
