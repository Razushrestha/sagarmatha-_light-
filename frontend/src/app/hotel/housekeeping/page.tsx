"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { hotelAPI } from "@/lib/api";
import toast from "react-hot-toast";

type Room = {
  _id: string;
  number: string;
  type: string;
  status: string;
  notes?: string;
  assignedTo?: { _id: string; name: string } | string | null;
};
type Staff = { _id: string; name: string; role: string };

const FLOW: Record<string, { next: string; label: string } | null> = {
  dirty: { next: "cleaning", label: "Start clean" },
  cleaning: { next: "inspected", label: "Mark inspected" },
  inspected: { next: "vacant", label: "Release vacant" },
};

export default function HousekeepingPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [mine, setMine] = useState("all");

  const load = () => {
    hotelAPI.getRooms().then((r) => setRooms(r.data.data || [])).catch(() => {});
    hotelAPI.getStaff().then((r) => setStaff(r.data.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const assignedId = (room: Room) => (typeof room.assignedTo === "object" && room.assignedTo ? room.assignedTo._id : room.assignedTo) || "";
  const visible = rooms.filter((room) => mine === "all" || assignedId(room) === mine);

  const setStatus = (id: string, status: string, extra?: object) => {
    hotelAPI.setRoomStatus(id, { status, ...extra })
      .then(load)
      .catch((e) => toast.error(e.response?.data?.message || "Update failed"));
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Housekeeping"
        subtitle="Assigned rooms, inspect after clean, out-of-order / maintenance."
      />
      <div className="flex flex-wrap gap-2 mb-4">
        <select className="input-field w-56" value={mine} onChange={(e) => setMine(e.target.value)}>
          <option value="all">All rooms</option>
          {staff.map((person) => (
            <option key={person._id} value={person._id}>{person.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((room) => {
          const step = FLOW[room.status];
          const assignee = typeof room.assignedTo === "object" ? room.assignedTo?.name : staff.find((s) => s._id === room.assignedTo)?.name;
          return (
            <div key={room._id} className={`card p-4 ${room.status === "ooo" ? "border-rose-300 bg-rose-50" : ""}`}>
              <p className="font-semibold">{room.number}</p>
              <p className="text-sm text-brand-500 capitalize">{room.type} · {room.status === "ooo" ? "out of order" : room.status}</p>
              <p className="text-xs text-brand-500 mt-1">{assignee ? `Assigned: ${assignee}` : "Unassigned"}</p>
              <select
                className="input-field mt-2 text-xs"
                value={assignedId(room)}
                onChange={(e) => setStatus(room._id, room.status, { assignedTo: e.target.value || null })}
              >
                <option value="">Assign…</option>
                {staff.map((person) => (
                  <option key={person._id} value={person._id}>{person.name}</option>
                ))}
              </select>
              {step && (
                <button type="button" className="text-sm mt-2 text-brand-700" onClick={() => setStatus(room._id, step.next)}>
                  {step.label}
                </button>
              )}
              {room.status !== "occupied" && room.status !== "ooo" && (
                <button type="button" className="block text-sm mt-1 text-rose-700" onClick={() => setStatus(room._id, "ooo")}>
                  Out of order
                </button>
              )}
              {room.status === "ooo" && (
                <button type="button" className="block text-sm mt-1 text-brand-700" onClick={() => setStatus(room._id, "vacant")}>
                  Back in service
                </button>
              )}
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
