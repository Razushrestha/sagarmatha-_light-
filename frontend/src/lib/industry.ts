export const INDUSTRIES = ["hardware", "paint", "cafe", "hotel"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const PUBLIC_INDUSTRIES = ["hardware", "paint", "cafe", "hotel"] as const;

export const INDUSTRY_LABELS: Record<Industry, string> = {
  hardware: "Electrical / hardware",
  paint: "Paint shop",
  cafe: "Coffee shop",
  hotel: "Hotel",
};

export type ShopModules = {
  partners: boolean;
  warranty: boolean;
  quotations: boolean;
  projects: boolean;
  tinting: boolean;
  recipes: boolean;
  tables: boolean;
  shifts: boolean;
  rooms: boolean;
  housekeeping: boolean;
};

export type PartnerLabel = { singular: string; plural: string };

export const DEFAULT_PARTNER_LABEL: PartnerLabel = { singular: "Electrician", plural: "Electricians" };

export const DEFAULT_MODULES: Record<Industry, ShopModules> = {
  hardware: {
    partners: true, warranty: true, quotations: true, projects: true,
    tinting: false, recipes: false, tables: false, shifts: false, rooms: false, housekeeping: false,
  },
  paint: {
    partners: true, warranty: false, quotations: false, projects: false,
    tinting: true, recipes: false, tables: false, shifts: false, rooms: false, housekeeping: false,
  },
  cafe: {
    partners: false, warranty: false, quotations: false, projects: false,
    tinting: false, recipes: true, tables: true, shifts: true, rooms: false, housekeeping: false,
  },
  hotel: {
    partners: false, warranty: false, quotations: false, projects: false,
    tinting: false, recipes: true, tables: true, shifts: true, rooms: true, housekeeping: true,
  },
};

export function resolvedModules(modules?: Partial<ShopModules> | null, industry?: string | null): ShopModules {
  const key = INDUSTRIES.includes(industry as Industry) ? (industry as Industry) : "hardware";
  const next = { ...DEFAULT_MODULES[key], ...modules };
  if (key === "paint") next.tinting = true;
  if (key === "cafe") {
    next.recipes = true;
    next.shifts = true;
    next.tables = true;
    next.partners = false;
    next.warranty = false;
    next.quotations = false;
    next.projects = false;
    next.tinting = false;
    next.rooms = false;
    next.housekeeping = false;
  }
  if (key === "hotel") {
    next.recipes = true;
    next.shifts = true;
    next.tables = true;
    next.rooms = true;
    next.housekeeping = true;
    next.partners = false;
    next.warranty = false;
    next.quotations = false;
    next.projects = false;
    next.tinting = false;
  }
  return next;
}

const MODULE_PATHS: Record<keyof ShopModules, string[]> = {
  partners: ["/electricians"],
  warranty: ["/warranty"],
  quotations: ["/quotations"],
  projects: ["/projects"],
  tinting: ["/paint/shades", "/paint/lots", "/paint/challans"],
  recipes: ["/cafe/recipes", "/cafe/hours"],
  tables: ["/cafe/tables"],
  shifts: ["/shifts"],
  rooms: ["/hotel"],
  housekeeping: ["/hotel/housekeeping"],
};

export function hasModule(
  modules: Partial<ShopModules> | null | undefined,
  name: keyof ShopModules,
  industry?: string | null
) {
  return Boolean(resolvedModules(modules, industry)[name]);
}

export function pathRequiresModule(pathname: string): keyof ShopModules | null {
  let best: { moduleName: keyof ShopModules; length: number } | null = null;
  for (const [moduleName, prefixes] of Object.entries(MODULE_PATHS) as Array<[keyof ShopModules, string[]]>) {
    for (const prefix of prefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        if (!best || prefix.length > best.length) best = { moduleName, length: prefix.length };
      }
    }
  }
  return best?.moduleName || null;
}

export function isPathAllowed(
  pathname: string,
  modules?: Partial<ShopModules> | null,
  industry?: string | null
) {
  const required = pathRequiresModule(pathname);
  if (!required) return true;
  return hasModule(modules, required, industry);
}
