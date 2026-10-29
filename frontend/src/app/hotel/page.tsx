"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import RoomRack, { type RackData } from "@/components/hotel/RoomRack";
import GuestFields, { EMPTY_GUEST, guestFromStay, guestGaps, type GuestDraft } from "@/components/hotel/GuestFields";
import FolioPanel from "@/components/hotel/FolioPanel";
import RatePlanSelect, { type RatePlan } from "@/components/hotel/RatePlanSelect";
import MealPlanSelect from "@/components/hotel/MealPlanSelect";
import DateInput from "@/components/ui/DateInput";
import { hotelAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { addDaysISO, todayISO } from "@/lib/nepaliDate";
import toast from "react-hot-toast";

type Room = { _id: string; number: string; type: string; rate: number; status: string };
type Stay = GuestDraft & {
  _id: string;
  status: string;
  nights: number;
  rate?: number;
  occupyStart?: string;
  occupyEnd?: string;
  folio?: { _id: string; balance: number };
  room?: { number: string; type?: string; rate?: number };
  roomSale?: { _id: string; invoiceNumber: string; total: number; vatAmount: number; irdStatus?: string };
  secondGuestName?: string;
  secondGuestPhone?: string;
  rateKind?: string;
  ratePlan?: { name: string; kind: string };
  customer?: { name: string; company?: string };
};
type Channel = { _id: string; channel: string; guestName: string; confirmation?: string; status: string; checkIn: string; checkOut: string };

export default function HotelPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [channel, setChannel] = useState<Channel[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [reservePlanId, setReservePlanId] = useState("");
  const [walkInPlanId, setWalkInPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [planKind, setPlanKind] = useState("company");
  const [planMode, setPlanMode] = useState("fixed");
  const [planRate, setPlanRate] = useState("");
  const [planOff, setPlanOff] = useState("10");
  const [planRoomType, setPlanRoomType] = useState("");
  const [reserveMeal, setReserveMeal] = useState("room_only");
  const [walkInMeal, setWalkInMeal] = useState("room_only");
  const [rack, setRack] = useState<RackData | null>(null);
  const [from, setFrom] = useState(todayISO());
  const [number, setNumber] = useState("");
  const [type, setType] = useState("Standard");
  const [rate, setRate] = useState("3500");
  const [walkInGuest, setWalkInGuest] = useState<GuestDraft>(EMPTY_GUEST);
  const [roomId, setRoomId] = useState("");
  const [nights, setNights] = useState("1");
  const [arriveOn, setArriveOn] = useState(todayISO());
  const [reserveGuest, setReserveGuest] = useState<GuestDraft>(EMPTY_GUEST);
  const [reserveRoomId, setReserveRoomId] = useState("");
  const [reserveNights, setReserveNights] = useState("1");
  const [importRoom, setImportRoom] = useState("");
  const [selectedStayId, setSelectedStayId] = useState("");
  const [selectedGuest, setSelectedGuest] = useState<GuestDraft>(EMPTY_GUEST);
  const [extraNights, setExtraNights] = useState("1");
  const [moveRoomId, setMoveRoomId] = useState("");
  const [newRate, setNewRate] = useState("");
  const [secondGuestName, setSecondGuestName] = useState("");
  const [secondGuestPhone, setSecondGuestPhone] = useState("");
  const today = rack?.today || todayISO();
  const walkInRooms = rooms.filter((room) => {
    if (room.status === "occupied") return false;
    const held = rack?.stays?.some((stay) => String(stay.roomId) === room._id && stay.start <= today && today < stay.end);
    return !held;
  });

  const load = useCallback(() => {
    hotelAPI.getRooms().then((r) => setRooms(r.data.data || [])).catch(() => {});
    hotelAPI.getStays().then((r) => setStays(r.data.data || [])).catch(() => {});
    hotelAPI.getChannel().then((r) => setChannel(r.data.data || [])).catch(() => {});
    hotelAPI.getRatePlans().then((r) => setRatePlans(r.data.data || [])).catch(() => {});
    hotelAPI.getRack({ from, days: "14" })
      .then((r) => setRack(r.data.data || null))
      .catch(() => toast.error("Could not load room rack"));
  }, [from]);

  useEffect(() => { load(); }, [load]);

  const selectedStay = stays.find((stay) => stay._id === selectedStayId) || null;
  useEffect(() => {
    setSelectedGuest(guestFromStay(selectedStay));
    setSecondGuestName(selectedStay?.secondGuestName || "");
    setSecondGuestPhone(selectedStay?.secondGuestPhone || "");
  }, [selectedStayId, selectedStay?.guestName, selectedStay?.guestPhone, selectedStay?.guestEmail, selectedStay?.guestIdNumber, selectedStay?.guestAddress, selectedStay?.secondGuestName, selectedStay?.secondGuestPhone]);

  const fillGuest = (phone: string, apply: (guest: GuestDraft) => void) => {
    const q = phone.trim();
    if (q.length < 2) {
      toast.error("Enter phone or ID, then Find");
      return;
    }
    hotelAPI.searchGuests(q).then((r) => {
      const hit = (r.data.data || [])[0];
      if (!hit) {
        toast.error("No returning guest with that phone or ID");
        return;
      }
      apply({
        guestName: hit.guestName,
        guestPhone: hit.guestPhone,
        guestEmail: hit.guestEmail || "",
        guestIdType: hit.guestIdType || "citizenship",
        guestIdNumber: hit.guestIdNumber || "",
        guestNationality: hit.guestNationality || "Nepal",
        guestAddress: hit.guestAddress || "",
      });
      toast.success(`Loaded ${hit.guestName}${hit.stayCount ? ` · ${hit.stayCount} stay(s)` : ""}`);
    }).catch(() => toast.error("Could not search guests"));
  };

  const requireGuest = (guest: GuestDraft, requireId: boolean) => {
    const missing = guestGaps(guest, requireId);
    if (missing.length) {
      toast.error(`Guest ${missing.join(", ")} required`);
      return false;
    }
    return true;
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Front desk"
        subtitle="Room rack — who is in which room, who arrives, who leaves. Night audit closes the hotel date."
      />

      <RoomRack
        data={rack}
        from={from}
        onFromChange={setFrom}
        selectedStayId={selectedStayId}
        onSelectStay={(id) => {
          setSelectedStayId(id);
          requestAnimationFrame(() => document.getElementById("hotel-guest")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
        onPickOpen={(id, date) => {
          if (date === today) {
            setRoomId(id);
            document.getElementById("hotel-checkin")?.scrollIntoView({ behavior: "smooth", block: "start" });
            toast.success("Room selected for walk-in check-in");
            return;
          }
          setReserveRoomId(id);
          setArriveOn(date);
          document.getElementById("hotel-reserve")?.scrollIntoView({ behavior: "smooth", block: "start" });
          toast.success("Room held dates ready — save the reservation");
        }}
      />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">Rooms</h2>
          <div className="flex gap-2">
            <input className="input-field" placeholder="101" value={number} onChange={(e) => setNumber(e.target.value)} />
            <input className="input-field" placeholder="Type" value={type} onChange={(e) => setType(e.target.value)} />
            <input className="input-field w-28" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            <button type="button" className="btn-primary" onClick={() => hotelAPI.saveRoom({ number, type, rate: Number(rate) }).then(() => { setNumber(""); load(); }).catch((e) => toast.error(e.response?.data?.message || "Save failed"))}>Add</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {rooms.map((room) => (
              <div key={room._id} className="border rounded-lg p-3 text-sm">
                <p className="font-medium">{room.number} · {room.type}</p>
                <p>{room.status} · {formatCurrency(room.rate)}</p>
                {room.status === "dirty" && <button type="button" className="text-xs mt-1 text-brand-700" onClick={() => hotelAPI.setRoomStatus(room._id, { status: "cleaning" }).then(load)}>Start clean</button>}
                {room.status === "cleaning" && <button type="button" className="text-xs mt-1 text-brand-700" onClick={() => hotelAPI.setRoomStatus(room._id, { status: "vacant" }).then(load)}>Mark vacant</button>}
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-brand-100 space-y-2">
            <h3 className="text-sm font-semibold">Company / agent rates</h3>
            <input className="input-field" placeholder="Plan name (Nabil, Himalayan Treks)" value={planName} onChange={(e) => setPlanName(e.target.value)} />
            <select className="input-field" value={planKind} onChange={(e) => setPlanKind(e.target.value)}>
              <option value="company">Company</option>
              <option value="travel_agent">Travel agent</option>
              <option value="group">Group</option>
            </select>
            <select className="input-field" value={planMode} onChange={(e) => setPlanMode(e.target.value)}>
              <option value="fixed">Fixed nightly NPR</option>
              <option value="percent_off">Percent off rack</option>
            </select>
            {planMode === "percent_off" ? (
              <input className="input-field" type="number" min={0} max={100} value={planOff} onChange={(e) => setPlanOff(e.target.value)} placeholder="% off" />
            ) : (
              <input className="input-field" type="number" min={0} value={planRate} onChange={(e) => setPlanRate(e.target.value)} placeholder="Nightly NPR" />
            )}
            <input className="input-field" placeholder="Room type (blank = all)" value={planRoomType} onChange={(e) => setPlanRoomType(e.target.value)} />
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => hotelAPI.saveRatePlan({
                name: planName,
                kind: planKind,
                mode: planMode,
                nightlyRate: Number(planRate) || 0,
                percentOff: Number(planOff) || 0,
                roomType: planRoomType,
              }).then(() => { toast.success("Rate plan saved"); setPlanName(""); load(); }).catch((e) => toast.error(e.response?.data?.message || "Could not save plan"))}
            >
              Save plan
            </button>
            <ul className="text-xs text-brand-600 space-y-1">
              {ratePlans.map((plan) => (
                <li key={plan._id}>{plan.name} · {plan.kind.replace("_", " ")} · {plan.mode === "percent_off" ? `${plan.percentOff}% off` : formatCurrency(plan.nightlyRate)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div id="hotel-reserve" className="card p-4 space-y-3">
          <h2 className="font-semibold">Reservation</h2>
          <p className="text-xs text-brand-500">Hold a room. Name and phone now; ID and address at arrival if still missing.</p>
          <GuestFields value={reserveGuest} onChange={setReserveGuest} onLookup={(phone) => fillGuest(phone, setReserveGuest)} />
          <select className="input-field" value={reserveRoomId} onChange={(e) => setReserveRoomId(e.target.value)}>
            <option value="">Room to hold</option>
            {rooms.map((r) => <option key={r._id} value={r._id}>{r.number} · {r.type}</option>)}
          </select>
          <label className="label">Expected check-in</label>
          <DateInput className="input-field" value={arriveOn} onChange={setArriveOn} required />
          <RatePlanSelect
            plans={ratePlans}
            room={rooms.find((r) => r._id === reserveRoomId) || null}
            value={reservePlanId}
            onChange={setReservePlanId}
          />
          <MealPlanSelect value={reserveMeal} onChange={setReserveMeal} />
          <label className="label">Nights</label>
          <input className="input-field" type="number" min={1} value={reserveNights} onChange={(e) => setReserveNights(e.target.value)} />
          {arriveOn && <p className="text-xs text-brand-500">Due out {formatDate(addDaysISO(Number(reserveNights) || 1, arriveOn))}</p>}
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (!requireGuest(reserveGuest, false)) return;
              hotelAPI.reserve({
                ...reserveGuest,
                roomId: reserveRoomId,
                checkIn: arriveOn,
                nights: Number(reserveNights) || 1,
                ratePlanId: reservePlanId || undefined,
                mealPlan: reserveMeal,
              }).then(() => {
                toast.success("Room held");
                setReserveGuest(EMPTY_GUEST);
                setReservePlanId("");
                setReserveMeal("room_only");
                load();
              }).catch((e) => toast.error(e.response?.data?.message || "Could not hold room"));
            }}
          >
            Hold room
          </button>
        </div>

        <div id="hotel-checkin" className="card p-4 space-y-3">
          <h2 className="font-semibold">Walk-in check-in</h2>
          <p className="text-xs text-brand-500">Name, phone, ID/passport, nationality and address are required. Check-in issues a 13% VAT invoice on room rent (shop VAT setting).</p>
          <GuestFields value={walkInGuest} onChange={setWalkInGuest} idRequired onLookup={(phone) => fillGuest(phone, setWalkInGuest)} />
          <select className="input-field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Open room tonight</option>
            {walkInRooms.map((r) => <option key={r._id} value={r._id}>{r.number}</option>)}
          </select>
          <RatePlanSelect
            plans={ratePlans}
            room={rooms.find((r) => r._id === roomId) || null}
            value={walkInPlanId}
            onChange={setWalkInPlanId}
          />
          <MealPlanSelect value={walkInMeal} onChange={setWalkInMeal} />
          <label className="label">Nights</label>
          <input className="input-field" type="number" min={1} value={nights} onChange={(e) => setNights(e.target.value)} />
          <button type="button" className="btn-primary" onClick={() => {
            if (!requireGuest(walkInGuest, true)) return;
            hotelAPI.checkIn({ ...walkInGuest, roomId, nights: Number(nights) || 1, ratePlanId: walkInPlanId || undefined, mealPlan: walkInMeal })
              .then(() => { toast.success("Checked in"); setWalkInGuest(EMPTY_GUEST); setWalkInPlanId(""); setWalkInMeal("room_only"); load(); })
              .catch((e) => toast.error(e.response?.data?.message || "Check-in failed"));
          }}>Check in</button>
        </div>
      </div>

      {selectedStay && (
        <div id="hotel-guest" className="card mt-6 p-4 space-y-3">
          <h2 className="font-semibold">Guest record · {selectedStay.room?.number || "room"} · {selectedStay.status.replace(/_/g, " ")}</h2>
          <GuestFields value={selectedGuest} onChange={setSelectedGuest} idRequired={selectedStay.status === "checked_in" || selectedStay.status === "reserved"} onLookup={(phone) => fillGuest(phone, setSelectedGuest)} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Second guest (optional)</label>
              <input className="input-field" value={secondGuestName} onChange={(e) => setSecondGuestName(e.target.value)} />
            </div>
            <div>
              <label className="label">Second guest phone</label>
              <input className="input-field" value={secondGuestPhone} onChange={(e) => setSecondGuestPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => hotelAPI.updateGuest(selectedStay._id, { ...selectedGuest, secondGuestName, secondGuestPhone })
                .then(() => { toast.success("Guest saved"); load(); })
                .catch((e) => toast.error(e.response?.data?.message || "Could not save guest"))}
            >
              Save guest
            </button>
            {selectedStay.status === "reserved" && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (!requireGuest(selectedGuest, true)) return;
                  hotelAPI.arrive(selectedStay._id, selectedGuest)
                    .then(() => { toast.success("Checked in"); load(); })
                    .catch((e) => toast.error(e.response?.data?.message || "Arrive failed"));
                }}
              >
                Arrive with this record
              </button>
            )}
          </div>
          {(selectedStay.status === "reserved" || selectedStay.status === "checked_in") && (
            <div className="grid sm:grid-cols-3 gap-3 pt-3 border-t border-brand-100">
              <div>
                <label className="label">Extra nights</label>
                <div className="flex gap-2">
                  <input className="input-field" type="number" min={1} value={extraNights} onChange={(e) => setExtraNights(e.target.value)} />
                  <button type="button" className="btn-secondary" onClick={() => hotelAPI.extendStay(selectedStay._id, { nights: Number(extraNights) || 1 }).then(() => { toast.success("Stay extended"); load(); }).catch((e) => toast.error(e.response?.data?.message || "Extend failed"))}>Extend</button>
                </div>
              </div>
              <div>
                <label className="label">Move room</label>
                <div className="flex gap-2">
                  <select className="input-field" value={moveRoomId} onChange={(e) => setMoveRoomId(e.target.value)}>
                    <option value="">Room</option>
                    {rooms.filter((r) => r.status !== "ooo" && r.status !== "occupied").map((r) => (
                      <option key={r._id} value={r._id}>{r.number}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary" onClick={() => hotelAPI.moveStay(selectedStay._id, { roomId: moveRoomId, useNewRate: true }).then(() => { toast.success("Room changed"); load(); }).catch((e) => toast.error(e.response?.data?.message || "Move failed"))}>Move</button>
                </div>
              </div>
              <div>
                <label className="label">Nightly rate</label>
                <div className="flex gap-2">
                  <input className="input-field" type="number" min={0} value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder={String(selectedStay.rate ?? "")} />
                  <button type="button" className="btn-secondary" onClick={() => hotelAPI.changeRate(selectedStay._id, { rate: Number(newRate) }).then(() => { toast.success("Rate updated"); load(); }).catch((e) => toast.error(e.response?.data?.message || "Rate failed"))}>Update</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedStay?.folio?._id && (
        <div className="card mt-6 p-4">
          <FolioPanel folioId={selectedStay.folio._id} onChanged={load} />
        </div>
      )}

      <div className="card mt-6 overflow-x-auto">
        <h2 className="font-semibold p-4">Stays</h2>
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Guest</th>
              <th className="table-header">ID</th>
              <th className="table-header">Room</th>
              <th className="table-header">Rate</th>
              <th className="table-header">In / due out</th>
              <th className="table-header">VAT invoice</th>
              <th className="table-header">Folio</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {stays.map((stay) => (
              <tr key={stay._id} className={selectedStayId === stay._id ? "bg-brand-50" : ""}>
                <td className="table-cell">
                  <button type="button" className="text-left" onClick={() => setSelectedStayId(stay._id)}>
                    <span className="font-medium">{stay.guestName}</span>
                    <span className="block text-xs text-brand-500">{stay.guestPhone || "No phone"} · {stay.status.replace(/_/g, " ")}</span>
                  </button>
                </td>
                <td className="table-cell text-sm">
                  {stay.guestIdNumber ? `${stay.guestIdType || "ID"} ${stay.guestIdNumber}` : "—"}
                  {stay.guestNationality ? <span className="block text-xs text-brand-500">{stay.guestNationality}</span> : null}
                </td>
                <td className="table-cell">{stay.room?.number}</td>
                <td className="table-cell text-sm">
                  {formatCurrency(stay.rate || 0)}
                  <span className="block text-xs text-brand-500">{stay.ratePlan?.name || stay.rateKind || "rack"}</span>
                </td>
                <td className="table-cell text-sm text-brand-600">
                  {stay.occupyStart ? formatDate(stay.occupyStart) : "—"}
                  {" → "}
                  {stay.occupyEnd ? formatDate(stay.occupyEnd) : "—"}
                </td>
                <td className="table-cell text-sm">
                  {stay.roomSale?._id ? (
                    <a href={`/sales/${stay.roomSale._id}/print`} className="text-brand-800 hover:underline" target="_blank" rel="noreferrer">
                      {stay.roomSale.invoiceNumber}
                      <span className="block text-xs text-brand-500">{formatCurrency(stay.roomSale.total)} · VAT {formatCurrency(stay.roomSale.vatAmount || 0)}</span>
                    </a>
                  ) : stay.status === "checked_in" ? "—" : ""}
                </td>
                <td className="table-cell">{formatCurrency(stay.folio?.balance || 0)}</td>
                <td className="table-cell whitespace-nowrap">
                  {stay.status === "reserved" && (
                    <>
                      <button type="button" className="text-sm text-brand-700 mr-2" onClick={() => {
                        setSelectedStayId(stay._id);
                        const guest = guestFromStay(stay);
                        if (guestGaps(guest, true).length) {
                          document.getElementById("hotel-guest")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          toast.error("Complete ID, nationality and address, then Arrive");
                          return;
                        }
                        hotelAPI.arrive(stay._id, guest).then(() => { toast.success("Checked in"); load(); }).catch((e) => toast.error(e.response?.data?.message || "Arrive failed"));
                      }}>Arrive</button>
                      <button type="button" className="text-sm text-brand-700 mr-2" onClick={() => {
                        const charge = window.confirm("Charge one night as a cancellation fee? Cancel for OK, skip fee with Cancel.");
                        hotelAPI.cancelStay(stay._id, { feeNights: charge ? 1 : 0 })
                          .then(() => { toast.success(charge ? "Cancelled with 1-night fee" : "Cancelled"); load(); })
                          .catch((e) => toast.error(e.response?.data?.message || "Cancel failed"));
                      }}>Cancel</button>
                      {stay.occupyStart && stay.occupyStart <= today && (
                        <button type="button" className="text-sm text-rose-700" onClick={() => {
                          const charge = window.confirm("Charge one night no-show fee?");
                          hotelAPI.noShow(stay._id, { feeNights: charge ? 1 : 0 })
                            .then(() => { toast.success("Marked no-show"); load(); })
                            .catch((e) => toast.error(e.response?.data?.message || "No-show failed"));
                        }}>No-show</button>
                      )}
                    </>
                  )}
                  {stay.status === "checked_in" && (
                    <button type="button" className="text-sm" onClick={() => {
                      const late = window.confirm("Late checkout? OK = half night, then you can still collect.") ? "half" : "none";
                      hotelAPI.checkOut(stay._id, { late, creditUnused: true })
                        .then(() => { toast.success("Checked out"); load(); })
                        .catch((e) => toast.error(e.response?.data?.message || "Checkout failed"));
                    }}>Check out</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-6 p-4 space-y-3">
        <h2 className="font-semibold">Channel inbox</h2>
        <p className="text-sm text-brand-500">Website bookings and pasted OTA reservations land here. Import to hold a room; guest still Arrives on the day. Live Booking.com login is not wired.</p>
        {user?.tenantSlug ? (
          <p className="text-sm">
            Guest booking page:{" "}
            <a className="text-brand-800 underline" href={`/book/${user.tenantSlug}`} target="_blank" rel="noreferrer">
              {typeof window !== "undefined" ? `${window.location.origin}/book/${user.tenantSlug}` : `/book/${user.tenantSlug}`}
            </a>
          </p>
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const name = prompt("Guest name");
            if (!name) return;
            const checkIn = prompt("Check-in YYYY-MM-DD", new Date().toISOString().slice(0, 10));
            const checkOut = prompt("Check-out YYYY-MM-DD");
            hotelAPI.createChannel({ channel: "Booking.com", guestName: name, checkIn, checkOut }).then(load);
          }}
        >
          Add reservation
        </button>
        {channel.map((row) => (
          <div key={row._id} className="flex justify-between text-sm border-b py-2">
            <span>{row.channel} · {row.guestName} · {row.status}</span>
            {row.status === "pending" && (
              <span className="flex gap-2">
                <select value={importRoom} onChange={(e) => setImportRoom(e.target.value)}>
                  <option value="">Room</option>
                  {rooms.map((r) => <option key={r._id} value={r._id}>{r.number}</option>)}
                </select>
                <button type="button" onClick={() => hotelAPI.importChannel(row._id, { roomId: importRoom }).then(load).catch((e) => toast.error(e.response?.data?.message || "Import failed"))}>Import</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
