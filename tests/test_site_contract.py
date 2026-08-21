import json
import re
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = [
    "index.html",
    "dragon-analytics.html",
    "writing.html",
    "404.html",
    "labs/monthly-ad-report.html",
    "labs/marketing-allocation.html",
    "labs/churn-risk.html",
    "ibex.html",
    "firstservice.html",
    "tamboran.html",
    "rex.html",
    "nordic-american-tankers.html",
]
ARTICLE_PAGES = ["ibex.html", "firstservice.html", "tamboran.html", "rex.html", "nordic-american-tankers.html"]


class ContractParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title_count = 0
        self.description_count = 0
        self.robots = []
        self.canonical = []
        self.og_image = []
        self.h1_count = 0
        self.links = []
        self.ids = set()
        self.forms = 0
        self.json_ld = []
        self._json_depth = 0
        self._json_parts = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.add(attributes["id"])
        if tag == "title":
            self.title_count += 1
        elif tag == "meta" and attributes.get("name") == "description":
            self.description_count += 1
        elif tag == "meta" and attributes.get("name") == "robots":
            self.robots.append(attributes.get("content", ""))
        elif tag == "link" and attributes.get("rel") == "canonical":
            self.canonical.append(attributes.get("href"))
        elif tag == "meta" and attributes.get("property") == "og:image":
            self.og_image.append(attributes.get("content"))
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"])
        elif tag == "form":
            self.forms += 1
        elif tag == "script" and attributes.get("type") == "application/ld+json":
            self._json_depth = 1
            self._json_parts = []

    def handle_endtag(self, tag):
        if tag == "script" and self._json_depth:
            self.json_ld.append("".join(self._json_parts))
            self._json_depth = 0

    def handle_data(self, data):
        if self._json_depth:
            self._json_parts.append(data)


def parse_page(relative_path):
    parser = ContractParser()
    parser.feed((ROOT / relative_path).read_text(encoding="utf-8"))
    return parser


class SiteContractTests(unittest.TestCase):
    def test_every_public_page_has_complete_discovery_metadata(self):
        """Dropping a canonical, description, social image, title, or H1 must fail."""
        for page in PUBLIC_PAGES:
            with self.subTest(page=page):
                parser = parse_page(page)
                self.assertEqual(parser.title_count, 1)
                self.assertEqual(parser.description_count, 1)
                self.assertEqual(len(parser.canonical), 1)
                self.assertTrue(parser.canonical[0].startswith("https://maxellaguiran.github.io/"))
                self.assertEqual(len(parser.og_image), 1)
                social_path = urlsplit(parser.og_image[0]).path.lstrip("/")
                self.assertTrue((ROOT / social_path).is_file(), social_path)
                self.assertEqual(parser.h1_count, 1)

    def test_internal_links_resolve_to_files_or_page_fragments(self):
        """A renamed route or missing downloadable artifact must fail the build."""
        for page in PUBLIC_PAGES:
            parser = parse_page(page)
            for link in parser.links:
                parts = urlsplit(link)
                if parts.scheme in {"http", "https", "mailto"}:
                    continue
                candidate = (ROOT / page).parent / unquote(parts.path)
                if not parts.path:
                    candidate = ROOT / page
                with self.subTest(page=page, link=link):
                    self.assertTrue(candidate.resolve().is_file(), f"Missing {candidate}")
                    if parts.fragment and candidate.suffix == ".html":
                        target = parse_page(candidate.resolve().relative_to(ROOT))
                        self.assertIn(unquote(parts.fragment), target.ids, f"Missing fragment in {candidate}")

    def test_no_private_project_or_platform_names_are_published(self):
        """Accidentally exposing a private project name must fail."""
        prohibited = ["WorldQuant", "Seeking Alpha", "Football Pro", "Forex Prophet", "submission identifier"]
        corpus = "\n".join((ROOT / page).read_text(encoding="utf-8") for page in PUBLIC_PAGES)
        for phrase in prohibited:
            self.assertNotIn(phrase.casefold(), corpus.casefold())

    def test_contact_is_direct_and_not_a_mailto_form_disguised_as_submission(self):
        """Reintroducing the old data-collecting mailto form must fail."""
        for page in ("index.html", "dragon-analytics.html"):
            parser = parse_page(page)
            self.assertEqual(parser.forms, 0)
            self.assertIn("mailto:maxell.aguiran@gmail.com", " ".join(parser.links))

    def test_current_sales_surfaces_state_the_monthly_ad_report_offer(self):
        """The sales pages must name the buyer, inputs, monthly decision, and exact deliverable."""
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        work_page = (ROOT / "dragon-analytics.html").read_text(encoding="utf-8")
        combined = f"{homepage}\n{work_page}".casefold()
        for phrase in (
            "marketing agencies",
            "meta ads",
            "google ads",
            "tiktok ads",
            "shopify",
            "fixed monthly ad budget",
            "cut",
            "reduce",
            "keep",
            "increase",
            "down to the cent",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, combined)
        for phrase in ("churn prediction", "customer retention", "accounts to contact"):
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, combined)

    def test_discovery_copy_and_primary_navigation_match_the_current_offer(self):
        """Old service positioning must not survive in previews or primary navigation."""
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        work_page = (ROOT / "dragon-analytics.html").read_text(encoding="utf-8")
        report_page = (ROOT / "labs/monthly-ad-report.html").read_text(encoding="utf-8")
        cards = {card["output"]: card for card in json.loads((ROOT / "tools/social-cards.json").read_text())}

        self.assertIn("Know which ads to cut—and exactly where next month's budget should go.", homepage)
        self.assertIn("Monthly ad forecasting and exact budget plans for marketing agencies.", work_page)
        self.assertIn("Which ads should receive next month's fixed budget?", report_page)
        self.assertEqual(
            cards["home.png"]["title"],
            "Know which ads to cut—and exactly where next month's budget should go.",
        )
        self.assertEqual(
            cards["dragon-analytics.png"]["title"],
            "Monthly ad forecasting and exact budget plans for marketing agencies.",
        )
        self.assertEqual(
            cards["monthly-ad-report.png"]["title"],
            "Which ads should receive next month's fixed budget?",
        )

        for page in ("index.html", "dragon-analytics.html", "writing.html", "404.html"):
            source = (ROOT / page).read_text(encoding="utf-8")
            with self.subTest(page=page):
                self.assertIn(">Work</a>", source)
                self.assertIn(">Sample report</a>", source)
                self.assertIn(">Research</a>", source)
                self.assertIn(">About</a>", source)
                self.assertIn(">Request a report</a>", source)
                self.assertNotIn(">Case study</a>", source)
                self.assertNotIn(">Start a conversation</a>", source)

    def test_legacy_labs_are_preserved_but_not_sold_as_current_services(self):
        """Old examples may remain available without confusing the current offer."""
        churn = (ROOT / "labs/churn-risk.html").read_text(encoding="utf-8")
        marketing = (ROOT / "labs/marketing-allocation.html").read_text(encoding="utf-8")
        self.assertIn('name="robots" content="noindex,follow"', churn)
        self.assertIn("Older generated analytics demonstration", churn)
        self.assertIn("Earlier channel-level generated demonstration", marketing)
        for page in ("index.html", "dragon-analytics.html"):
            source = (ROOT / page).read_text(encoding="utf-8")
            self.assertNotIn('href="labs/churn-risk.html"', source)

    def test_homepage_case_values_are_rendered_from_checked_evidence(self):
        """Hard-coding favorable report values would bypass the fail-closed renderer."""
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        report = json.loads((ROOT / "labs/data/monthly-ad-report.json").read_text())
        self.assertIn('data-evidence-src="labs/data/monthly-ad-report.json"', homepage)
        self.assertIn('data-dataset-src="labs/data/monthly-ad-report.csv"', homepage)
        self.assertNotIn(f"{report['baseline']['metrics']['mae']:.4f}", homepage)
        self.assertNotIn(f"{report['model']['metrics']['mae']:.4f}", homepage)
        self.assertNotIn(f">{report['metrics']['maeReductionPercent']:.2f}%<", homepage)
        self.assertNotIn(f"${report['budget']['suppliedMonthlyBudgetCents'] / 100:,.2f}", homepage)

    def test_articles_expose_article_json_ld_and_source_review_state(self):
        """Removing article identity or disguising unverified source links must fail."""
        for page in ARTICLE_PAGES:
            source = (ROOT / page).read_text(encoding="utf-8")
            parser = parse_page(page)
            objects = [json.loads(value) for value in parser.json_ld]
            self.assertTrue(any(value.get("@type") == "Article" for value in objects))
            self.assertIn('data-source-status="review"', source)
            self.assertIn("data-reading-progress", source)
            self.assertIn('class="article-toc"', source)

    def test_labs_disclose_generated_non_client_status_before_results(self):
        """A chart appearing before the plain-language non-client disclosure must fail."""
        required = "Example built from generated data—not client work."
        for page in ("labs/marketing-allocation.html", "labs/churn-risk.html"):
            source = (ROOT / page).read_text(encoding="utf-8")
            self.assertIn(required, source)
            self.assertLess(source.index(required), source.index('id="results"'))

        report = (ROOT / "labs/monthly-ad-report.html").read_text(encoding="utf-8")
        report_disclosure = "Generated example using synthetic advertising and sales data. It shows the report format and testing standard—not client performance."
        self.assertIn(report_disclosure, report)
        self.assertLess(report.index(report_disclosure), report.index("data-report-content"))

    def test_profile_article_and_dataset_structured_data_match_visible_page_types(self):
        """Mislabeling a lab as client work or losing the canonical author entity must fail."""
        homepage_objects = [json.loads(value) for value in parse_page("index.html").json_ld]
        self.assertEqual(homepage_objects[0]["@type"], "ProfilePage")
        self.assertEqual(homepage_objects[0]["mainEntity"]["@type"], "Person")
        self.assertNotIn("affiliation", homepage_objects[0]["mainEntity"])
        for page in ("labs/marketing-allocation.html", "labs/churn-risk.html"):
            objects = [json.loads(value) for value in parse_page(page).json_ld]
            dataset = next(value for value in objects if value.get("@type") == "Dataset")
            self.assertIn("generated", dataset["description"].casefold())
            self.assertIn("non-client", dataset["description"].casefold())
            self.assertIn("not a client engagement", dataset["isBasedOn"].casefold())
        report_objects = [json.loads(value) for value in parse_page("labs/monthly-ad-report.html").json_ld]
        report_dataset = next(value for value in report_objects if value.get("@type") == "Dataset")
        report_description = report_dataset["description"].casefold()
        self.assertIn("generated", report_description)
        self.assertIn("synthetic", report_description)
        self.assertIn("not client performance", report_description)

    def test_sitemap_robots_and_social_card_dimensions_are_launch_ready(self):
        """A missing canonical route, root sitemap reference, or wrongly sized preview must fail."""
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("https://maxellaguiran.github.io/sitemap.xml", robots)
        for page in PUBLIC_PAGES:
            if page == "404.html":
                continue
            parser = parse_page(page)
            canonical = parser.canonical[0]
            if any("noindex" in directive.casefold() for directive in parser.robots):
                self.assertNotIn(f"<loc>{canonical}</loc>", sitemap)
            else:
                self.assertIn(f"<loc>{canonical}</loc>", sitemap)
        for image in (ROOT / "assets" / "social").glob("*.png"):
            payload = image.read_bytes()[:24]
            self.assertEqual(payload[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", payload[16:24])
            self.assertEqual((width, height), (1200, 630), image.name)


if __name__ == "__main__":
    unittest.main()
