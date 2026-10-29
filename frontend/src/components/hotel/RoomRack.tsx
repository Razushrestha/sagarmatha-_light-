"use client";

import { formatDate } from "@/lib/utils";
import { addDaysISO, todayISO } from "@/lib/nepaliDate";
import { cn } from "@/lib/utils";

export type RackStay = {
  stayId: string;
  roomId: string;
  roomNumber: string;
  guestName: string;
  status: string;
  start: string;
  end: string;
  folioBalance?: number;
};

export type RackEvent = {
  date: string;
  guestName: string;
  roomNumber?: string;
  status?: string;
  channel?: string;
  kind?: string;
  folioBalance?: number;
};

export type RackRoom = { _id: string; number: string; type: string; rate: number; status: string };

export type RackData = {
  today?: string;
  from: string;
  days: number;
  dates: string[];
  rooms: RackRoom[];
  stays: RackStay[];
  arrivals: RackEvent[];
  departures: RackEvent[];
  pending?: Array<{ guestName: string; channel: string; start: string }>;
};

function weekday(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-NP", { weekday: "short" });
}

function dayNum(ymd: string) {
  return ymd.slice(8, 10);
}

function occupy(stays: RackStay[], roomId: string, ymd: string) {
  return stays.find((stay) => String(stay.roomId) === String(roomId) && stay.start <= ymd && ymd < stay.end);
}

export default function RoomRack({
  data,
  from,
  onFromChange,
  selectedStayId,
  onSelectStay,
  onPickOpen,
}: {
  data: RackData | null;
  from: string;
  onFromChange: (next: string) => void;
  selectedStayId?: string;
  onSelectStay?: (stayId: string) => void;
  onPickOpen?: (roomId: string, date: string) => void;
}) {
  const today = data?.today || todayISO();
  const dates = data?.dates || Array.from({ length: 14 }, (_, i) => addDaysISO(i, from));
  const rooms = data?.rooms || [];
  const stays = data?.stays || [];
  const inHouse = stays.filter((s) => s.status === "checked_in" && s.start <= today && today < s.end).length;
  const arriveToday = (data?.arrivals || []).filter((row) => row.date === today).length;
  const leaveToday = (data?.departures || []).filter((row) => row.date === today).length;
  const vacantTonight = rooms.filter((room) => !occupy(stays, room._id, today)).length;
  const held = stays.filter((s) => s.status === "reserved").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => onFromChange(addDaysISO(-7, from))}>
          Previous week
        </button>
        <button type="button" className="btn-secondary" onClick={() => onFromChange(today)}>
          Today
        </button>
        <button type="button" className="btn-secondary" onClick={() => onFromChange(addDaysISO(7, from))}>
          Next week
        </button>
        <p className="text-sm text-brand-500">
          {formatDate(from)} – {formatDate(addDaysISO(dates.length - 1, from))}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Summary label="In house tonight" value={inHouse} />
        <Summary label="Arrivals today" value={arriveToday} />
        <Summary label="Departures today" value={leaveToday} />
        <Summary label="Held (this view)" value={held} />
        <Summary label="Vacant tonight" value={vacantTonight} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-brand-600">
        <Legend className="bg-emerald-100 border-emerald-200" label="In house" />
        <Legend className="bg-violet-100 border-violet-200" label="Held / reserved" />
        <Legend className="bg-sky-100 border-sky-200" label="Arriving" />
        <Legend className="bg-amber-100 border-amber-200" label="Departing morning" />
        <Legend className="bg-rose-50 border-rose-200" label="Dirty / cleaning" />
        <Legend className="bg-white border-brand-200" label="Open" />
      </div>

      {rooms.length === 0 ? (
        <div className="card p-6 text-sm text-brand-500">Add rooms below to see the rack.</div>
      ) : (
        <div className="card overflow-auto max-h-[min(70vh,640px)]">
          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-brand-50 table-header min-w-[7rem]">Room</th>
                {dates.map((ymd) => (
                  <th
                    key={ymd}
                    className={cn(
                      "table-header text-center min-w-[4.5rem] px-1",
                      ymd === today && "bg-brand-900 text-white"
                    )}
                  >
                    <div className="font-semibold">{weekday(ymd)}</div>
                    <div>{dayNum(ymd)}</div>
                    <div className="font-normal opacity-80 normal-case tracking-normal">{formatDate(ymd)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room._id} className="border-b border-brand-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-brand-100 align-top">
                    <p className="font-semibold text-sm text-brand-900">{room.number}</p>
                    <p className="text-[11px] text-brand-500">{room.type}</p>
                    {(room.status === "dirty" || room.status === "cleaning") && (
                      <p className="text-[11px] text-rose-700 capitalize mt-0.5">{room.status}</p>
                    )}
                  </td>
                  {dates.map((ymd) => {
                    const stay = occupy(stays, room._id, ymd);
                    const reserved = stay?.status === "reserved";
                    const arriving = stay && stay.start === ymd;
                    const lastNight = stay && stay.end === addDaysISO(1, ymd);
                    const hk = !stay && ymd === today && (room.status === "dirty" || room.status === "cleaning");
                    const canOpen = !stay && ymd >= today;
                    return (
                      <td key={ymd} className="p-0.5 border-l border-brand-50">
                        <button
                          type="button"
                          disabled={!stay && !canOpen}
                          onClick={() => {
                            if (stay) onSelectStay?.(stay.stayId);
                            else if (canOpen) onPickOpen?.(room._id, ymd);
                          }}
                          className={cn(
                            "w-full min-h-[3.25rem] rounded px-1 py-1 text-left leading-tight",
                            !stay && "bg-white text-brand-300",
                            stay && !reserved && "bg-emerald-100 text-emerald-950",
                            reserved && "bg-violet-100 text-violet-950",
                            arriving && !reserved && "bg-sky-100 text-sky-950",
                            lastNight && stay && !reserved && "bg-amber-100 text-amber-950",
                            hk && "bg-rose-50 text-rose-800",
                            stay?.stayId === selectedStayId && "ring-2 ring-brand-900",
                            canOpen && "hover:bg-brand-50 text-brand-700"
                          )}
                        >
                          {stay ? (
                            <>
                              <span className="block font-medium truncate">{stay.guestName}</span>
                              <span className="block text-[10px] opacity-80">
                                {reserved
                                  ? arriving
                                    ? "Held · due in"
                                    : "Held"
                                  : arriving
                                    ? "Arriving"
                                    : lastNight
                                      ? "Out tomorrow"
                                      : "In house"}
                              </span>
                            </>
                          ) : hk ? (
                            <span className="capitalize">{room.status}</span>
                          ) : canOpen ? (
                            <span>{ymd === today ? "Open · check in" : "Open · hold"}</span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <EventList title="Arrivals this view" empty="No arrivals in these dates." rows={data?.arrivals || []} kind="in" />
        <EventList title="Departures this view" empty="No departures in these dates." rows={data?.departures || []} kind="out" />
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-brand-500">{label}</p>
      <p className="text-xl font-semibold text-brand-900">{value}</p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-3.5 h-3.5 rounded border", className)} />
      {label}
    </span>
  );
}

function EventList({
  title,
  empty,
  rows,
  kind,
}: {
  title: string;
  empty: string;
  rows: RackEvent[];
  kind: "in" | "out";
}) {
  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-brand-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-brand-50 text-sm">
          {rows.map((row, i) => (
            <li key={`${row.date}-${row.guestName}-${i}`} className="py-2 flex justify-between gap-3">
              <span>
                <span className="font-medium text-brand-900">{row.guestName}</span>
                <span className="text-brand-500">
                  {" "}
                  · {row.roomNumber || row.channel || (kind === "in" ? "No room yet" : "")}
                  {row.status === "reserved" ? " · held" : ""}
                </span>
              </span>
              <span className="text-brand-500 shrink-0">{formatDate(row.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
