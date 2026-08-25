"use client";

import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { productAPI } from "@/lib/api";
import { formatCurrency, cn, getImageUrl } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Plus, Search, Package, AlertTriangle, Pencil, Upload, Download } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  sellingPrice: number;
  purchasePrice: number;
  currentStock: number;
  minStock: number;
  brand?: { name: string };
  category?: { name: string };
  images?: string[];
  isActive: boolean;
}

async function saveBlob(request: Promise<{ data: Blob }>, fallbackName: string) {
  const res = await request;
  const url = window.URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebouncedValue(search, 250);

  const loadProducts = () => {
    setLoading(true);
    return productAPI.getAll({ search: debouncedSearch, limit: "50" })
      .then((res) => setProducts(res.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productAPI.getAll({ search: debouncedSearch, limit: "50" })
      .then((res) => {
        if (!cancelled) setProducts(res.data.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      await saveBlob(productAPI.exportFile(format), `products.${format}`);
      toast.success(format === "csv" ? "Product list saved as CSV" : "Product list saved as Excel");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(null);
    }
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await productAPI.importFile(file);
      const { created, updated, errors } = res.data.data || {};
      toast.success(`Imported from your file: ${created || 0} new, ${updated || 0} updated`);
      if (errors?.length) toast.error(`${errors.length} row(s) could not be imported`);
      await loadProducts();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Import failed. Choose a CSV or Excel file from your computer.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Products"
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> {importing ? "Importing..." : "Import"}
            </button>
            <button
              type="button"
              disabled={!!exporting}
              onClick={() => handleExport("csv")}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> {exporting === "csv" ? "Saving..." : "Export CSV"}
            </button>
            <button
              type="button"
              disabled={!!exporting}
              onClick={() => handleExport("xlsx")}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> {exporting === "xlsx" ? "Saving..." : "Export Excel"}
            </button>
            <Link href="/inventory/products/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </Link>
          </>
        }
      />

      <div className="card">
        <div className="p-4 border-b border-brand-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, or barcode..."
              className="input-field pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Product</th>
                <th className="table-header">SKU</th>
                <th className="table-header">Category</th>
                <th className="table-header">Brand</th>
                <th className="table-header">Purchase</th>
                <th className="table-header">Selling</th>
                <th className="table-header">Stock</th>
                <th className="table-header">Status</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={9} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-cell text-center py-12 text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product._id} className="hover:bg-brand-50/50 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-brand-50 border border-brand-100 overflow-hidden flex items-center justify-center shrink-0">
                          {product.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getImageUrl(product.images[0])}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-brand-400" />
                          )}
                        </div>
                        <span className="font-medium text-gray-800">{product.name}</span>
                      </div>
                    </td>
                    <td className="table-cell text-gray-500">{product.sku}</td>
                    <td className="table-cell">{product.category?.name || ""}</td>
                    <td className="table-cell">{product.brand?.name || ""}</td>
                    <td className="table-cell">{formatCurrency(product.purchasePrice)}</td>
                    <td className="table-cell font-medium text-brand-700">{formatCurrency(product.sellingPrice)}</td>
                    <td className="table-cell">
                      <span className="badge">
                        {product.currentStock <= product.minStock && <AlertTriangle className="w-3 h-3 mr-1" strokeWidth={1.75} />}
                        {product.currentStock}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={cn("badge", !product.isActive && "opacity-60")}>
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <Link href={`/inventory/products/${product._id}/edit`} className="p-2 rounded-lg hover:bg-brand-100 text-brand-600 inline-flex">
                        <Pencil className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
