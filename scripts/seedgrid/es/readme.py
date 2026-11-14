"""Rebuild the puzzle sections of the review README from each puzzle's review.md.
  python3 scripts/seedgrid/es/readme.py artifacts/seedgrid-es/2026-11-22
The text before the first puzzle section and from "## Word list" on is hand-written and kept as it is."""
import os, re, sys
day = sys.argv[1]
path = os.path.join(day, "README.md")
text = open(path, encoding="utf-8").read()
head = text[: text.index("\n---\n## ")]
tail = text[text.index("## Word list"):]
parts = []
for slot in ("mini", "midi", "plus", "large"):
    md = open(os.path.join(day, slot, "review.md"), encoding="utf-8").read()
    md = md[: md.index("## How it was built")].rstrip()
    parts.append(re.sub(r"^(#+ )", r"#\1", md, flags=re.M))
open(path, "w", encoding="utf-8").write(head + "\n---\n" + "\n\n---\n".join(parts) + "\n\n\n---\n\n" + tail)
