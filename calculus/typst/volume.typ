// The bound book: a whole course as one textbook (cover, contents, chapters, sections,
// exercises, answers at the back). Built by adaptcalc/volume.py; shares textbook.typ's styles.
#import "/typst/textbook.typ": *

// Pages before the first chapter (cover, credits, contents) carry no running head or folio.
#let _in-front() = {
  let start = query(<mainmatter>)
  start.len() == 0 or here().page() < start.first().location().page()
}

#let volume(title: "", subtitle: "", attribution: "", body) = {
  set document(title: title)
  set page(
    paper: "us-letter",
    margin: (top: 0.95in, bottom: 0.9in, inside: 1.0in, outside: 1.0in),
    header: context {
      if _in-front() { return }
      let n = here().page()
      if query(heading.where(level: 1)).any(h => h.location().page() == n) { return }  // chapter openers
      let chs = query(heading.where(level: 1).before(here()))
      let secs = query(heading.where(level: 2).before(here()))
      set text(font: sans, size: 8pt, fill: spot)
      // in the back matter (a chapter heading after the last section) both heads name the chapter
      let back = chs.len() > 0 and (secs.len() == 0 or chs.last().location().page() > secs.last().location().page())
      if calc.even(n) or back {
        align(if calc.even(n) { left } else { right }, if chs.len() > 0 { smallcaps(chs.last().body) })
      } else {
        align(right, if secs.len() > 0 { secs.last().body })
      }
      v(-4pt)
      line(length: 100%, stroke: 0.5pt + spot)
    },
    footer: context {
      if _in-front() { return }
      let n = here().page()
      set text(font: sans, size: 9pt, weight: "bold", fill: spot)
      align(if calc.even(n) { left } else { right }, str(n))
    },
  )
  set text(font: serif, size: 10.5pt, fill: ink, hyphenate: false, lang: "en")
  set par(justify: true, leading: 0.62em, spacing: 0.95em)
  show math.equation: set text(font: "New Computer Modern Math")
  set list(marker: text(fill: spot)[•], indent: 0.6em)
  set enum(indent: 0.4em)
  set table(stroke: 0.5pt + spot.lighten(40%))

  // a chapter opens on a new page: its number large, its title, and the sections inside it
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(1.1in)
    block(width: 100%)[
      #set par(justify: false)
      #text(font: sans, size: 10pt, weight: "bold", fill: spot, tracking: 0.2em)[#upper(it.supplement)]
      #v(-4pt)
      #text(font: sans, size: 30pt, weight: "bold", it.body)
      #v(-10pt)
      #line(length: 100%, stroke: 2.2pt + spot)
    ]
    context {
      let here-loc = here()
      let next-ch = query(heading.where(level: 1).after(here-loc)).filter(h => h.location() != here-loc)
      let secs = query(heading.where(level: 2).after(here-loc)).filter(s =>
        next-ch.len() == 0 or s.location().page() < next-ch.first().location().page()
          or (s.location().page() == next-ch.first().location().page()
              and s.location().position().y < next-ch.first().location().position().y))
      if secs.len() > 0 {
        v(0.3in)
        block(width: 100%, fill: tint2, inset: 14pt, stroke: (left: 3pt + spot))[
          #text(font: sans, size: 8.5pt, weight: "bold", fill: spot, tracking: 0.1em)[IN THIS CHAPTER]
          #v(2pt)
          #set text(font: sans, size: 10pt)
          #for s in secs [
            #link(s.location())[#s.body] #box(width: 1fr, repeat[#h(3pt).#h(3pt)]) #text(fill: spot)[#s.location().page()] \
          ]
        ]
        pagebreak(weak: true)  // an opener with sections has its own page; the answers follow their heading
      }
    }
  }
  // a section: number and title in the spot color, ruled
  show heading.where(level: 2): it => {
    v(0.4em)
    block(width: 100%, below: 0.9em, sticky: true)[
      #set text(font: sans, size: 19pt, weight: "semibold")
      #it.body
      #v(-8pt)
      #line(length: 100%, stroke: 1.4pt + spot)
    ]
  }
  show heading.where(level: 3): it => block(above: 1.3em, below: 0.7em, sticky: true,
    text(font: sans, size: 12pt, weight: "semibold", fill: spot, it.body))
  body
}

#let sec-num(n) = text(fill: spot, weight: "bold")[#n] + h(0.45em)

#let volume-cover(title, subtitle, edition) = page(margin: 0pt, header: none, footer: none,
  block(width: 100%, height: 100%, fill: spot, inset: (x: 0.9in, y: 1.1in))[
    #set text(fill: white, font: sans)
    #set par(justify: false)
    #text(size: 11pt, tracking: 0.3em, weight: "bold")[MARGINALIA]
    #v(1.6in)
    #line(length: 2.2in, stroke: 1.5pt + white)
    #v(0.15in)
    #text(size: 40pt, weight: "bold", title)
    #v(-0.1in)
    #text(size: 15pt, fill: tint1, subtitle)
    #v(1fr)
    #align(center, stack(dir: ltr, spacing: 8pt, line(length: 0.7in, stroke: 0.8pt + tint1),
      move(dy: -3.5pt, rotate(45deg, rect(width: 7pt, height: 7pt, fill: tint1, stroke: none))),
      line(length: 0.7in, stroke: 0.8pt + tint1)))
    #v(0.4in)
    #text(size: 9pt, fill: tint1, edition)
  ])

#let credits-page(body) = page(header: none, footer: none)[
  #v(1fr)
  #set text(size: 8.5pt, fill: luma(60))
  #set par(justify: false)
  #body
]

#let contents-page() = {
  show outline.entry.where(level: 1): it => {
    v(0.7em)
    text(font: sans, weight: "bold", size: 11pt, it)
  }
  set outline.entry(fill: repeat[#h(2.5pt).#h(2.5pt)])
  text(font: sans, size: 24pt, weight: "bold")[Contents]
  v(-8pt)
  line(length: 100%, stroke: 2pt + spot)
  v(6pt)
  outline(title: none, depth: 2, indent: 1.4em)
}

#let exercises-head() = block(above: 1.6em, below: 0.8em, sticky: true)[
  #box(fill: spot, inset: (x: 7pt, y: 4pt), text(font: sans, size: 10pt, weight: "bold", fill: white)[Exercises])
  #v(-6pt)
  #line(length: 100%, stroke: 0.8pt + spot)
]

#let exercise-group(title) = block(above: 1em, below: 0.5em, sticky: true,
  text(font: sans, size: 9.5pt, weight: "bold", fill: spot, title))

// answers at the back: one section's answers (the whole back matter flows in two columns)
#let answers-section(title, body) = block(width: 100%, breakable: true, above: 1em)[
  #block(sticky: true, below: 0.4em, text(font: sans, size: 10.5pt, weight: "bold", fill: spot, title))
  #set text(size: 9pt)
  #body
]
