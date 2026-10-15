"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormBackLink, FormCard, FormActions } from "@/components/ui/FormLayout";
import { productAPI, miscAPI } from "@/lib/api";
import { isAltN, isModS, useHotkey } from "@/lib/useHotkey";
import toast from "react-hot-toast";
import ProductFormFields, { emptyProductForm, productPayload, ProductFormState } from "@/components/inventory/ProductFormFields";

type Option = { _id: string; name: string };

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
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
      productAPI.getById(id),
    ]).then(([cat, br, un, wh, prod]) => {
      setCategories(cat.data.data || []);
      setBrands(br.data.data || []);
      setUnits(un.data.data || []);
      setWarehouses(wh.data.data || []);
      const p = prod.data.data;
      setForm({
        ...emptyProductForm,
        name: p.name || "",
        barcode: p.barcode || "",
        category: p.category?._id || p.category || "",
        brand: p.brand?._id || p.brand || "",
        model: p.model || "",
        description: p.description || "",
        purchasePrice: String(p.purchasePrice ?? ""),
        sellingPrice: String(p.sellingPrice ?? ""),
        wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
        dealerPrice: p.dealerPrice != null ? String(p.dealerPrice) : "",
        minStock: String(p.minStock ?? 5),
        currentStock: String(p.currentStock ?? 0),
        unit: p.unit?._id || p.unit || "",
        warehouse: p.warehouse?._id || p.warehouse || "",
        vatInclusive: p.vatInclusive ?? true,
        vatRate: String(p.vatRate ?? 13),
        commissionPercent: String(p.commissionPercent ?? 5),
      });
      setImages(p.images || []);
    }).catch(() => toast.error("Product not found"))
      .finally(() => setFetching(false));
  }, [id]);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await productAPI.update(id, productPayload(form, images));
      toast.success("Product updated!");
      router.push("/inventory/products");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to update product");
    } finally {
      setLoading(false);
    }
  };

  const saveProduct = useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);
  const openNewProduct = useCallback(() => {
    router.push("/inventory/products/new");
  }, [router]);

  useHotkey(isModS, saveProduct, { enabled: !loading && !fetching });
  useHotkey(isAltN, openNewProduct, { enabled: !fetching });

  if (fetching) {
    return (
      <DashboardLayout>
        <div className="card p-8 animate-pulse bg-brand-50 h-64" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <FormBackLink href="/inventory/products" label="Back to Products" />
      <PageHeader title="Edit Product" />

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
            sellingLabel="Retail Price"
            stockLabel="Current Stock"
            showDealerPrice
            htmlRequired
            checkboxId="edit-vatInclusive"
          />
          <FormActions>
            <button type="submit" disabled={loading} className="btn-primary" title="Ctrl+S">
              {loading ? "Saving..." : "Save Changes"}
              {!loading && <kbd className="hidden sm:inline ml-2 text-[10px] font-medium opacity-80 border border-white/30 rounded px-1 py-0.5">Ctrl+S</kbd>}
            </button>
            <button type="button" onClick={() => router.push("/inventory/products")} className="btn-secondary">Cancel</button>
          </FormActions>
        </FormCard>
      </form>
    </DashboardLayout>
  );
}
