import json
import hashlib
import math
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate_lab_evidence.py"


def assert_finite_numbers(test_case, value, path="root"):
    if isinstance(value, dict):
        for key, child in value.items():
            assert_finite_numbers(test_case, child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_finite_numbers(test_case, child, f"{path}[{index}]")
    elif isinstance(value, float):
        test_case.assertTrue(math.isfinite(value), f"{path} must be finite")


class LabGenerationTests(unittest.TestCase):
    def generate(self, destination):
        subprocess.run(
            ["python3", str(GENERATOR), "--output-dir", str(destination)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_generator_creates_deterministic_datasets_and_evidence(self):
        """Changing the seed contract or leaking randomness must change no checked output."""
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_path = Path(first)
            second_path = Path(second)
            self.generate(first_path)
            self.generate(second_path)
            for filename in (
                "marketing-allocation.csv",
                "marketing-allocation.json",
                "churn-risk.csv",
                "churn-risk.json",
            ):
                self.assertEqual(
                    (first_path / filename).read_bytes(),
                    (second_path / filename).read_bytes(),
                    f"{filename} must be byte-for-byte reproducible",
                )

    def test_marketing_recommendation_is_gated_by_holdout_baseline(self):
        """A recommendation must disappear if the declared holdout baseline is not beaten."""
        with tempfile.TemporaryDirectory() as destination:
            output = Path(destination)
            self.generate(output)
            evidence = json.loads((output / "marketing-allocation.json").read_text())
            self.assertEqual(evidence["schema"], "lab-evidence/v1")
            self.assertEqual(evidence["disclosure"], "synthetic-demonstration")
            model_mae = evidence["model"]["metrics"]["mae"]
            baseline_mae = evidence["baseline"]["metrics"]["mae"]
            self.assertEqual(evidence["metrics"]["evidenceGatePassed"], model_mae < baseline_mae)
            if model_mae >= baseline_mae:
                self.assertEqual(evidence["model"]["recommendation"]["status"], "withheld")
            assert_finite_numbers(self, evidence)

    def test_churn_model_uses_brier_score_and_a_held_out_cohort(self):
        """Replacing calibration with accuracy or training-set scoring must fail this contract."""
        with tempfile.TemporaryDirectory() as destination:
            output = Path(destination)
            self.generate(output)
            evidence = json.loads((output / "churn-risk.json").read_text())
            self.assertEqual(evidence["split"]["strategy"], "account-held-out")
            self.assertEqual(evidence["metrics"]["primary"], "brierScore")
            self.assertIn("brierScore", evidence["baseline"]["metrics"])
            self.assertIn("brierScore", evidence["model"]["metrics"])
            self.assertGreater(evidence["split"]["holdoutAccounts"], 0)
            self.assertGreater(evidence["model"]["metrics"]["topDecileLift"], 1)
            assert_finite_numbers(self, evidence)

    def test_checked_in_artifacts_match_their_datasets_and_current_generator(self):
        """Editing data or generator code without regenerating public evidence must fail."""
        generator_hash = hashlib.sha256(GENERATOR.read_bytes()).hexdigest()
        for lab in ("marketing-allocation", "churn-risk"):
            evidence = json.loads((ROOT / "labs" / "data" / f"{lab}.json").read_text())
            dataset_hash = hashlib.sha256((ROOT / "labs" / "data" / f"{lab}.csv").read_bytes()).hexdigest()
            self.assertEqual(evidence["artifactHashes"]["datasetSha256"], dataset_hash)
            self.assertEqual(evidence["artifactHashes"]["generatorSha256"], generator_hash)


if __name__ == "__main__":
    unittest.main()
