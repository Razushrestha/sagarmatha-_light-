"use client";

import { FormField } from "@/components/ui/FormField";

export const ID_TYPES = [
  { value: "citizenship", label: "Citizenship" },
  { value: "passport", label: "Passport" },
  { value: "license", label: "Driving licence" },
  { value: "voter", label: "Voter ID" },
  { value: "other", label: "Other ID" },
] as const;

export type GuestDraft = {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestIdType: string;
  guestIdNumber: string;
  guestNationality: string;
  guestAddress: string;
};

export const EMPTY_GUEST: GuestDraft = {
  guestName: "",
  guestPhone: "",
  guestEmail: "",
  guestIdType: "citizenship",
  guestIdNumber: "",
  guestNationality: "Nepal",
  guestAddress: "",
};

export function guestFromStay(stay: Partial<GuestDraft> | null | undefined): GuestDraft {
  return {
    guestName: stay?.guestName || "",
    guestPhone: stay?.guestPhone || "",
    guestEmail: stay?.guestEmail || "",
    guestIdType: stay?.guestIdType || "citizenship",
    guestIdNumber: stay?.guestIdNumber || "",
    guestNationality: stay?.guestNationality || "Nepal",
    guestAddress: stay?.guestAddress || "",
  };
}

export function guestGaps(guest: GuestDraft, requireId: boolean) {
  const missing: string[] = [];
  if (!guest.guestName.trim()) missing.push("name");
  if (!guest.guestPhone.trim()) missing.push("phone");
  if (requireId) {
    if (!guest.guestIdNumber.trim()) missing.push("ID / passport");
    if (!guest.guestNationality.trim()) missing.push("nationality");
    if (!guest.guestAddress.trim()) missing.push("address");
  }
  return missing;
}

export default function GuestFields({
  value,
  onChange,
  idRequired,
  onLookup,
}: {
  value: GuestDraft;
  onChange: (next: GuestDraft) => void;
  idRequired?: boolean;
  onLookup?: (phone: string) => void;
}) {
  const set = (key: keyof GuestDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    onChange({ ...value, [key]: e.target.value });
  };

  return (
    <div className="space-y-3">
      <FormField label="Guest name" required>
        <input className="input-field" value={value.guestName} onChange={set("guestName")} placeholder="Full name" />
      </FormField>
      <FormField label="Email">
        <input className="input-field" type="email" value={value.guestEmail} onChange={set("guestEmail")} placeholder="guest@email.com" />
      </FormField>
      <FormField label="Phone" required>
        <div className="flex gap-2">
          <input className="input-field" value={value.guestPhone} onChange={set("guestPhone")} placeholder="98xxxxxxxx" />
          {onLookup ? (
            <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => onLookup(value.guestPhone)}>
              Find
            </button>
          ) : null}
        </div>
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="ID type" required={idRequired}>
          <select className="input-field" value={value.guestIdType} onChange={set("guestIdType")}>
            {ID_TYPES.map((row) => (
              <option key={row.value} value={row.value}>{row.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="ID / passport no." required={idRequired}>
          <input className="input-field" value={value.guestIdNumber} onChange={set("guestIdNumber")} placeholder={idRequired ? "Required at check-in" : "Can add at arrival"} />
        </FormField>
      </div>
      <FormField label="Nationality" required={idRequired}>
        <input className="input-field" value={value.guestNationality} onChange={set("guestNationality")} placeholder="Nepal" />
      </FormField>
      <FormField label="Address" required={idRequired}>
        <textarea className="input-field min-h-[64px] resize-y" value={value.guestAddress} onChange={set("guestAddress")} placeholder="Street, city" />
      </FormField>
    </div>
  );
}
