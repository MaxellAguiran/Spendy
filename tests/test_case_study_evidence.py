import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate_case_study_evidence.py"


def period_rows():
    rows = []
    for period in range(1, 13):
        equal_profit = 2300 if period < 12 else 2392
        difference = 350 if period < 12 else 454
        rows.append({
            "period": period,
            "label": f"Weeks {period * 4 + 1}-{period * 4 + 4}",
            "equal_profit": equal_profit,
            "forecast_profit": equal_profit + difference,
        })
    return rows


class CaseStudyEvidenceTests(unittest.TestCase):
    def write_inputs(self, directory):
        source = {
            "source_mode": "public_research",
            "title": "Advertising Performance Based on Personalization Breadth and Depth",
            "authors": "Semeradova and Weinlich",
            "doi": "10.17632/hh7xps83z5.1",
            "url": "https://data.mendeley.com/datasets/hh7xps83z5/1",
            "license": "CC BY 4.0",
            "file_coverage": {"rows": 1872, "weekly_periods": 52, "campaign_ids_in_file": 36},
            "verification": {"native_ad_export_verified": False, "client_authorized": False},
            "private_internal_note": "do not copy this internal note"
        }
        backtest = {
            "summary": {
                "periods": 12,
                "total_coverage": "432/432 (100%)",
                "equal_profit_total": 27692.0,
                "forecast_profit_total": 31996.0,
                "forecast_advantage": 4304.0,
            },
            "periods": period_rows(),
        }
        source_path = directory / "source.json"
        backtest_path = directory / "backtest.json"
        source_path.write_text(json.dumps(source), encoding="utf-8")
        backtest_path.write_text(json.dumps(backtest), encoding="utf-8")
        return source_path, backtest_path

    def run_generator(self, source_path, backtest_path, output_dir):
        return subprocess.run(
            [
                "python3", str(GENERATOR),
                "--source-manifest", str(source_path),
                "--backtest", str(backtest_path),
                "--output-dir", str(output_dir),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_generator_emits_hashed_public_safe_evidence_deterministically(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source_path, backtest_path = self.write_inputs(directory)
            first_output = directory / "first"
            second_output = directory / "second"
            first = self.run_generator(source_path, backtest_path, first_output)
            second = self.run_generator(source_path, backtest_path, second_output)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 0, second.stderr)

            first_json = (first_output / "case-study-evidence.json").read_bytes()
            second_json = (second_output / "case-study-evidence.json").read_bytes()
            first_csv = (first_output / "case-study-periods.csv").read_bytes()
            second_csv = (second_output / "case-study-periods.csv").read_bytes()
            self.assertEqual(first_json, second_json)
            self.assertEqual(first_csv, second_csv)

            artifact = json.loads(first_json)
            self.assertEqual(artifact["schema"], "spendy-case-study-evidence/v1")
            self.assertEqual(artifact["engagement"]["displayName"], "Anonymous e-commerce advertiser")
            self.assertEqual(artifact["source"]["weekCount"], 52)
            self.assertEqual(artifact["source"]["setupCount"], 36)
            self.assertFalse(artifact["source"]["nativeClientExportVerified"])
            self.assertEqual(artifact["simulation"]["coverage"], {"covered": 432, "total": 432})
            self.assertEqual(artifact["simulation"]["equalProfitCents"], 2769200)
            self.assertEqual(artifact["simulation"]["spendyProfitCents"], 3199600)
            self.assertEqual(artifact["simulation"]["advantageCents"], 430400)
            self.assertIsNone(artifact["simulation"]["realizedClientSavingsCents"])
            self.assertEqual(artifact["artifacts"]["periodsSha256"], hashlib.sha256(first_csv).hexdigest())
            self.assertNotIn("private_internal_note", first_json.decode("utf-8"))
            self.assertNotIn("do not copy", first_json.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
