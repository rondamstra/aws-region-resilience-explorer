#!/usr/bin/env python3
"""Lightweight, dependency-free validator for data/regions.v1.json.

Checks every record against data/regions.schema.json (draft 2020-12 subset:
types, enums, required, additionalProperties, min/max, const, minItems,
minLength, patterns) PLUS the cross-field contract rules from DATA_CONTRACT.md
that a plain schema cannot express:
  - regionCode is a unique primary key
  - launchYear <= generatedDate year (and >= 2006)
  - MVP scope: every geographyType == "commercial"

Exit 0 and print a PASS line on success; exit 1 and list violations otherwise.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "regions.v1.json"
SCHEMA = HERE / "regions.schema.json"

errors = []


def fail(msg):
    errors.append(msg)


def check_type(val, t, where):
    ok = {
        "object": lambda v: isinstance(v, dict),
        "array": lambda v: isinstance(v, list),
        "string": lambda v: isinstance(v, str),
        "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    }[t]
    if not ok(val):
        fail(f"{where}: expected type {t}, got {type(val).__name__}")
        return False
    return True


def resolve(schema, root):
    if "$ref" in schema:
        ref = schema["$ref"]
        node = root
        for part in ref.lstrip("#/").split("/"):
            node = node[part]
        return node
    return schema


def validate(val, schema, root, where):
    schema = resolve(schema, root)
    t = schema.get("type")
    if t and not check_type(val, t, where):
        return
    if "const" in schema and val != schema["const"]:
        fail(f"{where}: expected const {schema['const']!r}, got {val!r}")
    if "enum" in schema and val not in schema["enum"]:
        fail(f"{where}: {val!r} not in enum {schema['enum']}")
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if "minimum" in schema and val < schema["minimum"]:
            fail(f"{where}: {val} < minimum {schema['minimum']}")
        if "maximum" in schema and val > schema["maximum"]:
            fail(f"{where}: {val} > maximum {schema['maximum']}")
    if isinstance(val, str):
        if "minLength" in schema and len(val) < schema["minLength"]:
            fail(f"{where}: string shorter than minLength {schema['minLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], val):
            fail(f"{where}: {val!r} does not match pattern {schema['pattern']}")
    if isinstance(val, list):
        if "minItems" in schema and len(val) < schema["minItems"]:
            fail(f"{where}: fewer than minItems {schema['minItems']}")
        item_schema = schema.get("items")
        if item_schema:
            for i, item in enumerate(val):
                validate(item, item_schema, root, f"{where}[{i}]")
    if isinstance(val, dict):
        props = schema.get("properties", {})
        for req in schema.get("required", []):
            if req not in val:
                fail(f"{where}: missing required property '{req}'")
        if schema.get("additionalProperties") is False:
            for k in val:
                if k not in props:
                    fail(f"{where}: unexpected property '{k}'")
        for k, sub in props.items():
            if k in val:
                validate(val[k], sub, root, f"{where}.{k}")


def main():
    data = json.loads(DATA.read_text())
    schema = json.loads(SCHEMA.read_text())

    validate(data, schema, schema, "$")

    # Cross-field contract rules
    regions = data.get("regions", []) if isinstance(data, dict) else []
    gen_year = None
    gd = data.get("generatedDate") if isinstance(data, dict) else None
    if isinstance(gd, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", gd):
        gen_year = int(gd[:4])

    seen = set()
    for i, r in enumerate(regions):
        if not isinstance(r, dict):
            continue
        rc = r.get("regionCode")
        if rc in seen:
            fail(f"regions[{i}]: duplicate regionCode '{rc}' (must be unique)")
        seen.add(rc)
        ly = r.get("launchYear")
        if gen_year is not None and isinstance(ly, int) and ly > gen_year:
            fail(f"regions[{i}] ({rc}): launchYear {ly} > generatedDate year {gen_year}")
        if r.get("geographyType") != "commercial":
            fail(f"regions[{i}] ({rc}): geographyType must be 'commercial' for MVP scope")

    if errors:
        print(f"FAIL: {len(errors)} violation(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    print(
        f"PASS: {len(regions)} region record(s) validate against "
        f"regions.schema.json and all DATA_CONTRACT.md constraints "
        f"(unique regionCode, launchYear<=generatedDate year, geographyType=commercial)."
    )


if __name__ == "__main__":
    main()
