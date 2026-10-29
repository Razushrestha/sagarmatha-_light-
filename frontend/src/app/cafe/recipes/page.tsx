"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { cafeAPI, productAPI } from "@/lib/api";
import { RECIPE_ROLES, type ModifierGroup, type RecipeLine } from "@/lib/recipe";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

type ProductOpt = { _id: string; name: string; sku: string; attrs?: { role?: string; recipe?: RecipeLine[]; modifierGroups?: ModifierGroup[] } };

const emptyGroup = (): ModifierGroup => ({
  name: "Size",
  required: true,
  options: [
    { name: "Regular", priceDelta: 0, scale: 1 },
    { name: "Large", priceDelta: 50, scale: 1.3 },
  ],
});

export default function CafeRecipesPage() {
  const [menu, setMenu] = useState<ProductOpt[]>([]);
  const [ingredients, setIngredients] = useState<ProductOpt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [recipe, setRecipe] = useState<Array<{ product: string; qty: string; role: string; scale: boolean }>>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [margins, setMargins] = useState<Array<{ _id: string; name: string; sellingPrice: number; cost: number; profit: number; margin: number }>>([]);

  const load = () => {
    cafeAPI.getMenu().then((res) => {
      const rows = res.data.data || [];
      setMenu(rows);
      if (!selectedId && rows[0]) setSelectedId(rows[0]._id);
    }).catch(() => {});
    productAPI.getAll({ limit: "200" }).then((res) => {
      const rows: ProductOpt[] = res.data.data || [];
      setIngredients(rows.filter((row) => row.attrs?.role === "ingredient" || !row.attrs?.recipe?.length));
    }).catch(() => {});
    cafeAPI.getMargins().then((res) => setMargins(res.data.data || [])).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const product = menu.find((row) => row._id === selectedId);
    if (!product) return;
    setRecipe((product.attrs?.recipe || []).map((line) => ({
      product: typeof line.product === "string" ? line.product : String(line.product),
      qty: String(line.qty),
      role: line.role || "",
      scale: line.scale !== false,
    })));
    setGroups(product.attrs?.modifierGroups || []);
  }, [selectedId, menu]);

  const selected = menu.find((row) => row._id === selectedId);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await cafeAPI.saveRecipe(selectedId, {
        recipe: recipe.filter((row) => row.product && Number(row.qty) > 0).map((row) => ({
          product: row.product,
          qty: Number(row.qty),
          role: row.role,
          scale: row.scale,
        })),
        modifierGroups: groups,
      });
      toast.success("Recipe saved");
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const addLatteGroups = () => {
    const milk = ingredients.find((row) => /oat/i.test(row.name));
    const dairy = ingredients.find((row) => /milk/i.test(row.name) && !/oat/i.test(row.name));
    setGroups([
      emptyGroup(),
      {
        name: "Milk",
        required: true,
        options: [
          { name: "Dairy", priceDelta: 0, replaceRole: "milk", replaceProduct: dairy?._id },
          { name: "Oat", priceDelta: 40, replaceRole: "milk", replaceProduct: milk?._id || dairy?._id },
        ],
      },
      {
        name: "Extra shot",
        required: false,
        options: [
          { name: "None", priceDelta: 0 },
          { name: "Extra shot", priceDelta: 50, extraRole: "shot", extraQty: 1 },
        ],
      },
    ]);
  };

  return (
    <DashboardLayout>
      <PageHeader title="Recipes" />
      <p className="text-sm text-brand-500 mb-4">
        A latte recipe is beans + milk + cup. Milk options swap the milk ingredient. Extra shot adds another beans line.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        <div className="card divide-y divide-brand-50 max-h-[70vh] overflow-y-auto">
          {menu.length === 0 ? (
            <p className="p-4 text-sm text-brand-400">Mark a product as a menu item, then set its recipe here.</p>
          ) : menu.map((row) => (
            <button
              key={row._id}
              type="button"
              onClick={() => setSelectedId(row._id)}
              className={`w-full text-left px-4 py-3 text-sm ${selectedId === row._id ? "bg-brand-50 font-medium" : ""}`}
            >
              {row.name}
            </button>
          ))}
        </div>
        {selected && (
          <div className="card p-4 space-y-4">
            <h2 className="font-semibold text-brand-900">{selected.name}</h2>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-brand-400">Ingredients (qty per drink)</p>
              {recipe.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_90px_120px_auto] gap-2">
                  <select className="input-field" value={line.product} onChange={(e) => {
                    const next = [...recipe];
                    next[idx] = { ...line, product: e.target.value };
                    setRecipe(next);
                  }}>
                    <option value="">Ingredient</option>
                    {ingredients.map((ing) => (
                      <option key={ing._id} value={ing._id}>{ing.name}</option>
                    ))}
                  </select>
                  <input className="input-field" placeholder="qty" value={line.qty} onChange={(e) => {
                    const next = [...recipe];
                    next[idx] = { ...line, qty: e.target.value };
                    setRecipe(next);
                  }} />
                  <select className="input-field" value={line.role} onChange={(e) => {
                    const next = [...recipe];
                    next[idx] = { ...line, role: e.target.value };
                    setRecipe(next);
                  }}>
                    {RECIPE_ROLES.map((role) => (
                      <option key={role.id} value={role.id}>{role.label}</option>
                    ))}
                  </select>
                  <label className="text-xs text-brand-500 flex items-center gap-1">
                    <input type="checkbox" checked={line.scale} onChange={(e) => {
                      const next = [...recipe];
                      next[idx] = { ...line, scale: e.target.checked };
                      setRecipe(next);
                    }} />
                    scale
                  </label>
                </div>
              ))}
              <button type="button" className="text-sm text-brand-700" onClick={() => setRecipe([...recipe, { product: "", qty: "", role: "", scale: true }])}>
                + ingredient
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-brand-400">Modifiers (order line)</p>
                <button type="button" className="text-xs text-brand-700" onClick={addLatteGroups}>Latte defaults</button>
              </div>
              {groups.map((group, gi) => (
                <div key={gi} className="rounded-xl border border-brand-100 p-3 space-y-2">
                  <input
                    className="input-field"
                    value={group.name}
                    onChange={(e) => {
                      const next = [...groups];
                      next[gi] = { ...group, name: e.target.value };
                      setGroups(next);
                    }}
                  />
                  {(group.options || []).map((opt, oi) => (
                    <div key={oi} className="space-y-1">
                      <div className="grid grid-cols-[1fr_80px] gap-2">
                        <input
                          className="input-field"
                          value={opt.name}
                          onChange={(e) => {
                            const next = [...groups];
                            const options = [...group.options];
                            options[oi] = { ...opt, name: e.target.value };
                            next[gi] = { ...group, options };
                            setGroups(next);
                          }}
                        />
                        <input
                          className="input-field"
                          placeholder="+NPR"
                          value={opt.priceDelta ?? ""}
                          onChange={(e) => {
                            const next = [...groups];
                            const options = [...group.options];
                            options[oi] = { ...opt, priceDelta: Number(e.target.value) || 0 };
                            next[gi] = { ...group, options };
                            setGroups(next);
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <input className="input-field text-xs" placeholder="scale" value={opt.scale ?? ""} onChange={(e) => {
                          const next = [...groups];
                          const options = [...group.options];
                          options[oi] = { ...opt, scale: e.target.value === "" ? undefined : Number(e.target.value) };
                          next[gi] = { ...group, options };
                          setGroups(next);
                        }} />
                        <input className="input-field text-xs" placeholder="swap role" value={opt.replaceRole ?? ""} onChange={(e) => {
                          const next = [...groups];
                          const options = [...group.options];
                          options[oi] = { ...opt, replaceRole: e.target.value };
                          next[gi] = { ...group, options };
                          setGroups(next);
                        }} />
                        <select className="input-field text-xs" value={opt.replaceProduct || ""} onChange={(e) => {
                          const next = [...groups];
                          const options = [...group.options];
                          options[oi] = { ...opt, replaceProduct: e.target.value };
                          next[gi] = { ...group, options };
                          setGroups(next);
                        }}>
                          <option value="">Swap ingredient</option>
                          {ingredients.map((ing) => (
                            <option key={ing._id} value={ing._id}>{ing.name}</option>
                          ))}
                        </select>
                        <input className="input-field text-xs" placeholder="extra role" value={opt.extraRole ?? ""} onChange={(e) => {
                          const next = [...groups];
                          const options = [...group.options];
                          options[oi] = { ...opt, extraRole: e.target.value };
                          next[gi] = { ...group, options };
                          setGroups(next);
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <button type="button" className="text-sm text-brand-700" onClick={() => setGroups([...groups, emptyGroup()])}>+ modifier group</button>
            </div>

            <button type="button" className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save recipe"}
            </button>
          </div>
        )}
      </div>
      {margins.length > 0 && (
        <div className="card overflow-x-auto mt-6">
          <p className="px-4 pt-4 text-sm font-semibold text-brand-800">BOM cost vs selling</p>
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Drink</th>
                <th className="table-header">Sell</th>
                <th className="table-header">Ingredient cost</th>
                <th className="table-header">Profit</th>
                <th className="table-header">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {margins.map((row) => (
                <tr key={row._id}>
                  <td className="table-cell font-medium">{row.name}</td>
                  <td className="table-cell">{formatCurrency(row.sellingPrice)}</td>
                  <td className="table-cell">{formatCurrency(row.cost)}</td>
                  <td className="table-cell">{formatCurrency(row.profit)}</td>
                  <td className="table-cell">{Math.round((row.margin || 0) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
