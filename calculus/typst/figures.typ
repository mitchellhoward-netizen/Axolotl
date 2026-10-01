// Figures for the elementary book: the pictures a child counts, reads and measures.
// Two inks only (black and the spot color), drawn plainly, as in a printed primer.
// Every function returns content; lessons and problems call them by name.
#import "@preview/cetz:0.3.4"

#let _spot = rgb("#006B7F")
#let _tint = _spot.lighten(86%)
#let _u = 0.5cm

// n counters in rows of `per` (a dot card). `shape`: "dot", "square", "star", "triangle".
#let _mark(shape, size, fill) = {
  if shape == "square" { box(rect(width: size, height: size, fill: fill, stroke: 0.6pt + black)) }
  else if shape == "triangle" { box(polygon(fill: fill, stroke: 0.6pt + black, (0pt, size), (size / 2, 0pt), (size, size))) }
  else if shape == "star" { box(text(size: size * 1.35, fill: fill, baseline: -0.1em)[★]) }
  else if shape == "ring" { box(circle(radius: size / 2, fill: white, stroke: 0.9pt + _spot)) }
  else { box(circle(radius: size / 2, fill: fill, stroke: 0.6pt + black)) }
}
#let counters(n, per: 5, shape: "dot", size: 0.42cm, fill: _spot) = {
  let rows = calc.ceil(n / per)
  box(baseline: if rows == 1 { 15% } else { 45% }, stack(dir: ttb, spacing: 0.16cm, ..range(rows).map(r => {
    let k = calc.min(per, n - r * per)
    stack(dir: ltr, spacing: 0.16cm, ..range(k).map(_ => _mark(shape, size, fill)))
  })))
}

// Two groups side by side (for joining and comparing): filled and open counters.
#let groups(a, b, per: 5) = box(stack(dir: ltr, spacing: 0.7cm,
  counters(a, per: per), counters(b, per: per, shape: "ring")))

// A ten frame (2 x 5) with n dots; n over 10 draws more frames. `open` more empty-circle dots
// after the filled ones (for "how many more to make 10").
#let _frame(k, extra) = box(table(columns: (0.62cm,) * 5, rows: (0.62cm,) * 2, inset: 0pt, align: center + horizon,
  stroke: 0.8pt + black,
  ..range(10).map(i => if i < k { circle(radius: 0.21cm, fill: _spot, stroke: none) }
    else if i < k + extra { circle(radius: 0.2cm, fill: white, stroke: 0.9pt + _spot) } else { [] })))
#let tenframe(n, open: 0) = {
  let frames = calc.max(1, calc.ceil((n + open) / 10))
  box(stack(dir: ltr, spacing: 0.4cm, ..range(frames).map(f => {
    let k = calc.max(0, calc.min(10, n - f * 10))
    let e = calc.max(0, calc.min(10 - k, n + open - f * 10 - k))
    _frame(k, e)
  })))
}

// Base-ten blocks: hundreds (flats), tens (rods), ones (cubes).
#let _cube(s) = rect(width: s, height: s, fill: _tint, stroke: 0.5pt + black)
#let baseten(h, t, o, s: 0.2cm) = {
  let flat = box(grid(columns: (s,) * 10, rows: (s,) * 10, ..range(100).map(_ => _cube(s))))
  let rod = box(grid(columns: (s,), rows: (s,) * 10, ..range(10).map(_ => _cube(s))))
  let ones = box(grid(columns: (s,) * calc.min(5, calc.max(o, 1)), row-gutter: 0.08cm, column-gutter: 0.08cm,
    ..range(o).map(_ => box(rect(width: s, height: s, fill: _spot, stroke: 0.5pt + black)))))
  box(stack(dir: ltr, spacing: 0.35cm,
    ..range(h).map(_ => flat),
    ..if t > 0 { (stack(dir: ltr, spacing: 0.1cm, ..range(t).map(_ => rod)),) } else { () },
    ..if o > 0 { (align(bottom, ones),) } else { () }))
}

// An analog clock showing h:m.
#let clock(h, m, r: 1.25) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  circle((0, 0), radius: r, stroke: 1.1pt + black)
  for i in range(60) {
    let a = 90deg - i * 6deg
    let r1 = if calc.rem(i, 5) == 0 { r * 0.86 } else { r * 0.93 }
    line((r1 * calc.cos(a), r1 * calc.sin(a)), (r * calc.cos(a), r * calc.sin(a)),
      stroke: if calc.rem(i, 5) == 0 { 0.9pt } else { 0.35pt })
  }
  for k in range(1, 13) {
    let a = 90deg - k * 30deg
    content((r * 0.7 * calc.cos(a), r * 0.7 * calc.sin(a)), text(size: 7.5pt, str(k)))
  }
  let ah = 90deg - (calc.rem(h, 12) + m / 60) * 30deg
  let am = 90deg - m * 6deg
  line((0, 0), (r * 0.45 * calc.cos(ah), r * 0.45 * calc.sin(ah)), stroke: 2.2pt + black)
  line((0, 0), (r * 0.78 * calc.cos(am), r * 0.78 * calc.sin(am)), stroke: 1.2pt + _spot)
  circle((0, 0), radius: 0.06, fill: black)
}))

// A number line from lo to hi. `every`: label every k-th tick. `marks`: points drawn as dots.
// `jumps`: ((from, to), ...) drawn as arcs above the line. `den`: ticks at 1/den between integers
// (fractions); labels then read as fractions where they are not whole.
#let numline(lo, hi, every: 1, marks: (), jumps: (), den: 1, width: 12, labels: true, skip: (), step: 1) = box(baseline: 40%, cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let n = int((hi - lo) * den / step)
  let x(v) = (v - lo) / (hi - lo) * width
  line((-0.3, 0), (width + 0.3, 0), stroke: 0.8pt, mark: (start: ">", end: ">", fill: black, size: 0.18))
  for i in range(n + 1) {
    let v = lo + i * step / den
    let whole = calc.rem(i * step, den) == 0
    line((x(v), -0.13), (x(v), 0.13), stroke: if whole { 0.8pt } else { 0.45pt })
    let show-it = labels and not skip.contains(i) and (if den > 1 { true } else { calc.rem(i, every) == 0 })
    if show-it {
      let txt = if whole { str(int(v)) } else { $#str(i * step + lo * den)/#str(den)$ }
      content((x(v), -0.42), text(size: 7.5pt, txt))
    }
  }
  for (a, b) in jumps {
    let mid = (x(a) + x(b)) / 2
    bezier((x(a), 0.12), (x(b), 0.12), (mid, 0.12 + 0.35 + calc.abs(x(b) - x(a)) * 0.08),
      stroke: 0.9pt + _spot, mark: (end: ">", fill: _spot, size: 0.16))
  }
  for v in marks { circle((x(v), 0), radius: 0.09, fill: _spot, stroke: none) }
}))

// A fraction bar: one whole cut into d equal parts, n shaded. `parts` lets two bars line up.
#let fracbar(n, d, width: 7cm, label: false) = box(stack(dir: ltr, spacing: 0pt, ..range(d).map(i =>
  box(rect(width: width / d, height: 0.62cm, fill: if i < n { _tint } else { white }, stroke: 0.8pt + black,
    inset: 0pt, align(center + horizon, if label { text(size: 7.5pt, $1/#str(d)$) } else { [] }))))))

// A whole shape cut into d equal parts, n shaded: "circle" (sectors), "rect" (strips), "square" (grid 2x2).
#let fracshape(n, d, kind: "circle", s: 1.6) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  if kind == "circle" {
    for i in range(d) {
      let a0 = 90deg - i * 360deg / d
      let a1 = 90deg - (i + 1) * 360deg / d
      let pts = ((0, 0),) + range(13).map(k => {
        let a = a0 + (a1 - a0) * k / 12
        (s / 2 * calc.cos(a), s / 2 * calc.sin(a))
      })
      line(..pts, close: true, fill: if i < n { _tint } else { white }, stroke: 0.8pt)
    }
  } else {
    for i in range(d) {
      rect((i * s * 1.4 / d, 0), ((i + 1) * s * 1.4 / d, s * 0.8), fill: if i < n { _tint } else { white }, stroke: 0.8pt)
    }
  }
}))

// An array of r rows and c columns of dots (multiplication).
#let arr(r, c) = counters(r * c, per: c, size: 0.34cm)

// A rectangle on a grid of unit squares (area), w by h, with or without side labels.
#let areagrid(w, h, s: 0.5cm, labels: false, shade: true) = box(stack(dir: ttb, spacing: 3pt,
  grid(columns: (s,) * w, rows: (s,) * h,
    ..range(w * h).map(_ => rect(width: s, height: s, fill: if shade { _tint } else { white }, stroke: 0.5pt + black))),
  ..if labels { (align(center, text(size: 8pt)[#w units]),) } else { () }))

// A rectangle drawn to look like a room or a garden, sides labeled (perimeter and area by formula).
#let labeledrect(w, h, unit: "", k: 0.25) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let W = calc.min(6, w * k + 1)
  let H = calc.min(3.2, h * k + 0.6)
  rect((0, 0), (W, H), fill: _tint, stroke: 0.9pt)
  content((W / 2, -0.32), text(size: 8pt)[#w #unit])
  content((W + 0.25, H / 2), anchor: "west", text(size: 8pt)[#h #unit])
}))

// Plane shapes by name.
#let shape(kind, s: 1.1) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let st = (fill: _tint, stroke: 0.9pt)
  let poly(k, rot: 90deg) = range(k).map(i => (s / 2 * calc.cos(rot + i * 360deg / k), s / 2 * calc.sin(rot + i * 360deg / k)))
  if kind == "circle" { circle((0, 0), radius: s / 2, ..st) }
  else if kind == "square" { rect((-s / 2, -s / 2), (s / 2, s / 2), ..st) }
  else if kind == "rectangle" { rect((-s * 0.8, -s / 2.6), (s * 0.8, s / 2.6), ..st) }
  else if kind == "triangle" { line(..poly(3), close: true, ..st) }
  else if kind == "hexagon" { line(..poly(6, rot: 0deg), close: true, ..st) }
  else if kind == "pentagon" { line(..poly(5), close: true, ..st) }
  else if kind == "trapezoid" { line((-s * 0.7, -s / 2.6), (s * 0.7, -s / 2.6), (s * 0.35, s / 2.6), (-s * 0.35, s / 2.6), close: true, ..st) }
  else if kind == "rhombus" { line((0, -s / 2), (s * 0.4, 0), (0, s / 2), (-s * 0.4, 0), close: true, ..st) }
}))
#let shapes(..kinds) = box(stack(dir: ltr, spacing: 0.5cm, ..kinds.pos().map(k => shape(k))))

// Coins (US): "p" penny, "n" nickel, "d" dime, "q" quarter. Drawn as labeled circles, sized as the coins are.
#let _coin(k) = {
  let (r, lab) = (p: (0.38, "1¢"), n: (0.42, "5¢"), d: (0.35, "10¢"), q: (0.48, "25¢")).at(k)
  box(baseline: 30%, circle(radius: r * 1cm, fill: if k == "p" { _tint } else { white }, stroke: 0.9pt + black,
    align(center + horizon, text(font: ("Fira Sans",), size: 7pt, weight: "bold", lab))))
}
#let coins(s) = box(stack(dir: ltr, spacing: 0.18cm, ..s.clusters().filter(c => c != " ").map(_coin)))

// A bar graph: labels, values, the scale step, and an axis title.
#let bars(labels, values, step: 1, title: "") = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let top = calc.ceil(calc.max(..values) / step) * step
  let H = 3.2
  let y(v) = v / top * H
  let n = labels.len()
  for k in range(0, int(top / step) + 1) {
    let v = k * step
    line((0, y(v)), (n * 1.2 + 0.2, y(v)), stroke: 0.3pt + _spot.lighten(50%))
    content((-0.25, y(v)), anchor: "east", text(size: 7pt, str(v)))
  }
  line((0, 0), (0, H + 0.2), stroke: 0.8pt)
  line((0, 0), (n * 1.2 + 0.2, 0), stroke: 0.8pt)
  for (i, (l, v)) in labels.zip(values).enumerate() {
    rect((0.35 + i * 1.2, 0), (0.35 + i * 1.2 + 0.7, y(v)), fill: _spot, stroke: none)
    content((0.7 + i * 1.2, -0.3), text(size: 7.5pt, l))
  }
  if title != "" { content((-0.9, H / 2), angle: 90deg, text(size: 7.5pt, title)) }
}))

// A picture graph: one row per label, each symbol worth `key`.
#let picgraph(labels, counts, key: 1) = box(table(columns: 2, stroke: (x, y) => (bottom: 0.4pt + black), inset: 4pt,
  align: (right + horizon, left + horizon),
  ..labels.zip(counts).map(((l, c)) => (text(size: 8.5pt, l), counters(c, per: 20, shape: "star", size: 0.3cm, fill: _spot))).flatten(),
  table.cell(colspan: 2, text(size: 7.5pt)[Each #box(text(fill: _spot)[★]) stands for #key.])))

// The first quadrant of the coordinate plane, 0..n, with labeled points ((x, y, "A"), ...).
#let plane(n: 8, pts: ()) = box(cetz.canvas(length: 0.45cm, {
  import cetz.draw: *
  for i in range(n + 1) {
    line((i, 0), (i, n), stroke: 0.3pt + _spot.lighten(50%))
    line((0, i), (n, i), stroke: 0.3pt + _spot.lighten(50%))
    content((i, -0.55), text(size: 6.5pt, str(i)))
    if i > 0 { content((-0.5, i), text(size: 6.5pt, str(i))) }
  }
  line((0, 0), (n + 0.6, 0), stroke: 0.8pt, mark: (end: ">", fill: black, size: 0.3))
  line((0, 0), (0, n + 0.6), stroke: 0.8pt, mark: (end: ">", fill: black, size: 0.3))
  content((n + 0.9, 0), text(size: 7pt, $x$))
  content((0, n + 1), text(size: 7pt, $y$))
  for (x, y, l) in pts {
    circle((x, y), radius: 0.16, fill: _spot, stroke: none)
    content((x + 0.45, y + 0.45), text(size: 7pt, weight: "bold", l))
  }
}))

// A rectangular prism of unit cubes, l x w x h, drawn in oblique projection.
#let prism(l, w, h, s: 0.42) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let dx = 0.5 * s
  let dy = 0.38 * s
  let P(x, y, z) = (x * s + y * dx, z * s + y * dy)
  // front face, top face, right face, unit edges
  line(P(0, 0, 0), P(l, 0, 0), P(l, 0, h), P(0, 0, h), close: true, fill: _tint, stroke: 0.8pt)
  line(P(0, 0, h), P(l, 0, h), P(l, w, h), P(0, w, h), close: true, fill: white, stroke: 0.8pt)
  line(P(l, 0, 0), P(l, w, 0), P(l, w, h), P(l, 0, h), close: true, fill: _spot.lighten(70%), stroke: 0.8pt)
  for i in range(1, l) { line(P(i, 0, 0), P(i, 0, h), P(i, w, h), stroke: 0.35pt) }
  for k in range(1, h) { line(P(0, 0, k), P(l, 0, k), P(l, w, k), stroke: 0.35pt) }
  for j in range(1, w) { line(P(0, j, h), P(l, j, h), P(l, j, 0), stroke: 0.35pt) }
}))

// An angle of `deg` degrees with its arc; `label` printed inside the arc.
#let angledeg(deg, label: none, r: 1.6) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  line((r, 0), (0, 0), (r * calc.cos(deg * 1deg), r * calc.sin(deg * 1deg)), stroke: 1pt)
  arc((0.55, 0), start: 0deg, stop: deg * 1deg, radius: 0.55, stroke: 0.8pt + _spot)
  if label != none {
    let a = deg / 2 * 1deg
    content((0.95 * calc.cos(a), 0.95 * calc.sin(a)), text(size: 7.5pt, label))
  }
}))
// Two adjacent angles sharing a ray: a + b, labels given.
#let angles2(a, b, la: none, lb: none, r: 1.7) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let ray(d) = (r * calc.cos(d * 1deg), r * calc.sin(d * 1deg))
  line((r, 0), (0, 0), ray(a + b), stroke: 1pt)
  line((0, 0), ray(a), stroke: 1pt)
  arc((0.5, 0), start: 0deg, stop: a * 1deg, radius: 0.5, stroke: 0.8pt + _spot)
  arc((0.75 * calc.cos(a * 1deg), 0.75 * calc.sin(a * 1deg)), start: a * 1deg, stop: (a + b) * 1deg, radius: 0.75, stroke: 0.8pt + _spot)
  if la != none { content((1.0 * calc.cos(a / 2 * 1deg), 1.0 * calc.sin(a / 2 * 1deg)), text(size: 7.5pt, la)) }
  if lb != none { content((1.2 * calc.cos((a + b / 2) * 1deg), 1.2 * calc.sin((a + b / 2) * 1deg)), text(size: 7.5pt, lb)) }
}))

// A ruler in inches (or centimeters) under a bar of the given length; the bar starts at 0.
#let ruler(len, max: 6, unit: "in", show-bar: true) = box(cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let u = if unit == "in" { 1.6 } else { 0.8 }
  if show-bar { rect((0, 0.55), (len * u, 0.85), fill: _spot, stroke: none) }
  rect((-0.15, -0.55), (max * u + 0.15, 0.3), fill: white, stroke: 0.8pt)
  for i in range(max * 4 + 1) {
    let x = i / 4 * u
    let L = if calc.rem(i, 4) == 0 { 0.35 } else if calc.rem(i, 2) == 0 { 0.22 } else { 0.13 }
    line((x, 0.3), (x, 0.3 - L), stroke: 0.5pt)
    if calc.rem(i, 4) == 0 { content((x, -0.25), text(size: 7pt, str(int(i / 4)))) }
  }
  content((max * u + 0.45, -0.1), text(size: 6.5pt, unit))
}))

// Two lengths drawn as bars to compare; heights in units.
#let lengths(..pairs) = box(stack(dir: ttb, spacing: 0.25cm, ..pairs.pos().map(((name, n)) =>
  stack(dir: ltr, spacing: 0.3cm, box(width: 1.6cm, align(right, text(size: 8.5pt, name))),
    box(rect(width: n * 0.5cm, height: 0.38cm, fill: _tint, stroke: 0.7pt + black))))))

// A bar model (tape diagram): parts with labels inside, a total bracketed under it.
#let tape(parts, total: none, unit: 0.25cm) = box(stack(dir: ttb, spacing: 3pt,
  stack(dir: ltr, ..parts.map(((v, l)) => box(rect(width: calc.max(v, 4) * unit, height: 0.6cm, fill: _tint,
    stroke: 0.7pt + black, inset: 0pt, align(center + horizon, text(size: 8pt, l)))))),
  ..if total != none { (align(center, text(size: 8pt)[#sym.arrow.l.r #h(2pt) #total #h(2pt) #sym.arrow.l.r]),) } else { () }))
