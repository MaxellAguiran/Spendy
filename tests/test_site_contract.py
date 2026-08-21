import json
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
ACTIVE_SERVICE_PAGES = ["index.html", "dragon-analytics.html", "labs/monthly-ad-report.html"]
RETIRED_PAGES = [
    "writing.html",
    "404.html",
    "labs/marketing-allocation.html",
    "labs/churn-risk.html",
    "ibex.html",
    "firstservice.html",
    "tamboran.html",
    "rex.html",
    "nordic-american-tankers.html",
]
PUBLIC_PAGES = [*ACTIVE_SERVICE_PAGES, *RETIRED_PAGES]


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

    def test_spendy_public_brand_and_route_contract(self):
        """A returned personal or broad-portfolio surface must fail before release."""
        prohibited = (
            "maxell aguiran",
            "maxell agustin",
            "dragon analytics",
            "equity research",
            "company research",
            "customer churn",
            "churn prediction",
            "customer retention",
            "seeking alpha",
        )
        for page in PUBLIC_PAGES:
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            with self.subTest(page=page):
                self.assertIn("spendy", source)
                for phrase in prohibited:
                    self.assertNotIn(phrase, source)

        for page in ACTIVE_SERVICE_PAGES:
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            with self.subTest(page=page):
                self.assertIn("machine-learning", source)
                self.assertIn("fixed", source)
                self.assertIn("budget", source)

        for page in RETIRED_PAGES:
            parser = parse_page(page)
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            with self.subTest(page=page):
                self.assertTrue(any("noindex" in directive.casefold() for directive in parser.robots))
                self.assertIn("this route is no longer published", source)
                self.assertIn("spendy", source)
                self.assertTrue(any(link.endswith("dragon-analytics.html") for link in parser.links))
                self.assertTrue(any(link.endswith("monthly-ad-report.html") for link in parser.links))

        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        for page in ACTIVE_SERVICE_PAGES:
            canonical = parse_page(page).canonical[0]
            self.assertIn(f"<loc>{canonical}</loc>", sitemap)
        for page in RETIRED_PAGES:
            canonical = parse_page(page).canonical[0]
            self.assertNotIn(f"<loc>{canonical}</loc>", sitemap)

        cards = json.loads((ROOT / "tools/social-cards.json").read_text(encoding="utf-8"))
        self.assertEqual({card["output"] for card in cards}, {"home.png", "service.png", "monthly-ad-report.png"})
        for card in cards:
            self.assertIn("spendy", " ".join(str(value) for value in card.values()).casefold())

    def test_contact_is_direct_without_visible_personal_branding(self):
        """The service can start by email without reintroducing a named founder or web form."""
        for page in ("index.html", "dragon-analytics.html"):
            parser = parse_page(page)
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            self.assertEqual(parser.forms, 0)
            self.assertIn("mailto:maxell.aguiran@gmail.com", " ".join(parser.links))
            self.assertNotIn(">maxell", source)

    def test_current_sales_surfaces_state_the_machine_learning_budget_offer(self):
        """The active sales pages must name the buyer, forecast, input budget, and allocation output."""
        combined = "\n".join((ROOT / page).read_text(encoding="utf-8") for page in ACTIVE_SERVICE_PAGES).casefold()
        for phrase in (
            "marketing agencies",
            "machine-learning",
            "meta ads",
            "google ads",
            "tiktok ads",
            "shopify",
            "fixed",
            "budget",
            "break-even",
            "cut",
            "reduce",
            "keep",
            "increase",
            "exact",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, combined)
        for phrase in ("guaranteed", "profitability", "causal incrementality", "platform partner"):
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, combined)

    def test_primary_navigation_leads_only_to_the_active_service(self):
        """A navigation link to a retired route would contradict the single-service focus."""
        for page in ACTIVE_SERVICE_PAGES:
            parser = parse_page(page)
            with self.subTest(page=page):
                self.assertTrue(any(link.endswith("dragon-analytics.html") for link in parser.links))
                self.assertTrue(any(link.endswith("monthly-ad-report.html") for link in parser.links))
                self.assertNotIn("writing.html", parser.links)
                for retired in RETIRED_PAGES:
                    if retired != page:
                        self.assertNotIn(retired, parser.links)

    def test_homepage_case_values_are_rendered_from_checked_evidence(self):
        """Hard-coding favorable report values would bypass the fail-closed renderer."""
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        report = json.loads((ROOT / "labs/data/monthly-ad-report.json").read_text(encoding="utf-8"))
        self.assertIn('data-evidence-src="labs/data/monthly-ad-report.json"', homepage)
        self.assertIn('data-dataset-src="labs/data/monthly-ad-report.csv"', homepage)
        self.assertIn("data-load-deferred", homepage)
        self.assertNotIn(f"{report['baseline']['metrics']['mae']:.4f}", homepage)
        self.assertNotIn(f"{report['model']['metrics']['mae']:.4f}", homepage)
        self.assertNotIn(f">{report['metrics']['maeReductionPercent']:.2f}%<", homepage)
        self.assertNotIn(f"${report['budget']['suppliedMonthlyBudgetCents'] / 100:,.2f}", homepage)

    def test_homepage_has_the_optimized_cartoon_planner_asset(self):
        """The friendly hero illustration must be real, accessible, and kept within the page asset budget."""
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        illustration = ROOT / "assets" / "spendy-planner-hero.png"
        self.assertIn('src="assets/spendy-planner-hero.png"', homepage)
        self.assertIn('alt="Illustrated strategist with a purple marker, laptop, and hand-drawn budget charts"', homepage)
        self.assertTrue(illustration.is_file())
        self.assertLess(illustration.stat().st_size, 700 * 1024)

    def test_monthly_report_discloses_synthetic_status_before_checked_results(self):
        """A favorable sample must disclose generated data before any released values."""
        report = (ROOT / "labs/monthly-ad-report.html").read_text(encoding="utf-8")
        disclosure_start = "Generated example using synthetic advertising and sales data."
        disclosure_end = "It shows the report format and testing standard—not client performance."
        self.assertIn(disclosure_start, report)
        self.assertIn(disclosure_end, report)
        self.assertLess(report.index(disclosure_start), report.index("data-report-content"))

    def test_structured_data_matches_the_single_service(self):
        """The homepage must describe Spendy as an organization, not a founder profile or research publisher."""
        homepage_objects = [json.loads(value) for value in parse_page("index.html").json_ld]
        self.assertEqual(homepage_objects[0]["@type"], "WebPage")
        self.assertEqual(homepage_objects[0]["mainEntity"]["@type"], "Organization")
        self.assertEqual(homepage_objects[0]["mainEntity"]["name"], "Spendy")
        report_objects = [json.loads(value) for value in parse_page("labs/monthly-ad-report.html").json_ld]
        report_dataset = next(value for value in report_objects if value.get("@type") == "Dataset")
        report_description = report_dataset["description"].casefold()
        self.assertIn("generated", report_description)
        self.assertIn("synthetic", report_description)
        self.assertIn("not client performance", report_description)

    def test_sitemap_robots_and_social_card_dimensions_are_launch_ready(self):
        """Only active routes and current social cards may be discoverable."""
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("https://maxellaguiran.github.io/sitemap.xml", robots)
        for page in ACTIVE_SERVICE_PAGES:
            self.assertIn(f"<loc>{parse_page(page).canonical[0]}</loc>", sitemap)
        for page in RETIRED_PAGES:
            self.assertNotIn(f"<loc>{parse_page(page).canonical[0]}</loc>", sitemap)
        social_images = {image.name for image in (ROOT / "assets" / "social").glob("*.png")}
        self.assertEqual(social_images, {"home.png", "service.png", "monthly-ad-report.png"})
        for image in (ROOT / "assets" / "social").glob("*.png"):
            payload = image.read_bytes()[:24]
            self.assertEqual(payload[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", payload[16:24])
            self.assertEqual((width, height), (1200, 630), image.name)


if __name__ == "__main__":
    unittest.main()
