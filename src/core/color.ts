export type Rgb = [number, number, number];

/**
 * Parses `#rgb` / `#rrggbb` into 0..1 components. Shaders in this project work directly in
 * sRGB space (no colour-space conversion), so we deliberately skip `THREE.Color` here.
 */
export function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
