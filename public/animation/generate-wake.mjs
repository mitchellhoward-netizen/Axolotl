import { readFile, writeFile } from "node:fs/promises";

const END = 138;
const COLORS = {
  pink: "#EE6D9E",
  coral: "#F0603F",
  amber: "#E8912F",
  green: "#3E9E5B",
  teal: "#0FA088",
  blue: "#3B7DE0",
  indigo: "#6C5CE0",
  ink: "#1A1A1A",
};
const fixed = (k) => ({ a: 0, k });
const hold = (t, s) => ({ t, s, h: 1 });
const tween = (t, s, e) => ({
  t,
  s,
  e,
  i: { x: [0.42], y: [1] },
  o: { x: [0.58], y: [0] },
});
const animated = (k) => ({ a: 1, k });
const tr = (extra = {}) => ({
  o: fixed(100),
  r: fixed(0),
  p: fixed([0, 0, 0]),
  a: fixed([0, 0, 0]),
  s: fixed([100, 100, 100]),
  ...extra,
});

// Geometry and all eight colors from the supplied flat pill-eye family.
function flat(color, scene = false) {
  const mark = `<g fill="${color}">
<ellipse cx="30" cy="28" rx="5" ry="15" transform="rotate(-25 30 28)"/>
<ellipse cx="20" cy="39" rx="5" ry="15" transform="rotate(-52 20 39)"/>
<ellipse cx="16" cy="53" rx="4.5" ry="14" transform="rotate(-80 16 53)"/>
<ellipse cx="70" cy="28" rx="5" ry="15" transform="rotate(25 70 28)"/>
<ellipse cx="80" cy="39" rx="5" ry="15" transform="rotate(52 80 39)"/>
<ellipse cx="84" cy="53" rx="4.5" ry="14" transform="rotate(80 84 53)"/>
<ellipse cx="50" cy="55" rx="32" ry="28"/>
</g><g fill="#FFFFFF"><rect x="38.5" y="43" width="9" height="19" rx="4.5"/><rect x="52.5" y="43" width="9" height="19" rx="4.5"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene ? 256 : 100}" height="${scene ? 224 : 100}" viewBox="${scene ? "0 0 256 224" : "0 0 100 100"}" role="img" aria-label="Benny with white pill eyes">${scene ? `<g transform="translate(38 15) scale(1.8)">${mark}</g>` : mark}</svg>\n`;
}

// Keep the supplied clay gradients intact. Only split its groups for rigging;
// SVG layers are embedded in the Lottie JSON, not fetched from another host.
const clay = await readFile(
  new URL("./benny-clay.svg", import.meta.url),
  "utf8",
);
const defs = clay.match(/<defs>[\s\S]*?<\/defs>/)[0];
const group = (name) =>
  clay.match(new RegExp(`<g id="${name}">([\\s\\S]*?)<\\/g>`))[1].trim();
const clayScene = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="224" viewBox="0 0 256 224">${defs}<g transform="translate(38 16.5) scale(.75)">${content}</g></svg>`;
const sources = {
  "awake-eyes": clayScene(group("awake-eyes")),
  "sleeping-eyes": clayScene(
    '<rect x="91" y="125" width="26" height="6" rx="3" fill="#FFFFFF"/><rect x="123" y="125" width="26" height="6" rx="3" fill="#FFFFFF"/>',
  ),
  face: clayScene(group("face")),
  "left-gills": clayScene(group("left-gills")),
  "right-gills": clayScene(group("right-gills")),
  shadow: clayScene(group("contact-shadow")),
};
const assets = Object.entries(sources).map(([id, source]) => ({
  id,
  w: 256,
  h: 224,
  u: "",
  p: `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`,
  e: 1,
}));
let index = 1;
const image = (name, asset, transform = {}, parent = 20) => ({
  ddd: 0,
  ind: index++,
  ty: 2,
  nm: name,
  refId: asset,
  ip: 0,
  op: END,
  st: 0,
  ...(parent ? { parent } : {}),
  ks: tr(transform),
});
const asleep = animated([
  hold(0, [100]),
  hold(83, [100]),
  hold(84, [0]),
  hold(END, [0]),
]);
const awake = animated([
  hold(0, [0]),
  hold(83, [0]),
  hold(84, [100]),
  hold(END, [100]),
]);
function gillMotion(side) {
  const pivot = side === "left" ? [92, 100, 0] : [164, 100, 0];
  const sign = side === "left" ? 1 : -1;
  return {
    a: fixed(pivot),
    p: fixed(pivot),
    r: animated([
      hold(0, [0]),
      tween(36, [0], [sign * 3]),
      tween(49, [sign * 3], [-sign * 4]),
      tween(84, [-sign * 4], [sign * 3]),
      tween(100, [sign * 3], [0]),
      hold(116, [0]),
      hold(END, [0]),
    ]),
  };
}
const layers = [
  image("Awake eyes", "awake-eyes", { o: awake }),
  image("Sleeping eyes", "sleeping-eyes", { o: asleep }),
  image("Clay face", "face"),
  image("Left gills", "left-gills", gillMotion("left")),
  image("Right gills", "right-gills", gillMotion("right")),
  image("Contact shadow", "shadow", {}, null),
];

function z(name, vertices) {
  return {
    ty: "gr",
    nm: name,
    it: [
      {
        ty: "sh",
        ks: fixed({
          c: false,
          v: vertices,
          i: vertices.map(() => [0, 0]),
          o: vertices.map(() => [0, 0]),
        }),
      },
      {
        ty: "st",
        c: fixed([68 / 255, 68 / 255, 68 / 255, 1]),
        o: fixed(100),
        w: fixed(1.5),
        lc: 2,
        lj: 2,
      },
      { ty: "tr", ...tr(), sk: fixed(0), sa: fixed(0) },
    ],
  };
}
layers.unshift({
  ddd: 0,
  ind: index++,
  ty: 4,
  nm: "Sleep Zs",
  ip: 0,
  op: END,
  st: 0,
  ks: tr({
    o: animated([
      hold(0, [75]),
      tween(25, [75], [0]),
      hold(49, [0]),
      hold(END, [0]),
    ]),
    p: animated([
      tween(0, [0, 0, 0], [3, -8, 0]),
      hold(49, [3, -8, 0]),
      hold(END, [3, -8, 0]),
    ]),
  }),
  shapes: [
    z("Small Z", [
      [207, 59],
      [214, 59],
      [207, 66],
      [214, 66],
    ]),
    z("Large Z", [
      [218, 45],
      [228, 45],
      [218, 55],
      [228, 55],
    ]),
  ],
});
layers.push({
  ddd: 0,
  ind: 20,
  ty: 3,
  nm: "Benny motion",
  ip: 0,
  op: END,
  st: 0,
  ks: tr({
    a: fixed([128, 135, 0]),
    r: animated([
      hold(0, [0]),
      tween(36, [0], [-1.5]),
      tween(49, [-1.5], [1]),
      tween(84, [1], [0]),
      hold(116, [0]),
      hold(END, [0]),
    ]),
    p: animated([
      hold(0, [128, 135, 0]),
      tween(35, [128, 135, 0], [128, 141, 0]),
      tween(49, [128, 141, 0], [128, 111, 0]),
      tween(68, [128, 111, 0], [128, 140, 0]),
      tween(84, [128, 140, 0], [128, 131, 0]),
      tween(101, [128, 131, 0], [128, 135, 0]),
      hold(116, [128, 135, 0]),
      hold(END, [128, 135, 0]),
    ]),
    s: animated([
      hold(0, [100, 100, 100]),
      tween(35, [100, 100, 100], [106, 92, 100]),
      tween(49, [106, 92, 100], [95, 107, 100]),
      tween(68, [95, 107, 100], [98, 103, 100]),
      tween(84, [98, 103, 100], [107, 91, 100]),
      tween(91, [107, 91, 100], [98, 103, 100]),
      tween(103, [98, 103, 100], [100, 100, 100]),
      hold(116, [100, 100, 100]),
      hold(END, [100, 100, 100]),
    ]),
  }),
});
const animation = {
  v: "5.13.0",
  fr: 60,
  ip: 0,
  op: END,
  w: 256,
  h: 224,
  nm: "Benny wakes up",
  ddd: 0,
  assets,
  layers,
  markers: [
    { tm: 0, cm: "asleep", dr: 0 },
    { tm: 49, cm: "hop", dr: 0 },
    { tm: 84, cm: "awake", dr: 0 },
    { tm: 116, cm: "settled", dr: 0 },
  ],
};
await Promise.all([
  ...Object.entries(COLORS).map(([name, color]) =>
    writeFile(
      new URL(
        `./benny-mark${name === "pink" ? "" : `-${name}`}.svg`,
        import.meta.url,
      ),
      flat(color),
    ),
  ),
  writeFile(
    new URL("./benny-rest.svg", import.meta.url),
    clayScene(
      ["contact-shadow", "right-gills", "left-gills", "face", "awake-eyes"]
        .map(group)
        .join(""),
    ),
  ),
  writeFile(
    new URL("./wake.json", import.meta.url),
    `${JSON.stringify(animation)}\n`,
  ),
]);
