"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/utils";
import {
  COMP_REASONS,
  defaultModifiers,
  formatModifiers,
  modifierDelta,
  setModifier,
  type ModifierGroup,
  type TicketModifier,
} from "@/lib/recipe";
import { cn } from "@/lib/utils";

export default function ModifierModal({
  open,
  productName,
  basePrice,
  groups,
  onClose,
  onAdd,
}: {
  open: boolean;
  productName: string;
  basePrice: number;
  groups: ModifierGroup[];
  onClose: () => void;
  onAdd: (payload: { modifiers: TicketModifier[]; complimentary: boolean; compReason?: string }) => void;
}) {
  const [mods, setMods] = useState<TicketModifier[]>([]);
  const [comp, setComp] = useState(false);
  const [reason, setReason] = useState(COMP_REASONS[0]);

  useEffect(() => {
    if (!open) return;
    setMods(defaultModifiers(groups));
    setComp(false);
    setReason(COMP_REASONS[0]);
  }, [open, groups]);

  const price = comp ? 0 : basePrice + modifierDelta(mods);

  return (
    <Modal open={open} onClose={onClose} title={productName} size="md">
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.name}>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-400 mb-2">{group.name}</p>
            <div className="flex flex-wrap gap-2">
              {group.options.map((opt) => {
                const selected = mods.some((row) => row.group === group.name && row.option === opt.name);
                return (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => setMods((prev) => setModifier(prev, group, opt))}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-sm",
                      selected ? "bg-brand-900 text-white border-brand-900" : "border-brand-200 text-brand-800"
                    )}
                  >
                    {opt.name}
                    {Number(opt.priceDelta) ? ` · +${opt.priceDelta}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} />
          Complimentary
        </label>
        {comp && (
          <select className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
            {COMP_REASONS.map((row) => (
              <option key={row} value={row}>{row}</option>
            ))}
          </select>
        )}

        <p className="text-sm text-brand-600">{formatModifiers(mods) || "No extras"}</p>
        <p className="text-lg font-semibold">{formatCurrency(price)}</p>

        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => onAdd({ modifiers: mods, complimentary: comp, compReason: comp ? reason : undefined })}
        >
          Add to ticket
        </button>
      </div>
    </Modal>
  );
}
