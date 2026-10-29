"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { cafeAPI } from "@/lib/api";
import {
  WASTE_REASONS,
  defaultModifiers,
  setModifier,
  type ModifierGroup,
  type TicketModifier,
} from "@/lib/recipe";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type MenuProduct = {
  _id: string;
  name: string;
  attrs?: { modifierGroups?: ModifierGroup[] };
};

export default function WasteModal({
  open,
  products,
  warehouseId,
  onClose,
  onBooked,
}: {
  open: boolean;
  products: MenuProduct[];
  warehouseId?: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState(WASTE_REASONS[0]);
  const [mods, setMods] = useState<TicketModifier[]>([]);
  const [saving, setSaving] = useState(false);

  const product = products.find((row) => row._id === productId);
  const groups = product?.attrs?.modifierGroups || [];

  useEffect(() => {
    if (!open) return;
    setProductId(products[0]?._id || "");
    setQty("1");
    setReason(WASTE_REASONS[0]);
  }, [open, products]);

  useEffect(() => {
    setMods(defaultModifiers(groups));
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!productId) return toast.error("Pick a drink");
    setSaving(true);
    try {
      await cafeAPI.bookWaste({
        productId,
        quantity: Number(qty) || 1,
        modifiers: mods,
        reason,
        warehouseId,
      });
      toast.success("Waste booked");
      onBooked();
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not book waste");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Book waste" size="md">
      <div className="space-y-3">
        <select className="input-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((row) => (
            <option key={row._id} value={row._id}>{row.name}</option>
          ))}
        </select>
        {groups.map((group) => (
          <div key={group.name} className="flex flex-wrap gap-2">
            {group.options.map((opt) => {
              const selected = mods.some((row) => row.group === group.name && row.option === opt.name);
              return (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => setMods((prev) => setModifier(prev, group, opt))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm",
                    selected ? "bg-brand-900 text-white border-brand-900" : "border-brand-200"
                  )}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <input className="input-field" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          <select className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
            {WASTE_REASONS.map((row) => (
              <option key={row} value={row}>{row}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-brand-500">Deducts the recipe (beans, milk, cup) — not a finished drink SKU.</p>
        <button type="button" className="btn-primary w-full" disabled={saving} onClick={save}>
          {saving ? "Booking…" : "Book waste"}
        </button>
      </div>
    </Modal>
  );
}
