"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { authAPI } from "@/lib/api";
import { UserCog } from "lucide-react";

interface StaffUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive?: boolean;
}

export default function EmployeesPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authAPI.getUsers()
      .then((res) => setStaff(res.data.data || []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <PageHeader title="Employees" />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Email</th>
              <th className="table-header">Phone</th>
              <th className="table-header">Role</th>
              <th className="table-header">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              <tr><td colSpan={5} className="table-cell"><div className="h-10 bg-brand-50 animate-pulse rounded" /></td></tr>
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-cell text-center py-12 text-gray-400">
                  <UserCog className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  No employees found
                </td>
              </tr>
            ) : staff.map((person) => (
              <tr key={person._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium">{person.name}</td>
                <td className="table-cell">{person.email}</td>
                <td className="table-cell">{person.phone || "-"}</td>
                <td className="table-cell capitalize">{person.role.replace(/_/g, " ")}</td>
                <td className="table-cell">{person.isActive === false ? "Inactive" : "Active"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
