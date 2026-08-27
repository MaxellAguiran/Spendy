import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = [
    "index.html",
    "articles/how-to-read-a-10-k.html",
    "articles/free-cash-flow.html",
    "articles/dividend-yield-vs-total-return.html",
    "404.html",
]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.titles = 0
        self.descriptions = 0
        self.canonical = []
        self.og_images = []
        self.h1_count = 0
        self.ids = set()
        self.links = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.add(attributes["id"])
        if tag == "title":
            self.titles += 1
        elif tag == "meta" and attributes.get("name") == "description":
            self.descriptions += 1
        elif tag == "link" and attributes.get("rel") == "canonical":
            self.canonical.append(attributes.get("href"))
        elif tag == "meta" and attributes.get("property") == "og:image":
            self.og_images.append(attributes.get("content"))
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"])


def parse_page(relative_path):
    parser = PageParser()
    parser.feed((ROOT / relative_path).read_text(encoding="utf-8"))
    return parser


class PortfolioContractTests(unittest.TestCase):
    def test_public_portfolio_pages_have_complete_discovery_metadata(self):
        for page in PUBLIC_PAGES:
            with self.subTest(page=page):
                parser = parse_page(page)
                self.assertEqual(parser.titles, 1)
                self.assertEqual(parser.descriptions, 1)
                self.assertEqual(parser.h1_count, 1)
                self.assertEqual(len(parser.canonical), 1)
                self.assertTrue(parser.canonical[0].startswith("https://maxellaguiran.github.io/"))
                self.assertEqual(len(parser.og_images), 1)
                image_path = urlsplit(parser.og_images[0]).path.lstrip("/")
                self.assertTrue((ROOT / image_path).is_file(), image_path)

    def test_portfolio_navigation_resolves_and_does_not_retain_the_replaced_brand(self):
        for page in PUBLIC_PAGES:
            parser = parse_page(page)
            source = (ROOT / page).read_text(encoding="utf-8").casefold()
            with self.subTest(page=page):
                self.assertNotIn("spendy", source)
                for link in parser.links:
                    parts = urlsplit(link)
                    if parts.scheme in {"https", "http", "mailto"}:
                        continue
                    target = (ROOT / page).parent / unquote(parts.path or Path(page).name)
                    self.assertTrue(target.resolve().is_file(), f"Missing linked file {target}")
                    if parts.fragment and target.suffix == ".html":
                        self.assertIn(unquote(parts.fragment), parse_page(target.resolve().relative_to(ROOT)).ids)

    def test_homepage_lists_three_portfolio_samples_and_a_direct_contact_path(self):
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        for path in PUBLIC_PAGES[1:4]:
            with self.subTest(path=path):
                self.assertIn(f'href="{path}"', homepage)
        self.assertIn("mailto:maxell.aguiran@gmail.com?subject=Freelance%20writing%20enquiry", homepage)
        self.assertIn("Finance &amp; Investing Writer", homepage)

    def test_sitemap_lists_only_the_portfolio_and_writing_samples(self):
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        expected = {
            "https://maxellaguiran.github.io/",
            "https://maxellaguiran.github.io/articles/how-to-read-a-10-k.html",
            "https://maxellaguiran.github.io/articles/free-cash-flow.html",
            "https://maxellaguiran.github.io/articles/dividend-yield-vs-total-return.html",
        }
        for url in expected:
            self.assertIn(f"<loc>{url}</loc>", sitemap)
        self.assertNotIn("case-study", sitemap)
        self.assertNotIn("monthly-ad-report", sitemap)


if __name__ == "__main__":
    unittest.main()
