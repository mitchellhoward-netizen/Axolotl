# Benny assets

These mascots use the supplied `benny_faux_clay_render.html` and
`benny_flat_pill_eyes_color_family.html` artwork. No pupils are added.

- `benny-clay.svg` preserves the supplied gradients, pill eyes, and silhouette.
  Named groups separate the face, eyes, gills, and ground shadow for animation.
- `benny-mark.svg` is the supplied flat pink mark. All eight supplied family
  colors are generated: pink, coral, amber, green, teal, blue, indigo, and ink.
  Teal, indigo, and amber peek from distinct section edges on the marketing page.
- `benny-rest.svg` composites the awake clay layers in the animation's exact
  viewBox. The hero keeps the clay head, with no change of style at the end.

Run `bash public/animation/generate-assets.sh` from the repository root, then
`node --test scripts/test-benny-assets.mjs`.

`wake.json` is a 138-frame / 60fps Lottie animation with embedded SVG image
layers (not raster images or an After Effects vector export). Embedding the
supplied SVG preserves its gradients without extra network requests. It sleeps,
hops, opens its eyes at frame 84, and settles by frame 116.
The gills move independently; the contact shadow stays on the ground.
`mountWake(container, onAwake)` plays once and replaces the canvas with the
matching awake clay image on completion. Reduced motion and failed loads show
that same awake image immediately. The flat mark stays in smaller brand placements.
The settled hero has a gentle six-second CSS float, with a pause/resume control.
Reduced motion disables the float too; the smaller peeking marks never animate.

Colored ink accents on page links/focus states remain off by default.
