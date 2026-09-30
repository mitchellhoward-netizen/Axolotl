"""Nothing non-commercial may be pinned loosely or shipped as sellable."""
from adaptcalc import source

SELLABLE = {"https://creativecommons.org/licenses/by/4.0/", "https://creativecommons.org/licenses/by-sa/4.0/"}


def test_sellable_books_are_cc_by_and_pinned_to_an_exact_commit():
    for b in source.BOOKS.values():
        if b.commercial:
            assert b.license_url in SELLABLE, b.id
            assert len(b.ref) == 40 and b.ref != "main", b.id
        assert b.authors, b.id


def test_calculus_volume_1_is_not_sellable():
    assert not source.BOOKS["calc1"].commercial


def test_fetched_collections_declare_the_license_we_rely_on():
    for book in source.BOOKS:
        source.chapter_modules(book)  # raises LicenseMismatch if the cached source says otherwise


def test_attribution_names_authors_license_and_changes():
    line = source.attribution_line("pa2e")
    assert "Marecek" in line and "CC BY 4.0" in line and "creativecommons.org/licenses/by/4.0" in line
    assert "openstax.org/books/prealgebra-2e" in line and "adapted" in line.lower()
