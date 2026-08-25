export function isWireText(value?: string | null): boolean {
  const text = String(value || "");
  if (!text.trim()) return false;
  if (/wire/i.test(text)) return true;
  if (/\bcables?\b/i.test(text) && !/cable\s*ties?/i.test(text)) return true;
  return false;
}

export function productCategoryName(product?: { category?: { name?: string } | string }): string {
  if (!product?.category) return "";
  return typeof product.category === "string" ? product.category : product.category.name || "";
}

export function isWireProduct(product?: { name?: string; sku?: string; category?: { name?: string } | string }): boolean {
  if (!product) return false;
  return isWireText(product.name) || isWireText(product.sku) || isWireText(productCategoryName(product));
}

export function productCommissionPercent(product?: {
  name?: string;
  sku?: string;
  category?: { name?: string } | string;
  commissionPercent?: number;
}): number {
  if (isWireProduct(product)) return 0;
  const rate = Number(product?.commissionPercent);
  if (!Number.isFinite(rate)) return 5;
  return rate;
}

export function lineCommission(lineTotal: number, isWire: boolean, ratePercent = 0): number {
  if (isWire || !Number.isFinite(lineTotal) || lineTotal <= 0) return 0;
  return Math.round(lineTotal * (Number(ratePercent) || 0) / 100 * 100) / 100;
}
