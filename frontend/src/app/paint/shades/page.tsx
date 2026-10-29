"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { FormActions, FormGrid } from "@/components/ui/FormLayout";
import { miscAPI, paintAPI, productAPI } from "@/lib/api";
import { PACK_LITRES, packLabel } from "@/lib/paint";
import { Plus, Pencil, Trash2, Palette } from "lucide-react";
import toast from "react-hot-toast";

type ProductOpt = { _id: string; name: string; sku: string; attrs?: { role?: string; packLitres?: number } };
type ColorantLine = { product: string; millilitres: string };
type FormulaRow = { packLitres: number; baseProduct: string; sellingPrice: string; colorants: ColorantLine[] };

const emptyFormula = (pack: number): FormulaRow => ({
  packLitres: pack,
  baseProduct: "",
  sellingPrice: "",
  colorants: [{ product: "", millilitres: "" }],
});

export default function PaintShadesPage() {
  const [shades, setShades] = useState<Array<{
    _id: string; code: string; name: string; swatch?: string; brand?: { name?: string };
    formulas?: Array<{ packLitres: number }>;
  }>>([]);
  const [brands, setBrands] = useState<Array<{ _id: string; name: string }>>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", brand: "", swatch: "#c4a574" });
  const [formulas, setFormulas] = useState<FormulaRow[]>(PACK_LITRES.map(emptyFormula));

  const bases = products.filter((p) => p.attrs?.role === "paint_base");
  const colorants = products.filter((p) => p.attrs?.role === "colorant");
  const baseOptions = bases.length ? bases : products;
  const colorantOptions = colorants.length ? colorants : products;

  const load = () => {
    paintAPI.getShades().then((res) => setShades(res.data.data || [])).catch(() => toast.error("Failed to load shades"));
  };

  useEffect(() => {
    load();
    miscAPI.getBrands().then((res) => setBrands(res.data.data || [])).catch(() => {});
    productAPI.getAll({ limit: "200" }).then((res) => setProducts(res.data.data || [])).catch(() => {});
  }, []);

  const reset = () => {
    setEditingId(null);
    setForm({ code: "", name: "", brand: "", swatch: "#c4a574" });
    setFormulas(PACK_LITRES.map(emptyFormula));
  };

  const openCreate = () => { reset(); setOpen(true); };

  const openEdit = async (id: string) => {
    const all = await paintAPI.getShades();
    const shade = (all.data.data || []).find((row: { _id: string }) => row._id === id);
    if (!shade) return;
    setEditingId(id);
    setForm({
      code: shade.code || "",
      name: shade.name || "",
      brand: shade.brand?._id || shade.brand || "",
      swatch: shade.swatch || "#c4a574",
    });
    setFormulas(PACK_LITRES.map((pack) => {
      const row = (shade.formulas || []).find((f: { packLitres: number }) => f.packLitres === pack);
      return {
        packLitres: pack,
        baseProduct: row?.baseProduct?._id || row?.baseProduct || "",
        sellingPrice: row?.sellingPrice != null ? String(row.sellingPrice) : "",
        colorants: (row?.colorants || []).length
          ? row.colorants.map((line: { product?: { _id?: string }; millilitres?: number }) => ({
            product: line.product?._id || line.product || "",
            millilitres: String(line.millilitres || ""),
          }))
          : [{ product: "", millilitres: "" }],
      };
    }));
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      brand: form.brand || undefined,
      formulas: formulas
        .filter((row) => row.baseProduct)
        .map((row) => ({
          packLitres: row.packLitres,
          baseProduct: row.baseProduct,
          sellingPrice: row.sellingPrice ? Number(row.sellingPrice) : undefined,
          colorants: row.colorants
            .filter((line) => line.product && Number(line.millilitres) > 0)
            .map((line) => ({ product: line.product, millilitres: Number(line.millilitres) })),
        })),
    };
    try {
      if (editingId) await paintAPI.updateShade(editingId, payload);
      else await paintAPI.createShade(payload);
      toast.success("Shade saved");
      setOpen(false);
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not save shade");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Archive shade ${name}?`)) return;
    try {
      await paintAPI.removeShade(id);
      toast.success("Archived");
      load();
    } catch {
      toast.error("Could not archive");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Paint shades"
        action={
          <button type="button" className="btn-primary flex items-center gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add shade
          </button>
        }
      />
      <p className="text-sm text-brand-500 mb-4">
        Set a formula per pack. Colorant stock is in millilitres. Mix from POS to produce a tinted tin.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Swatch</th>
              <th className="table-header">Code</th>
              <th className="table-header">Name</th>
              <th className="table-header">Brand</th>
              <th className="table-header">Packs</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {shades.length === 0 ? (
              <tr>
                <td colSpan={6} className="table-cell text-center py-12 text-gray-400">
                  <Palette className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No shades yet
                </td>
              </tr>
            ) : shades.map((shade) => (
              <tr key={shade._id} className="hover:bg-brand-50/50">
                <td className="table-cell">
                  <span className="inline-block w-8 h-8 rounded-md border border-brand-200" style={{ background: shade.swatch || "#ccc" }} />
                </td>
                <td className="table-cell font-medium">{shade.code}</td>
                <td className="table-cell">{shade.name}</td>
                <td className="table-cell text-brand-600">{shade.brand?.name || "—"}</td>
                <td className="table-cell text-brand-600">
                  {(shade.formulas || []).map((row) => packLabel(row.packLitres)).join(", ") || "—"}
                </td>
                <td className="table-cell text-right">
                  <button type="button" className="p-2 rounded-lg hover:bg-brand-100" onClick={() => openEdit(shade._id)}>
                    <Pencil className="w-4 h-4 text-brand-600" />
                  </button>
                  <button type="button" className="p-2 rounded-lg hover:bg-red-50" onClick={() => remove(shade._id, shade.code)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Edit shade" : "Add shade"} size="lg">
        <form onSubmit={save} className="space-y-4">
          <FormGrid cols={2}>
            <FormField label="Code" required>
              <input className="input-field" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="AP-1234" />
            </FormField>
            <FormField label="Name" required>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Brand">
              <select className="input-field" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
                <option value="">—</option>
                {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </FormField>
            <FormField label="Swatch">
              <input type="color" className="h-10 w-full rounded-lg border border-brand-200" value={form.swatch} onChange={(e) => setForm({ ...form, swatch: e.target.value })} />
            </FormField>
          </FormGrid>

          {formulas.map((row, idx) => (
            <div key={row.packLitres} className="rounded-xl border border-brand-100 p-3 space-y-2">
              <p className="text-sm font-semibold text-brand-800">{packLabel(row.packLitres)} formula</p>
              <FormGrid cols={2}>
                <FormField label="Base tin">
                  <select
                    className="input-field"
                    value={row.baseProduct}
                    onChange={(e) => {
                      const next = [...formulas];
                      next[idx] = { ...row, baseProduct: e.target.value };
                      setFormulas(next);
                    }}
                  >
                    <option value="">Skip this pack</option>
                    {baseOptions.map((p) => (
                      <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Tinted selling price (optional)">
                  <input
                    className="input-field"
                    value={row.sellingPrice}
                    onChange={(e) => {
                      const next = [...formulas];
                      next[idx] = { ...row, sellingPrice: e.target.value };
                      setFormulas(next);
                    }}
                    placeholder="Use base price"
                  />
                </FormField>
              </FormGrid>
              {row.colorants.map((line, li) => (
                <div key={li} className="grid grid-cols-[1fr_100px] gap-2">
                  <select
                    className="input-field"
                    value={line.product}
                    onChange={(e) => {
                      const next = [...formulas];
                      const colorants = [...row.colorants];
                      colorants[li] = { ...line, product: e.target.value };
                      next[idx] = { ...row, colorants };
                      setFormulas(next);
                    }}
                  >
                    <option value="">Colorant</option>
                    {colorantOptions.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    className="input-field"
                    placeholder="ml"
                    value={line.millilitres}
                    onChange={(e) => {
                      const next = [...formulas];
                      const colorants = [...row.colorants];
                      colorants[li] = { ...line, millilitres: e.target.value };
                      next[idx] = { ...row, colorants };
                      setFormulas(next);
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-brand-700"
                onClick={() => {
                  const next = [...formulas];
                  next[idx] = { ...row, colorants: [...row.colorants, { product: "", millilitres: "" }] };
                  setFormulas(next);
                }}
              >
                + colorant
              </button>
            </div>
          ))}
          <FormActions>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save shade"}</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
