"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { publicAPI } from "@/lib/api";
import DateInput from "@/components/ui/DateInput";
import { addDaysISO, todayISO } from "@/lib/nepaliDate";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

type Widget = {
  name: string;
  address?: string;
  phone?: string;
  types: Array<{ type: string; rate: number; vacant: number }>;
  meals: Array<{ key: string; label: string; extra: number }>;
};

export default function HotelBookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [hotel, setHotel] = useState<Widget | null>(null);
  const [error, setError] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [nights, setNights] = useState("1");
  const [roomType, setRoomType] = useState("");
  const [mealPlan, setMealPlan] = useState("room_only");
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slug) return;
    publicAPI.hotelWidget(slug)
      .then((r) => {
        setHotel(r.data.data);
        const first = r.data.data?.types?.[0]?.type || "";
        setRoomType(first);
      })
      .catch(() => setError("This hotel booking page is not available."));
  }, [slug]);

  if (error) {
    return <main className="max-w-lg mx-auto p-6"><p className="text-brand-700">{error}</p></main>;
  }
  if (!hotel) return <main className="max-w-lg mx-auto p-6"><p className="text-sm text-brand-500">Loading…</p></main>;

  const dueOut = addDaysISO(Number(nights) || 1, checkIn);

  return (
    <main className="max-w-lg mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{hotel.name}</h1>
      <p className="text-sm text-brand-600">{hotel.address}{hotel.phone ? ` · ${hotel.phone}` : ""}</p>
      <p className="text-sm text-brand-500">Request a room. The hotel will confirm. This is not a live Booking.com connection.</p>
      {sent ? (
        <p className="card p-4">Request sent. We will call or email {guestPhone || guestEmail} to confirm.</p>
      ) : (
        <form
          className="card p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSaving(true);
            publicAPI.hotelBook(slug, {
              guestName,
              guestPhone,
              guestEmail,
              checkIn,
              nights: Number(nights) || 1,
              roomType,
              mealPlan,
              notes,
            }).then(() => setSent(true))
              .catch((err) => toast.error(err.response?.data?.message || "Could not send request"))
              .finally(() => setSaving(false));
          }}
        >
          <input className="input-field" required placeholder="Full name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <input className="input-field" required placeholder="Phone" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
          <input className="input-field" type="email" placeholder="Email (optional)" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
          <label className="label">Check-in</label>
          <DateInput className="input-field" value={checkIn} onChange={setCheckIn} required />
          <label className="label">Nights</label>
          <input className="input-field" type="number" min={1} value={nights} onChange={(e) => setNights(e.target.value)} />
          <p className="text-xs text-brand-500">Due out {dueOut}</p>
          <label className="label">Room type</label>
          <select className="input-field" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
            {hotel.types.map((row) => (
              <option key={row.type} value={row.type}>
                {row.type} · from {formatCurrency(row.rate)} · {row.vacant} open
              </option>
            ))}
          </select>
          <label className="label">Meal plan</label>
          <select className="input-field" value={mealPlan} onChange={(e) => setMealPlan(e.target.value)}>
            {hotel.meals.map((row) => (
              <option key={row.key} value={row.key}>{row.label}{row.extra ? ` · +${row.extra}` : ""}</option>
            ))}
          </select>
          <textarea className="input-field" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? "Sending…" : "Request to book"}</button>
        </form>
      )}
    </main>
  );
}
