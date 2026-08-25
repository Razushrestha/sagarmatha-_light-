"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { FormActions } from "@/components/ui/FormLayout";
import { miscAPI } from "@/lib/api";
import { Plus, Tag } from "lucide-react";
import toast from "react-hot-toast";

interface Category {
  _id: string;
  name: string;
  description?: string;
}

interface Brand {
  _id: string;
  name: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [catName, setCatName] = useState("");
  const [brandName, setBrandName] = useState("");

  const load = () => {
    Promise.all([
      miscAPI.getCategories(),
      miscAPI.getBrands(),
    ]).then(([cats, brandsRes]) => {
      setCategories(cats.data.data);
      setBrands(brandsRes.data.data);
    });
  };

  useEffect(() => { load(); }, []);

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await miscAPI.createCategory({ name: catName });
      toast.success("Category created!");
      setShowCatModal(false);
      setCatName("");
      load();
    } catch {
      toast.error("Failed to create category");
    }
  };

  const createBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await miscAPI.createBrand({ name: brandName });
      toast.success("Brand created!");
      setShowBrandModal(false);
      setBrandName("");
      load();
    } catch {
      toast.error("Failed to create brand");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Categories & Brands" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
            <h3 className="font-semibold text-gray-900">Categories</h3>
            <button onClick={() => setShowCatModal(true)} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="divide-y divide-brand-50">
            {categories.length === 0 ? (
              <p className="p-6 text-center text-gray-400">No categories</p>
            ) : categories.map((cat) => (
              <div key={cat._id} className="flex items-center gap-3 px-6 py-3 hover:bg-brand-50/50">
                <Tag className="w-4 h-4 text-brand-400" />
                <span className="font-medium">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
            <h3 className="font-semibold text-gray-900">Brands</h3>
            <button onClick={() => setShowBrandModal(true)} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="divide-y divide-brand-50">
            {brands.length === 0 ? (
              <p className="p-6 text-center text-gray-400">No brands</p>
            ) : brands.map((brand) => (
              <div key={brand._id} className="flex items-center gap-3 px-6 py-3 hover:bg-brand-50/50">
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
                  {brand.name.charAt(0)}
                </div>
                <span className="font-medium">{brand.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={showCatModal} onClose={() => setShowCatModal(false)} title="Add Category">
        <form onSubmit={createCategory} className="form-modal">
          <FormField label="Category Name" required>
            <input className="input-field" value={catName} onChange={(e) => setCatName(e.target.value)} required />
          </FormField>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" onClick={() => setShowCatModal(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>

      <Modal open={showBrandModal} onClose={() => setShowBrandModal(false)} title="Add Brand">
        <form onSubmit={createBrand} className="form-modal">
          <FormField label="Brand Name" required>
            <input className="input-field" value={brandName} onChange={(e) => setBrandName(e.target.value)} required />
          </FormField>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" onClick={() => setShowBrandModal(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
