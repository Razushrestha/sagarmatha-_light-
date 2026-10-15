export const PRODUCT = {
  name: "Nepatronix ERP",
  shortName: "Nepatronix",
  monogram: "NE",
  tagline: "Business ERP for Nepal",
} as const;

export function shopMonogram(name?: string | null) {
  const parts = String(name || PRODUCT.shortName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0] || PRODUCT.monogram).slice(0, 2).toUpperCase();
}

export const COMPANY = {
  name: "Sagarmatha Light Solution",
  shortName: "Sagarmatha",
  monogram: "SL",
  tagline: "Light Solutions ERP",
  address: "Tri.Na.Pa-11 Gaighat",
  vatNumber: "611357131",
  phone: "+977-1-XXXXXXX",
} as const;
