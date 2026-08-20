#!/usr/bin/env python3
"""Generate deterministic synthetic datasets and lab-evidence/v1 artifacts."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path


GENERATED_AT = "2026-08-20T00:00:00Z"
MARKETING_SEED = 7319
CHURN_SEED = 4403


def rounded(value, digits=4):
    return round(float(value), digits)


def sha256_bytes(payload):
    return hashlib.sha256(payload).hexdigest()


def solve_linear_system(matrix, vector):
    """Solve a small dense system with partial-pivot Gaussian elimination."""
    size = len(vector)
    augmented = [list(matrix[row]) + [vector[row]] for row in range(size)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError("Singular model matrix")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        scale = augmented[column][column]
        augmented[column] = [value / scale for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            augmented[row] = [
                current - factor * pivot_value
                for current, pivot_value in zip(augmented[row], augmented[column])
            ]
    return [augmented[row][-1] for row in range(size)]


def ridge_fit(features, targets, penalty=0.2):
    width = len(features[0])
    gram = [[0.0 for _ in range(width)] for _ in range(width)]
    rhs = [0.0 for _ in range(width)]
    for row, target in zip(features, targets):
        for left in range(width):
            rhs[left] += row[left] * target
            for right in range(width):
                gram[left][right] += row[left] * row[right]
    for index in range(1, width):
        gram[index][index] += penalty
    return solve_linear_system(gram, rhs)


def dot(left, right):
    return sum(a * b for a, b in zip(left, right))


def mae(actual, predicted):
    return sum(abs(a - p) for a, p in zip(actual, predicted)) / len(actual)


def rmse(actual, predicted):
    return math.sqrt(sum((a - p) ** 2 for a, p in zip(actual, predicted)) / len(actual))


def write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return path.read_bytes()


def write_json(path, artifact):
    payload = (json.dumps(artifact, indent=2, sort_keys=True, allow_nan=False) + "\n").encode()
    path.write_bytes(payload)


def marketing_features(row, index, total):
    angle = 2 * math.pi * index / 52
    return [
        1.0,
        index / total,
        math.sin(angle),
        math.cos(angle),
        math.log1p(row["search_adstock"] / 9000),
        math.log1p(row["social_adstock"] / 7200),
        math.log1p(row["email_adstock"] / 2800),
        math.log1p(row["partner_adstock"] / 5000),
    ]


def generate_marketing(output_dir):
    rng = random.Random(MARKETING_SEED)
    raw_rows = []
    adstock = {"search": 0.0, "social": 0.0, "email": 0.0, "partner": 0.0}
    decays = {"search": 0.45, "social": 0.62, "email": 0.30, "partner": 0.70}
    start = date(2023, 8, 28)

    for index in range(156):
        angle = 2 * math.pi * index / 52
        search = max(5000, 16500 + 2200 * math.sin(angle + 0.4) + rng.gauss(0, 1600))
        social = max(3500, 11900 + 1700 * math.cos(angle - 0.7) + rng.gauss(0, 1300))
        email = max(1200, 4700 + 500 * math.sin(angle * 2) + rng.gauss(0, 450))
        partner = max(2200, 7600 + 1000 * math.cos(angle + 1.1) + rng.gauss(0, 900))
        spends = {"search": search, "social": social, "email": email, "partner": partner}
        for channel in adstock:
            adstock[channel] = spends[channel] + decays[channel] * adstock[channel]

        seasonality = 13500 * math.sin(angle - 0.3) + 6000 * math.cos(angle * 2)
        organic = 142000 + 185 * index + seasonality
        responses = {
            "search": 46500 * math.log1p(adstock["search"] / 9000),
            "social": 32800 * math.log1p(adstock["social"] / 7200),
            "email": 25200 * math.log1p(adstock["email"] / 2800),
            "partner": 37100 * math.log1p(adstock["partner"] / 5000),
        }
        noise = rng.gauss(0, 7200)
        revenue = organic + sum(responses.values()) + noise
        raw_rows.append({
            "week": (start + timedelta(days=7 * index)).isoformat(),
            "search_spend": search,
            "social_spend": social,
            "email_spend": email,
            "partner_spend": partner,
            "seasonality": seasonality,
            "organic_demand": organic,
            "lagged_effect": sum(responses.values()),
            "revenue": revenue,
            "search_adstock": adstock["search"],
            "social_adstock": adstock["social"],
            "email_adstock": adstock["email"],
            "partner_adstock": adstock["partner"],
        })

    split_index = 130
    features = [marketing_features(row, index, len(raw_rows)) for index, row in enumerate(raw_rows)]
    targets = [row["revenue"] for row in raw_rows]
    coefficients = ridge_fit(features[:split_index], targets[:split_index], penalty=0.35)
    predictions = [dot(row, coefficients) for row in features]
    holdout_actual = targets[split_index:]
    holdout_model = predictions[split_index:]
    holdout_baseline = [targets[index - 52] for index in range(split_index, len(targets))]
    baseline_mae = mae(holdout_actual, holdout_baseline)
    model_mae = mae(holdout_actual, holdout_model)
    baseline_rmse = rmse(holdout_actual, holdout_baseline)
    model_rmse = rmse(holdout_actual, holdout_model)
    development_residuals = [a - p for a, p in zip(targets[:split_index], predictions[:split_index])]
    residual_std = math.sqrt(sum(value * value for value in development_residuals) / (split_index - len(coefficients)))
    interval = 1.645 * residual_std
    gate_passed = model_mae < baseline_mae

    channels = ["search", "social", "email", "partner"]
    current = {
        channel: sum(row[f"{channel}_spend"] for row in raw_rows[-8:]) / 8
        for channel in channels
    }
    response_scales = {
        "search": (coefficients[4], 9000),
        "social": (coefficients[5], 7200),
        "email": (coefficients[6], 2800),
        "partner": (coefficients[7], 5000),
    }
    total_budget = sum(current.values())
    minimum = {channel: current[channel] * 0.55 for channel in channels}
    recommended = dict(minimum)
    remaining = total_budget - sum(recommended.values())
    increment = 100.0
    while remaining >= increment:
        best = max(
            channels,
            key=lambda channel: response_scales[channel][0]
            / (response_scales[channel][1] + recommended[channel]),
        )
        recommended[best] += increment
        remaining -= increment
    recommended[max(channels, key=current.get)] += remaining
    if not gate_passed:
        recommended = dict(current)

    csv_rows = []
    for index, row in enumerate(raw_rows):
        cohort = "development" if index < split_index else "holdout"
        csv_rows.append({
            "week": row["week"],
            "cohort": cohort,
            "search_spend": rounded(row["search_spend"], 2),
            "social_spend": rounded(row["social_spend"], 2),
            "email_spend": rounded(row["email_spend"], 2),
            "partner_spend": rounded(row["partner_spend"], 2),
            "seasonality": rounded(row["seasonality"], 2),
            "organic_demand": rounded(row["organic_demand"], 2),
            "lagged_effect": rounded(row["lagged_effect"], 2),
            "noise": rounded(row["revenue"] - row["organic_demand"] - row["lagged_effect"], 2),
            "revenue": rounded(row["revenue"], 2),
        })
    csv_path = output_dir / "marketing-allocation.csv"
    csv_payload = write_csv(csv_path, csv_rows, list(csv_rows[0]))

    holdout_labels = [row["week"] for row in raw_rows[split_index:]]
    allocation_labels = [channel.title() for channel in channels]
    curve_spend = [0, 5000, 10000, 15000, 20000, 25000, 30000]
    curve_series = []
    for channel in channels:
        coefficient, scale = response_scales[channel]
        curve_series.append({
            "name": channel.title(),
            "values": [rounded(max(0, coefficient) * math.log1p(spend / scale), 2) for spend in curve_spend],
        })

    artifact = {
        "schema": "lab-evidence/v1",
        "lab": "marketing-allocation",
        "generatedAt": GENERATED_AT,
        "seed": MARKETING_SEED,
        "disclosure": "synthetic-demonstration",
        "dataset": {
            "rows": len(csv_rows),
            "frequency": "weekly",
            "download": "data/marketing-allocation.csv",
            "fields": list(csv_rows[0]),
        },
        "split": {
            "strategy": "chronological",
            "developmentRows": split_index,
            "holdoutRows": len(csv_rows) - split_index,
            "holdoutStart": raw_rows[split_index]["week"],
            "holdoutEnd": raw_rows[-1]["week"],
        },
        "baseline": {
            "name": "Same week one year earlier",
            "metrics": {"mae": rounded(baseline_mae, 2), "rmse": rounded(baseline_rmse, 2)},
        },
        "model": {
            "name": "Regularized lagged-response regression",
            "features": ["trend", "annual seasonality", "channel adstock", "diminishing returns"],
            "metrics": {"mae": rounded(model_mae, 2), "rmse": rounded(model_rmse, 2)},
            "interval": {"coverageTarget": 0.90, "halfWidth": rounded(interval, 2)},
            "recommendation": {
                "status": "shown" if gate_passed else "withheld",
                "reason": "Holdout model MAE beat the declared baseline." if gate_passed else "Holdout model MAE did not beat the declared baseline.",
                "currentWeeklyAllocation": {key: rounded(value, 2) for key, value in current.items()},
                "recommendedWeeklyAllocation": {key: rounded(value, 2) for key, value in recommended.items()},
            },
        },
        "metrics": {
            "primary": "mae",
            "evidenceGatePassed": gate_passed,
            "maeReductionPercent": rounded(100 * (baseline_mae - model_mae) / baseline_mae, 1),
        },
        "chartSeries": [
            {
                "id": "allocation",
                "title": "Current versus recommended weekly allocation",
                "labels": allocation_labels,
                "series": [
                    {"name": "Current", "values": [rounded(current[channel], 2) for channel in channels]},
                    {"name": "Recommended", "values": [rounded(recommended[channel], 2) for channel in channels]},
                ],
            },
            {
                "id": "response-curves",
                "title": "Estimated channel response and diminishing returns",
                "labels": [str(value) for value in curve_spend],
                "series": curve_series,
            },
            {
                "id": "held-out-revenue",
                "title": "Held-out weekly revenue",
                "labels": holdout_labels,
                "series": [
                    {"name": "Actual", "values": [rounded(value, 2) for value in holdout_actual]},
                    {"name": "Model", "values": [rounded(value, 2) for value in holdout_model]},
                    {"name": "Lower interval", "values": [rounded(value - interval, 2) for value in holdout_model]},
                    {"name": "Upper interval", "values": [rounded(value + interval, 2) for value in holdout_model]},
                ],
            },
            {
                "id": "error-comparison",
                "title": "Holdout error comparison",
                "labels": ["Mean absolute error", "Root mean squared error"],
                "series": [
                    {"name": "Baseline", "values": [rounded(baseline_mae, 2), rounded(baseline_rmse, 2)]},
                    {"name": "Model", "values": [rounded(model_mae, 2), rounded(model_rmse, 2)]},
                ],
            },
        ],
        "limitations": [
            "The data-generating process is synthetic and less irregular than a live market.",
            "Channel response is estimated inside the observed spend range; extrapolation is not supported.",
            "The recommendation assumes the historical response process and budget constraints remain stable.",
            "Revenue attribution is simulated and does not prove incrementality in a real campaign.",
        ],
        "artifactHashes": {
            "datasetSha256": sha256_bytes(csv_payload),
            "generatorSha256": sha256_bytes(Path(__file__).read_bytes()),
        },
    }
    write_json(output_dir / "marketing-allocation.json", artifact)


def sigmoid(value):
    if value >= 0:
        exp_value = math.exp(-value)
        return 1 / (1 + exp_value)
    exp_value = math.exp(value)
    return exp_value / (1 + exp_value)


def fit_logistic(features, outcomes, iterations=700, learning_rate=0.32, penalty=0.03):
    coefficients = [0.0] * len(features[0])
    count = len(features)
    for step in range(iterations):
        gradients = [0.0] * len(coefficients)
        for row, outcome in zip(features, outcomes):
            error = sigmoid(dot(coefficients, row)) - outcome
            for index, value in enumerate(row):
                gradients[index] += error * value
        rate = learning_rate / math.sqrt(1 + step / 140)
        for index in range(len(coefficients)):
            regularizer = 0.0 if index == 0 else penalty * coefficients[index]
            coefficients[index] -= rate * (gradients[index] / count + regularizer)
    return coefficients


def brier_score(outcomes, probabilities):
    return sum((outcome - probability) ** 2 for outcome, probability in zip(outcomes, probabilities)) / len(outcomes)


def log_loss(outcomes, probabilities):
    clipped = [min(1 - 1e-12, max(1e-12, value)) for value in probabilities]
    return -sum(
        outcome * math.log(probability) + (1 - outcome) * math.log(1 - probability)
        for outcome, probability in zip(outcomes, clipped)
    ) / len(outcomes)


def generate_churn(output_dir):
    rng = random.Random(CHURN_SEED)
    records = []
    for account_id in range(1, 5001):
        tenure = rng.randint(2, 84)
        usage_change = max(-0.95, min(0.75, rng.gauss(-0.05, 0.27)))
        communication_gap = max(1, min(120, int(rng.gauss(25, 20))))
        billing_change = 1 if rng.random() < 0.16 else 0
        delivered_performance = max(0.35, min(1.25, rng.gauss(0.91, 0.14)))
        support_contacts = min(10, int(rng.expovariate(0.55)))
        monthly_revenue = max(180, min(18000, rng.lognormvariate(7.25, 0.75)))
        score = (
            -2.65
            - 1.85 * usage_change
            + 0.021 * communication_gap
            + 0.92 * billing_change
            - 1.35 * (delivered_performance - 0.8)
            + 0.13 * support_contacts
            - 0.007 * tenure
            + rng.gauss(0, 0.28)
        )
        probability = sigmoid(score)
        churn = 1 if rng.random() < probability else 0
        if churn:
            lead_time = max(7, min(180, int(112 + 68 * usage_change - 0.45 * communication_gap + rng.gauss(0, 22))))
        else:
            lead_time = 0
        records.append({
            "account_id": f"SYN-{account_id:05d}",
            "tenure_months": tenure,
            "usage_change_90d": usage_change,
            "communication_gap_days": communication_gap,
            "billing_change": billing_change,
            "delivered_performance_index": delivered_performance,
            "support_contacts_90d": support_contacts,
            "monthly_revenue": monthly_revenue,
            "churned_120d": churn,
            "lead_time_days": lead_time,
        })

    feature_names = [
        "tenure_months",
        "usage_change_90d",
        "communication_gap_days",
        "billing_change",
        "delivered_performance_index",
        "support_contacts_90d",
        "monthly_revenue",
    ]
    split_index = 4000
    means = {name: sum(row[name] for row in records[:split_index]) / split_index for name in feature_names}
    stds = {}
    for name in feature_names:
        variance = sum((row[name] - means[name]) ** 2 for row in records[:split_index]) / split_index
        stds[name] = math.sqrt(variance) or 1.0

    def feature_row(record):
        return [1.0] + [(record[name] - means[name]) / stds[name] for name in feature_names]

    features = [feature_row(record) for record in records]
    outcomes = [record["churned_120d"] for record in records]
    coefficients = fit_logistic(features[:split_index], outcomes[:split_index])
    probabilities = [sigmoid(dot(coefficients, row)) for row in features]
    training_rate = sum(outcomes[:split_index]) / split_index
    holdout_outcomes = outcomes[split_index:]
    holdout_probabilities = probabilities[split_index:]
    baseline_probabilities = [training_rate] * len(holdout_outcomes)
    model_brier = brier_score(holdout_outcomes, holdout_probabilities)
    baseline_brier = brier_score(holdout_outcomes, baseline_probabilities)
    model_log_loss = log_loss(holdout_outcomes, holdout_probabilities)
    baseline_log_loss = log_loss(holdout_outcomes, baseline_probabilities)

    ranked = sorted(
        zip(records[split_index:], holdout_outcomes, holdout_probabilities),
        key=lambda item: item[2],
        reverse=True,
    )
    capacity = max(1, len(ranked) // 10)
    top = ranked[:capacity]
    prevalence = sum(holdout_outcomes) / len(holdout_outcomes)
    precision = sum(outcome for _, outcome, _ in top) / capacity
    lift = precision / prevalence
    revenue_at_risk = sum(record["monthly_revenue"] * probability for record, _, probability in ranked)

    calibration_labels = []
    calibration_predicted = []
    calibration_observed = []
    for bin_index in range(10):
        lower = bin_index / 10
        upper = (bin_index + 1) / 10
        members = [
            (outcome, probability)
            for outcome, probability in zip(holdout_outcomes, holdout_probabilities)
            if lower <= probability < upper or (bin_index == 9 and probability == 1)
        ]
        calibration_labels.append(f"{lower:.1f}–{upper:.1f}")
        if members:
            calibration_predicted.append(sum(value for _, value in members) / len(members))
            calibration_observed.append(sum(value for value, _ in members) / len(members))
        else:
            calibration_predicted.append((lower + upper) / 2)
            calibration_observed.append(0.0)

    capacity_labels = ["5%", "10%", "20%", "30%"]
    capacity_precision = []
    capacity_lift = []
    for fraction in (0.05, 0.10, 0.20, 0.30):
        count = max(1, int(len(ranked) * fraction))
        observed = sum(outcome for _, outcome, _ in ranked[:count]) / count
        capacity_precision.append(observed)
        capacity_lift.append(observed / prevalence)

    lead_buckets = [0, 0, 0, 0]
    for record, outcome, _ in ranked:
        if not outcome:
            continue
        lead = record["lead_time_days"]
        if lead <= 30:
            lead_buckets[0] += 1
        elif lead <= 60:
            lead_buckets[1] += 1
        elif lead <= 90:
            lead_buckets[2] += 1
        else:
            lead_buckets[3] += 1

    csv_rows = []
    for index, (record, probability) in enumerate(zip(records, probabilities)):
        csv_rows.append({
            "account_id": record["account_id"],
            "cohort": "development" if index < split_index else "holdout",
            "tenure_months": record["tenure_months"],
            "usage_change_90d": rounded(record["usage_change_90d"], 4),
            "communication_gap_days": record["communication_gap_days"],
            "billing_change": record["billing_change"],
            "delivered_performance_index": rounded(record["delivered_performance_index"], 4),
            "support_contacts_90d": record["support_contacts_90d"],
            "monthly_revenue": rounded(record["monthly_revenue"], 2),
            "churned_120d": record["churned_120d"],
            "lead_time_days": record["lead_time_days"],
            "model_probability": rounded(probability, 6),
        })
    csv_path = output_dir / "churn-risk.csv"
    csv_payload = write_csv(csv_path, csv_rows, list(csv_rows[0]))

    gate_passed = model_brier < baseline_brier
    artifact = {
        "schema": "lab-evidence/v1",
        "lab": "churn-risk",
        "generatedAt": GENERATED_AT,
        "seed": CHURN_SEED,
        "disclosure": "synthetic-demonstration",
        "dataset": {
            "rows": len(csv_rows),
            "unit": "synthetic account",
            "download": "data/churn-risk.csv",
            "fields": list(csv_rows[0]),
        },
        "split": {
            "strategy": "account-held-out",
            "developmentAccounts": split_index,
            "holdoutAccounts": len(records) - split_index,
            "assignment": "Account IDs SYN-04001 through SYN-05000 were untouched during fitting.",
        },
        "baseline": {
            "name": "Constant development-cohort churn rate",
            "rate": rounded(training_rate, 6),
            "metrics": {
                "brierScore": rounded(baseline_brier, 6),
                "logLoss": rounded(baseline_log_loss, 6),
            },
        },
        "model": {
            "name": "Regularized logistic risk model",
            "features": feature_names,
            "metrics": {
                "brierScore": rounded(model_brier, 6),
                "logLoss": rounded(model_log_loss, 6),
                "topDecilePrecision": rounded(precision, 4),
                "topDecileLift": rounded(lift, 3),
                "expectedMonthlyRevenueAtRisk": rounded(revenue_at_risk, 2),
            },
        },
        "metrics": {
            "primary": "brierScore",
            "evidenceGatePassed": gate_passed,
            "brierReductionPercent": rounded(100 * (baseline_brier - model_brier) / baseline_brier, 1),
            "holdoutPrevalence": rounded(prevalence, 4),
        },
        "chartSeries": [
            {
                "id": "calibration",
                "title": "Holdout calibration",
                "labels": calibration_labels,
                "series": [
                    {"name": "Mean predicted risk", "values": [rounded(value, 4) for value in calibration_predicted]},
                    {"name": "Observed churn rate", "values": [rounded(value, 4) for value in calibration_observed]},
                ],
            },
            {
                "id": "capacity",
                "title": "Precision and lift at outreach capacity",
                "labels": capacity_labels,
                "series": [
                    {"name": "Precision", "values": [rounded(value, 4) for value in capacity_precision]},
                    {"name": "Lift", "values": [rounded(value, 3) for value in capacity_lift]},
                ],
            },
            {
                "id": "lead-time",
                "title": "Lead-time distribution among held-out churn events",
                "labels": ["7–30 days", "31–60 days", "61–90 days", "91–180 days"],
                "series": [{"name": "Accounts", "values": lead_buckets}],
            },
            {
                "id": "loss-comparison",
                "title": "Baseline versus model probabilistic loss",
                "labels": ["Brier score", "Log loss"],
                "series": [
                    {"name": "Baseline", "values": [rounded(baseline_brier, 6), rounded(baseline_log_loss, 6)]},
                    {"name": "Model", "values": [rounded(model_brier, 6), rounded(model_log_loss, 6)]},
                ],
            },
        ],
        "limitations": [
            "Synthetic account behavior is more regular than a live product and is not evidence of client retention.",
            "Risk discrimination does not establish that any intervention will prevent churn.",
            "Expected revenue at risk is probability-weighted exposure, not retained or realised revenue.",
            "False-positive outreach can impose service cost and customer fatigue.",
            "Calibration must be rechecked after material product, pricing, or customer-mix changes.",
        ],
        "artifactHashes": {
            "datasetSha256": sha256_bytes(csv_payload),
            "generatorSha256": sha256_bytes(Path(__file__).read_bytes()),
        },
    }
    write_json(output_dir / "churn-risk.json", artifact)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("labs/data"))
    arguments = parser.parse_args()
    arguments.output_dir.mkdir(parents=True, exist_ok=True)
    generate_marketing(arguments.output_dir)
    generate_churn(arguments.output_dir)
    print(f"Generated deterministic lab evidence in {arguments.output_dir}")


if __name__ == "__main__":
    main()
