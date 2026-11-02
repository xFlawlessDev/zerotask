/**
 * Contrast audit for the palette in DESIGN.md.
 *
 * Run: bun scripts/contrast.ts
 * Fails with a non-zero exit if any pairing the UI actually uses drops below its
 * WCAG AA minimum, so a palette edit cannot quietly break readability.
 */

interface Pair {
  name: string;
  fg: string;
  bg: string;
  /** 4.5 for body text, 3 for large text and non-text UI. */
  minimum: number;
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light! + 0.05) / (dark! + 0.05);
}

const light = {
  canvas: "#F4F4F0",
  surface: "#FFFFFF",
  sunk: "#EDEDE7",
  ink: "#14181D",
  muted: "#545B63",
  faint: "#767D85",
  rule: "#D8D8D0",
  accent: "#17457F",
  accentWash: "#E8EEF7",
  onAccent: "#FFFFFF",
  danger: "#9A2B1E",
  caution: "#7A4A00",
  settled: "#2A5B41",
};

const dark = {
  canvas: "#0E1114",
  surface: "#16191D",
  sunk: "#0A0C0F",
  ink: "#E9E9E3",
  muted: "#A2A9B1",
  faint: "#8A9199",
  rule: "#2A2F35",
  accent: "#8FB4E8",
  accentWash: "#1B2431",
  onAccent: "#0E1114",
  danger: "#F0917F",
  caution: "#E3B661",
  settled: "#7FC49B",
};

const pairs: Pair[] = [
  // Light theme
  { name: "light / body on canvas", fg: light.ink, bg: light.canvas, minimum: 4.5 },
  { name: "light / body on surface", fg: light.ink, bg: light.surface, minimum: 4.5 },
  { name: "light / body on sunk", fg: light.ink, bg: light.sunk, minimum: 4.5 },
  { name: "light / muted on canvas", fg: light.muted, bg: light.canvas, minimum: 4.5 },
  { name: "light / muted on surface", fg: light.muted, bg: light.surface, minimum: 4.5 },
  { name: "light / muted on sunk", fg: light.muted, bg: light.sunk, minimum: 4.5 },
  { name: "light / faint on surface (disabled only)", fg: light.faint, bg: light.surface, minimum: 3 },
  { name: "light / accent on canvas", fg: light.accent, bg: light.canvas, minimum: 4.5 },
  { name: "light / accent on surface", fg: light.accent, bg: light.surface, minimum: 4.5 },
  { name: "light / accent on accent-wash", fg: light.accent, bg: light.accentWash, minimum: 4.5 },
  { name: "light / on-accent on accent", fg: light.onAccent, bg: light.accent, minimum: 4.5 },
  { name: "light / danger on surface", fg: light.danger, bg: light.surface, minimum: 4.5 },
  { name: "light / caution on surface", fg: light.caution, bg: light.surface, minimum: 4.5 },
  { name: "light / settled on surface", fg: light.settled, bg: light.surface, minimum: 4.5 },
  { name: "light / rule against surface (non-text)", fg: light.rule, bg: light.surface, minimum: 1.2 },

  // Dark theme
  { name: "dark / body on canvas", fg: dark.ink, bg: dark.canvas, minimum: 4.5 },
  { name: "dark / body on surface", fg: dark.ink, bg: dark.surface, minimum: 4.5 },
  { name: "dark / body on sunk", fg: dark.ink, bg: dark.sunk, minimum: 4.5 },
  { name: "dark / muted on canvas", fg: dark.muted, bg: dark.canvas, minimum: 4.5 },
  { name: "dark / muted on surface", fg: dark.muted, bg: dark.surface, minimum: 4.5 },
  { name: "dark / faint on surface (disabled only)", fg: dark.faint, bg: dark.surface, minimum: 3 },
  { name: "dark / accent on canvas", fg: dark.accent, bg: dark.canvas, minimum: 4.5 },
  { name: "dark / accent on surface", fg: dark.accent, bg: dark.surface, minimum: 4.5 },
  { name: "dark / accent on accent-wash", fg: dark.accent, bg: dark.accentWash, minimum: 4.5 },
  { name: "dark / on-accent on accent", fg: dark.onAccent, bg: dark.accent, minimum: 4.5 },
  { name: "dark / danger on surface", fg: dark.danger, bg: dark.surface, minimum: 4.5 },
  { name: "dark / caution on surface", fg: dark.caution, bg: dark.surface, minimum: 4.5 },
  { name: "dark / settled on surface", fg: dark.settled, bg: dark.surface, minimum: 4.5 },
];

let failures = 0;

for (const pair of pairs) {
  const value = ratio(pair.fg, pair.bg);
  const pass = value >= pair.minimum;
  if (!pass) failures++;
  const rounded = value.toFixed(2).padStart(6);
  console.log(`${pass ? "PASS" : "FAIL"}  ${rounded}  (min ${pair.minimum})  ${pair.name}`);
}

console.log("");
if (failures > 0) {
  console.error(`${failures} pairing(s) below the required ratio.`);
  process.exit(1);
}
console.log(`All ${pairs.length} pairings meet their minimum.`);
