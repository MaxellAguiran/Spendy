import hashlib
import json
import re
import unicodedata
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HASH_FIXTURE = ROOT / "tests" / "fixtures" / "article-body-hashes.json"


class ArticleBodyParser(HTMLParser):
    """Extract visible text from the first .article-body element."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if self.depth:
            self.depth += 1
        elif "article-body" in attributes.get("class", "").split():
            self.depth = 1

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.parts.append(data)


def normalized_article_text(path):
    parser = ArticleBodyParser()
    parser.feed(path.read_text(encoding="utf-8"))
    if not parser.parts:
        raise AssertionError(f"{path.name} has no .article-body content")
    return re.sub(
        r"\s+",
        " ",
        unicodedata.normalize("NFC", "".join(parser.parts)),
    ).strip()


class ArticleIntegrityTests(unittest.TestCase):
    def test_published_article_body_text_matches_frozen_hashes(self):
        """A copy or markup edit must not alter any published article-body text."""
        expected = json.loads(HASH_FIXTURE.read_text(encoding="utf-8"))
        actual = {}
        for filename in expected:
            text = normalized_article_text(ROOT / filename)
            actual[filename] = hashlib.sha256(text.encode("utf-8")).hexdigest()
        self.assertEqual(expected, actual)


if __name__ == "__main__":
    unittest.main()
