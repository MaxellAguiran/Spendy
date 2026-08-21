import json
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
ACTIVE_SERVICE_PAGES = ["index.html", "case-study.html", "dragon-analytics.html", "labs/monthly-ad-report.html"]
RETIRED_PAGES = [
    "writing.html", "404.html", "labs/marketing-allocation.html", "labs/churn-risk.html",
    "ibex.html", "firstservice.html", "tamboran.html", "rex.html", "nordic-american-tankers.html",
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

    def test_spendy_brand_and_exact_route_contract(self):
        prohibited = (
            "maxell aguiran", "maxell agustin", "dragon analytics", "equity research",
            "company research", "customer churn", "churn prediction", "customer retention", "seeking alpha",
        )
        for page in PUBLIC_PAGES:
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            with self.subTest(page=page):
                self.assertIn("spendy", source)
                for phrase in prohibited:
                    self.assertNotIn(phrase, source)

        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        for page in ACTIVE_SERVICE_PAGES:
            self.assertIn(f"<loc>{parse_page(page).canonical[0]}</loc>", sitemap)
        for page in RETIRED_PAGES:
            parser = parse_page(page)
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            self.assertTrue(any("noindex" in directive.casefold() for directive in parser.robots))
            self.assertIn("this route is no longer published", source)
            self.assertNotIn(f"<loc>{parser.canonical[0]}</loc>", sitemap)
            self.assertTrue(any(link.endswith("dragon-analytics.html") for link in parser.links))
            self.assertTrue(any(link.endswith("monthly-ad-report.html") for link in parser.links))

        cards = json.loads((ROOT / "tools/social-cards.json").read_text(encoding="utf-8"))
        self.assertEqual({card["output"] for card in cards}, {"home.png", "case-study.png", "service.png", "monthly-ad-report.png"})

    def test_active_navigation_is_proof_first_and_contains_no_retired_surface(self):
        expected = {"case-study.html", "dragon-analytics.html", "monthly-ad-report.html"}
        for page in ACTIVE_SERVICE_PAGES:
            parser = parse_page(page)
            links = " ".join(parser.links)
            with self.subTest(page=page):
                for destination in expected:
                    self.assertIn(destination, links)
                for retired in RETIRED_PAGES:
                    self.assertNotIn(retired, parser.links)
                self.assertNotIn("writing.html", parser.links)

    def test_direct_email_survives_without_a_form_or_visible_personal_branding(self):
        for page in ACTIVE_SERVICE_PAGES:
            parser = parse_page(page)
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            with self.subTest(page=page):
                self.assertEqual(parser.forms, 0)
                self.assertIn("mailto:maxell.aguiran@gmail.com", " ".join(parser.links))
                self.assertNotIn(">maxell", source)

    def test_homepage_promises_two_audiences_and_plain_language(self):
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        for phrase in (
            "For agencies and in-house teams managing lots of active ads.",
            "Stop guessing where next month’s ad money should go.",
            "Spendy makes the plan simple.",
            "For agencies", "For in-house teams", "No plan yet",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, homepage)
        self.assertIn('src="assets/spendy-crew-hero.png"', homepage)
        self.assertIn('data-case-study', homepage)

    def test_case_study_is_evidence_bound_and_does_not_mislabel_the_data(self):
        case = (ROOT / "case-study.html").read_text(encoding="utf-8")
        prohibited = (
            "client-account data", "we saved the client", "proven savings", "guaranteed return",
            "live campaign result", "client testimonial", "model name", "algorithm", "endpoint",
        )
        for phrase in prohibited:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, case.casefold())
        for phrase in (
            "Real client engagement · name withheld",
            "licensed public retail-advertising research",
            "not a verified native client advertising or commerce export",
            "Historical simulation using licensed public retail-advertising data.",
            "The €5,000 monthly budget and margin assumption are illustrative.",
            "The €4,304 difference is not realized client savings and does not promise future performance.",
            "In the historical simulation, the Spendy-guided budget produced",
            "data-case-study", "data-case-value", "data-case-chart",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, case)
        self.assertNotIn("€27,692", case)
        self.assertNotIn("€31,996", case)
        self.assertLess(case.index("Historical simulation using licensed public retail-advertising data."), case.index("data-case-value"))

    def test_case_structured_data_describes_article_and_separate_dataset(self):
        values = [json.loads(value) for value in parse_page("case-study.html").json_ld]
        article = next(value for value in values if value.get("@type") == "Article")
        dataset = next(value for value in values if value.get("@type") == "Dataset")
        self.assertEqual(article["publisher"]["name"], "Spendy")
        self.assertIn("not realized client savings", article["description"])
        self.assertEqual(dataset["identifier"], "https://doi.org/10.17632/hh7xps83z5.1")
        self.assertIn("creativecommons.org/licenses/by/4.0", dataset["license"])

    def test_sample_plan_is_disclosed_before_checked_results_and_has_a_phone_surface(self):
        report = (ROOT / "labs/monthly-ad-report.html").read_text(encoding="utf-8")
        disclosure = "Illustrative example — not a client result."
        self.assertIn(disclosure, report)
        self.assertLess(report.index(disclosure), report.index("data-report-content"))
        self.assertIn("data-report-cards", report)
        self.assertIn("data-report-rows", report)
        self.assertIn('<h2 class="visually-hidden">Your simple monthly plan</h2>', report)

    def test_assets_and_social_cards_are_sized_and_present(self):
        for name in ("spendy-crew-hero.webp", "spendy-decision-scene.webp", "spendy-review-scene.webp", "spendy-planner-hero.webp"):
            asset = ROOT / "assets" / name
            self.assertTrue(asset.is_file(), name)
            self.assertLess(asset.stat().st_size, 180 * 1024, name)
        social_images = {image.name for image in (ROOT / "assets" / "social").glob("*.png")}
        self.assertEqual(social_images, {"home.png", "case-study.png", "service.png", "monthly-ad-report.png"})
        for image in (ROOT / "assets" / "social").glob("*.png"):
            payload = image.read_bytes()[:24]
            self.assertEqual(payload[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", payload[16:24])
            self.assertEqual((width, height), (1200, 630), image.name)


if __name__ == "__main__":
    unittest.main()
