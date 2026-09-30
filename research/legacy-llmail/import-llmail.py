"""Select a small reproducible Jev corpus from Microsoft's LLMail-Inject files.

Usage: python3 scripts/import-llmail.py RAW_PHASE2.jsonl BENIGN_EMAILS.json
The source files are published at https://huggingface.co/datasets/microsoft/llmail-inject-challenge/tree/main/data
"""

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path


SUCCESS_FLAGS = (
    "email.retrieved",
    "defense.undetected",
    "exfil.sent",
    "exfil.destination",
    "exfil.content",
)
OUTPUT = Path(__file__).resolve().parent / "llmail-cases.json"


def fingerprint(text):
    return " ".join(text.casefold().split())


def grams(text):
    tokens = re.findall(r"\w+", text)
    return set(tuple(tokens[i : i + 4]) for i in range(len(tokens) - 3)) or {tuple(tokens)}


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def attack_candidates(path):
    seen = set()
    with open(path, encoding="utf-8") as source:
        for line in source:
            row = json.loads(line)
            flags = json.loads(row["objectives"])
            if not all(flags.get(name) is True for name in SUCCESS_FLAGS):
                continue
            text = f"Subject: {row['subject'] or ''}\nBody: {row['body'] or ''}"
            normalized = fingerprint(text)
            if normalized in seen or len(text) > 20_000:
                continue
            seen.add(normalized)
            yield row, text, normalized, grams(normalized)


def select_attacks(candidates, count=100):
    scenario_count = Counter()
    team_count = Counter()
    selected = []
    remaining = sorted(candidates, key=lambda item: digest(item[2]))
    while remaining and len(selected) < count:
        remaining.sort(key=lambda item: (
            scenario_count[item[0]["scenario"]],
            team_count[item[0]["team_id"]],
            digest(item[2]),
        ))
        chosen_index = next((i for i, item in enumerate(remaining) if all(
            len(item[3] & prior[3]) / len(item[3] | prior[3]) < 0.7
            for prior in selected
        )), None)
        if chosen_index is None:
            break
        chosen = remaining.pop(chosen_index)
        selected.append(chosen)
        scenario_count[chosen[0]["scenario"]] += 1
        team_count[chosen[0]["team_id"]] += 1
    if len(selected) != count:
        raise ValueError(f"Only {len(selected)} sufficiently distinct successful attacks found")
    return [{
        "sourceRowKey": row["RowKey"],
        "scenario": row["scenario"],
        "text": text,
    } for row, text, _, _ in selected]


def select_controls(path, count=20):
    emails = json.loads(Path(path).read_text(encoding="utf-8"))
    controls = [emails[i * len(emails) // count] for i in range(count)]
    if len(set(controls)) != count:
        raise ValueError("Benign controls are not distinct")
    return controls


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    attacks = select_attacks(list(attack_candidates(sys.argv[1])))
    controls = select_controls(sys.argv[2])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"attacks": attacks, "controls": controls},
                                 ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(attacks)} successful attack texts and {len(controls)} controls to {OUTPUT}")


if __name__ == "__main__":
    main()
