#!/usr/bin/env python3
"""Apply the shared article shell while preserving normalized article-body text."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

ARTICLES = {
    "ibex.html": {
        "ticker": "IBEX", "date": "2026-07-28", "rating": "Hold", "target": "$40",
        "price": "$36.40", "range": "$30–$48", "method": "DCF and forward-multiple cross-check",
        "falsifier": "Automation cannibalises traditional revenue faster than measurable AI-enabled revenue replaces it.",
    },
    "firstservice.html": {
        "ticker": "FSV", "date": "2026-07-24", "rating": "Buy", "target": "$182",
        "price": "$137.46", "range": "$114–$209", "method": "EV/EBITDA peer and scenario valuation",
        "falsifier": "Brands records two more periods of negative organic growth while margins continue to deteriorate.",
    },
    "tamboran.html": {
        "ticker": "TBN", "date": "2026-07-28", "rating": "Hold", "target": "$23",
        "price": "Not stated in article", "range": "$10–$50", "method": "Per-acre framework and scenario NAV",
        "falsifier": "First gas slips again, reserve booking remains limited, or dilution accelerates.",
    },
    "rex.html": {
        "ticker": "REX", "date": "2026-07-27", "rating": "Hold", "target": "$34",
        "price": "$43.70", "range": "$18.71–$43.46", "method": "Normalized-margin EV/EBITDA scenarios",
        "falsifier": "Gross margins remain above 16% for several quarters and the 45Z run rate proves durable.",
    },
    "nordic-american-tankers.html": {
        "ticker": "NAT", "date": "2026-07-24", "rating": "Hold", "target": "$4.50",
        "price": "$6.45", "range": "$1.73–$4.82 displayed", "method": "TCE reverse valuation and peer multiple",
        "falsifier": "Suezmax TCE remains securely above $50,000 as elevated ton-mile demand persists.",
    },
}


def text_match(source, pattern):
    match = re.search(pattern, source, re.S | re.I)
    if not match:
        raise ValueError(f"Missing pattern: {pattern}")
    return html.unescape(re.sub(r"<[^>]+>", "", match.group(1))).strip()


def slugify(value):
    value = html.unescape(re.sub(r"<[^>]+>", "", value)).lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def extract_article_body(source):
    start_match = re.search(r'<div class="article-body">', source)
    if not start_match:
        raise ValueError("Missing article body")
    start = start_match.start()
    cursor = start
    depth = 0
    for tag in re.finditer(r"<div\b[^>]*>|</div>", source[start:], re.I):
        absolute_end = start + tag.end()
        if tag.group(0).lower().startswith("<div"):
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return source[start:absolute_end]
        cursor = absolute_end
    raise ValueError(f"Unclosed article body after {cursor}")


def enhance_body(body):
    headings = []
    seen = {}

    def heading_replacement(match):
        content = match.group(1)
        base = slugify(content)
        seen[base] = seen.get(base, 0) + 1
        identifier = base if seen[base] == 1 else f"{base}-{seen[base]}"
        headings.append((identifier, html.unescape(re.sub(r"<[^>]+>", "", content))))
        return f'<h2 id="{identifier}">{content}</h2>'

    body = re.sub(r'<h2(?: id="[^"]+")?>(.*?)</h2>', heading_replacement, body, flags=re.S | re.I)
    body = re.sub(
        r'<li(?: data-source-status="review" title="Official source link pending verification")?>([^<]+)</li>',
        lambda match: f'<li data-source-status="review" title="Official source link pending verification">{match.group(1)}</li>',
        body,
    )
    body = body.replace("<figcaption>", '<div class="figcaption">').replace("</figcaption>", "</div>")
    return body, headings


def build_page(filename, source, metadata):
    title = text_match(source, r"<title>(.*?)</title>")
    headline = text_match(source, r"<h1>(.*?)</h1>")
    description = text_match(source, r'<meta name="description" content="(.*?)"')
    deck = text_match(source, r'<p class="deck">(.*?)</p>')
    kicker = text_match(source, r'<div class="article-kicker">(.*?)</div>')
    rating_line = text_match(source, r'<div class="rating-pill">(.*?)</div>')
    body, headings = enhance_body(extract_article_body(source))
    toc = "".join(f'<li><a href="#{identifier}">{html.escape(label)}</a></li>' for identifier, label in headings)
    canonical = f"https://maxellaguiran.github.io/{filename}"
    social = f"https://maxellaguiran.github.io/assets/social/{filename.removesuffix('.html')}.png"
    structured = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": headline,
        "description": description,
        "url": canonical,
        "mainEntityOfPage": canonical,
        "datePublished": metadata["date"],
        "author": {"@type": "Person", "name": "Maxell Agustin Aguiran", "url": "https://maxellaguiran.github.io/"},
        "image": social,
    }
    browser_title = title if len(title) <= 70 else f"{metadata['ticker']} Valuation Report | Maxell Aguiran"
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{html.escape(browser_title)}</title>
  <meta name="description" content="{html.escape(description, quote=True)}">
  <link rel="canonical" href="{canonical}"><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta name="theme-color" content="#F7FAF7">
  <meta property="og:type" content="article"><meta property="og:site_name" content="Maxell Aguiran"><meta property="og:title" content="{html.escape(headline, quote=True)}"><meta property="og:description" content="{html.escape(description, quote=True)}"><meta property="og:url" content="{canonical}"><meta property="og:image" content="{social}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="article:published_time" content="{metadata['date']}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{html.escape(headline, quote=True)}"><meta name="twitter:description" content="{html.escape(description, quote=True)}"><meta name="twitter:image" content="{social}">
  <link rel="stylesheet" href="styles.css">
  <script type="application/ld+json">{json.dumps(structured, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')}</script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <progress class="reading-progress" data-reading-progress aria-label="Reading progress" value="0" max="100"></progress>
  <header class="site-header"><a class="brand" href="index.html"><img class="brand-mark" src="assets/dragon-mark.svg" width="32" height="32" alt=""><span>Maxell Aguiran</span></a><button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-navigation" aria-label="Open navigation" data-nav-toggle><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><nav class="site-nav" id="site-navigation" aria-label="Primary navigation"><a href="dragon-analytics.html">Services</a><a href="index.html#proof">Worked examples</a><a href="writing.html" aria-current="page">Research</a><a href="dragon-analytics.html#contact">Contact</a></nav></header>
  <main class="article-shell" id="main">
    <a class="back" href="writing.html#reports">← Back to research collection</a>
    <article>
      <header class="article-header"><div class="article-kicker">{html.escape(kicker)}</div><h1>{html.escape(headline)}</h1><p class="deck">{html.escape(deck)}</p><div class="rating-pill">{html.escape(rating_line)}</div></header>
      <section class="decision-summary" aria-labelledby="decision-summary-title"><h2 id="decision-summary-title">Decision summary</h2><div class="decision-grid"><div class="decision-item"><span>Rating</span><strong>{metadata['rating']}</strong></div><div class="decision-item"><span>12-month target</span><strong>{metadata['target']}</strong></div><div class="decision-item"><span>Reference price</span><strong>{metadata['price']}</strong></div><div class="decision-item"><span>Reference date</span><strong>{metadata['date']}</strong></div><div class="decision-item"><span>Scenario range</span><strong>{metadata['range']}</strong></div><div class="decision-item"><span>Valuation method</span><strong>{metadata['method']}</strong></div><div class="decision-item wide"><span>Principal falsifier</span><strong>{metadata['falsifier']}</strong></div></div></section>
      <div class="article-layout"><nav class="article-toc" aria-label="On this page"><strong>On this page</strong><ol>{toc}</ol></nav>{body}</div>
      <div class="disclaimer">This writing sample is for portfolio purposes only and is not investment advice. Market prices and estimates reflect the reference dates shown. Source labels remain plain text where an exact official destination has not yet been verified; those entries are marked for editorial review in the page source rather than linked by guesswork.</div>
    </article>
  </main>
  <footer class="site-footer"><div><div class="footer-brand"><img class="foot-mark" src="assets/dragon-mark.svg" width="32" height="32" alt=""><span>Maxell Aguiran · Equity research</span></div><div>Portfolio research and predictive analytics. © 2026 Maxell Agustin Aguiran.</div></div><nav class="footer-links" aria-label="Footer navigation"><a href="mailto:maxell.aguiran@gmail.com">Email</a><a href="https://github.com/MaxellAguiran">GitHub</a><a href="writing.html">Research</a><a href="dragon-analytics.html">Services</a></nav></footer>
  <script type="module" src="scripts/site.mjs"></script>
</body>
</html>
'''


def main():
    for filename, metadata in ARTICLES.items():
        path = ROOT / filename
        path.write_text(build_page(filename, path.read_text(encoding="utf-8"), metadata), encoding="utf-8")
        print(f"Enhanced {filename}")


if __name__ == "__main__":
    main()
