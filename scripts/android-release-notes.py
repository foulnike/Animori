import argparse
from pathlib import Path
import re
from uuid import uuid4


SECTION = re.compile(r"^##[ \t]+\\?\[(\d+\.\d+\.\d+)\\?\](?:[ \t].*)?$")
LEGAL = (
    "— Политика: https://github.com/foulnike/Animori/blob/main/docs/PRIVACY.md"
    " · Условия: https://github.com/foulnike/Animori/blob/main/docs/TERMS.md"
)


def notes_for_version(changelog: Path, version: str) -> str:
    lines = changelog.read_text(encoding="utf-8-sig").splitlines()
    sections = [
        (index, match[1])
        for index, line in enumerate(lines)
        if (match := SECTION.fullmatch(line))
    ]

    for index, (start, current_version) in enumerate(sections):
        if current_version != version:
            continue

        end = sections[index + 1][0] if index + 1 < len(sections) else len(lines)
        section = lines[start + 1 : end]
        intro_end = next(
            (offset for offset, line in enumerate(section) if line.lstrip().startswith("#")),
            len(section),
        )
        body = "\n".join(section[:intro_end]).strip() or "\n".join(section).strip()
        if not body:
            raise SystemExit(f"Раздел {version} в {changelog} пуст")
        if len(body) > 1200:
            body = body[:1200].rstrip() + "…"
        return f"{body}\n\n{LEGAL}"

    raise SystemExit(f"Раздел {version} не найден в {changelog}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("changelog", type=Path)
    parser.add_argument("version")
    parser.add_argument("--github-output", action="store_true")
    args = parser.parse_args()
    notes = notes_for_version(args.changelog, args.version)
    if args.github_output:
        delimiter = uuid4().hex
        print(f"body<<{delimiter}\n{notes}\n{delimiter}")
    else:
        print(notes)
