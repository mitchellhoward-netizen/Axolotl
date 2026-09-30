# Content licenses and provenance

Everything a learner sees comes from one of three places. Each has a license
that allows the use we make of it, recorded here with the exact version used.

## 1. Canonical textbook text (verbatim excerpts)

| Book | Authors | License | Exact source used | Sellable? |
|---|---|---|---|---|
| Prealgebra 2e | Lynn Marecek, MaryAnne Anthony-Smith, Andrea Honeycutt Mathis (OpenStax) | CC BY 4.0 | [openstax/osbooks-prealgebra-bundle @ c1bbed4](https://github.com/openstax/osbooks-prealgebra-bundle/tree/c1bbed4b86ff5c80686d339a6ca5e4e48fae2483) | yes |
| Algebra and Trigonometry 2e | Jay Abramson (OpenStax) | CC BY 4.0 | [openstax/osbooks-college-algebra-bundle @ d1bd19c](https://github.com/openstax/osbooks-college-algebra-bundle/tree/d1bd19c69107ba7f45775670809ae161d63db864) | yes |
| Calculus Volume 1 | Gilbert Strang, Edwin Herman (OpenStax) | CC BY-NC-SA 4.0 | openstax/osbooks-calculus-bundle @ main | **no**: personal study only |

**Why pinned commits.** On 2026-04-23 OpenStax changed the declared license of
its algebra books (Prealgebra 2e, Elementary Algebra 2e, Intermediate Algebra 2e,
College Algebra 2e, Algebra and Trigonometry 2e, Precalculus 2e) from CC BY 4.0 to
CC BY-NC-SA 4.0, in commits that changed only the license line. The last commits
before that (2026-04-09, linked above) declare CC BY 4.0 in the book's own
collection file. Creative Commons licenses are irrevocable for material already
released under them (CC BY 4.0 legal code, section 2(a)(1)), so we use exactly
those versions. `adaptcalc/source.py` fetches only from the pinned commit and
refuses to run if the fetched collection declares any other license
(`LicenseMismatch`). Figures are fetched from the same pinned commit.

**Calculus.** Calculus Volume 1 has never been CC BY. It stays available for
personal study only and is excluded from anything sold (`Book.commercial = False`,
enforced by `tests/test_licenses.py`). The sellable calculus course will be built
on *Active Calculus* (Boelkins, Austin, Schlicker; CC BY-SA 4.0), whose
adaptations must themselves be shared under CC BY-SA 4.0.

**Attribution** is printed on every packet (`source.attribution_line`): title,
authors, OpenStax as licensor, the license and its link, a link to the free
book, and a statement that the text was excerpted and adapted. The OpenStax and
Rice University names and logos are trademarks outside the license: they appear
only in that attribution, never as branding.

## 2. Generated material (ours)

Problem templates, the skill graph and prerequisite structure, the misconception
library, transition sentences, tutor replies and all software in this directory
are original to this project.

## 3. Candidate sources for the K–12 expansion (checked, not yet used)

| Source | License | Use |
|---|---|---|
| Illustrative Mathematics K–5, 6–8, Algebra 1, Geometry, Algebra 2 | CC BY 4.0 | K–8 lessons, HS geometry |
| Achieve the Core Coherence Map (Common Core prerequisite graph) | CC0 | K–12 skill-graph skeleton |
| Common Core Progressions documents | CC BY | misconceptions, sequencing |
| Active Calculus (single variable) | CC BY-SA 4.0 | sellable calculus |
| Earlier CC BY commits of Elementary Algebra 2e, Intermediate Algebra 2e, College Algebra 2e, Precalculus 2e | CC BY 4.0 | same pinning as above |

Not usable in a paid product: EngageNY/Eureka Math (CC BY-NC-SA), CK-12 (CC BY-NC),
current OpenStax releases (CC BY-NC-SA).

Fonts: Fira Sans (SIL Open Font License). KaTeX (MIT). Typst and cetz (Apache 2.0 / LGPL-3.0 packages loaded at render time).
