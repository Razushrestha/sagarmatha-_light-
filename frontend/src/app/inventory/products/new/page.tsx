"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormBackLink, FormCard, FormSection, FormGrid, FormActions, FormCheckbox } from "@/components/ui/FormLayout";
import ImageUpload from "@/components/ui/ImageUpload";
import { productAPI, miscAPI } from "@/lib/api";
import toast from "react-hot-toast";

export default function NewProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ _id: string; name: string }>>([]);
  const [units, setUnits] = useState<Array<{ _id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [images, setImages] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: "", sku: "", barcode: "", category: "", brand: "", model: "",
    description: "", purchasePrice: "", sellingPrice: "", wholesalePrice: "",
    minStock: "5", currentStock: "0", unit: "", warehouse: "",
    vatInclusive: true, vatRate: "13", commissionPercent: "5",
  });

  useEffect(() => {
    Promise.all([
      miscAPI.getCategories(),
      miscAPI.getBrands(),
      miscAPI.getUnits(),
      miscAPI.getWarehouses(),
    ]).then(([cat, br, un, wh]) => {
      setCategories(cat.data.data);
      setBrands(br.data.data);
      setUnits(un.data.data);
      setWarehouses(wh.data.data);
    });
  }, []);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await productAPI.create({
        ...form,
        images,
        purchasePrice: Number(form.purchasePrice),
        sellingPrice: Number(form.sellingPrice),
        wholesalePrice: form.wholesalePrice ? Number(form.wholesalePrice) : undefined,
        minStock: Number(form.minStock),
        currentStock: Number(form.currentStock),
        vatRate: Number(form.vatRate),
        commissionPercent: Number(form.commissionPercent) || 0,
      });
      toast.success("Product created successfully!");
      router.push("/inventory/products");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <FormBackLink href="/inventory/products" label="Back to Products" />
      <PageHeader title="Add New Product" />

      <form onSubmit={handleSubmit}>
        <FormCard>
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
                    <input className="input-field" value={form.name} onChange={(e) => update("name", e.target.value)} required />
                  </FormField>
                  <FormField label="SKU" required>
                    <input className="input-field" value={form.sku} onChange={(e) => update("sku", e.target.value)} required />
                  </FormField>
                  <FormField label="Barcode">
                    <input className="input-field" value={form.barcode} onChange={(e) => update("barcode", e.target.value)} />
                  </FormField>
                  <FormField label="Model">
                    <input className="input-field" value={form.model} onChange={(e) => update("model", e.target.value)} />
                  </FormField>
                  <FormField label="Category">
                    <SelectField value={form.category} onChange={(v) => update("category", v)} placeholder="Select category"
                      options={categories.map((c) => ({ value: c._id, label: c.name }))} />
                  </FormField>
                  <FormField label="Brand">
                    <SelectField value={form.brand} onChange={(v) => update("brand", v)} placeholder="Select brand"
                      options={brands.map((b) => ({ value: b._id, label: b.name }))} />
                  </FormField>
                </FormGrid>
              </FormSection>

              <FormSection title="Pricing (NPR)">
                <FormGrid cols={4}>
                  <FormField label="Purchase Price" required>
                    <input type="number" className="input-field" value={form.purchasePrice} onChange={(e) => update("purchasePrice", e.target.value)} required />
                  </FormField>
                  <FormField label="Selling Price" required>
                    <input type="number" className="input-field" value={form.sellingPrice} onChange={(e) => update("sellingPrice", e.target.value)} required />
                  </FormField>
                  <FormField label="Wholesale Price">
                    <input type="number" className="input-field" value={form.wholesalePrice} onChange={(e) => update("wholesalePrice", e.target.value)} />
                  </FormField>
                  <FormField label="VAT Rate (%)">
                    <input type="number" className="input-field" value={form.vatRate} onChange={(e) => update("vatRate", e.target.value)} />
                  </FormField>
                  <FormField label="Commission %">
                    <input type="number" min={0} max={100} step="0.1" className="input-field" value={form.commissionPercent} onChange={(e) => update("commissionPercent", e.target.value)} />
                  </FormField>
                </FormGrid>
                <div className="mt-3">
                  <FormCheckbox id="vatInclusive" label="VAT inclusive pricing" checked={form.vatInclusive} onChange={(v) => update("vatInclusive", v)} />
                </div>
              </FormSection>

              <FormSection title="Inventory">
                <FormGrid cols={4}>
                  <FormField label="Unit">
                    <SelectField value={form.unit} onChange={(v) => update("unit", v)} placeholder="Select unit"
                      options={units.map((u) => ({ value: u._id, label: u.name }))} />
                  </FormField>
                  <FormField label="Warehouse">
                    <SelectField value={form.warehouse} onChange={(v) => update("warehouse", v)} placeholder="Select warehouse"
                      options={warehouses.map((w) => ({ value: w._id, label: w.name }))} />
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

          <FormActions>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creating..." : "Create Product"}
            </button>
            <button type="button" onClick={() => router.push("/inventory/products")} className="btn-secondary">Cancel</button>
          </FormActions>
        </FormCard>
      </form>
    </DashboardLayout>
  );
}
