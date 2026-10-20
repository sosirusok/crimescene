#!/usr/bin/env python3
"""Make site-text subsets of Pretendard and write their @font-face rules.

Run after changing customer-facing text: python3 scripts/subset-fonts.py
Add --api to refresh scripts/subset-fonts-api.txt from the live public GET endpoints
(theme texts and notices) first. Needs fontTools and brotli (pip install fonttools brotli).

Each weight gets a small SiteSubset-<W>.woff2 with every character the site's own
source and the saved API text can show. The full Pretendard-<W>.woff2 stays as a second
@font-face for the remaining characters, so names and new notices still render in Pretendard.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public/fonts"
POLISH = ROOT / "pages-src/customer-polish.css"
API_TEXT = ROOT / "scripts/subset-fonts-api.txt"
SOURCES = ["pages-src/customer-final.js", "pages-src/shell.html", "pages-src/build.mjs", "pages-src/final.css", "pages-src/customer-polish.css"]
RUNTIME = "일월화수목금토오전후년"  # Intl ko-KR weekdays, 오전/오후 and 년 are generated in the browser.
PUNCTUATION = "\u00a0·×‥…–—‘’“”‧•※←↑→↓○●◎△▲▽▼□■◇◆☆★〈〉《》「」『』【】〔〕〜・ㆍ₩℃"
FACES = [("Regular", "400"), ("SemiBold", "600"), ("Bold", "700"), ("ExtraBold", "800 900")]
SUBSET = {"Regular", "Bold", "ExtraBold"}  # SemiBold is declared but not used by the site.
NAME = "SiteSubset"  # OFL: a subset is a Modified Version, so it must not carry the Reserved Font Name.


def ranges(codepoints, avoid=None, gap=0x20):
    """unicode-range text. With avoid, a range may also bridge short gaps that hold none of those codepoints."""
    out = []
    for cp in sorted(codepoints):
        last = out[-1][1] if out else None
        if last is not None and (cp == last + 1 or avoid is not None and cp - last <= gap and not any(c in avoid for c in range(last + 1, cp))):
            out[-1][1] = cp
        else:
            out.append([cp, cp])
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in out)


def face(file, weight, unicode_range=""):
    extra = f";unicode-range:{unicode_range}" if unicode_range else ""
    return f'@font-face{{font-family:"Pretendard";src:url("../fonts/{file}") format("woff2");font-style:normal;font-weight:{weight};font-display:swap{extra}}}'


def rename(font):
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16, 18, 21, 25):
            record.string = record.toUnicode().replace("Pretendard", NAME)


def refresh_api_text():
    code = (ROOT / "pages-src/customer-final.js").read_text(encoding="utf8")
    api, key = (re.search(rf'const {name} = "([^"]+)"', code).group(1) for name in ("API", "PUBLISHABLE_KEY"))
    text = ""
    for endpoint in ("bootstrap", "notices"):
        with urllib.request.urlopen(urllib.request.Request(f"{api}/{endpoint}", headers={"apikey": key}), timeout=30) as response:
            text += json.dumps(json.load(response), ensure_ascii=False)
    API_TEXT.write_text("".join(sorted({c for c in text if ord(c) > 0x7E})) + "\n", encoding="utf8")
    print(f"Updated {API_TEXT.relative_to(ROOT)}")


def main():
    if "--api" in sys.argv[1:]:
        refresh_api_text()
    text = "".join((ROOT / source).read_text(encoding="utf8") for source in SOURCES) + RUNTIME + PUNCTUATION
    if API_TEXT.exists():
        text += API_TEXT.read_text(encoding="utf8")
    wanted = {ord(c) for c in text if ord(c) > 0x7E} | set(range(0x20, 0x7F))
    faces = []
    for style, weight in FACES:
        full = f"Pretendard-{style}.woff2"
        if style not in SUBSET:
            faces.append(face(full, weight))
            continue
        font = TTFont(FONTS / full, recalcTimestamp=False)
        cmap = set(font.getBestCmap())
        keep = wanted & cmap
        options = subset.Options(layout_features=["*"], name_IDs=["*"], name_languages=["*"], flavor="woff2")
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=keep)
        subsetter.subset(font)
        rename(font)
        font.flavor = "woff2"
        target = FONTS / f"{NAME}-{style}.woff2"
        font.save(target)
        faces.append(face(target.name, weight, ranges(keep)))
        faces.append(face(full, weight, ranges(cmap - keep, wanted)))
        print(f"{target.relative_to(ROOT)}: {len(keep)} characters, {target.stat().st_size:,} bytes (full file {(FONTS / full).stat().st_size:,})")
    lines = POLISH.read_text(encoding="utf8").split("\n")
    while lines and lines[0].startswith("@font-face"):
        lines.pop(0)
    POLISH.write_text("\n".join(faces + lines), encoding="utf8")
    print(f"Updated {POLISH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
