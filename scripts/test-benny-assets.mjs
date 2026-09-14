import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../public/animation/", import.meta.url);
const animation = JSON.parse(
  await readFile(new URL("wake.json", root), "utf8"),
);
const layer = (name) => animation.layers.find((item) => item.nm === name);
const svgAsset = (id) =>
  Buffer.from(
    animation.assets.find((asset) => asset.id === id).p.split(",")[1],
    "base64",
  ).toString("utf8");

test("all eight supplied flat colors preserve six gills and two white pill eyes, without pupils", async () => {
  const family = {
    pink: "#EE6D9E",
    coral: "#F0603F",
    amber: "#E8912F",
    green: "#3E9E5B",
    teal: "#0FA088",
    blue: "#3B7DE0",
    indigo: "#6C5CE0",
    ink: "#1A1A1A",
  };
  for (const [name, color] of Object.entries(family)) {
    const svg = await readFile(
      new URL(`benny-mark${name === "pink" ? "" : `-${name}`}.svg`, root),
      "utf8",
    );
    assert.equal((svg.match(/<ellipse /g) || []).length, 7, name);
    assert.equal((svg.match(/<rect /g) || []).length, 2, name);
    assert.ok(svg.includes(`fill="${color}"`), name);
    assert.match(
      svg,
      /<g fill="#FFFFFF"><rect x="38.5" y="43" width="9" height="19" rx="4.5"\/><rect x="52.5" y="43" width="9" height="19" rx="4.5"\/><\/g>/,
    );
    assert.doesNotMatch(svg, /<circle|<image|gradient|filter|pupil/i);
  }
});

test("clay eyes retain the supplied white gradient and no pupils; sleeping eyes stay white", () => {
  const awake = svgAsset("awake-eyes");
  const gradient = awake.match(
    /<linearGradient id="eye"[\s\S]*?<\/linearGradient>/,
  )[0];
  assert.deepEqual(
    [...gradient.matchAll(/stop-color="(.*?)"/g)].map((match) => match[1]),
    ["#FFFFFF", "#E4E4EC"],
  );
  assert.equal((awake.match(/<rect .*?fill="url\(#eye\)"/g) || []).length, 2);
  assert.doesNotMatch(awake, /<circle|pupil/i);
  assert.equal(
    (svgAsset("sleeping-eyes").match(/<rect .*?fill="#FFFFFF"/g) || []).length,
    2,
  );
});

test("clay has three frills on each side and self-contained SVG layers, never raster or remote assets", () => {
  for (const side of ["left", "right"])
    assert.equal(
      (svgAsset(`${side}-gills`).match(/<ellipse /g) || []).length,
      3,
    );
  for (const asset of animation.assets) {
    assert.match(asset.p, /^data:image\/svg\+xml;base64,/);
    assert.equal(asset.e, 1);
    const svg = svgAsset(asset.id);
    assert.doesNotMatch(svg, /<script|<image|NaN|undefined/);
    assert.match(svg, /viewBox="0 0 256 224"/);
  }
  assert.equal(animation.op / animation.fr, 2.3);
});

test("sleep indicators disappear before eyes open and clay stays visible through settling", () => {
  const sleepOff = layer("Sleep Zs").ks.o.k.find(
    (key) => key.h === 1 && key.s[0] === 0,
  );
  assert.ok(sleepOff.t <= 49);
  assert.equal(
    layer("Awake eyes").ks.o.k.find((key) => key.s[0] === 100).t,
    84,
  );
  assert.deepEqual(layer("Awake eyes").ks.o.k.at(-1).s, [100]);
  assert.deepEqual(layer("Sleeping eyes").ks.o.k.at(-1).s, [0]);
  for (const name of [
    "Clay face",
    "Left gills",
    "Right gills",
    "Contact shadow",
  ]) {
    assert.deepEqual(layer(name).ks.o, { a: 0, k: 100 }, name);
  }
  assert.equal(layer("Flat resting mark"), undefined);
});

test("static fallback composites the same awake clay artwork at its settled position", async () => {
  const rest = await readFile(new URL("benny-rest.svg", root), "utf8");
  let previous = -1;
  for (const id of [
    "shadow",
    "right-gills",
    "left-gills",
    "face",
    "awake-eyes",
  ]) {
    const content = svgAsset(id).match(
      /<g transform="translate\(38 16.5\) scale\(.75\)">([\s\S]*)<\/g><\/svg>/,
    )[1];
    const position = rest.indexOf(content);
    assert.ok(position > previous, `${id} in matching paint order`);
    previous = position;
  }
  assert.match(rest, /viewBox="0 0 256 224"/);
  assert.match(rest, /translate\(38 16.5\) scale\(.75\)/);
  const motion = layer("Benny motion").ks;
  assert.deepEqual(motion.p.k.at(-1).s, motion.a.k);
  assert.deepEqual(motion.s.k.at(-1).s, [100, 100, 100]);
  assert.deepEqual(motion.r.k.at(-1).s, [0]);
});
