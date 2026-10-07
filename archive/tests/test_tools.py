"""Tests for the archive tooling (not for any one playbook)."""

from datetime import date

import pytest

from rulesarchive import params
from rulesarchive.household import Household
from tools import check_changes
from tools.fetch import Fetched, normalize, redact, strip_active_content


def test_parameter_lookup_picks_value_in_effect():
    assert params.get("federal.cms.part_b_standard_premium", date(2025, 6, 1)).value == 185.00
    assert params.get("federal.cms.part_b_standard_premium", date(2026, 6, 1)).value == 202.90


def test_parameter_lookup_before_any_value_is_unresolved():
    with pytest.raises(params.ParameterUnresolved):
        params.get("federal.cms.part_b_standard_premium", date(2019, 1, 1))


def test_mapping_values_accept_int_keys():
    pv = params.get("federal.hhs.poverty_guideline_annual", date(2026, 3, 1))
    assert pv[1] == 15960 and pv["additional"] == 5680


def test_household_rejects_unknown_income_kind():
    with pytest.raises(ValueError):
        Household.from_dict({"state": "ny", "members": [{"id": "a", "age": 70}],
                             "incomes": [{"kind": "lottery", "monthly": 5, "owner": "a"}]})


def test_html_normalization_drops_scripts_and_keeps_text():
    # Fake token assembled at runtime so the repo's secret scanner never sees a literal key shape.
    token = b"pk." + b"eyJ" + b"abcdefghijk.lmnopqrstuvw.xyz1234567890"
    html = b"<html><body><script>var k='" + token + b"'</script><p>Limit is $1,836</p></body></html>"
    assert "Limit is $1,836" in normalize(html, "html")
    stored = strip_active_content(html)
    assert b"<script" not in stored and token not in stored


def test_redact_replaces_credential_shapes():
    fake = b"AK" + b"IA" + b"ABCDEFGHIJKLMNOP"
    out, n = redact(b"token: '" + fake + b"'")
    assert n == 1 and fake not in out


def test_change_detection_flags_dependents_by_state(monkeypatch, tmp_path):
    """A changed NY directive must flag the NY rules and parameters that cite it."""
    from rulesarchive.registry import iter_parts

    part = next(p for p in iter_parts() if p.label == "msp/ny")
    src = next(s for s in part.sources if s["id"] == "ny-gis-26-ma-05-att1")

    def fake_fetch(url, timeout=60):
        text = "New York State Income and Resource Standards\nQualified Medicare Beneficiary (QMB) 138% FPL 1,900 2,550\n"
        return Fetched(url, url, 200, "application/pdf", b"%PDF-fake", text)

    monkeypatch.setattr(check_changes, "fetch", fake_fetch)
    monkeypatch.setattr(check_changes, "REPORTS", tmp_path)
    result = check_changes.check_one(part, src)
    assert result.status == "changed"
    assert any("1,900" in ln for ln in result.number_lines)
    report = check_changes.render([result], check_changes.dependents_index(), date(2026, 10, 7))
    ny_section = report.split("### New York")[1]
    assert "MSP-NY-QMB-INCOME" in ny_section
    assert "ny.msp.qmb_income_limit_monthly" in ny_section


def test_change_detection_reports_unreachable_imported_source(monkeypatch, tmp_path):
    from rulesarchive.registry import iter_parts

    part = next(p for p in iter_parts() if p.label == "msp/ny")
    src = next(s for s in part.sources if s["id"] == "nysofa-hiicap-msp-2026")
    monkeypatch.setattr(check_changes, "fetch", lambda url, timeout=60: Fetched(url, url, 403, "text/html", b"", ""))
    assert check_changes.check_one(part, src).status == "manual"


def test_archive_validates():
    from tools.validate import validate

    rep, _ = validate()
    assert rep.errors == [], "\n".join(rep.errors[:30])
