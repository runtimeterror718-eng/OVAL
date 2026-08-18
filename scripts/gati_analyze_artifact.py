#!/usr/bin/env python3
"""Bounded, non-executing local inspection for APK/XAPK/archive evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from shield.gati import analyse_application_artifact


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Statically inspect an application artifact without executing it."
    )
    parser.add_argument("artifact", type=Path)
    parser.add_argument(
        "--max-mb",
        type=int,
        default=250,
        help="Reject artifacts larger than this limit (default: 250 MB).",
    )
    args = parser.parse_args()
    if args.max_mb < 1 or args.max_mb > 1024:
        parser.error("--max-mb must be between 1 and 1024")
    output = analyse_application_artifact(
        args.artifact.resolve(), max_bytes=args.max_mb * 1024 * 1024
    )
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
