"""What helping members get SSDI is worth to a multiemployer health fund.

    python -m research.disability_fund_economics.model      (from archive/)

Reads assumptions.yaml and prints, per 10,000 working-age covered members a
year, the health savings we cause (only the difference we make, not every
award) and a 20% share of them, at low / middle / high assumptions. Low uses
every low value and high every high value, so the range is wide on purpose.
"""

from __future__ import annotations

from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent


def load() -> dict:
    return yaml.safe_load((HERE / "assumptions.yaml").read_text())


def scenario(a: dict, case: str) -> dict:
    v = {k: a[k][case] if case in a[k] else a[k]["middle"] for k in a}
    awards = v["awards_per_10k_members_per_year"]
    covered = v["share_still_covered_at_medicare"]
    per_year = v["savings_per_member_year"]

    # Awards that happen only because of us: savings for the member's whole stay.
    incremental = awards * v["incremental_award_share"]
    from_incremental = incremental * covered * v["member_years_of_savings"] * per_year

    # Awards that would happen anyway, filed earlier: savings for the months gained.
    sped_up = awards * (1 - v["incremental_award_share"]) * v["share_touched_for_speed"]
    from_speed = sped_up * covered * v["months_earlier"] / 12 * per_year

    savings = from_incremental + from_speed
    return {
        "awards": awards,
        "incremental_awards": round(incremental, 1),
        "savings_from_new_awards": round(from_incremental),
        "savings_from_earlier_filing": round(from_speed),
        "savings": round(savings),
        "fee": round(savings * v["fee_share_of_savings"]),
        "per_member_per_month_fee": round(savings * v["fee_share_of_savings"] / 10000 / 12, 2),
    }


def main() -> None:
    a = load()
    rows = {case: scenario(a, case) for case in ("low", "middle", "high")}
    print("Per 10,000 working-age covered members, per year of outreach (2026 $)")
    for key in rows["middle"]:
        print(f"  {key:30} " + "  ".join(f"{rows[c][key]:>12,}" for c in rows))
    mid = rows["middle"]["fee"]
    print(f"\nMembers needed for $2.5M a year in fees at the middle case: {2_500_000 / mid * 10000:,.0f}")


if __name__ == "__main__":
    main()
