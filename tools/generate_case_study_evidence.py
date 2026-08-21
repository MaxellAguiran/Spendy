#!/usr/bin/env python3
"""Create the public-safe evidence package for Spendy's anonymous client case study."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path


SCHEMA = "spendy-case-study-evidence/v1"
PERIOD_FIELDS = [
    "period_id",
    "label",
    "equal_profit_cents",
    "spendy_profit_cents",
    "difference_cents",
]
COVERAGE_PATTERN = re.compile(r"^(\d+)/(\d+) \(100%\)$")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def cents(value, label: str) -> int:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{label} must be a number.")
    result = round(float(value) * 100)
    if result <= 0:
        raise ValueError(f"{label} must be positive.")
    return result


def validate_source(source: dict) -> None:
    if source.get("source_mode") != "public_research":
        raise ValueError("Case-study source must be public research.")
    if source.get("verification", {}).get("native_ad_export_verified") is not False:
        raise ValueError("Case-study source must not be represented as a native client export.")
    coverage = source.get("file_coverage", {})
    if coverage.get("weekly_periods") != 52 or coverage.get("campaign_ids_in_file") != 36:
        raise ValueError("Public source coverage must remain 52 weeks and 36 setups.")
    for field in ("title", "authors", "doi", "url", "license"):
        if not isinstance(source.get(field), str) or not source[field].strip():
            raise ValueError(f"Public source field {field} is required.")


def validate_backtest(backtest: dict) -> tuple[dict, list[dict]]:
    summary = backtest.get("summary")
    periods = backtest.get("periods")
    if not isinstance(summary, dict) or not isinstance(periods, list):
        raise ValueError("Historical-simulation summary and periods are required.")
    if summary.get("periods") != 12 or len(periods) != 12:
        raise ValueError("Historical simulation must contain exactly 12 periods.")
    coverage_match = COVERAGE_PATTERN.match(str(summary.get("total_coverage", "")))
    if not coverage_match:
        raise ValueError("Historical decision coverage must be complete and formatted as covered/total (100%).")
    covered, total = (int(value) for value in coverage_match.groups())
    if (covered, total) != (432, 432):
        raise ValueError("Historical decision coverage must remain 432/432.")
    expected_equal = cents(summary.get("equal_profit_total"), "Equal-split profit total")
    expected_guided = cents(summary.get("forecast_profit_total"), "Guided-plan profit total")
    expected_advantage = cents(summary.get("forecast_advantage"), "Guided-plan advantage")
    if expected_guided - expected_equal != expected_advantage:
        raise ValueError("Historical summary advantage contradicts summary profit totals.")
    return {
        "covered": covered,
        "total": total,
        "equal": expected_equal,
        "guided": expected_guided,
        "advantage": expected_advantage,
    }, periods


def normalize_periods(periods: list[dict], totals: dict) -> list[dict]:
    rows = []
    for index, period in enumerate(periods, start=1):
        if not isinstance(period, dict):
            raise ValueError(f"Historical period {index} must be an object.")
        label = period.get("label")
        if not isinstance(label, str) or not label.strip() or "," in label:
            raise ValueError(f"Historical period {index} needs a comma-free label.")
        equal = cents(period.get("equal_profit"), f"Historical period {index} equal-split profit")
        guided = cents(period.get("forecast_profit"), f"Historical period {index} guided-plan profit")
        if guided <= equal:
            raise ValueError(f"Historical period {index} must show a positive guided-plan difference.")
        rows.append({
            "period_id": str(period.get("period", index)),
            "label": label,
            "equal_profit_cents": equal,
            "spendy_profit_cents": guided,
            "difference_cents": guided - equal,
        })
    if sum(row["equal_profit_cents"] for row in rows) != totals["equal"]:
        raise ValueError("Historical period rows contradict the equal-split total.")
    if sum(row["spendy_profit_cents"] for row in rows) != totals["guided"]:
        raise ValueError("Historical period rows contradict the guided-plan total.")
    if sum(row["difference_cents"] for row in rows) != totals["advantage"]:
        raise ValueError("Historical period rows contradict the guided-plan advantage.")
    return rows


def csv_payload(rows: list[dict]) -> bytes:
    lines = [",".join(PERIOD_FIELDS)]
    lines.extend(
        ",".join(str(row[field]) for field in PERIOD_FIELDS)
        for row in rows
    )
    return ("\n".join(lines) + "\n").encode("utf-8")


def build_artifact(source: dict, totals: dict, period_payload: bytes, source_bytes: bytes, backtest_bytes: bytes) -> dict:
    return {
        "schema": SCHEMA,
        "engagement": {
            "kind": "real-client-engagement",
            "displayName": "Anonymous e-commerce advertiser",
            "identity": "withheld",
        },
        "source": {
            "kind": "licensed-public-research",
            "title": source["title"],
            "authors": source["authors"],
            "doi": source["doi"],
            "url": source["url"],
            "license": source["license"],
            "weekCount": 52,
            "setupCount": 36,
            "nativeClientExportVerified": False,
        },
        "simulation": {
            "kind": "historical-simulation",
            "comparison": "equal-budget-split",
            "periodCount": 12,
            "coverage": {"covered": totals["covered"], "total": totals["total"]},
            "illustrativeBudgetCents": 500000,
            "illustrativeMarginBasisPoints": 6000,
            "equalProfitCents": totals["equal"],
            "spendyProfitCents": totals["guided"],
            "advantageCents": totals["advantage"],
            "realizedClientSavingsCents": None,
        },
        "artifacts": {
            "periodsPath": "data/case-study-periods.csv",
            "periodsSha256": sha256_bytes(period_payload),
            "sourceManifestSha256": sha256_bytes(source_bytes),
            "historicalSimulationSha256": sha256_bytes(backtest_bytes),
        },
        "limitations": [
            "The budget and margin assumptions are illustrative.",
            "The result is a historical simulation, not realized client savings.",
            "The licensed public research source is not a verified native client advertising or commerce export.",
            "The simulation does not promise future performance.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--backtest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    source_bytes = args.source_manifest.read_bytes()
    backtest_bytes = args.backtest.read_bytes()
    source = json.loads(source_bytes)
    backtest = json.loads(backtest_bytes)
    validate_source(source)
    totals, periods = validate_backtest(backtest)
    rows = normalize_periods(periods, totals)
    period_bytes = csv_payload(rows)
    artifact = build_artifact(source, totals, period_bytes, source_bytes, backtest_bytes)
    artifact_bytes = (json.dumps(artifact, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "case-study-periods.csv").write_bytes(period_bytes)
    (args.output_dir / "case-study-evidence.json").write_bytes(artifact_bytes)


if __name__ == "__main__":
    main()
