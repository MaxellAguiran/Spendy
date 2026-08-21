import csv
import hashlib
import importlib.util
import json
import math
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate_ad_report.py"
OUTPUTS = (
    "monthly-ad-report.csv",
    "monthly-ad-report.json",
    "monthly-ad-report-methodology.md",
)
ALLOWED_PLATFORMS = {"Meta Ads", "Google Ads", "TikTok Ads"}
ALLOWED_ACTIONS = {"Cut", "Reduce", "Keep", "Increase"}


def assert_finite_numbers(test_case, value, path="root"):
    if isinstance(value, dict):
        for key, child in value.items():
            assert_finite_numbers(test_case, child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_finite_numbers(test_case, child, f"{path}[{index}]")
    elif isinstance(value, float):
        test_case.assertTrue(math.isfinite(value), f"{path} must be finite")


class AdReportGenerationTests(unittest.TestCase):
    def generate(self, destination):
        subprocess.run(
            ["python3", str(GENERATOR), "--output-dir", str(destination)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_generator_is_byte_for_byte_deterministic(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_path = Path(first)
            second_path = Path(second)
            self.generate(first_path)
            self.generate(second_path)
            for filename in OUTPUTS:
                with self.subTest(filename=filename):
                    self.assertEqual(
                        (first_path / filename).read_bytes(),
                        (second_path / filename).read_bytes(),
                    )

    def test_artifact_uses_a_later_period_and_derives_its_release_gate(self):
        with tempfile.TemporaryDirectory() as destination:
            output = Path(destination)
            self.generate(output)
            evidence = json.loads((output / "monthly-ad-report.json").read_text())
            self.assertEqual(evidence["schema"], "ad-report-evidence/v1")
            self.assertEqual(evidence["report"], "monthly-ad-forecast")
            self.assertEqual(evidence["disclosure"], "synthetic-demonstration")
            self.assertEqual(evidence["split"]["strategy"], "chronological")
            self.assertGreater(evidence["split"]["developmentDays"], 0)
            self.assertGreater(evidence["split"]["holdoutDays"], 0)
            self.assertLess(
                date.fromisoformat(evidence["split"]["developmentEnd"]),
                date.fromisoformat(evidence["split"]["holdoutStart"]),
            )
            self.assertLessEqual(
                date.fromisoformat(evidence["split"]["holdoutStart"]),
                date.fromisoformat(evidence["split"]["holdoutEnd"]),
            )
            self.assertEqual(evidence["metrics"]["primary"], "mae")
            expected_gate = evidence["model"]["metrics"]["mae"] < evidence["baseline"]["metrics"]["mae"]
            self.assertEqual(evidence["metrics"]["evidenceGatePassed"], expected_gate)
            self.assertEqual(
                evidence["model"]["recommendationStatus"],
                "shown" if expected_gate else "withheld",
            )
            assert_finite_numbers(self, evidence)

    def test_shown_report_reconciles_every_ad_to_the_supplied_budget_in_cents(self):
        with tempfile.TemporaryDirectory() as destination:
            output = Path(destination)
            self.generate(output)
            evidence = json.loads((output / "monthly-ad-report.json").read_text())
            ads = evidence["ads"]
            self.assertEqual(len(ads), 12)
            self.assertEqual(len({ad["adId"] for ad in ads}), len(ads))
            self.assertGreater(evidence["budget"]["suppliedMonthlyBudgetCents"], 0)
            self.assertEqual(
                sum(ad["currentSpendCents"] for ad in ads),
                evidence["budget"]["currentTotalCents"],
            )
            for ad in ads:
                with self.subTest(ad=ad["adId"]):
                    self.assertIn(ad["platform"], ALLOWED_PLATFORMS)
                    self.assertIn(ad["action"], ALLOWED_ACTIONS)
                    self.assertIsInstance(ad["currentSpendCents"], int)
                    self.assertGreaterEqual(ad["currentSpendCents"], 0)
                    self.assertLessEqual(ad["forecastLow"], ad["forecastRoas"])
                    self.assertLessEqual(ad["forecastRoas"], ad["forecastHigh"])
                    self.assertEqual(ad["breakEvenRoas"], evidence["breakEven"]["roas"])
            if evidence["model"]["recommendationStatus"] == "shown":
                for ad in ads:
                    self.assertIsInstance(ad["recommendedSpendCents"], int)
                    self.assertIsInstance(ad["changeCents"], int)
                    self.assertGreaterEqual(ad["recommendedSpendCents"], 0)
                    expected_action = (
                        "Cut" if ad["forecastHigh"] < ad["breakEvenRoas"]
                        else "Reduce" if ad["forecastRoas"] < ad["breakEvenRoas"]
                        else "Increase" if ad["forecastLow"] > ad["breakEvenRoas"]
                        else "Keep"
                    )
                    self.assertEqual(ad["action"], expected_action)
                    if ad["action"] in {"Cut", "Reduce"}:
                        self.assertLess(ad["recommendedSpendCents"], ad["currentSpendCents"])
                    elif ad["action"] == "Keep":
                        self.assertEqual(ad["recommendedSpendCents"], ad["currentSpendCents"])
                    else:
                        self.assertGreater(ad["recommendedSpendCents"], ad["currentSpendCents"])
                recommended_total = sum(ad["recommendedSpendCents"] for ad in ads)
                self.assertEqual(recommended_total, evidence["budget"]["suppliedMonthlyBudgetCents"])
                self.assertEqual(recommended_total, evidence["budget"]["recommendedTotalCents"])
                self.assertEqual(evidence["budget"]["reconciliationDifferenceCents"], 0)
            else:
                self.assertIsNone(evidence["budget"]["recommendedTotalCents"])
                self.assertIsNone(evidence["budget"]["reconciliationDifferenceCents"])
                self.assertTrue(all(ad["recommendedSpendCents"] is None for ad in ads))
                self.assertTrue(all(ad["changeCents"] is None for ad in ads))

    def test_csv_and_generator_hashes_bind_the_checked_artifact(self):
        with tempfile.TemporaryDirectory() as destination:
            output = Path(destination)
            self.generate(output)
            evidence = json.loads((output / "monthly-ad-report.json").read_text())
            csv_path = output / "monthly-ad-report.csv"
            self.assertEqual(
                evidence["artifactHashes"]["datasetSha256"],
                hashlib.sha256(csv_path.read_bytes()).hexdigest(),
            )
            self.assertEqual(
                evidence["artifactHashes"]["generatorSha256"],
                hashlib.sha256(GENERATOR.read_bytes()).hexdigest(),
            )
            with csv_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 12 * 240)
            self.assertEqual({row["cohort"] for row in rows}, {"development", "holdout"})
            corpus = csv_path.read_text(encoding="utf-8").casefold()
            for prohibited in ("client", "worldquant", "seeking alpha", "football pro"):
                self.assertNotIn(prohibited, corpus)

    def test_largest_remainder_reconciliation_is_exact_and_stable(self):
        spec = importlib.util.spec_from_file_location("generate_ad_report", GENERATOR)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        raw = {"SYN-B": 100.6, "SYN-A": 100.6, "SYN-C": 98.8}
        result = module.reconcile_cents(raw, 300)
        self.assertEqual(result, {"SYN-B": 100, "SYN-A": 101, "SYN-C": 99})
        self.assertEqual(sum(result.values()), 300)


if __name__ == "__main__":
    unittest.main()
