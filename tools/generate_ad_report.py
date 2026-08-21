#!/usr/bin/env python3
"""Generate the deterministic synthetic monthly ad-report demonstration."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path


GENERATED_AT = "2026-08-21T00:00:00Z"
REPORT_SEED = 19247
FORECAST_MONTH = "2026-09"
PLATFORMS = ("Meta Ads", "Google Ads", "TikTok Ads")
ACTIONS = ("Cut", "Reduce", "Keep", "Increase")
DEVELOPMENT_DAYS = 210
HOLDOUT_DAYS = 30
TOTAL_DAYS = DEVELOPMENT_DAYS + HOLDOUT_DAYS
SUPPLIED_BUDGET_CENTS = 12_500_000
BREAK_EVEN_ROAS = 1.45
START_DATE = date(2026, 1, 4)


AD_CONFIG = (
    ("SYN-META-01", "Prospecting concept A", "Meta Ads", 1.13, -0.04, 46000),
    ("SYN-META-02", "Prospecting concept B", "Meta Ads", 1.34, 0.02, 39000),
    ("SYN-META-03", "Retargeting concept A", "Meta Ads", 1.48, 0.04, 34000),
    ("SYN-META-04", "Retargeting concept B", "Meta Ads", 1.69, 0.08, 30000),
    ("SYN-GOOG-01", "Search group A", "Google Ads", 1.17, -0.03, 52000),
    ("SYN-GOOG-02", "Search group B", "Google Ads", 1.36, 0.02, 48000),
    ("SYN-GOOG-03", "Shopping group A", "Google Ads", 1.50, 0.05, 41000),
    ("SYN-GOOG-04", "Shopping group B", "Google Ads", 1.72, 0.07, 36000),
    ("SYN-TIKT-01", "Short-form concept A", "TikTok Ads", 1.11, -0.02, 33000),
    ("SYN-TIKT-02", "Short-form concept B", "TikTok Ads", 1.33, 0.03, 31000),
    ("SYN-TIKT-03", "Creator concept A", "TikTok Ads", 1.49, 0.05, 28000),
    ("SYN-TIKT-04", "Creator concept B", "TikTok Ads", 1.70, 0.09, 25000),
)


def rounded(value, digits=4):
    return round(float(value), digits)


def sha256_bytes(payload):
    return hashlib.sha256(payload).hexdigest()


def solve_linear_system(matrix, vector):
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


def ridge_fit(features, targets, penalty=0.45):
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


def feature_row(ad_index, platform, day_index, spend_cents):
    weekly_angle = 2 * math.pi * day_index / 7
    monthly_angle = 2 * math.pi * day_index / 30
    platform_features = [1.0 if platform == candidate else 0.0 for candidate in PLATFORMS[1:]]
    ad_features = [1.0 if ad_index == candidate else 0.0 for candidate in range(1, len(AD_CONFIG))]
    return [
        1.0,
        day_index / TOTAL_DAYS,
        math.sin(weekly_angle),
        math.cos(weekly_angle),
        math.sin(monthly_angle),
        math.cos(monthly_angle),
        math.log1p(spend_cents / 40000),
        *platform_features,
        *ad_features,
    ]


def generate_histories(rng):
    rows = []
    for ad_index, (ad_id, ad_name, platform, base_roas, trend, base_spend_cents) in enumerate(AD_CONFIG):
        prior_roas = base_roas
        for day_index in range(TOTAL_DAYS):
            day = START_DATE + timedelta(days=day_index)
            weekly = math.sin(2 * math.pi * day_index / 7 + ad_index * 0.31)
            monthly = math.cos(2 * math.pi * day_index / 30 + ad_index * 0.19)
            spend_wave = 1 + 0.14 * weekly + 0.08 * monthly + rng.gauss(0, 0.045)
            spend_cents = max(5000, round(base_spend_cents * spend_wave))
            saturation = -0.10 * math.log1p(spend_cents / 45000)
            slow_move = trend * day_index / TOTAL_DAYS
            carry = 0.09 * (prior_roas - base_roas)
            observed_roas = max(
                0.35,
                base_roas
                + slow_move
                + 0.08 * weekly
                + 0.045 * monthly
                + saturation
                + carry
                + rng.gauss(0, 0.045),
            )
            attributed_revenue_cents = round(spend_cents * observed_roas)
            clicks = max(1, round(spend_cents / (92 + 4 * (ad_index % 4))))
            conversions = max(0, round(attributed_revenue_cents / (7600 + 250 * (ad_index % 3))))
            impressions = max(clicks, round(clicks / (0.011 + 0.001 * (ad_index % 4))))
            observed_roas = attributed_revenue_cents / spend_cents
            rows.append({
                "date": day.isoformat(),
                "day_index": day_index,
                "ad_index": ad_index,
                "ad_id": ad_id,
                "ad_name": ad_name,
                "platform": platform,
                "spend_cents": spend_cents,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "attributed_revenue_cents": attributed_revenue_cents,
                "observed_roas": observed_roas,
                "cohort": "development" if day_index < DEVELOPMENT_DAYS else "holdout",
            })
            prior_roas = observed_roas
    return rows


def evaluate_forecasts(rows):
    development = [row for row in rows if row["day_index"] < DEVELOPMENT_DAYS]
    holdout = [row for row in rows if row["day_index"] >= DEVELOPMENT_DAYS]
    features = [feature_row(row["ad_index"], row["platform"], row["day_index"], row["spend_cents"]) for row in development]
    targets = [row["observed_roas"] for row in development]
    coefficients = ridge_fit(features, targets)

    recent_by_ad = {}
    for ad_id, *_ in AD_CONFIG:
        recent = [
            row["observed_roas"]
            for row in development
            if row["ad_id"] == ad_id and row["day_index"] >= DEVELOPMENT_DAYS - 30
        ]
        recent_by_ad[ad_id] = sum(recent) / len(recent)

    model_predictions = [
        dot(coefficients, feature_row(row["ad_index"], row["platform"], row["day_index"], row["spend_cents"]))
        for row in holdout
    ]
    baseline_predictions = [recent_by_ad[row["ad_id"]] for row in holdout]
    actual = [row["observed_roas"] for row in holdout]
    development_predictions = [dot(coefficients, row) for row in features]
    residuals = [actual_value - predicted for actual_value, predicted in zip(targets, development_predictions)]
    residual_std = math.sqrt(sum(value * value for value in residuals) / (len(residuals) - len(coefficients)))
    return {
        "coefficients": coefficients,
        "model_mae": mae(actual, model_predictions),
        "model_rmse": rmse(actual, model_predictions),
        "baseline_mae": mae(actual, baseline_predictions),
        "baseline_rmse": rmse(actual, baseline_predictions),
        "interval_half_width": 1.645 * residual_std,
        "model_predictions": model_predictions,
        "baseline_predictions": baseline_predictions,
    }


def classify_action(forecast_low, forecast_point, forecast_high, break_even):
    if forecast_high < break_even:
        return "Cut"
    if forecast_point < break_even:
        return "Reduce"
    if forecast_low > break_even:
        return "Increase"
    return "Keep"


def reconcile_cents(raw_allocations, total_cents):
    if not isinstance(total_cents, int) or total_cents < 0:
        raise ValueError("Total cents must be a non-negative integer")
    if not raw_allocations:
        raise ValueError("At least one allocation is required")
    if any(not math.isfinite(value) or value < 0 for value in raw_allocations.values()):
        raise ValueError("Raw allocations must be finite and non-negative")
    raw_total = sum(raw_allocations.values())
    if raw_total <= 0:
        raise ValueError("Raw allocations must have a positive total")
    scaled = {key: value * total_cents / raw_total for key, value in raw_allocations.items()}
    floors = {key: math.floor(value) for key, value in scaled.items()}
    remaining = total_cents - sum(floors.values())
    order = sorted(scaled, key=lambda key: (-(scaled[key] - floors[key]), key))
    for key in order[:remaining]:
        floors[key] += 1
    if sum(floors.values()) != total_cents:
        raise AssertionError("Cent reconciliation failed")
    return floors


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


def build_forecast_rows(rows, evaluation, gate_passed):
    current_raw = {}
    for ad_id, *_ in AD_CONFIG:
        current_raw[ad_id] = sum(
            row["spend_cents"]
            for row in rows
            if row["ad_id"] == ad_id and row["day_index"] >= TOTAL_DAYS - 30
        )
    current = reconcile_cents(current_raw, SUPPLIED_BUDGET_CENTS)

    forecasts = []
    for ad_index, (ad_id, ad_name, platform, _base_roas, _trend, _base_spend) in enumerate(AD_CONFIG):
        daily_spend = current[ad_id] / 30
        points = [
            dot(
                evaluation["coefficients"],
                feature_row(ad_index, platform, TOTAL_DAYS + future_day, daily_spend),
            )
            for future_day in range(30)
        ]
        point = max(0, sum(points) / len(points))
        low = max(0, point - evaluation["interval_half_width"])
        high = point + evaluation["interval_half_width"]
        point, low, high = rounded(point), rounded(low), rounded(high)
        action = classify_action(low, point, high, BREAK_EVEN_ROAS)
        forecasts.append({
            "adId": ad_id,
            "adName": ad_name,
            "platform": platform,
            "currentSpendCents": current[ad_id],
            "forecastRoas": point,
            "forecastLow": low,
            "forecastHigh": high,
            "breakEvenRoas": BREAK_EVEN_ROAS,
            "action": action,
        })

    recommended = None
    if gate_passed:
        recommended = {}
        increase_weights = {}
        for ad in forecasts:
            current_spend = ad["currentSpendCents"]
            if ad["action"] == "Cut":
                recommended[ad["adId"]] = math.floor(current_spend * 0.08)
            elif ad["action"] == "Reduce":
                recommended[ad["adId"]] = math.floor(current_spend * 0.62)
            else:
                recommended[ad["adId"]] = current_spend
            if ad["action"] == "Increase":
                increase_weights[ad["adId"]] = current_spend * ad["forecastRoas"] / BREAK_EVEN_ROAS

        remaining = SUPPLIED_BUDGET_CENTS - sum(recommended.values())
        if remaining <= 0 or not increase_weights:
            raise ValueError("A fixed-budget recommendation requires positive budget to move to at least one Increase ad")
        increase_additions = reconcile_cents(increase_weights, remaining)
        for ad_id, addition in increase_additions.items():
            recommended[ad_id] += addition

    for ad in forecasts:
        amount = recommended[ad["adId"]] if recommended else None
        ad["recommendedSpendCents"] = amount
        ad["changeCents"] = amount - ad["currentSpendCents"] if amount is not None else None
    return forecasts


def methodology_text(evidence):
    return f"""# How this sample plan works

## A quick note

This is an illustrative sample, not customer work or a promise of results. It shows the kind of clear monthly plan Spendy can make.

## What is in the sample

- 12 example ads across Meta, Google, and TikTok
- Past daily ad and sales information for each ad
- One monthly budget: ${SUPPLIED_BUDGET_CENTS / 100:,.2f}
- A simple next step for every ad: spend less, keep it as it is, or add more

## How Spendy checks the plan

Spendy looks at the earlier part of the example information. Then it checks its answer on later days it did not see. Smaller numbers below mean the check was closer to what happened.

- Simple check: {evidence['baseline']['metrics']['mae']:.4f}
- Spendy check: {evidence['model']['metrics']['mae']:.4f}
- Plan status: {evidence['model']['recommendationStatus']}

Spendy only shows a plan when its check is better than the simple check. The expected-result ranges are helpful estimates, not guarantees.

## How the money is split

The sample starts with one total budget. Ads that look weaker get less money. Ads that look steady keep their amount. Ads that look stronger can get more. Every line in the plan adds up to the same monthly total.

## What can change

Real advertising is messier than this example. New offers, tracking changes, price changes, stock, and changes in the market can all change the outcome. When the past information is not good enough, Spendy can say “no plan yet.”
"""


def generate_report(output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = generate_histories(random.Random(REPORT_SEED))
    evaluation = evaluate_forecasts(rows)
    gate_passed = evaluation["model_mae"] < evaluation["baseline_mae"]
    ads = build_forecast_rows(rows, evaluation, gate_passed)

    csv_rows = []
    holdout_index = 0
    for row in rows:
        is_holdout = row["cohort"] == "holdout"
        csv_rows.append({
            "date": row["date"],
            "ad_id": row["ad_id"],
            "platform": row["platform"],
            "cohort": row["cohort"],
            "spend_cents": row["spend_cents"],
            "impressions": row["impressions"],
            "clicks": row["clicks"],
            "conversions": row["conversions"],
            "attributed_revenue_cents": row["attributed_revenue_cents"],
            "observed_roas": rounded(row["observed_roas"], 6),
            "baseline_forecast_roas": rounded(evaluation["baseline_predictions"][holdout_index], 6) if is_holdout else "",
            "model_forecast_roas": rounded(evaluation["model_predictions"][holdout_index], 6) if is_holdout else "",
        })
        if is_holdout:
            holdout_index += 1
    csv_path = output_dir / "monthly-ad-report.csv"
    csv_payload = write_csv(csv_path, csv_rows, list(csv_rows[0]))

    recommended_total = (
        sum(ad["recommendedSpendCents"] for ad in ads)
        if gate_passed
        else None
    )
    baseline_mae = evaluation["baseline_mae"]
    model_mae = evaluation["model_mae"]
    artifact = {
        "schema": "ad-report-evidence/v1",
        "report": "monthly-ad-forecast",
        "generatedAt": GENERATED_AT,
        "seed": REPORT_SEED,
        "disclosure": "synthetic-demonstration",
        "currency": "USD",
        "forecastMonth": FORECAST_MONTH,
        "dataset": {
            "rows": len(csv_rows),
            "unit": "generated ad-day",
            "download": "data/monthly-ad-report.csv",
            "fields": list(csv_rows[0]),
            "platforms": list(PLATFORMS),
        },
        "split": {
            "strategy": "chronological",
            "developmentDays": DEVELOPMENT_DAYS,
            "holdoutDays": HOLDOUT_DAYS,
            "developmentStart": START_DATE.isoformat(),
            "developmentEnd": (START_DATE + timedelta(days=DEVELOPMENT_DAYS - 1)).isoformat(),
            "holdoutStart": (START_DATE + timedelta(days=DEVELOPMENT_DAYS)).isoformat(),
            "holdoutEnd": (START_DATE + timedelta(days=TOTAL_DAYS - 1)).isoformat(),
        },
        "breakEven": {
            "roas": BREAK_EVEN_ROAS,
            "definition": "Generated attributed revenue divided by ad spend; break-even is 1.45.",
        },
        "baseline": {
            "name": "Each ad's trailing 30-day average ROAS",
            "metrics": {
                "mae": rounded(baseline_mae, 6),
                "rmse": rounded(evaluation["baseline_rmse"], 6),
            },
        },
        "model": {
            "name": "Regularized ad-level response regression",
            "features": ["trend", "weekly pattern", "monthly pattern", "spend saturation", "platform", "ad identity"],
            "metrics": {
                "mae": rounded(model_mae, 6),
                "rmse": rounded(evaluation["model_rmse"], 6),
            },
            "interval": {
                "coverageTarget": 0.90,
                "halfWidth": rounded(evaluation["interval_half_width"], 6),
            },
            "recommendationStatus": "shown" if gate_passed else "withheld",
            "reason": (
                "Held-out model MAE beat the declared simple comparison."
                if gate_passed
                else "Held-out model MAE did not beat the declared simple comparison."
            ),
        },
        "metrics": {
            "primary": "mae",
            "evidenceGatePassed": gate_passed,
            "maeReductionPercent": rounded(100 * (baseline_mae - model_mae) / baseline_mae, 2),
        },
        "budget": {
            "suppliedMonthlyBudgetCents": SUPPLIED_BUDGET_CENTS,
            "currentTotalCents": sum(ad["currentSpendCents"] for ad in ads),
            "recommendedTotalCents": recommended_total,
            "reconciliationDifferenceCents": (
                recommended_total - SUPPLIED_BUDGET_CENTS
                if recommended_total is not None
                else None
            ),
        },
        "ads": ads,
        "chartSeries": [
            {
                "id": "ad-budget-comparison",
                "labels": [ad["adId"] for ad in ads],
                "series": [
                    {"name": "Current", "values": [ad["currentSpendCents"] for ad in ads]},
                    {"name": "Recommended", "values": [ad["recommendedSpendCents"] for ad in ads]},
                ],
            }
        ],
        "limitations": [
            "The data is generated and is less irregular than live advertising and sales exports.",
            "Attributed revenue does not prove causal incrementality.",
            "Forecasts are estimates and can fail when offers, tracking, prices, inventory, or markets change.",
            "The allocation is constrained to the supplied budget and observed generated spend range.",
        ],
        "artifactHashes": {
            "datasetSha256": sha256_bytes(csv_payload),
            "generatorSha256": sha256_bytes(Path(__file__).read_bytes()),
        },
    }
    write_json(output_dir / "monthly-ad-report.json", artifact)
    (output_dir / "monthly-ad-report-methodology.md").write_text(
        methodology_text(artifact),
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("labs/data"))
    arguments = parser.parse_args()
    generate_report(arguments.output_dir)


if __name__ == "__main__":
    main()
