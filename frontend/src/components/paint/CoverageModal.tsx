"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { coverageQuote, DEFAULT_SQFT_PER_LITRE, formatPackSplit, packLabel } from "@/lib/paint";

export default function CoverageModal({
  open,
  onClose,
  onUseQuote,
}: {
  open: boolean;
  onClose: () => void;
  onUseQuote: (text: string) => void;
}) {
  const [sqFt, setSqFt] = useState("1200");
  const [coats, setCoats] = useState("2");
  const [sqFtPerLitre, setSqFtPerLitre] = useState(String(DEFAULT_SQFT_PER_LITRE));

  const quote = useMemo(
    () => coverageQuote({
      sqFt: Number(sqFt) || 0,
      coats: Number(coats) || 0,
      sqFtPerLitre: Number(sqFtPerLitre) || 0,
    }),
    [sqFt, coats, sqFtPerLitre]
  );

  return (
    <Modal open={open} onClose={onClose} title="Coverage" size="md">
      <div className="space-y-4">
        <p className="text-sm text-brand-500">
          Contractor job in litres. Default 100 sq ft per litre per coat — change it for that paint.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block text-brand-600 mb-1">Area (sq ft)</span>
            <input className="input-field" type="number" min={0} value={sqFt} onChange={(e) => setSqFt(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="block text-brand-600 mb-1">Coats</span>
            <input className="input-field" type="number" min={1} step={1} value={coats} onChange={(e) => setCoats(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="block text-brand-600 mb-1">Sq ft / L</span>
            <input className="input-field" type="number" min={1} value={sqFtPerLitre} onChange={(e) => setSqFtPerLitre(e.target.value)} />
          </label>
        </div>

        <div className="rounded-xl border border-brand-100 p-4 space-y-2">
          <p className="text-2xl font-semibold text-brand-900">{quote.litres.toFixed(1)} L</p>
          <p className="text-sm text-brand-700">Pack split: {formatPackSplit(quote.split)}</p>
          {quote.split.lines.length > 0 && (
            <ul className="text-sm text-brand-600 space-y-0.5">
              {quote.split.lines.map((line) => (
                <li key={line.pack}>{line.count} × {packLabel(line.pack)}</li>
              ))}
            </ul>
          )}
          {quote.split.extraLitres > 0.05 && (
            <p className="text-xs text-brand-400">{quote.split.extraLitres.toFixed(1)} L extra from packing up to whole tins</p>
          )}
        </div>

        <button
          type="button"
          className="btn-primary w-full"
          disabled={quote.litres <= 0}
          onClick={() => {
            onUseQuote(quote.text);
            onClose();
          }}
        >
          Put litres on this bill
        </button>
      </div>
    </Modal>
  );
}
