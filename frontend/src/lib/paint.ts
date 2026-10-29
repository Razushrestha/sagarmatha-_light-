export const PACK_LITRES = [1, 4, 10, 20] as const;
export type PackLitres = (typeof PACK_LITRES)[number];

export type PaintRole = "stock" | "colorant" | "paint_base" | "tinted";

export const DEFAULT_SQFT_PER_LITRE = 100;

export function packLabel(litres: number) {
  return `${litres}L`;
}

export function litresNeeded(sqFt: number, coats: number, sqFtPerLitre: number) {
  const area = Number(sqFt) || 0;
  const layers = Number(coats) || 0;
  const cover = Number(sqFtPerLitre) || 0;
  if (area <= 0 || layers <= 0 || cover <= 0) return 0;
  return (area * layers) / cover;
}

export type PackLine = { pack: number; count: number };

export function packSplit(litres: number) {
  const raw = Math.max(0, Number(litres) || 0);
  const packedLitres = Math.ceil(raw - 1e-9);
  let remaining = packedLitres;
  const lines: PackLine[] = [];
  for (const pack of [...PACK_LITRES].sort((a, b) => b - a)) {
    const count = Math.floor(remaining / pack);
    if (count > 0) {
      lines.push({ pack, count });
      remaining -= count * pack;
    }
  }
  return {
    litres: raw,
    packedLitres,
    extraLitres: Math.max(0, packedLitres - raw),
    lines,
  };
}

export function formatPackSplit(split: ReturnType<typeof packSplit>) {
  if (!split.lines.length) return "0 L";
  return split.lines.map((line) => `${line.count}×${packLabel(line.pack)}`).join(" + ");
}

export function coverageQuote({
  sqFt,
  coats,
  sqFtPerLitre,
}: {
  sqFt: number;
  coats: number;
  sqFtPerLitre: number;
}) {
  const litres = litresNeeded(sqFt, coats, sqFtPerLitre);
  const split = packSplit(litres);
  const text = `${sqFt} sq ft × ${coats} coat${coats === 1 ? "" : "s"} @ ${sqFtPerLitre} sq ft/L → ${litres.toFixed(1)} L (${formatPackSplit(split)})`;
  return { litres, split, text };
}
