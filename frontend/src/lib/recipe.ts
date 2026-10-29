export type RecipeLine = {
  product: string;
  productName?: string;
  qty: number;
  role?: string;
  scale?: boolean;
};

export type ModifierOption = {
  id?: string;
  name: string;
  priceDelta?: number;
  scale?: number;
  replaceRole?: string;
  replaceProduct?: string;
  extraRole?: string;
  extraQty?: number;
};

export type ModifierGroup = {
  id?: string;
  name: string;
  required?: boolean;
  options: ModifierOption[];
};

export type TicketModifier = { group: string; option: string; priceDelta: number };

export const RECIPE_ROLES = [
  { id: "", label: "Other" },
  { id: "shot", label: "Shot / beans" },
  { id: "milk", label: "Milk" },
  { id: "cup", label: "Cup" },
] as const;

export const WASTE_REASONS = ["Spilled", "Wrong drink", "Expired", "Staff tasting", "Other"];
export const COMP_REASONS = ["Staff", "Complaint", "Promo", "Owner", "Other"];

export function hasRecipe(product?: { attrs?: { recipe?: RecipeLine[] } } | null) {
  return Array.isArray(product?.attrs?.recipe) && product.attrs.recipe.length > 0;
}

export function modifierKey(mods?: TicketModifier[]) {
  return (mods || []).map((row) => `${row.group}:${row.option}`).sort().join("|");
}

export function modifierDelta(mods?: TicketModifier[]) {
  return (mods || []).reduce((sum, row) => sum + (Number(row.priceDelta) || 0), 0);
}

export function defaultModifiers(groups?: ModifierGroup[]): TicketModifier[] {
  return (groups || [])
    .filter((group) => group.required !== false && group.options?.[0])
    .map((group) => ({
      group: group.name,
      option: group.options[0].name,
      priceDelta: Number(group.options[0].priceDelta) || 0,
    }));
}

export function setModifier(
  current: TicketModifier[],
  group: ModifierGroup,
  option: ModifierOption
): TicketModifier[] {
  const next = current.filter((row) => row.group !== group.name);
  next.push({
    group: group.name,
    option: option.name,
    priceDelta: Number(option.priceDelta) || 0,
  });
  return next;
}

export function formatModifiers(mods?: TicketModifier[]) {
  if (!mods?.length) return "";
  return mods.map((row) => row.option).join(" · ");
}
