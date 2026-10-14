"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { FormActions } from "@/components/ui/FormLayout";
import { miscAPI } from "@/lib/api";
import { Plus, Tag, Pencil, Trash2 } from "lucide-react";
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

function apiError(err: unknown, fallback: string) {
  const error = err as { response?: { data?: { message?: string } } };
  return error.response?.data?.message || fallback;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [catName, setCatName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openAddCategory = () => {
    setEditingCategory(null);
    setCatName("");
    setShowCatModal(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setShowCatModal(true);
  };

  const openAddBrand = () => {
    setEditingBrand(null);
    setBrandName("");
    setShowBrandModal(true);
  };

  const openEditBrand = (brand: Brand) => {
    setEditingBrand(brand);
    setBrandName(brand.name);
    setShowBrandModal(true);
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingCategory) {
        await miscAPI.updateCategory(editingCategory._id, { name: catName.trim() });
        toast.success("Category updated");
      } else {
        await miscAPI.createCategory({ name: catName.trim() });
        toast.success("Category created");
      }
      setShowCatModal(false);
      setEditingCategory(null);
      setCatName("");
      load();
    } catch (err) {
      toast.error(apiError(err, editingCategory ? "Failed to update category" : "Failed to create category"));
    } finally {
      setSaving(false);
    }
  };

  const saveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingBrand) {
        await miscAPI.updateBrand(editingBrand._id, { name: brandName.trim() });
        toast.success("Brand updated");
      } else {
        await miscAPI.createBrand({ name: brandName.trim() });
        toast.success("Brand created");
      }
      setShowBrandModal(false);
      setEditingBrand(null);
      setBrandName("");
      load();
    } catch (err) {
      toast.error(apiError(err, editingBrand ? "Failed to update brand" : "Failed to create brand"));
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (cat: Category) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await miscAPI.deleteCategory(cat._id);
      toast.success("Category deleted");
      load();
    } catch (err) {
      toast.error(apiError(err, "Could not delete category"));
    }
  };

  const deleteBrand = async (brand: Brand) => {
    if (!window.confirm(`Delete brand "${brand.name}"?`)) return;
    try {
      await miscAPI.deleteBrand(brand._id);
      toast.success("Brand deleted");
      load();
    } catch (err) {
      toast.error(apiError(err, "Could not delete brand"));
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Categories & Brands" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
            <h3 className="font-semibold text-gray-900">Categories</h3>
            <button onClick={openAddCategory} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="divide-y divide-brand-50">
            {categories.length === 0 ? (
              <p className="p-6 text-center text-gray-400">No categories</p>
            ) : categories.map((cat) => (
              <div key={cat._id} className="flex items-center gap-3 px-6 py-3 hover:bg-brand-50/50">
                <Tag className="w-4 h-4 text-brand-400" />
                <span className="font-medium flex-1">{cat.name}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEditCategory(cat)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-100 text-brand-700">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button type="button" onClick={() => deleteCategory(cat)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 text-red-600">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
            <h3 className="font-semibold text-gray-900">Brands</h3>
            <button onClick={openAddBrand} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
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
                <span className="font-medium flex-1">{brand.name}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEditBrand(brand)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-100 text-brand-700">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button type="button" onClick={() => deleteBrand(brand)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 text-red-600">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={showCatModal}
        onClose={() => { setShowCatModal(false); setEditingCategory(null); }}
        title={editingCategory ? "Edit Category" : "Add Category"}
      >
        <form onSubmit={saveCategory} className="form-modal">
          <FormField label="Category Name" required>
            <input className="input-field" value={catName} onChange={(e) => setCatName(e.target.value)} required />
          </FormField>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editingCategory ? "Save Changes" : "Create"}
            </button>
            <button type="button" onClick={() => { setShowCatModal(false); setEditingCategory(null); }} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>

      <Modal
        open={showBrandModal}
        onClose={() => { setShowBrandModal(false); setEditingBrand(null); }}
        title={editingBrand ? "Edit Brand" : "Add Brand"}
      >
        <form onSubmit={saveBrand} className="form-modal">
          <FormField label="Brand Name" required>
            <input className="input-field" value={brandName} onChange={(e) => setBrandName(e.target.value)} required />
          </FormField>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editingBrand ? "Save Changes" : "Create"}
            </button>
            <button type="button" onClick={() => { setShowBrandModal(false); setEditingBrand(null); }} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
