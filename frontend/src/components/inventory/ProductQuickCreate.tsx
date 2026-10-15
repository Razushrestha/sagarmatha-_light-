"use client";

import { useEffect, useState } from "react";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormSection, FormGrid, FormCheckbox } from "@/components/ui/FormLayout";
import ImageUpload from "@/components/ui/ImageUpload";
import { productAPI, miscAPI } from "@/lib/api";
import toast from "react-hot-toast";

export interface CreatedProduct {
  _id: string;
  name: string;
  sku?: string;
  purchasePrice: number;
  sellingPrice?: number;
  currentStock?: number;
  unit?: { name?: string; symbol?: string } | string;
}

const emptyForm = {
  name: "",
  barcode: "",
  category: "",
  brand: "",
  model: "",
  description: "",
  purchasePrice: "",
  sellingPrice: "",
  wholesalePrice: "",
  minStock: "5",
  currentStock: "0",
  unit: "",
  warehouse: "",
  vatInclusive: true,
  vatRate: "13",
  commissionPercent: "5",
};

export default function ProductQuickCreate({
  defaultWarehouse = "",
  onCreated,
  onCancel,
}: {
  defaultWarehouse?: string;
  onCreated: (product: CreatedProduct) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ _id: string; name: string }>>([]);
  const [units, setUnits] = useState<Array<{ _id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [images, setImages] = useState<string[]>([]);
  const [form, setForm] = useState({ ...emptyForm, warehouse: defaultWarehouse });

  useEffect(() => {
    Promise.all([
      miscAPI.getCategories(),
      miscAPI.getBrands(),
      miscAPI.getUnits(),
      miscAPI.getWarehouses(),
    ]).then(([cat, br, un, wh]) => {
      setCategories(cat.data.data || []);
      setBrands(br.data.data || []);
      setUnits(un.data.data || []);
      setWarehouses(wh.data.data || []);
    }).catch(() => toast.error("Unable to load product options"));
  }, []);

  useEffect(() => {
    if (defaultWarehouse) {
      setForm((prev) => prev.warehouse ? prev : { ...prev, warehouse: defaultWarehouse });
    }
  }, [defaultWarehouse]);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error("Product name is required");
    if (!form.purchasePrice || !form.sellingPrice) return toast.error("Purchase and selling price are required");
    setLoading(true);
    try {
      const res = await productAPI.create({
        ...form,
        images,
        purchasePrice: parseFloat(form.purchasePrice) || 0,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : undefined,
        minStock: Number(form.minStock),
        currentStock: Number(form.currentStock),
        vatRate: parseFloat(form.vatRate) || 0,
        commissionPercent: parseFloat(form.commissionPercent) || 0,
      });
      toast.success("Product added to inventory");
      onCreated(res.data.data);
      setForm({ ...emptyForm, warehouse: defaultWarehouse });
      setImages([]);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="mt-3 rounded-xl border border-brand-200 bg-white p-4"
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
    >
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-3">
          <FormSection title="Product Images" description="Up to 4 photos">
            <ImageUpload images={images} onChange={setImages} compact />
          </FormSection>
        </div>

        <div className="xl:col-span-9 space-y-4">
          <FormSection title="Basic Details">
            <FormGrid cols={3}>
              <FormField label="Product Name" required>
                <input className="input-field" value={form.name} onChange={(e) => update("name", e.target.value)} />
              </FormField>
              <FormField label="Barcode">
                <input className="input-field" value={form.barcode} onChange={(e) => update("barcode", e.target.value)} />
              </FormField>
              <FormField label="Model">
                <input className="input-field" value={form.model} onChange={(e) => update("model", e.target.value)} />
              </FormField>
              <FormField label="Category">
                <SelectField
                  value={form.category}
                  onChange={(v) => update("category", v)}
                  placeholder="Select category"
                  options={categories.map((c) => ({ value: c._id, label: c.name }))}
                />
              </FormField>
              <FormField label="Brand">
                <SelectField
                  value={form.brand}
                  onChange={(v) => update("brand", v)}
                  placeholder="Select brand"
                  options={brands.map((b) => ({ value: b._id, label: b.name }))}
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Pricing (NPR)">
            <FormGrid cols={4}>
              <FormField label="Purchase Price" required>
                <input type="number" step="any" min="0" className="input-field" value={form.purchasePrice} onChange={(e) => update("purchasePrice", e.target.value)} />
              </FormField>
              <FormField label="Selling Price" required>
                <input type="number" step="any" min="0" className="input-field" value={form.sellingPrice} onChange={(e) => update("sellingPrice", e.target.value)} />
              </FormField>
              <FormField label="Wholesale Price">
                <input type="number" step="any" min="0" className="input-field" value={form.wholesalePrice} onChange={(e) => update("wholesalePrice", e.target.value)} />
              </FormField>
              <FormField label="VAT Rate (%)">
                <input type="number" step="any" min="0" className="input-field" value={form.vatRate} onChange={(e) => update("vatRate", e.target.value)} />
              </FormField>
              <FormField label="Commission %">
                <input type="number" min={0} max={100} step="any" className="input-field" value={form.commissionPercent} onChange={(e) => update("commissionPercent", e.target.value)} />
              </FormField>
            </FormGrid>
            <div className="mt-3">
              <FormCheckbox id="purchase-new-vatInclusive" label="VAT inclusive pricing" checked={form.vatInclusive} onChange={(v) => update("vatInclusive", v)} />
            </div>
          </FormSection>

          <FormSection title="Inventory">
            <FormGrid cols={4}>
              <FormField label="Unit">
                <SelectField
                  value={form.unit}
                  onChange={(v) => update("unit", v)}
                  placeholder="Select unit"
                  options={units.map((u) => ({ value: u._id, label: u.name }))}
                />
              </FormField>
              <FormField label="Warehouse">
                <SelectField
                  value={form.warehouse}
                  onChange={(v) => update("warehouse", v)}
                  placeholder="Select warehouse"
                  options={warehouses.map((w) => ({ value: w._id, label: w.name }))}
                />
              </FormField>
              <FormField label="Opening Stock">
                <input type="number" className="input-field" value={form.currentStock} onChange={(e) => update("currentStock", e.target.value)} />
              </FormField>
              <FormField label="Min Stock">
                <input type="number" className="input-field" value={form.minStock} onChange={(e) => update("minStock", e.target.value)} />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Description">
            <textarea className="input-field min-h-[72px] resize-y" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Optional product notes..." />
          </FormSection>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={handleCreate} disabled={loading} className="btn-primary">
          {loading ? "Creating..." : "Create Product"}
        </button>
      </div>
    </div>
  );
}
