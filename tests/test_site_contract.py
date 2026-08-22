import json
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
ACTIVE_SERVICE_PAGES = ["index.html", "case-study.html", "labs/monthly-ad-report.html"]
POLICY_PAGES = ["privacy.html", "audit-terms.html"]
RETIRED_PAGES = [
    "dragon-analytics.html", "writing.html", "404.html", "labs/marketing-allocation.html", "labs/churn-risk.html",
    "ibex.html", "firstservice.html", "tamboran.html", "rex.html", "nordic-american-tankers.html",
]
PUBLIC_PAGES = [*ACTIVE_SERVICE_PAGES, *POLICY_PAGES, *RETIRED_PAGES]


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

    def test_spendy_routes_brand_and_indexing_contract(self):
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
        for page in [*POLICY_PAGES, *(page for page in RETIRED_PAGES if page != "dragon-analytics.html")]:
            parser = parse_page(page)
            self.assertTrue(any("noindex" in directive.casefold() for directive in parser.robots))
            self.assertNotIn(f"<loc>{parser.canonical[0]}</loc>", sitemap)

        dragon = (ROOT / "dragon-analytics.html").read_text(encoding="utf-8")
        self.assertIn("This route is no longer published", dragon)
        self.assertIn('href="index.html"', dragon)
        self.assertIn('href="case-study.html"', dragon)
        self.assertIn('href="labs/monthly-ad-report.html"', dragon)
        dragon_parser = parse_page("dragon-analytics.html")
        self.assertIn("noindex,follow", dragon_parser.robots)
        self.assertEqual(dragon_parser.canonical, ["https://maxellaguiran.github.io/"])
        self.assertNotIn("https://maxellaguiran.github.io/dragon-analytics.html", sitemap)

    def test_homepage_is_a_roas_audit_funnel_with_a_single_qualification_form(self):
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        parser = parse_page("index.html")
        for phrase in (
            "Spendy — Improve ROAS and Optimize Your Ad Budget",
            "For agencies and in-house growth teams",
            "Improve ROAS with a smarter ad budget.",
            "Spendy audits up to two ad platforms and Shopify to find where spend should increase, hold, reduce, or stop—so the same budget can support stronger returns and more profitable growth.",
            "Every ad reviewed", "Up to 100 ads", "2 ad platforms + Shopify", "€1,500 total",
            "Delivered within 3 business days after accepted exports", "Check if your account is a fit",
            "See the evidence", "No plan yet is a valid answer.", "Know what to change before the next budget cycle.",
            "What is evidence—and what is not.", "A decision pack built for the budget meeting.",
            "From fit check to finished audit.", "One fixed audit. €1,500 total.",
            "Check if your account is a fit.", "For agencies", "For in-house teams",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, homepage)
        for fragment in ("deliverable", "evidence", "process", "price", "contact"):
            self.assertIn(fragment, parser.ids)
        self.assertEqual(parser.forms, 1)
        self.assertIn('id="spendy-qualification"', homepage)
        self.assertIn('action="mailto:maxell.aguiran@gmail.com', homepage)
        self.assertIn('scripts/qualification.mjs', homepage)
        self.assertIn('src="assets/spendy-crew-hero.png"', homepage)
        self.assertIn('data-case-study', homepage)
        self.assertIn('data-ad-report', homepage)
        for prohibited in (
            "guaranteed roas", "guaranteed profit", "will improve roas", "will increase profit",
            "proven savings", "risk-free",
        ):
            with self.subTest(prohibited=prohibited):
                self.assertNotIn(prohibited, homepage.casefold())

    def test_qualification_form_collects_only_the_approved_fit_information(self):
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        for field in (
            "full_name", "work_email", "company", "team_type", "website", "platform_one", "platform_two",
            "monthly_spend", "ad_count", "uses_shopify", "primary_outcome", "budget_problem", "privacy_consent",
        ):
            with self.subTest(field=field):
                self.assertIn(f'name="{field}"', homepage)
        for phrase in (
            "Under €5,000", "€5,000–€9,999", "€10,000–€24,999", "€25,000–€49,999",
            "€50,000–€99,999", "€100,000+", "Prefer not to say", "More than 100",
            "Prepare review email", "Email Spendy directly", "privacy.html", "audit-terms.html",
            "No files, passwords, API keys, or customer-level Shopify exports belong in this form.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, homepage)
        self.assertNotIn('type="file"', homepage)

    def test_homepage_structured_data_describes_the_fixed_fee_service(self):
        values = [json.loads(value) for value in parse_page("index.html").json_ld]
        page = next(value for value in values if value.get("@type") == "WebPage")
        service = page["mainEntity"]
        self.assertEqual(service["@type"], "Service")
        self.assertEqual(service["name"], "Spendy ROAS Budget Audit")
        self.assertEqual(service["offers"]["price"], "1500")
        self.assertEqual(service["offers"]["priceCurrency"], "EUR")
        self.assertEqual(service["areaServed"], "Europe")
        self.assertIn("Return on ad spend optimization", service["provider"]["knowsAbout"])

    def test_case_study_keeps_the_anonymous_engagement_separate_from_the_public_simulation(self):
        case = (ROOT / "case-study.html").read_text(encoding="utf-8")
        prohibited = (
            "we saved the client", "proven savings", "guaranteed return", "model name", "algorithm", "endpoint",
        )
        for phrase in prohibited:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, case.casefold())
        for phrase in (
            "Anonymous engagement context", "Public-data historical simulation", "Real client engagement · name withheld",
            "licensed public retail-advertising research", "not a verified native client advertising or commerce export",
            "Historical simulation using licensed public retail-advertising data.",
            "The €5,000 monthly budget and margin assumption are illustrative.",
            "The €4,304 difference is not realized client savings and does not promise future performance.",
            "data-case-study", "data-case-value", "data-case-chart",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, case)
        self.assertLess(case.index("Public-data historical simulation"), case.index("data-case-value"))
        self.assertLess(case.index("Historical simulation using licensed public retail-advertising data."), case.index("data-case-value"))
        self.assertIn('href="index.html#contact"', case)

    def test_case_structured_data_describes_article_and_separate_dataset(self):
        values = [json.loads(value) for value in parse_page("case-study.html").json_ld]
        article = next(value for value in values if value.get("@type") == "Article")
        dataset = next(value for value in values if value.get("@type") == "Dataset")
        self.assertEqual(article["publisher"]["name"], "Spendy")
        self.assertIn("not realized client savings", article["description"])
        self.assertEqual(dataset["identifier"], "https://doi.org/10.17632/hh7xps83z5.1")
        self.assertIn("creativecommons.org/licenses/by/4.0", dataset["license"])

    def test_sample_plan_is_disclosed_before_checked_results_and_links_to_the_qualification_form(self):
        report = (ROOT / "labs/monthly-ad-report.html").read_text(encoding="utf-8")
        disclosure = "Illustrative example — not a client result."
        self.assertIn(disclosure, report)
        self.assertLess(report.index(disclosure), report.index("data-report-content"))
        self.assertIn("data-report-cards", report)
        self.assertIn("data-report-rows", report)
        self.assertIn('<h2 class="visually-hidden">Your simple monthly plan</h2>', report)
        self.assertIn('href="../index.html#contact"', report)

    def test_policy_pages_publish_the_operational_data_and_audit_terms(self):
        privacy = (ROOT / "privacy.html").read_text(encoding="utf-8")
        terms = (ROOT / "audit-terms.html").read_text(encoding="utf-8")
        for phrase in (
            "The public qualification form prepares an email in your mail app.",
            "passwords", "API keys", "customer-level Shopify exports", "30 calendar days", "maxell.aguiran@gmail.com",
        ):
            with self.subTest(privacy=phrase):
                self.assertIn(phrase, privacy)
        for phrase in (
            "€1,500 total", "three business days", "No plan yet", "14 calendar days", "30 calendar days",
            "No follow-up call", "separate quote",
        ):
            with self.subTest(terms=phrase):
                self.assertIn(phrase, terms)

    def test_assets_and_social_cards_are_sized_and_present(self):
        for name in ("spendy-crew-hero.webp", "spendy-decision-scene.webp", "spendy-review-scene.webp"):
            asset = ROOT / "assets" / name
            self.assertTrue(asset.is_file(), name)
            self.assertLess(asset.stat().st_size, 180 * 1024, name)
        social_images = {image.name for image in (ROOT / "assets" / "social").glob("*.png")}
        self.assertEqual(social_images, {"home.png", "case-study.png", "monthly-ad-report.png"})
        for image in (ROOT / "assets" / "social").glob("*.png"):
            payload = image.read_bytes()[:24]
            self.assertEqual(payload[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", payload[16:24])
            self.assertEqual((width, height), (1200, 630), image.name)
        cards = json.loads((ROOT / "tools/social-cards.json").read_text(encoding="utf-8"))
        self.assertEqual({card["output"] for card in cards}, {"home.png", "case-study.png", "monthly-ad-report.png"})
        home_card = next(card for card in cards if card["output"] == "home.png")
        self.assertEqual(home_card, {
            "output": "home.png",
            "kicker": "Spendy · ROAS Budget Audit",
            "title": "Improve ROAS with a smarter ad budget.",
            "subtitle": "Clear budget moves for stronger returns and more profitable growth.",
        })


if __name__ == "__main__":
    unittest.main()
