"use client";

import { useEffect, useState } from "react";
import { productAPI, miscAPI } from "@/lib/api";
import toast from "react-hot-toast";
import ProductFormFields, { emptyProductForm, productPayload, ProductFormState } from "./ProductFormFields";

export interface CreatedProduct {
  _id: string;
  name: string;
  sku?: string;
  purchasePrice: number;
  sellingPrice?: number;
  currentStock?: number;
  unit?: { name?: string; symbol?: string } | string;
}

type Option = { _id: string; name: string };

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
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [form, setForm] = useState<ProductFormState>({ ...emptyProductForm, warehouse: defaultWarehouse });

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
      setForm((prev) => (prev.warehouse ? prev : { ...prev, warehouse: defaultWarehouse }));
    }
  }, [defaultWarehouse]);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error("Product name is required");
    if (!form.purchasePrice || !form.sellingPrice) return toast.error("Purchase and selling price are required");
    setLoading(true);
    try {
      const res = await productAPI.create(productPayload(form, images));
      toast.success("Product added to inventory");
      onCreated(res.data.data);
      setForm({ ...emptyProductForm, warehouse: defaultWarehouse });
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
      <ProductFormFields
        form={form}
        update={update}
        images={images}
        onImagesChange={setImages}
        categories={categories}
        brands={brands}
        units={units}
        warehouses={warehouses}
        checkboxId="purchase-new-vatInclusive"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={handleCreate} disabled={loading} className="btn-primary">
          {loading ? "Creating..." : "Create Product"}
        </button>
      </div>
    </div>
  );
}
