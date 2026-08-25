"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { miscAPI, inventoryAPI } from "@/lib/api";
import { formatDateTime, cn } from "@/lib/utils";
import { Bell, CheckCheck } from "lucide-react";
import toast from "react-hot-toast";

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  isRead: boolean;
  createdAt: string;
}

const priorityColors: Record<string, string> = {
  critical: "border-l-brand-900 bg-brand-50",
  high: "border-l-brand-700 bg-brand-50",
  medium: "border-l-yellow-500 bg-yellow-50",
  low: "border-l-brand-500 bg-brand-50",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = () => miscAPI.getNotifications().then((r) => setNotifications(r.data.data));

  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    await inventoryAPI.markAllNotificationsRead();
    toast.success("All marked as read");
    load();
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <DashboardLayout>
      <PageHeader
        title="Notifications"
        action={
          unread > 0 && (
            <button onClick={markAllRead} className="btn-secondary flex items-center gap-2">
              <CheckCheck className="w-4 h-4" /> Mark All Read
            </button>
          )
        }
      />

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />No notifications
          </div>
        ) : notifications.map((n) => (
          <div
            key={n._id}
            className={cn(
              "card p-4 border-l-4 transition-all",
              priorityColors[n.priority] || "border-l-gray-300",
              !n.isRead && "shadow-card-hover"
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className={cn("font-medium", !n.isRead ? "text-gray-900" : "text-gray-600")}>{n.title}</p>
                <p className="text-sm text-gray-500 mt-1">{n.message}</p>
                <p className="text-xs text-gray-400 mt-2">{formatDateTime(n.createdAt)}</p>
              </div>
              {!n.isRead && <span className="w-2.5 h-2.5 rounded-full bg-brand-600 flex-shrink-0 mt-1" />}
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
