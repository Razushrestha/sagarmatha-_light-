"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormBackLink, FormCard, FormActions } from "@/components/ui/FormLayout";
import { productAPI, miscAPI } from "@/lib/api";
import { isModS, useHotkey } from "@/lib/useHotkey";
import toast from "react-hot-toast";
import ProductFormFields, { emptyProductForm, productPayload, ProductFormState } from "@/components/inventory/ProductFormFields";

type Option = { _id: string; name: string };

export default function NewProductPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [form, setForm] = useState<ProductFormState>(emptyProductForm);

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
    });
  }, []);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await productAPI.create(productPayload(form, images));
      toast.success("Product created successfully!");
      router.push("/inventory/products");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  const saveProduct = useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);

  useHotkey(isModS, saveProduct, { enabled: !loading });

  return (
    <DashboardLayout>
      <FormBackLink href="/inventory/products" label="Back to Products" />
      <PageHeader title="Add New Product" />

      <form ref={formRef} onSubmit={handleSubmit}>
        <FormCard>
          <ProductFormFields
            form={form}
            update={update}
            images={images}
            onImagesChange={setImages}
            categories={categories}
            brands={brands}
            units={units}
            warehouses={warehouses}
            htmlRequired
          />
          <FormActions>
            <button type="submit" disabled={loading} className="btn-primary" title="Ctrl+S">
              {loading ? "Creating..." : "Create Product"}
              {!loading && <kbd className="hidden sm:inline ml-2 text-[10px] font-medium opacity-80 border border-white/30 rounded px-1 py-0.5">Ctrl+S</kbd>}
            </button>
            <button type="button" onClick={() => router.push("/inventory/products")} className="btn-secondary">Cancel</button>
          </FormActions>
        </FormCard>
      </form>
    </DashboardLayout>
  );
}
