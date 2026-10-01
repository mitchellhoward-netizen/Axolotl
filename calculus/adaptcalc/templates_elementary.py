"""Elementary templates (course `elementary`, Marginalia Elementary Mathematics, K-5).

Same contract as templates.py: build a problem constructively, check the key independently, and
give a worked solution (so the first problem of a lesson can be faded). Pictures are Typst calls
from typst/figures.typ; `plain` names the picture in words for the transcriber and the Jev gate.
"""
from __future__ import annotations

from fractions import Fraction as F

import sympy as sp

from .symtyp import typ as T
from .templates import check, template
from .templates_algebra import OU, V


def C(value: str, *aliases: str) -> dict:
    return {"kind": "choice", "value": value, "aliases": list(aliases)}


def cmp_key(a, b, ta: str | None = None, tb: str | None = None) -> tuple[dict, str]:
    """The sign that compares a with b, accepting '<' alone or the whole statement either way round."""
    s = "<" if a < b else ">" if a > b else "="
    flip = {"<": ">", ">": "<", "=": "="}[s]
    ta, tb = ta or str(a), tb or str(b)
    return C(s, f"{ta} {s} {tb}", f"{tb} {flip} {ta}"), s


def fr(q: F) -> str:
    """Typst for a fraction."""
    return f"{q.numerator}/{q.denominator}" if q.denominator != 1 else str(q.numerator)


def comma(n: int) -> str:
    """12,345 in Typst math (the comma not read as a separator)."""
    return f"{n:,}".replace(",", "{,}")


def clock_t(h: int, m: int) -> str:
    return f"{h}:{m:02d}"


def time_key(h: int, m: int) -> dict:
    words = {0: "o'clock", 30: "thirty"}
    al = [f"{h} {m:02d}", f"{h}.{m:02d}"]
    if m == 0:
        al += [f"{h} o'clock", f"{h}"]
    if m == 30:
        al += [f"half past {h}"]
    return C(clock_t(h, m), *al)


def SOL(*lines: str) -> list[str]:
    return list(lines)


# ============================================================ Kindergarten

@template("k_count.dots", "k_count", guess=0.1, work_lines=2,
          substeps=["touch each one and say one number", "the last number is how many"],
          strategies={"count_one_by_one": "count one by one", "subitize": "see it at a glance", **OU})
def _(rng):
    n = rng.randint(4, 20)
    shape = rng.choice(["dot", "star", "square"])
    word = {"dot": "dots", "star": "stars", "square": "squares"}[shape]
    check(n == len(list(range(n))), "count")
    return {"prompt": f"How many {word}? #counters({n}, shape: \"{shape}\")", "plain": f"How many {word}? (picture: {n} {word} in rows of 5)",
            "key": V(n), "display": str(n), "verified": f"{n} drawn", "work_lines": 1,
            "solution": SOL(f"1, 2, 3, ..., {n}", f"{n}")}


@template("k_numerals.teen", "k_numerals", requires=["k_count"], guess=0.05, work_lines=1,
          substeps=["one ten", "and some ones"], strategies={"ten_and_ones": "ten and some more", **OU})
def _(rng):
    k = rng.randint(1, 9)
    n = 10 + k
    check(n // 10 == 1 and n % 10 == k, "teen")
    return {"prompt": f"Write the number for ten and {k} more. #tenframe({n})", "plain": f"Write the number for ten and {k} more (ten frame picture of {n}).",
            "key": V(n), "display": str(n), "verified": f"10 + {k} = {n}", "solution": SOL(f"10 + {k}", f"{n}")}


@template("k_compare.greater", "k_compare", requires=["k_count"], guess=0.5, work_lines=1,
          substeps=["count each group", "the number said later is greater"], strategies={"count": "count both", "match": "match one to one", **OU})
def _(rng):
    a, b = rng.sample(range(1, 11), 2)
    ask = rng.choice(["more", "fewer"])
    if rng.random() < 0.5:
        want = max(a, b) if ask == "more" else min(a, b)
        return {"prompt": f"Which number is {'greater' if ask == 'more' else 'less'}, {a} or {b}?", "plain": f"Which is {'greater' if ask == 'more' else 'less'}, {a} or {b}?",
                "key": V(want), "display": str(want), "verified": f"{'max' if ask == 'more' else 'min'}({a}, {b}) = {want}",
                "solution": SOL(f"{min(a, b)} < {max(a, b)}", f"{want}")}
    want = "filled" if (a > b) == (ask == "more") else "open"
    return {"prompt": f"Which group has {ask}, the filled dots or the open dots? #groups({a}, {b})",
            "plain": f"Which group has {ask}: {a} filled dots or {b} open dots?",
            "key": C(want, f"the {want} dots", f"{want} dots", str(a if want == 'filled' else b)), "display": f'"{want}"',
            "verified": f"{a} vs {b}", "solution": SOL(f"{a} \"and\" {b}", f"\"{want}\"")}


@template("k_addsub.within10", "k_addsub", requires=["k_count"], guess=0.05, work_lines=2,
          substeps=["show the first amount", "put together or take away", "count what there is"],
          strategies={"count_all": "count all", "count_on": "count on", "fact": "known fact", **OU})
def _(rng):
    if rng.random() < 0.5:
        a = rng.randint(1, 9)
        b = rng.randint(1, 10 - a)
        q = rng.choice([f"Add: ${a} + {b}$", f"There are {a} birds. {b} more come. How many birds now?"])
        return {"prompt": q, "plain": q.replace("$", ""), "key": V(a + b), "display": str(a + b), "verified": f"{a}+{b}={sp.Integer(a) + b}",
                "solution": SOL(f"{a} + {b}", f"= {a + b}")}
    a = rng.randint(3, 10)
    b = rng.randint(1, a - 1)
    q = rng.choice([f"Subtract: ${a} - {b}$", f"You have {a} grapes and eat {b}. How many are left?"])
    return {"prompt": q, "plain": q.replace("$", ""), "key": V(a - b), "display": str(a - b), "verified": f"{a}-{b}={sp.Integer(a) - b}",
            "solution": SOL(f"{a} - {b}", f"= {a - b}")}


@template("k_make10.partner", "k_make10", requires=["k_addsub"], guess=0.1, work_lines=1,
          substeps=["count the empty spaces"], strategies={"ten_frame": "count empty spaces", "fact": "known pair", **OU})
def _(rng):
    a = rng.randint(1, 9)
    if rng.random() < 0.5:
        q, plain = f"How many more dots make 10? #tenframe({a})", f"How many more dots make 10? (ten frame with {a} dots)"
    else:
        q, plain = f"${a} + square = 10$. What number goes in the box?", f"{a} + [ ] = 10"
    check(a + (10 - a) == 10, "ten")
    return {"prompt": q, "plain": plain, "key": V(10 - a), "display": str(10 - a), "verified": f"{a} + {10 - a} = 10",
            "solution": SOL(f"{a} + square = 10", f"{a} + {10 - a} = 10")}


@template("k_teens.decompose", "k_teens", requires=["k_numerals", "k_make10"], guess=0.05, work_lines=1,
          substeps=["one full ten", "the ones left"], strategies={"ten_and_ones": "ten and some more", **OU})
def _(rng):
    k = rng.randint(1, 9)
    n = 10 + k
    if rng.random() < 0.5:
        return {"prompt": f"{n} is ten and how many more?", "plain": f"{n} is ten and how many more?", "key": V(k), "display": str(k),
                "verified": f"{n} - 10 = {n - 10}", "solution": SOL(f"{n} = 10 + square", f"{n} = 10 + {k}")}
    return {"prompt": f"What number is $10 + {k}$?", "plain": f"10 + {k}", "key": V(n), "display": str(n),
            "verified": f"10 + {k} = {n}", "solution": SOL(f"10 + {k}", f"= {n}")}


@template("k_count100.next", "k_count100", requires=["k_teens"], guess=0.05, work_lines=1,
          substeps=["find the pattern", "say the next number"], strategies={"count_on": "count on", **OU})
def _(rng):
    if rng.random() < 0.5:
        t = rng.randint(1, 7) * 10
        seq = [t, t + 10, t + 20]
        return {"prompt": f"Count by tens: {seq[0]}, {seq[1]}, {seq[2]}, \\_\\_\\_. What comes next?", "plain": f"Count by tens: {seq[0]}, {seq[1]}, {seq[2]}, __",
                "key": V(t + 30), "display": str(t + 30), "verified": f"{t + 20} + 10", "solution": SOL(f"{t + 20} + 10", f"= {t + 30}")}
    n = rng.choice([rng.randint(11, 98), rng.randint(1, 9) * 10 + 9])
    return {"prompt": f"What number comes after {n}?", "plain": f"What number comes after {n}?", "key": V(n + 1), "display": str(n + 1),
            "verified": f"{n} + 1", "solution": SOL(f"{n} + 1", f"= {n + 1}")}


SHAPES = {"circle": 0, "triangle": 3, "square": 4, "rectangle": 4, "hexagon": 6, "pentagon": 5}


@template("k_shapes.name", "k_shapes", guess=0.2, work_lines=1,
          substeps=["count the sides and corners"], strategies={"count_sides": "count sides", "recognize": "recognize it", **OU})
def _(rng):
    name = rng.choice(list(SHAPES))
    if rng.random() < 0.5 or name == "circle":
        al = ["a " + name, "an " + name]
        return {"prompt": f"Name this shape. #shape(\"{name}\")", "plain": f"Name this shape. (picture of a {name})",
                "key": C(name, *al), "display": f'"{name}"', "verified": f"{name}: {SHAPES[name]} sides", "solution": SOL(f"{SHAPES[name]} \"sides\"", f"\"{name}\"")}
    return {"prompt": f"How many sides does a {name} have?", "plain": f"How many sides does a {name} have?", "key": V(SHAPES[name]),
            "display": str(SHAPES[name]), "verified": f"{name}: {SHAPES[name]} sides", "solution": SOL(f"{SHAPES[name]}")}


# ============================================================ Grade 1

@template("g1_add20.add", "g1_add20", requires=["k_make10", "k_teens"], guess=0.03, work_lines=2,
          substeps=["start with the larger number or make a ten", "add the rest"],
          strategies={"make_ten": "make a ten", "count_on": "count on", "doubles": "doubles", "fact": "known fact", **OU})
def _(rng):
    a, b = rng.randint(3, 9), rng.randint(3, 9)
    check(a + b > 10, "crosses ten")
    big, small = max(a, b), min(a, b)
    return {"prompt": f"Add: ${a} + {b}$", "plain": f"{a} + {b}", "key": V(a + b), "display": str(a + b), "verified": f"{a}+{b}={sp.Integer(a) + b}",
            "solution": SOL(f"{big} + {10 - big} + {small - (10 - big)}", f"10 + {small - (10 - big)} = {a + b}")}


@template("g1_sub20.sub", "g1_sub20", requires=["g1_add20"], guess=0.03, work_lines=2,
          substeps=["think: what do I add to the smaller number", "find the missing part"],
          strategies={"think_addition": "think addition", "count_back": "count back", **OU})
def _(rng):
    b = rng.randint(3, 9)
    d = rng.randint(2, 9)
    a = b + d
    check(10 < a <= 18, "teen minuend")
    return {"prompt": f"Subtract: ${a} - {b}$", "plain": f"{a} - {b}", "key": V(d), "display": str(d), "verified": f"{a}-{b}={sp.Integer(a) - b}",
            "solution": SOL(f"{b} + square = {a}", f"{b} + {d} = {a}", f"{a} - {b} = {d}")}


@template("g1_unknown.missing", "g1_unknown", requires=["g1_sub20"], guess=0.03, work_lines=2,
          substeps=["read = as 'is the same as'", "find the number that balances"],
          strategies={"think_addition": "think addition", "guess_check": "guess and check", **OU})
def _(rng):
    a, b = rng.randint(2, 9), rng.randint(3, 9)
    s = a + b
    form = rng.choice(["a+_=s", "_+b=s", "s-_=a", "a+b=_+c"])
    if form == "a+b=_+c":
        c = rng.randint(1, s - 1)
        ans, q = s - c, f"${a} + {b} = square + {c}$"
    elif form == "a+_=s":
        ans, q = b, f"${a} + square = {s}$"
    elif form == "_+b=s":
        ans, q = a, f"$square + {b} = {s}$"
    else:
        ans, q = b, f"${s} - square = {a}$"
    eq = sp.sympify(q.replace("$", "").replace("square", "X").replace("=", "-(") + ")")
    check(eq.subs(sp.Symbol("X"), ans) == 0, "balances")
    return {"prompt": f"What number goes in the box? {q}", "plain": "What number goes in the box? " + q.replace("$", "").replace("square", "[ ]"),
            "key": V(ans), "display": str(ans), "verified": f"substitute {ans}: both sides equal",
            "solution": SOL(q.replace("$", ""), q.replace("$", "").replace("square", str(ans)))}


@template("g1_word.story", "g1_word", requires=["g1_sub20"], guess=0.03, work_lines=3,
          substeps=["picture the story", "write a number sentence", "answer the question"],
          strategies={"add": "put together", "subtract": "take away or compare", **OU})
def _(rng):
    kind = rng.choice(["join", "separate", "compare", "start_unknown"])
    name = rng.choice(["Maya", "Leo", "Sam", "Ava", "Noah", "Ella"])
    thing = rng.choice(["stickers", "marbles", "shells", "cards", "beads"])
    if kind == "join":
        a, b = rng.randint(4, 9), rng.randint(3, 9)
        q, ans, sent = f"{name} has {a} {thing}. A friend gives {name} {b} more. How many {thing} does {name} have now?", a + b, f"{a} + {b} = {a + b}"
    elif kind == "separate":
        a = rng.randint(11, 19)
        b = rng.randint(3, 9)
        q, ans, sent = f"{name} had {a} {thing} and gave away {b}. How many are left?", a - b, f"{a} - {b} = {a - b}"
    elif kind == "compare":
        a = rng.randint(10, 19)
        b = rng.randint(3, a - 2)
        q, ans, sent = f"{name} has {a} {thing}. Kim has {b} {thing}. How many more {thing} does {name} have than Kim?", a - b, f"{a} - {b} = {a - b}"
    else:
        a, b = rng.randint(3, 9), rng.randint(3, 9)
        q, ans, sent = f"{name} had some {thing}. After getting {b} more, {name} has {a + b}. How many did {name} have at first?", a, f"{a + b} - {b} = {a}"
    check(0 < ans <= 20, "within 20")
    return {"prompt": q, "plain": q, "key": V(ans), "display": str(ans), "verified": sent, "solution": SOL(sent)}


@template("g1_tens.compose", "g1_tens", requires=["k_count100"], guess=0.03, work_lines=1,
          substeps=["tens are worth ten each", "add the ones"], strategies={"place_value": "tens and ones", **OU})
def _(rng):
    t, o = rng.randint(1, 9), rng.randint(0, 9)
    n = 10 * t + o
    form = rng.choice(["compose", "tens_digit", "ones_digit", "blocks"])
    if form == "compose":
        q, ans = f"What number is {t} tens and {o} ones?", n
    elif form == "tens_digit":
        q, ans = f"How many tens are in {n}?", t
    elif form == "ones_digit":
        q, ans = f"How many ones are in {n}?", o
    else:
        q, ans = f"What number is shown? #baseten(0, {t}, {o})", n
    check(int(str(n)[-1]) == o and n // 10 == t, "digits")
    plain = q.replace(f"#baseten(0, {t}, {o})", f"(picture: {t} rods of ten and {o} cubes)")
    return {"prompt": q, "plain": plain, "key": V(ans), "display": str(ans), "verified": f"{n} = {t}*10 + {o}",
            "solution": SOL(f"{n} = {10 * t} + {o}", f"{ans}")}


@template("g1_compare.sign", "g1_compare", requires=["g1_tens", "k_compare"], guess=0.33, work_lines=1,
          substeps=["compare the tens", "if the tens are equal, compare the ones"], strategies={"tens_first": "tens first", **OU})
def _(rng):
    a = rng.randint(10, 99)
    b = rng.choice([rng.randint(10, 99), int(str(a)[::-1]) if a % 10 else a + 1, (a // 10) * 10 + rng.randint(0, 9), a])
    check(10 <= b <= 99, "two digits")
    key, s = cmp_key(a, b)
    return {"prompt": f"Compare {a} and {b}. Write $<$, $>$ or $=$.", "plain": f"Compare {a} and {b}. Write <, > or =.",
            "key": key, "display": f"{a} {s} {b}", "verified": f"{a} {s} {b}", "solution": SOL(f"{a // 10} \"tens and\" {b // 10} \"tens\"", f"{a} {s} {b}")}


@template("g1_add100.add", "g1_add100", requires=["g1_tens", "g1_add20"], guess=0.02, work_lines=2,
          substeps=["tens with tens", "ones with ones, making a new ten if needed"], strategies={"place_value": "tens and ones", "count_on": "count on", **OU})
def _(rng):
    a = rng.randint(12, 89)
    if rng.random() < 0.5:
        b = rng.randint(1, (99 - a) // 10) * 10 if a < 90 else 0
        check(b > 0, "room for tens")
        sol = SOL(f"{a // 10} \"tens\" + {b // 10} \"tens\" = {(a + b) // 10} \"tens\"", f"{a} + {b} = {a + b}")
    else:
        b = rng.randint(2, 9)
        check(a % 10 + b >= 10 and a + b < 100, "makes a ten")
        sol = SOL(f"{a % 10} + {b} = {a % 10 + b}", f"{a} + {b} = {a + b}")
    return {"prompt": f"Add: ${a} + {b}$", "plain": f"{a} + {b}", "key": V(a + b), "display": str(a + b), "verified": f"{a}+{b}={sp.Integer(a) + b}", "solution": sol}


@template("g1_length.compare", "g1_length", requires=["k_count"], guess=0.05, work_lines=2,
          substeps=["compare the two lengths", "subtract"], strategies={"subtract": "subtract", "count_on": "count on", **OU})
def _(rng):
    things = rng.sample(["shoe", "book", "pencil", "spoon", "ribbon", "stick"], 2)
    unit = rng.choice(["paper clips", "cubes"])
    a, b = rng.randint(6, 15), rng.randint(2, 12)
    check(a > b, "first longer")
    q = f"A {things[0]} is {a} {unit} long. A {things[1]} is {b} {unit} long. How much longer is the {things[0]}?"
    return {"prompt": q, "plain": q, "key": V(a - b), "display": f"{a - b}", "verified": f"{a} - {b} = {a - b}", "solution": SOL(f"{a} - {b} = {a - b}")}


@template("g1_time.read", "g1_time", requires=["k_numerals"], guess=0.05, work_lines=1,
          substeps=["the short hand tells the hour", "the long hand: 12 is o'clock, 6 is half past"], strategies={"hands": "read both hands", **OU})
def _(rng):
    h, m = rng.randint(1, 12), rng.choice([0, 30])
    return {"prompt": f"What time is it? #clock({h}, {m})", "plain": f"What time is it? (clock picture showing {clock_t(h, m)})",
            "key": time_key(h, m), "display": f'"{clock_t(h, m)}"', "verified": f"hour hand {h}, minute hand {m // 5 or 12}",
            "solution": SOL(f"\"hour\" {h}", f"\"{clock_t(h, m)}\"")}


# ============================================================ Grade 2

@template("g2_addsub100.regroup", "g2_addsub100", requires=["g1_add100", "g1_sub20"], guess=0.02, work_lines=3,
          substeps=["add or subtract the ones, regrouping a ten", "add or subtract the tens"],
          strategies={"column": "column method", "split": "split into tens and ones", **OU})
def _(rng):
    if rng.random() < 0.5:
        a, b = rng.randint(15, 69), rng.randint(15, 39)
        check(a % 10 + b % 10 >= 10 and a + b < 100, "carry")
        return {"prompt": f"Add: ${a} + {b}$", "plain": f"{a} + {b}", "key": V(a + b), "display": str(a + b), "verified": f"{a}+{b}={sp.Integer(a) + b}",
                "solution": SOL(f"{a % 10} + {b % 10} = {a % 10 + b % 10}", f"{a // 10} + {b // 10} + 1 = {(a + b) // 10}", f"{a} + {b} = {a + b}")}
    a, b = rng.randint(31, 98), rng.randint(12, 59)
    check(a % 10 < b % 10 and a > b, "borrow")
    return {"prompt": f"Subtract: ${a} - {b}$", "plain": f"{a} - {b}", "key": V(a - b), "display": str(a - b), "verified": f"{a}-{b}={sp.Integer(a) - b}",
            "solution": SOL(f"{a % 10 + 10} - {b % 10} = {a % 10 + 10 - b % 10}", f"{a // 10 - 1} - {b // 10} = {a // 10 - 1 - b // 10}", f"{a} - {b} = {a - b}")}


@template("g2_hundreds.place", "g2_hundreds", requires=["g1_compare"], guess=0.03, work_lines=1,
          substeps=["hundreds, tens, ones"], strategies={"place_value": "place value", **OU})
def _(rng):
    h, t, o = rng.randint(1, 9), rng.choice([0, rng.randint(1, 9)]), rng.randint(0, 9)
    n = 100 * h + 10 * t + o
    form = rng.choice(["expanded", "value", "compare"])
    if form == "expanded":
        parts = " + ".join(str(p) for p in (100 * h, 10 * t, o) if p)
        return {"prompt": f"What number is ${parts}$?", "plain": f"What number is {parts}?", "key": V(n), "display": str(n),
                "verified": f"{parts} = {n}", "solution": SOL(parts, f"= {n}")}
    if form == "value":
        d = rng.choice([("hundreds", 100 * h, h), ("ones", o, o)] + ([("tens", 10 * t, t)] if t else []))
        check(str(d[2]) in str(n), "digit present")
        check(str(n).count(str(d[2])) == 1, "digit unique")
        return {"prompt": f"What is the value of the {d[2]} in {n}?", "plain": f"What is the value of the {d[2]} in {n}?", "key": V(d[1]),
                "display": str(d[1]), "verified": f"{d[2]} in the {d[0]} place", "solution": SOL(f"{d[2]} \"in the {d[0]} place\"", f"{d[1]}")}
    m = rng.choice([n + rng.choice([-90, -9, 9, 90, 1]), int(str(n)[0] + str(n)[2] + str(n)[1])])
    check(100 <= m <= 999, "three digits")
    key, s = cmp_key(n, m)
    return {"prompt": f"Compare {n} and {m}. Write $<$, $>$ or $=$.", "plain": f"Compare {n} and {m}. Write <, > or =.", "key": key,
            "display": f"{n} {s} {m}", "verified": f"{n} {s} {m}", "solution": SOL(f"{n} {s} {m}")}


@template("g2_addsub1000.three_digit", "g2_addsub1000", requires=["g2_addsub100", "g2_hundreds"], guess=0.02, work_lines=4,
          substeps=["line up places", "work from the ones, regrouping"], strategies={"column": "column method", **OU})
def _(rng):
    if rng.random() < 0.5:
        a, b = rng.randint(150, 699), rng.randint(120, 299)
        check(a + b < 1000 and (a % 10 + b % 10 >= 10 or a % 100 + b % 100 >= 100), "regroup")
        return {"prompt": f"Add: ${a} + {b}$", "plain": f"{a} + {b}", "key": V(a + b), "display": str(a + b), "verified": f"{a}+{b}={sp.Integer(a) + b}",
                "solution": SOL(f"{a} + {b}", f"= {a + b}")}
    a = rng.choice([rng.randint(300, 999), rng.randint(3, 9) * 100 + rng.randint(0, 9)])
    b = rng.randint(110, a - 50) if a > 160 else 120
    check(a > b and (a % 10 < b % 10 or (a // 10) % 10 < (b // 10) % 10), "regroup")
    return {"prompt": f"Subtract: ${a} - {b}$", "plain": f"{a} - {b}", "key": V(a - b), "display": str(a - b), "verified": f"{a}-{b}={sp.Integer(a) - b}",
            "solution": SOL(f"{a} - {b}", f"= {a - b}")}


@template("g2_word.two_step", "g2_word", requires=["g2_addsub100", "g1_word"], guess=0.02, work_lines=4,
          substeps=["first step", "second step"], strategies={"two_sentences": "two number sentences", **OU})
def _(rng):
    a, b, c = rng.randint(30, 60), rng.randint(10, 29), rng.randint(10, 40)
    place = rng.choice(["library cart", "shelf", "box"])
    thing = {"library cart": "books", "shelf": "jars", "box": "crayons"}[place]
    check(a - b + c <= 100, "within 100")
    q = f"A {place} had {a} {thing}. {b} were taken away. Then {c} more were added. How many {thing} are there now?"
    return {"prompt": q, "plain": q, "key": V(a - b + c), "display": str(a - b + c), "verified": f"{a}-{b}+{c}={sp.Integer(a) - b + c}",
            "solution": SOL(f"{a} - {b} = {a - b}", f"{a - b} + {c} = {a - b + c}")}


@template("g2_evenodd.classify", "g2_evenodd", requires=["g1_add20"], guess=0.5, work_lines=1,
          substeps=["pair them up, or look at the last digit"], strategies={"pairs": "pairs", "last_digit": "last digit", **OU})
def _(rng):
    if rng.random() < 0.5:
        n = rng.randint(3, 40)
        w = "even" if n % 2 == 0 else "odd"
        return {"prompt": f"Is {n} even or odd?", "plain": f"Is {n} even or odd?", "key": C(w), "display": f'"{w}"', "verified": f"{n} mod 2 = {n % 2}",
                "solution": SOL(f"{n} = {n // 2} + {n - n // 2}", f"\"{w}\"")}
    r, c = rng.randint(2, 5), rng.randint(2, 5)
    return {"prompt": f"How many dots? #arr({r}, {c})", "plain": f"How many dots? (array of {r} rows of {c})", "key": V(r * c), "display": str(r * c),
            "verified": f"{' + '.join([str(c)] * r)} = {r * c}", "solution": SOL(" + ".join([str(c)] * r), f"= {r * c}")}


@template("g2_measure.ruler", "g2_measure", requires=["g1_length"], guess=0.05, work_lines=1,
          substeps=["start at 0", "read the end"], strategies={"from_zero": "from zero", **OU})
def _(rng):
    if rng.random() < 0.5:
        n = rng.randint(1, 6)
        return {"prompt": f"How long is the bar, in inches? #ruler({n})", "plain": f"How long is the bar? (picture: a bar from 0 to {n} on an inch ruler)",
                "key": V(n), "display": f"{n}", "verified": f"bar ends at {n}", "solution": SOL(f"{n} - 0 = {n}")}
    a, b = rng.randint(20, 95), rng.randint(5, 60)
    check(a > b, "longer")
    u = rng.choice(["inches", "centimeters"])
    q = f"A table is {a} {u} long. A desk is {b} {u} long. How much longer is the table?"
    return {"prompt": q, "plain": q, "key": V(a - b), "display": str(a - b), "verified": f"{a}-{b}={sp.Integer(a) - b}", "solution": SOL(f"{a} - {b} = {a - b}")}


@template("g2_time.five_min", "g2_time", requires=["g1_time"], guess=0.03, work_lines=1,
          substeps=["count by fives to the minute hand", "the hour the hour hand has passed"], strategies={"count_fives": "count by fives", **OU})
def _(rng):
    h, m = rng.randint(1, 12), rng.choice(range(5, 60, 5))
    return {"prompt": f"What time is it? #clock({h}, {m})", "plain": f"What time is it? (clock picture showing {clock_t(h, m)})",
            "key": time_key(h, m), "display": f'"{clock_t(h, m)}"', "verified": f"minute hand at {m // 5}: {m} minutes",
            "solution": SOL(f"{m // 5} times 5 = {m}", f"\"{clock_t(h, m)}\"")}


COIN = {"q": 25, "d": 10, "n": 5, "p": 1}


@template("g2_money.coins", "g2_money", requires=["g2_addsub100"], guess=0.03, work_lines=2,
          substeps=["start with the coin worth the most", "count on"], strategies={"count_on": "count on", **OU})
def _(rng):
    counts = {"q": rng.randint(0, 3), "d": rng.randint(0, 3), "n": rng.randint(0, 2), "p": rng.randint(0, 4)}
    s = "".join(k * v for k, v in counts.items())
    total = sum(COIN[c] for c in s)
    check(len(s) >= 3 and total < 100, "a few coins")
    names = {"q": "quarter", "d": "dime", "n": "nickel", "p": "penny"}
    words = ", ".join(f"{v} {names[k] + ('s' if v > 1 else '') if k != 'p' else ('pennies' if v > 1 else 'penny')}" for k, v in counts.items() if v)
    running, acc = [], 0
    for c in s:
        acc += COIN[c]
        running.append(str(acc))
    return {"prompt": f"How many cents? #coins(\"{s}\")", "plain": f"How many cents? (picture: {words})", "key": V(total), "display": str(total),
            "verified": f"{' + '.join(str(COIN[c]) for c in s)} = {total}", "solution": SOL(", ".join(running), f"{total} \"cents\"")}


@template("g2_graphs.bar", "g2_graphs", requires=["g1_sub20"], guess=0.03, work_lines=2,
          substeps=["read each bar on the scale", "compare or combine"], strategies={"read_scale": "read the scale", **OU})
def _(rng):
    labels = rng.choice([("Red", "Blue", "Green"), ("Cats", "Dogs", "Fish"), ("Mon", "Tue", "Wed")])
    vals = [rng.randint(2, 10) for _ in labels]
    i, j = rng.sample(range(3), 2)
    check(vals[i] != vals[j], "different")
    lab = ", ".join(f'"{l}"' for l in labels)
    fig = {"type": "draw", "typ": f"bars(({lab}), ({', '.join(map(str, vals))}), title: \"Votes\")"}
    plain_fig = ", ".join(f"{l} {v}" for l, v in zip(labels, vals))
    if rng.random() < 0.5:
        hi, lo = (i, j) if vals[i] > vals[j] else (j, i)
        q = f"How many more votes did {labels[hi]} get than {labels[lo]}?"
        return {"prompt": q, "plain": f"{q} (bar graph: {plain_fig})", "figure": fig, "key": V(vals[hi] - vals[lo]), "display": str(vals[hi] - vals[lo]),
                "verified": f"{vals[hi]} - {vals[lo]}", "solution": SOL(f"{vals[hi]} - {vals[lo]} = {vals[hi] - vals[lo]}")}
    q = "How many votes are there in all?"
    return {"prompt": q, "plain": f"{q} (bar graph: {plain_fig})", "figure": fig, "key": V(sum(vals)), "display": str(sum(vals)),
            "verified": f"sum = {sum(vals)}", "solution": SOL(" + ".join(map(str, vals)) + f" = {sum(vals)}")}


@template("g2_parts.name", "g2_parts", requires=["k_shapes"], guess=0.33, work_lines=1,
          substeps=["count the equal parts"], strategies={"count_parts": "count equal parts", **OU})
def _(rng):
    d = rng.choice([2, 3, 4])
    name = {2: "half", 3: "third", 4: "fourth"}[d]
    al = {2: ["a half", "one half", "halves", "1/2"], 3: ["a third", "one third", "thirds", "1/3"], 4: ["a fourth", "one fourth", "fourths", "a quarter", "quarter", "1/4"]}[d]
    kind = rng.choice(["circle", "rect"])
    return {"prompt": f"The shape is cut into equal parts. What is each part called? #fracshape(1, {d}, kind: \"{kind}\")",
            "plain": f"A shape cut into {d} equal parts. What is each part called?", "key": C(name, *al), "display": f'"{name}"',
            "verified": f"{d} equal parts", "solution": SOL(f"{d} \"equal parts\"", f"\"one {name}\"")}


# ============================================================ Grade 3

@template("g3_mult.groups", "g3_mult", requires=["g2_evenodd"], guess=0.03, work_lines=2,
          substeps=["number of groups times size of each group"], strategies={"repeated_addition": "repeated addition", "fact": "known fact", **OU})
def _(rng):
    g, s = rng.randint(2, 9), rng.randint(2, 9)
    if rng.random() < 0.5:
        c = rng.choice([("bags", "apples"), ("vases", "flowers"), ("boxes", "crayons"), ("teams", "players")])
        q = f"There are {g} {c[0]} with {s} {c[1]} in each. How many {c[1]} are there?"
        plain = q
    else:
        q, plain = f"Write a multiplication sentence and find the total. #arr({g}, {s})", f"Array of {g} rows of {s}. Multiply."
    return {"prompt": q, "plain": plain, "key": V(g * s), "display": str(g * s), "verified": f"{'+'.join([str(s)] * g)} = {sum([s] * g)}",
            "solution": SOL(f"{g} times {s}", f"= {g * s}")}


@template("g3_div.share", "g3_div", requires=["g3_mult"], guess=0.03, work_lines=2,
          substeps=["think: what times the divisor gives the total"], strategies={"think_multiplication": "think multiplication", "share": "share out", **OU})
def _(rng):
    d, qv = rng.randint(2, 9), rng.randint(2, 9)
    n = d * qv
    form = rng.choice(["share", "group", "bare"])
    if form == "share":
        q = f"{n} stickers are shared equally among {d} friends. How many does each friend get?"
    elif form == "group":
        q = f"There are {n} eggs. A carton holds {d}. How many cartons are filled?"
    else:
        q = f"Divide: ${n} div {d}$"
    check(n % d == 0, "exact")
    return {"prompt": q, "plain": q.replace("$", "").replace("div", "/"), "key": V(qv), "display": str(qv), "verified": f"{d}*{qv} = {n}",
            "solution": SOL(f"{d} times square = {n}", f"{d} times {qv} = {n}", f"{n} div {d} = {qv}")}


@template("g3_facts.fact", "g3_facts", requires=["g3_div"], guess=0.02, work_lines=1,
          substeps=["use a fact you know to build this one"], strategies={"known_fact": "known fact", "split": "split a factor", **OU})
def _(rng):
    a, b = rng.randint(3, 9), rng.randint(3, 9)
    if rng.random() < 0.6:
        return {"prompt": f"Multiply: ${a} times {b}$", "plain": f"{a} * {b}", "key": V(a * b), "display": str(a * b), "verified": f"{a}*{b} = {sp.Integer(a) * b}",
                "solution": SOL(f"{a} times {b} = 5 times {b} + {a - 5} times {b}" if a > 5 else f"{a} times {b}", f"= {a * b}")}
    return {"prompt": f"Divide: ${a * b} div {a}$", "plain": f"{a * b} / {a}", "key": V(b), "display": str(b), "verified": f"{a}*{b} = {a * b}",
            "solution": SOL(f"{a} times square = {a * b}", f"{a * b} div {a} = {b}")}


@template("g3_props.distribute", "g3_props", requires=["g3_facts"], guess=0.03, work_lines=3,
          substeps=["break a factor into tens and ones", "multiply each part", "add"], strategies={"break_apart": "break apart", "column": "column method", **OU})
def _(rng):
    a, b = rng.randint(3, 9), rng.randint(11, 19)
    if rng.random() < 0.5:
        return {"prompt": f"Multiply by breaking apart: ${a} times {b}$", "plain": f"{a} * {b}", "key": V(a * b), "display": str(a * b),
                "verified": f"{a}*{b} = {sp.Integer(a) * b}", "solution": SOL(f"{a} times 10 + {a} times {b - 10}", f"{10 * a} + {a * (b - 10)}", f"= {a * b}")}
    p, r = rng.randint(2, 8), rng.randint(1, 6)
    return {"prompt": f"What number goes in the box? ${a} times ({p} + {r}) = {a} times {p} + {a} times square$",
            "plain": f"{a} * ({p} + {r}) = {a} * {p} + {a} * [ ]", "key": V(r), "display": str(r), "verified": f"{a}*({p}+{r}) = {a * (p + r)} = {a * p} + {a * r}",
            "solution": SOL(f"{a} times ({p} + {r}) = {a} times {p} + {a} times {r}")}


@template("g3_word.two_step", "g3_word", requires=["g3_facts", "g2_word"], guess=0.02, work_lines=4,
          substeps=["first step", "second step"], strategies={"two_sentences": "two number sentences", **OU})
def _(rng):
    form = rng.choice(["mult_sub", "add_div", "mult_add"])
    if form == "mult_sub":
        p, k = rng.randint(3, 9), rng.randint(4, 9)
        g = rng.randint(5, p * k - 1)
        q = f"A teacher buys {p} packs of pencils with {k} pencils in each pack. She gives out {g} pencils. How many pencils are left?"
        ans, sol = p * k - g, SOL(f"{p} times {k} = {p * k}", f"{p * k} - {g} = {p * k - g}")
    elif form == "add_div":
        j = rng.randint(3, 9)
        each = rng.randint(3, 9)
        total = j * each
        a = rng.randint(5, total - 5)
        q = f"Ana has {a} marbles and Ben has {total - a}. They share all of them equally among {j} jars. How many marbles go in each jar?"
        ans, sol = each, SOL(f"{a} + {total - a} = {total}", f"{total} div {j} = {each}")
    else:
        s, k, x = rng.randint(2, 6), rng.randint(5, 9), rng.randint(2, 9)
        q = f"There are {s} shelves with {k} books on each. {x} more books are added. How many books are there now?"
        ans, sol = s * k + x, SOL(f"{s} times {k} = {s * k}", f"{s * k} + {x} = {s * k + x}")
    check(ans > 0, "positive")
    return {"prompt": q, "plain": q, "key": V(ans), "display": str(ans), "verified": " ; ".join(sol), "solution": sol}


@template("g3_round.round", "g3_round", requires=["g2_hundreds"], guess=0.03, work_lines=1,
          substeps=["find the two tens or hundreds it is between", "look at the next digit: 5 or more rounds up"], strategies={"rule": "look at the next digit", "number_line": "number line", **OU})
def _(rng):
    place = rng.choice([10, 100])
    n = rng.randint(11, 99) if place == 10 and rng.random() < 0.4 else rng.randint(101, 999)
    check(n % place != 0, "not already round")
    r = int((F(n, place) + F(1, 2)) // 1) * place
    check(abs(r - n) * 2 <= place, "nearest")
    name = "ten" if place == 10 else "hundred"
    return {"prompt": f"Round {n} to the nearest {name}.", "plain": f"Round {n} to the nearest {name}.", "key": V(r), "display": str(r),
            "verified": f"|{r} - {n}| <= {place // 2}", "solution": SOL(f"{n - n % place} < {n} < {n - n % place + place}", f"{r}")}


@template("g3_mult10.mult", "g3_mult10", requires=["g3_facts"], guess=0.03, work_lines=1,
          substeps=["multiply the digits", "the answer counts tens"], strategies={"tens": "count tens", **OU})
def _(rng):
    a, t = rng.randint(2, 9), rng.randint(2, 9)
    return {"prompt": f"Multiply: ${a} times {10 * t}$", "plain": f"{a} * {10 * t}", "key": V(a * 10 * t), "display": str(a * 10 * t),
            "verified": f"{a}*{10 * t} = {sp.Integer(a) * 10 * t}", "solution": SOL(f"{a} times {t} \"tens\" = {a * t} \"tens\"", f"= {a * t * 10}")}


@template("g3_fractions.shaded", "g3_fractions", requires=["g2_parts"], guess=0.03, work_lines=1,
          substeps=["count the equal parts (denominator)", "count the shaded parts (numerator)"], strategies={"count_parts": "count parts", **OU})
def _(rng):
    d = rng.choice([2, 3, 4, 5, 6, 8])
    n = rng.randint(1, d - 1)
    if rng.random() < 0.6:
        return {"prompt": f"What fraction of the bar is shaded? #fracbar({n}, {d})", "plain": f"What fraction of the bar is shaded? (bar of {d} equal parts, {n} shaded)",
                "key": V(sp.Rational(n, d)), "display": f"{n}/{d}", "verified": f"{n} of {d} parts",
                "solution": SOL(f"\"parts:\" {d}", f"\"shaded:\" {n}", f"{n}/{d}")}
    q = f"A pizza is cut into {d} equal slices. You eat {n}. What fraction of the pizza did you eat?"
    return {"prompt": q, "plain": q, "key": V(sp.Rational(n, d)), "display": f"{n}/{d}", "verified": f"{n} of {d}",
            "solution": SOL(f"{n}/{d}")}


@template("g3_frac_line.compare", "g3_frac_line", requires=["g3_fractions"], guess=0.33, work_lines=1,
          substeps=["same denominator: compare numerators", "same numerator: more parts means smaller parts"], strategies={"same_size_parts": "same-size parts", "number_line": "number line", **OU})
def _(rng):
    if rng.random() < 0.5:
        d = rng.choice([3, 4, 6, 8])
        a, b = rng.sample(range(1, d), 2)
        x, y = F(a, d), F(b, d)
    else:
        n = rng.randint(1, 3)
        d1, d2 = rng.sample([2, 3, 4, 6, 8], 2)
        check(n < min(d1, d2), "proper")
        x, y = F(n, d1), F(n, d2)
        a, b, d = n, n, None
    key, s = cmp_key(x, y, f"{x.numerator}/{x.denominator}", f"{y.numerator}/{y.denominator}")
    tx, ty = f"{x.numerator}/{x.denominator}", f"{y.numerator}/{y.denominator}"
    return {"prompt": f"Compare ${tx}$ and ${ty}$. Write $<$, $>$ or $=$.", "plain": f"Compare {tx} and {ty}. Write <, > or =.", "key": key,
            "display": f"{tx} {s} {ty}", "verified": f"{float(x):.3f} {s} {float(y):.3f}", "solution": SOL(f"{tx} {s} {ty}")}


@template("g3_area.rect", "g3_area", requires=["g3_facts"], guess=0.03, work_lines=2,
          substeps=["area: multiply length by width", "perimeter: add all four sides"], strategies={"formula": "multiply or add sides", "count": "count squares", **OU})
def _(rng):
    l, w = rng.randint(3, 10), rng.randint(2, 9)
    u = rng.choice(["feet", "meters", "inches"])
    if rng.random() < 0.5:
        q = f"A rectangle is {l} {u} long and {w} {u} wide. What is its area, in square {u}?"
        return {"prompt": q, "plain": q, "key": V(l * w), "display": str(l * w), "verified": f"{l}*{w} = {sp.Integer(l) * w}",
                "solution": SOL(f"{l} times {w} = {l * w}")}
    q = f"A rectangle is {l} {u} long and {w} {u} wide. What is its perimeter, in {u}?"
    return {"prompt": q, "plain": q, "key": V(2 * (l + w)), "display": str(2 * (l + w)), "verified": f"{l}+{w}+{l}+{w} = {l + w + l + w}",
            "solution": SOL(f"{l} + {w} + {l} + {w}", f"= {2 * (l + w)}")}


@template("g3_time.elapsed", "g3_time", requires=["g2_time"], guess=0.02, work_lines=3,
          substeps=["count on to the next hour", "then to the end time"], strategies={"count_on": "count on", **OU})
def _(rng):
    h = rng.randint(1, 10)
    m = rng.choice(range(5, 60, 5))
    dur = rng.randint(15, 80)
    start = h * 60 + m
    end = start + dur
    eh, em = end // 60, end % 60
    check(eh <= 12 and eh > h, "crosses the hour")
    if rng.random() < 0.5:
        q = f"A class starts at {clock_t(h, m)} and ends at {clock_t(eh, em)}. How many minutes long is it?"
        return {"prompt": q, "plain": q, "key": V(dur), "display": str(dur), "verified": f"{end} - {start} = {end - start} minutes",
                "solution": SOL(f"{60 - m} + {em} = {60 - m + em}" if eh == h + 1 else f"{60 - m} + 60 + {em}", f"{dur} \"minutes\"")}
    q = f"A bus leaves at {clock_t(h, m)}. The trip takes {dur} minutes. At what time does it arrive?"
    return {"prompt": q, "plain": q, "key": time_key(eh, em), "display": f'"{clock_t(eh, em)}"', "verified": f"{start} + {dur} = {end} minutes after midnight",
            "solution": SOL(f"{clock_t(h, m)} + {60 - m} = {clock_t(h + 1, 0)}", f"\"{clock_t(eh, em)}\"")}


# ============================================================ Grade 4

@template("g4_place.round", "g4_place", requires=["g3_round"], guess=0.03, work_lines=1,
          substeps=["find the rounding place", "look at the digit to its right"], strategies={"rule": "look at the next digit", **OU})
def _(rng):
    n = rng.randint(10_000, 999_999)
    place, name = rng.choice([(100, "hundred"), (1000, "thousand"), (10_000, "ten thousand"), (100_000, "hundred thousand")])
    check(n % place != 0, "not round")
    r = int((F(n, place) + F(1, 2)) // 1) * place
    check(abs(r - n) * 2 <= place, "nearest")
    return {"prompt": f"Round ${comma(n)}$ to the nearest {name}.", "plain": f"Round {n:,} to the nearest {name}.", "key": V(r), "display": comma(r),
            "verified": f"|{r} - {n}| <= {place // 2}", "solution": SOL(f"{comma(n - n % place)} < {comma(n)} < {comma(n - n % place + place)}", comma(r))}


@template("g4_addsub.algorithm", "g4_addsub", requires=["g4_place", "g2_addsub1000"], guess=0.02, work_lines=4,
          substeps=["line up places", "regroup from right to left"], strategies={"column": "standard algorithm", **OU})
def _(rng):
    if rng.random() < 0.5:
        a, b = rng.randint(10_000, 79_999), rng.randint(1_000, 19_999)
        return {"prompt": f"Add: ${comma(a)} + {comma(b)}$", "plain": f"{a:,} + {b:,}", "key": V(a + b), "display": comma(a + b),
                "verified": f"{a}+{b} = {sp.Integer(a) + b}", "solution": SOL(f"{comma(a)} + {comma(b)}", f"= {comma(a + b)}")}
    a = rng.choice([rng.randint(2, 9) * 1000 + rng.randint(0, 9), rng.randint(3000, 9999)])
    b = rng.randint(1000, a - 100)
    return {"prompt": f"Subtract: ${comma(a)} - {comma(b)}$", "plain": f"{a:,} - {b:,}", "key": V(a - b), "display": comma(a - b),
            "verified": f"{a}-{b} = {sp.Integer(a) - b}", "solution": SOL(f"{comma(a)} - {comma(b)}", f"= {comma(a - b)}")}


@template("g4_mult.partial", "g4_mult", requires=["g3_mult10", "g3_props"], guess=0.02, work_lines=4,
          substeps=["multiply by each place", "add the partial products"], strategies={"partial_products": "partial products", "column": "standard algorithm", **OU})
def _(rng):
    if rng.random() < 0.5:
        a, b = rng.randint(3, 9), rng.randint(102, 2999)
        parts = [int(d) * 10 ** i for i, d in enumerate(str(b)[::-1]) if d != "0"][::-1]
        return {"prompt": f"Multiply: ${a} times {comma(b)}$", "plain": f"{a} * {b:,}", "key": V(a * b), "display": comma(a * b),
                "verified": f"{a}*{b} = {sp.Integer(a) * b}", "solution": SOL(" + ".join(f"{a} times {comma(p)}" for p in parts), " + ".join(comma(a * p) for p in parts), f"= {comma(a * b)}")}
    a, b = rng.randint(12, 98), rng.randint(11, 49)
    return {"prompt": f"Multiply: ${a} times {b}$", "plain": f"{a} * {b}", "key": V(a * b), "display": comma(a * b), "verified": f"{a}*{b} = {sp.Integer(a) * b}",
            "solution": SOL(f"{a} times {b % 10} = {a * (b % 10)}", f"{a} times {b - b % 10} = {comma(a * (b - b % 10))}", f"{a * (b % 10)} + {comma(a * (b - b % 10))} = {comma(a * b)}")}


@template("g4_div.remainder", "g4_div", requires=["g4_mult"], guess=0.02, work_lines=6,
          substeps=["divide, multiply, subtract, bring down", "check: quotient times divisor plus remainder"], strategies={"long_division": "long division", **OU})
def _(rng):
    d = rng.randint(3, 9)
    qv = rng.randint(41, 999)
    r = rng.choice([0, rng.randint(1, d - 1)])
    n = d * qv + r
    check(r < d and d * qv + r == n, "division")
    if r:
        return {"prompt": f"Divide: ${comma(n)} div {d}$. Write the remainder like this: 23 R 4.", "plain": f"{n} / {d}, quotient and remainder",
                "key": C(f"{qv} R {r}", f"{qv}R{r}", f"{qv} r {r}", f"{qv} remainder {r}"), "display": f'"{qv} R {r}"', "verified": f"{d}*{qv} + {r} = {n}",
                "solution": SOL(f"{d} times {qv} = {comma(d * qv)}", f"{comma(n)} - {comma(d * qv)} = {r}", f"\"{qv} R {r}\"")}
    return {"prompt": f"Divide: ${comma(n)} div {d}$", "plain": f"{n} / {d}", "key": V(qv), "display": str(qv), "verified": f"{d}*{qv} = {n}",
            "solution": SOL(f"{d} times {qv} = {comma(n)}", f"{comma(n)} div {d} = {qv}")}


@template("g4_factors.list", "g4_factors", requires=["g3_facts"], guess=0.02, work_lines=3,
          substeps=["test 1, 2, 3, ... in pairs", "stop when the pairs meet"], strategies={"pairs": "factor pairs", **OU})
def _(rng):
    if rng.random() < 0.5:
        n = rng.choice([12, 16, 18, 20, 24, 28, 30, 32, 36, 40, 42, 45, 48])
        fs = [k for k in range(1, n + 1) if n % k == 0]
        check(fs == sorted(int(d) for d in sp.divisors(n)), "divisors")
        return {"prompt": f"List all the factors of {n}.", "plain": f"List all the factors of {n}.", "key": {"kind": "set", "value": [str(f) for f in fs]},
                "display": ", ".join(map(str, fs)), "verified": f"sympy divisors({n})",
                "solution": SOL(", ".join(f"{k} times {n // k}" for k in fs if k * k <= n), ", ".join(map(str, fs)))}
    n = rng.randint(11, 99)
    w = "prime" if sp.isprime(n) else "composite"
    small = next((k for k in range(2, n) if n % k == 0), None)
    return {"prompt": f"Is {n} prime or composite?", "plain": f"Is {n} prime or composite?", "key": C(w), "display": f'"{w}"', "verified": f"sympy isprime({n}) = {sp.isprime(n)}",
            "solution": SOL(f"{small} times {n // small} = {n}" if small else f"\"no factor from 2 to\" {int(n ** 0.5)}", f"\"{w}\"")}


@template("g4_equiv.missing", "g4_equiv", requires=["g3_frac_line"], guess=0.03, work_lines=2,
          substeps=["find what the denominator was multiplied by", "multiply the numerator by the same number"], strategies={"multiply_both": "multiply top and bottom", **OU})
def _(rng):
    d = rng.choice([2, 3, 4, 5, 6, 8])
    n = rng.randint(1, d - 1)
    k = rng.randint(2, 6)
    if rng.random() < 0.6:
        return {"prompt": f"What number goes in the box? ${n}/{d} = square/{d * k}$", "plain": f"{n}/{d} = [ ]/{d * k}", "key": V(n * k), "display": str(n * k),
                "verified": f"{n}/{d} == {n * k}/{d * k}: {F(n, d) == F(n * k, d * k)}", "solution": SOL(f"{d} times {k} = {d * k}", f"{n} times {k} = {n * k}")}
    a, b = F(n, d), F(rng.randint(1, 7), rng.choice([3, 4, 5, 6, 8]))
    check(a != b and b < 1, "different, proper")
    ta, tb = f"{a.numerator}/{a.denominator}", f"{b.numerator}/{b.denominator}"
    key, s = cmp_key(a, b, ta, tb)
    lcd = sp.ilcm(a.denominator, b.denominator)
    return {"prompt": f"Compare ${ta}$ and ${tb}$. Write $<$, $>$ or $=$.", "plain": f"Compare {ta} and {tb}. Write <, > or =.", "key": key,
            "display": f"{ta} {s} {tb}", "verified": f"{float(a):.4f} vs {float(b):.4f}",
            "solution": SOL(f"{ta} = {a.numerator * lcd // a.denominator}/{lcd}, {tb} = {b.numerator * lcd // b.denominator}/{lcd}", f"{ta} {s} {tb}")}


@template("g4_frac_add.like", "g4_frac_add", requires=["g4_equiv"], guess=0.02, work_lines=3,
          substeps=["add or subtract the numerators", "keep the denominator", "make a whole if needed"], strategies={"like_parts": "same-size parts", **OU})
def _(rng):
    d = rng.choice([3, 4, 5, 6, 8, 10])
    if rng.random() < 0.5:
        a, b = rng.randint(1, d - 1), rng.randint(1, d - 1)
        op = rng.choice(["+", "-"])
        if op == "-":
            a, b = max(a, b), min(a, b)
            check(a != b, "nonzero")
        v = F(a + b if op == "+" else a - b, d)
        return {"prompt": f"{'Add' if op == '+' else 'Subtract'}: ${a}/{d} {op} {b}/{d}$", "plain": f"{a}/{d} {op} {b}/{d}", "key": V(sp.Rational(v.numerator, v.denominator)),
                "display": f"{a + b if op == '+' else a - b}/{d}", "verified": f"= {v}", "solution": SOL(f"({a} {op} {b})/{d}", f"= {a + b if op == '+' else a - b}/{d}")}
    w1, w2 = rng.randint(1, 5), rng.randint(1, 4)
    a, b = rng.randint(1, d - 1), rng.randint(1, d - 1)
    x, y = w1 + F(a, d), w2 + F(b, d)
    v = x + y
    whole, rem = divmod(v.numerator, v.denominator)
    check(rem != 0, "mixed")
    rem_d = v - whole
    disp = f"{whole} {rem_d.numerator}/{rem_d.denominator}"
    return {"prompt": f"Add: ${w1} {a}/{d} + {w2} {b}/{d}$", "plain": f"{w1} {a}/{d} + {w2} {b}/{d}", "key": V(sp.Rational(v.numerator, v.denominator)),
            "display": disp, "verified": f"= {v}", "solution": SOL(f"{w1} + {w2} = {w1 + w2}", f"{a}/{d} + {b}/{d} = {a + b}/{d}", f"= {disp}")}


@template("g4_frac_whole.mult", "g4_frac_whole", requires=["g4_frac_add", "g3_mult"], guess=0.02, work_lines=2,
          substeps=["multiply the whole number by the numerator", "keep the denominator"], strategies={"groups": "groups of a fraction", **OU})
def _(rng):
    k = rng.randint(2, 9)
    d = rng.choice([3, 4, 5, 6, 8])
    n = rng.randint(1, d - 1)
    v = k * F(n, d)
    return {"prompt": f"Multiply: ${k} times {n}/{d}$", "plain": f"{k} * {n}/{d}", "key": V(sp.Rational(v.numerator, v.denominator)), "display": f"{k * n}/{d}",
            "verified": f"sympy: {sp.Integer(k) * sp.Rational(n, d)}", "solution": SOL(f"({k} times {n})/{d}", f"= {k * n}/{d}")}


@template("g4_decimals.convert", "g4_decimals", requires=["g4_equiv"], guess=0.03, work_lines=1,
          substeps=["tenths: one place; hundredths: two places"], strategies={"place_value": "place value", **OU})
def _(rng):
    if rng.random() < 0.5:
        d = rng.choice([10, 100])
        n = rng.randint(1, d - 1)
        v = sp.Rational(n, d)
        s = f"{float(v):.{1 if d == 10 else 2}f}"
        return {"prompt": f"Write ${n}/{d}$ as a decimal.", "plain": f"Write {n}/{d} as a decimal.", "key": V(v), "display": s, "verified": f"{n}/{d} = {s}",
                "solution": SOL(f"{n}/{d} = {s}")}
    a = rng.randint(1, 9) / 10
    b = rng.randint(1, 99) / 100
    check(abs(a - b) > 1e-9 and round(b * 10) != b * 10, "hundredths")
    sa, sb = f"{a:.1f}", f"{b:.2f}"
    key, s = cmp_key(F(sa), F(sb), sa, sb)
    return {"prompt": f"Compare {sa} and {sb}. Write $<$, $>$ or $=$.", "plain": f"Compare {sa} and {sb}. Write <, > or =.", "key": key,
            "display": f"{sa} {s} {sb}", "verified": f"{sa}0 vs {sb}", "solution": SOL(f"{sa}0 \"and\" {sb}", f"{sa} {s} {sb}")}


@template("g4_measure.convert", "g4_measure", requires=["g3_area", "g4_mult"], guess=0.03, work_lines=2,
          substeps=["larger to smaller: multiply"], strategies={"multiply": "multiply by the conversion", **OU})
def _(rng):
    if rng.random() < 0.5:
        big, small, f = rng.choice([("feet", "inches", 12), ("yards", "feet", 3), ("hours", "minutes", 60), ("meters", "centimeters", 100), ("kilograms", "grams", 1000)])
        n = rng.randint(2, 9)
        return {"prompt": f"How many {small} are in {n} {big}?", "plain": f"How many {small} are in {n} {big}?", "key": V(n * f), "display": comma(n * f),
                "verified": f"{n}*{f} = {n * f}", "solution": SOL(f"{n} times {comma(f)} = {comma(n * f)}")}
    w, l = rng.randint(2, 9), rng.randint(4, 15)
    A = w * l
    q = f"A rectangle has an area of {A} square feet. Its length is {l} feet. What is its width, in feet?"
    return {"prompt": q, "plain": q, "key": V(w), "display": str(w), "verified": f"{l}*{w} = {A}", "solution": SOL(f"{l} times w = {A}", f"w = {A} div {l} = {w}")}


@template("g4_angles.unknown", "g4_angles", requires=["g2_addsub100"], guess=0.02, work_lines=2,
          substeps=["the angles add to the whole", "subtract the known angle"], strategies={"subtract": "subtract from the whole", **OU})
def _(rng):
    whole = rng.choice([90, 180])
    a = rng.randint(15, whole - 15)
    if whole == 90:
        q = f"Two angles together make a right angle. One is {a} degrees. What is the other, in degrees? #angles2({a}, {90 - a}, la: [{a}°], lb: [?])"
    else:
        q = f"Two angles on a straight line add to 180 degrees. One is {a} degrees. What is the other, in degrees?"
    return {"prompt": q, "plain": q.split(" #")[0], "key": V(whole - a), "display": str(whole - a), "verified": f"{whole} - {a} = {whole - a}",
            "solution": SOL(f"{a} + square = {whole}", f"{whole} - {a} = {whole - a}")}


# ============================================================ Grade 5

@template("g5_expr.evaluate", "g5_expr", requires=["g3_props"], guess=0.02, work_lines=3,
          substeps=["parentheses first", "then multiply and divide", "then add and subtract"], strategies={"order": "order of operations", **OU})
def _(rng):
    a, b, c = rng.randint(2, 12), rng.randint(2, 9), rng.randint(2, 9)
    form = rng.choice(["a+b*c", "(a+b)*c", "c*(a-b)+a", "a*b-c"])
    if form == "c*(a-b)+a":
        check(a > b, "positive")
    expr = form.replace("a", str(a)).replace("b", str(b)).replace("c", str(c))
    val = sp.sympify(expr)
    typ = expr.replace("*", " times ")
    return {"prompt": f"Evaluate: ${typ}$", "plain": expr, "key": V(val), "display": str(val), "verified": f"sympy: {expr} = {val}", "solution": SOL(typ, f"= {val}")}


@template("g5_place.decimals", "g5_place", requires=["g4_decimals"], guess=0.03, work_lines=1,
          substeps=["move each digit one place per zero"], strategies={"place_value": "place value", **OU})
def _(rng):
    form = rng.choice(["mult", "div", "round"])
    if form == "round":
        v = sp.Rational(rng.randint(1001, 9999), 1000)
        check(v * 1000 % 10 != 0, "three places")
        r = sp.Rational(int(sp.floor(v * 100 + sp.Rational(1, 2))), 100)
        sv, sr = f"{float(v):.3f}", f"{float(r):.2f}"
        return {"prompt": f"Round {sv} to the nearest hundredth.", "plain": f"Round {sv} to the nearest hundredth.", "key": V(r), "display": sr,
                "verified": f"|{r} - {v}| <= 1/200", "solution": SOL(f"{sv} \"is between\" {float(r) - 0.01:.2f} \"and\" {float(r) + 0.01:.2f}", sr)}
    p = rng.choice([10, 100, 1000])
    v = sp.Rational(rng.randint(11, 999), rng.choice([10, 100]))
    sv = str(sp.N(v, 6)).rstrip("0").rstrip(".")
    res = v * p if form == "mult" else v / p
    sres = f"{float(res):.6f}".rstrip("0").rstrip(".")
    return {"prompt": f"{'Multiply' if form == 'mult' else 'Divide'}: ${sv} {'times' if form == 'mult' else 'div'} {comma(p)}$", "plain": f"{sv} {'*' if form == 'mult' else '/'} {p}",
            "key": V(res), "display": sres, "verified": f"sympy: {res}", "solution": SOL(f"{sv} {'times' if form == 'mult' else 'div'} {comma(p)} = {sres}")}


@template("g5_mult.algorithm", "g5_mult", requires=["g4_mult"], guess=0.02, work_lines=5,
          substeps=["multiply by the ones digit", "multiply by the tens digit, with a placeholder zero", "add the rows"], strategies={"column": "standard algorithm", **OU})
def _(rng):
    a, b = rng.randint(123, 989), rng.randint(12, 89)
    r1, r2 = a * (b % 10), a * (b // 10) * 10
    return {"prompt": f"Multiply: ${a} times {b}$", "plain": f"{a} * {b}", "key": V(a * b), "display": comma(a * b), "verified": f"{a}*{b} = {sp.Integer(a) * b}",
            "solution": SOL(f"{a} times {b % 10} = {comma(r1)}", f"{a} times {b - b % 10} = {comma(r2)}", f"{comma(r1)} + {comma(r2)} = {comma(a * b)}")}


@template("g5_div.two_digit", "g5_div", requires=["g4_div", "g5_mult"], guess=0.02, work_lines=6,
          substeps=["estimate each quotient digit by rounding the divisor", "multiply, subtract, bring down"], strategies={"long_division": "long division", **OU})
def _(rng):
    d = rng.randint(12, 48)
    qv = rng.randint(12, 89)
    r = rng.choice([0, 0, rng.randint(1, d - 1)])
    n = d * qv + r
    check(r < d, "remainder")
    if r:
        return {"prompt": f"Divide: ${comma(n)} div {d}$. Write the remainder like this: 23 R 4.", "plain": f"{n} / {d}, quotient and remainder",
                "key": C(f"{qv} R {r}", f"{qv}R{r}", f"{qv} r {r}", f"{qv} remainder {r}"), "display": f'"{qv} R {r}"', "verified": f"{d}*{qv} + {r} = {n}",
                "solution": SOL(f"{d} times {qv} = {comma(d * qv)}", f"{comma(n)} - {comma(d * qv)} = {r}")}
    return {"prompt": f"Divide: ${comma(n)} div {d}$", "plain": f"{n} / {d}", "key": V(qv), "display": str(qv), "verified": f"{d}*{qv} = {n}",
            "solution": SOL(f"{d} times {qv} = {comma(n)}")}


def dec(v, places=4) -> str:
    """A decimal without trailing zeros: 3.60 -> 3.6, 12.0 -> 12."""
    return f"{float(v):.{places}f}".rstrip("0").rstrip(".")


@template("g5_dec_ops.compute", "g5_dec_ops", requires=["g5_place", "g4_addsub"], guess=0.02, work_lines=3,
          substeps=["line up the points (add, subtract) or count decimal places (multiply)"], strategies={"column": "line up points", **OU})
def _(rng):
    op = rng.choice(["+", "-", "*", "/"])
    if op in "+-":
        a, b = sp.Rational(rng.randint(105, 2000), 100), sp.Rational(rng.randint(11, 99), 10)
        if op == "-":
            check(a > b, "positive")
        v = a + b if op == "+" else a - b
        sym = op
    elif op == "*":
        a, b = sp.Rational(rng.randint(11, 99), 10), sp.Rational(rng.randint(2, 19), 10)
        v, sym = a * b, "times"
    else:
        b = sp.Integer(rng.randint(2, 9))
        v = sp.Rational(rng.randint(11, 499), 100)
        a, sym = v * b, "div"
        check(a * 100 == int(a * 100), "hundredths")
    sa, sb, sv = dec(a), dec(b), dec(v, 4)
    return {"prompt": f"{dict(zip('+-*/', ['Add', 'Subtract', 'Multiply', 'Divide']))[op]}: ${sa} {sym} {sb}$", "plain": f"{sa} {op} {sb}",
            "key": V(v), "display": sv, "verified": f"sympy: {v}", "solution": SOL(f"{sa} {sym} {sb}", f"= {sv}")}


@template("g5_frac_addsub.unlike", "g5_frac_addsub", requires=["g4_frac_add", "g4_factors"], guess=0.02, work_lines=4,
          substeps=["find a common denominator", "rewrite each fraction", "add or subtract the numerators"], strategies={"common_denominator": "common denominator", **OU})
def _(rng):
    d1, d2 = rng.sample([2, 3, 4, 5, 6, 8, 10, 12], 2)
    a, b = F(rng.randint(1, d1 - 1), d1), F(rng.randint(1, d2 - 1), d2)
    op = rng.choice(["+", "-"])
    if op == "-":
        a, b = max(a, b), min(a, b)
        check(a != b, "nonzero")
    v = a + b if op == "+" else a - b
    L = sp.ilcm(d1, d2)
    ta, tb = fr(a), fr(b)
    na, nb = a.numerator * (L // a.denominator), b.numerator * (L // b.denominator)
    return {"prompt": f"{'Add' if op == '+' else 'Subtract'}: ${ta} {op} {tb}$", "plain": f"{ta} {op} {tb}", "key": V(sp.Rational(v.numerator, v.denominator)),
            "display": fr(v), "verified": f"sympy: {sp.Rational(a.numerator, a.denominator) + (1 if op == '+' else -1) * sp.Rational(b.numerator, b.denominator)}",
            "solution": SOL(f"{na}/{L} {op} {nb}/{L}", f"= {na + nb if op == '+' else na - nb}/{L}", f"= {fr(v)}")}


@template("g5_frac_mul.mult", "g5_frac_mul", requires=["g4_frac_whole"], guess=0.02, work_lines=3,
          substeps=["multiply the numerators", "multiply the denominators", "simplify"], strategies={"across": "multiply across", **OU})
def _(rng):
    a = F(rng.randint(1, 5), rng.randint(2, 8))
    b = F(rng.randint(1, 5), rng.randint(2, 8))
    check(a < 1 and b < 1, "proper")
    v = a * b
    return {"prompt": f"Multiply: ${fr(a)} times {fr(b)}$", "plain": f"{fr(a)} * {fr(b)}", "key": V(sp.Rational(v.numerator, v.denominator)), "display": fr(v),
            "verified": f"sympy: {sp.Rational(a.numerator, a.denominator) * sp.Rational(b.numerator, b.denominator)}",
            "solution": SOL(f"({a.numerator} times {b.numerator})/({a.denominator} times {b.denominator})", f"= {a.numerator * b.numerator}/{a.denominator * b.denominator}", f"= {fr(v)}")}


@template("g5_frac_div.unit", "g5_frac_div", requires=["g5_frac_mul"], guess=0.02, work_lines=2,
          substeps=["fraction by whole: share it", "whole by unit fraction: how many parts in the wholes"], strategies={"model": "share or count parts", "reciprocal": "multiply by the reciprocal", **OU})
def _(rng):
    d, k = rng.randint(2, 9), rng.randint(2, 9)
    if rng.random() < 0.5:
        v = F(1, d) / k
        return {"prompt": f"Divide: $1/{d} div {k}$", "plain": f"1/{d} / {k}", "key": V(sp.Rational(1, d * k)), "display": fr(v), "verified": f"sympy: {sp.Rational(1, d) / k}",
                "solution": SOL(f"1/{d} div {k} = 1/({d} times {k})", f"= {fr(v)}")}
    return {"prompt": f"Divide: ${k} div 1/{d}$", "plain": f"{k} / (1/{d})", "key": V(k * d), "display": str(k * d), "verified": f"sympy: {sp.Integer(k) / sp.Rational(1, d)}",
            "solution": SOL(f"{k} times {d}", f"= {k * d}")}


@template("g5_volume.prism", "g5_volume", requires=["g4_measure"], guess=0.02, work_lines=2,
          substeps=["multiply length, width and height"], strategies={"formula": "V = l times w times h", "layers": "count layers", **OU})
def _(rng):
    l, w, h = rng.randint(2, 9), rng.randint(2, 6), rng.randint(2, 5)
    if rng.random() < 0.5 and l <= 6:
        return {"prompt": f"How many unit cubes fill this box? #prism({l}, {w}, {h})", "plain": f"How many unit cubes fill a box {l} long, {w} wide and {h} high?",
                "key": V(l * w * h), "display": str(l * w * h), "verified": f"{l}*{w}*{h} = {sp.Integer(l) * w * h}", "solution": SOL(f"{l} times {w} times {h}", f"= {l * w * h}")}
    u = rng.choice(["cm", "ft", "in"])
    q = f"A box is {l} {u} long, {w} {u} wide and {h} {u} high. What is its volume, in cubic {u}?"
    return {"prompt": q, "plain": q, "key": V(l * w * h), "display": str(l * w * h), "verified": f"{l}*{w}*{h} = {sp.Integer(l) * w * h}",
            "solution": SOL(f"{l} times {w} times {h}", f"= {l * w * h}")}


@template("g5_coord.name", "g5_coord", requires=["g5_expr"], guess=0.03, work_lines=1,
          substeps=["across first", "then up"], strategies={"across_then_up": "across, then up", **OU})
def _(rng):
    x0, y0 = rng.randint(1, 7), rng.randint(1, 7)
    x1, y1 = rng.randint(1, 7), rng.randint(1, 7)
    check((x0, y0) != (x1, y1) and x0 != y0, "distinct, not symmetric")
    return {"prompt": "What ordered pair names point P?", "plain": f"What ordered pair names point P? (grid: P at ({x0}, {y0}), Q at ({x1}, {y1}))",
            "figure": {"type": "draw", "typ": f'plane(n: 8, pts: (({x0}, {y0}, "P"), ({x1}, {y1}, "Q")))'},
            "key": {"kind": "point", "value": [str(x0), str(y0)]}, "display": f"({x0}, {y0})", "verified": f"P drawn at ({x0}, {y0})",
            "solution": SOL(f"\"across\" {x0}", f"\"up\" {y0}", f"({x0}, {y0})")}


@template("g5_convert.units", "g5_convert", requires=["g5_dec_ops", "g4_measure"], guess=0.02, work_lines=2,
          substeps=["to a smaller unit multiply; to a larger unit divide"], strategies={"multiply_divide": "multiply or divide by the conversion", **OU})
def _(rng):
    big, small, f = rng.choice([("meters", "centimeters", 100), ("kilograms", "grams", 1000), ("liters", "milliliters", 1000), ("pounds", "ounces", 16), ("yards", "feet", 3)])
    if rng.random() < 0.5:
        v = sp.Rational(rng.randint(11, 99), 10)
        res = v * f
        q = f"How many {small} are in {dec(v)} {big}?"
        return {"prompt": q, "plain": q, "key": V(res), "display": dec(res), "verified": f"{v}*{f} = {res}", "solution": SOL(f"{dec(v)} times {comma(f)} = {dec(res)}")}
    n = f * rng.randint(2, 9) + rng.choice([0, f // 2]) if f % 2 == 0 else f * rng.randint(2, 9)
    res = sp.Rational(n, f)
    q = f"How many {big} is {n:,} {small}?"
    return {"prompt": q, "plain": q, "key": V(res), "display": dec(res), "verified": f"{n}/{f} = {res}", "solution": SOL(f"{n} div {f} = {dec(res)}")}
