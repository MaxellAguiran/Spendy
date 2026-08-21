import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RETIRED_ARTICLE_ROUTES = (
    "firstservice.html",
    "ibex.html",
    "nordic-american-tankers.html",
    "rex.html",
    "tamboran.html",
)


class RetiredArticleRouteTests(unittest.TestCase):
    def test_retired_article_routes_do_not_restore_legacy_research_content(self):
        """Former article URLs must hand off to Spendy instead of resurfacing research."""
        for filename in RETIRED_ARTICLE_ROUTES:
            source = (ROOT / filename).read_text(encoding="utf-8").casefold()
            with self.subTest(filename=filename):
                self.assertIn('name="robots" content="noindex,follow"', source)
                self.assertIn("spendy", source)
                self.assertIn("this route is no longer published", source)
                self.assertNotIn("article-body", source)
                self.assertNotIn("equity research", source)
                self.assertNotIn("company research", source)


if __name__ == "__main__":
    unittest.main()
