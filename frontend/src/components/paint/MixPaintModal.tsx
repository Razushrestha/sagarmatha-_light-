"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { paintAPI } from "@/lib/api";
import { PACK_LITRES, packLabel } from "@/lib/paint";
import { cn, formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

type Shade = {
  _id: string;
  code: string;
  name: string;
  swatch?: string;
  brand?: { name?: string };
  formulas?: Array<{ packLitres: number }>;
};

type MixProduct = {
  _id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  currentStock: number;
  attrs?: { tinted?: boolean };
};

export default function MixPaintModal({
  open,
  onClose,
  warehouseId,
  onMixed,
}: {
  open: boolean;
  onClose: () => void;
  warehouseId?: string;
  onMixed: (product: MixProduct) => void;
}) {
  const [search, setSearch] = useState("");
  const [shades, setShades] = useState<Shade[]>([]);
  const [shadeId, setShadeId] = useState("");
  const [packLitres, setPackLitres] = useState(4);
  const [preview, setPreview] = useState<{
    ok?: boolean;
    message?: string;
    usage?: {
      sellingPrice?: number;
      base?: { name?: string; currentStock?: number; sku?: string };
      colorants?: Array<{ millilitres: number; product?: { name?: string; currentStock?: number } }>;
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [mixing, setMixing] = useState(false);

  useEffect(() => {
    if (!open) return;
    paintAPI.getShades({ search, limit: "80" })
      .then((res) => setShades(res.data.data || []))
      .catch(() => setShades([]));
  }, [open, search]);

  useEffect(() => {
    if (!open || !shadeId) {
      setPreview(null);
      return;
    }
    setLoading(true);
    paintAPI.previewMix({ shadeId, packLitres })
      .then((res) => setPreview(res.data.data))
      .catch((err: { response?: { data?: { message?: string } } }) => {
        setPreview({ ok: false, message: err.response?.data?.message || "No formula for this pack" });
      })
      .finally(() => setLoading(false));
  }, [open, shadeId, packLitres]);

  const selected = shades.find((row) => row._id === shadeId);
  const packsForShade = selected?.formulas?.map((row) => row.packLitres) || PACK_LITRES;

  const mix = async () => {
    if (!shadeId) return toast.error("Pick a shade");
    setMixing(true);
    try {
      const res = await paintAPI.mix({ shadeId, packLitres, warehouseId });
      const product = res.data.data.product as MixProduct;
      toast.success("Tinted tin ready");
      onMixed({ ...product, currentStock: Math.max(Number(product.currentStock) || 0, 1) });
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not mix");
    } finally {
      setMixing(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Mix paint" size="lg">
      <div className="space-y-4">
        <input
          className="input-field"
          placeholder="Search shade code or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-40 overflow-y-auto border border-brand-100 rounded-xl divide-y divide-brand-50">
          {shades.length === 0 ? (
            <p className="p-4 text-sm text-brand-400">No shades yet. Add them under Paint shades.</p>
          ) : shades.map((shade) => (
            <button
              type="button"
              key={shade._id}
              onClick={() => setShadeId(shade._id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left text-sm",
                shadeId === shade._id ? "bg-brand-50" : "hover:bg-brand-50/60"
              )}
            >
              <span className="w-7 h-7 rounded-md border border-brand-200 shrink-0" style={{ background: shade.swatch || "#ccc" }} />
              <span className="font-medium text-brand-900">{shade.code}</span>
              <span className="text-brand-600 truncate">{shade.name}</span>
              {shade.brand?.name && <span className="ml-auto text-xs text-brand-400">{shade.brand.name}</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {PACK_LITRES.map((pack) => (
            <button
              type="button"
              key={pack}
              disabled={selected && !packsForShade.includes(pack)}
              onClick={() => setPackLitres(pack)}
              className={cn(
                "flex-1 py-2 rounded-lg border text-sm font-medium",
                packLitres === pack ? "bg-brand-900 text-white border-brand-900" : "border-brand-200 text-brand-700",
                selected && !packsForShade.includes(pack) && "opacity-40"
              )}
            >
              {packLabel(pack)}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-brand-500">Checking stock…</p>}
        {preview?.usage && (
          <div className="rounded-xl border border-brand-100 p-3 text-sm space-y-1">
            <p>Base: {preview.usage.base?.name} ({preview.usage.base?.currentStock} in stock)</p>
            {(preview.usage.colorants || []).map((line, i) => (
              <p key={i}>{line.millilitres} ml {line.product?.name} ({line.product?.currentStock} ml in stock)</p>
            ))}
            <p className="font-medium pt-1">Sell at {formatCurrency(preview.usage.sellingPrice || 0)}</p>
          </div>
        )}
        {preview && preview.ok === false && (
          <p className="text-sm text-red-600">{preview.message}</p>
        )}

        <button
          type="button"
          className="btn-primary w-full"
          disabled={!shadeId || mixing || preview?.ok === false}
          onClick={mix}
        >
          {mixing ? "Mixing…" : `Mix ${packLabel(packLitres)} and add to cart`}
        </button>
      </div>
    </Modal>
  );
}
