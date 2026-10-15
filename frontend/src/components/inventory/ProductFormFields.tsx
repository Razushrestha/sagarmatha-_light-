"use client";

import { FormField, SelectField } from "@/components/ui/FormField";
import { FormSection, FormGrid, FormCheckbox } from "@/components/ui/FormLayout";
import ImageUpload from "@/components/ui/ImageUpload";

export type ProductFormState = {
  name: string;
  barcode: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  purchasePrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  dealerPrice?: string;
  minStock: string;
  currentStock: string;
  unit: string;
  warehouse: string;
  vatInclusive: boolean;
  vatRate: string;
  commissionPercent: string;
};

type Option = { _id: string; name: string };

export const emptyProductForm: ProductFormState = {
  name: "",
  barcode: "",
  category: "",
  brand: "",
  model: "",
  description: "",
  purchasePrice: "",
  sellingPrice: "",
  wholesalePrice: "",
  dealerPrice: "",
  minStock: "5",
  currentStock: "0",
  unit: "",
  warehouse: "",
  vatInclusive: true,
  vatRate: "13",
  commissionPercent: "5",
};

export function productPayload(form: ProductFormState, images: string[]) {
  return {
    ...form,
    images,
    purchasePrice: parseFloat(form.purchasePrice) || 0,
    sellingPrice: parseFloat(form.sellingPrice) || 0,
    wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : undefined,
    dealerPrice: form.dealerPrice ? parseFloat(form.dealerPrice) : undefined,
    minStock: Number(form.minStock),
    currentStock: Number(form.currentStock),
    vatRate: parseFloat(form.vatRate) || 0,
    commissionPercent: parseFloat(form.commissionPercent) || 0,
  };
}

export default function ProductFormFields({
  form,
  update,
  images,
  onImagesChange,
  categories,
  brands,
  units,
  warehouses,
  checkboxId = "vatInclusive",
  sellingLabel = "Selling Price",
  stockLabel = "Opening Stock",
  showDealerPrice = false,
  htmlRequired = false,
}: {
  form: ProductFormState;
  update: (field: string, value: string | boolean) => void;
  images: string[];
  onImagesChange: (images: string[]) => void;
  categories: Option[];
  brands: Option[];
  units: Option[];
  warehouses: Option[];
  checkboxId?: string;
  sellingLabel?: string;
  stockLabel?: string;
  showDealerPrice?: boolean;
  htmlRequired?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-3">
        <FormSection title="Product Images" description="Up to 4 photos">
          <ImageUpload images={images} onChange={onImagesChange} compact />
        </FormSection>
      </div>

      <div className="xl:col-span-9 space-y-4">
        <FormSection title="Basic Details">
          <FormGrid cols={3}>
            <FormField label="Product Name" required>
              <input className="input-field" value={form.name} onChange={(e) => update("name", e.target.value)} required={htmlRequired} />
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
              <input type="number" step="any" min="0" className="input-field" value={form.purchasePrice} onChange={(e) => update("purchasePrice", e.target.value)} required={htmlRequired} />
            </FormField>
            <FormField label={sellingLabel} required>
              <input type="number" step="any" min="0" className="input-field" value={form.sellingPrice} onChange={(e) => update("sellingPrice", e.target.value)} required={htmlRequired} />
            </FormField>
            <FormField label="Wholesale Price">
              <input type="number" step="any" min="0" className="input-field" value={form.wholesalePrice} onChange={(e) => update("wholesalePrice", e.target.value)} />
            </FormField>
            {showDealerPrice && (
              <FormField label="Dealer Price">
                <input type="number" step="any" min="0" className="input-field" value={form.dealerPrice || ""} onChange={(e) => update("dealerPrice", e.target.value)} />
              </FormField>
            )}
            <FormField label="VAT Rate (%)">
              <input type="number" step="any" min="0" className="input-field" value={form.vatRate} onChange={(e) => update("vatRate", e.target.value)} />
            </FormField>
            <FormField label="Commission %">
              <input type="number" min={0} max={100} step="any" className="input-field" value={form.commissionPercent} onChange={(e) => update("commissionPercent", e.target.value)} />
            </FormField>
          </FormGrid>
          <div className="mt-3">
            <FormCheckbox id={checkboxId} label="VAT inclusive pricing" checked={form.vatInclusive} onChange={(v) => update("vatInclusive", v)} />
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
            <FormField label={stockLabel}>
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
  );
}
