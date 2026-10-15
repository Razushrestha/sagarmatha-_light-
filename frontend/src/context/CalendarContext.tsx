"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { miscAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  CalendarType,
  readStoredCalendarType,
  setCalendarPreference,
} from "@/lib/nepaliDate";

interface CalendarContextType {
  calendarType: CalendarType;
  setCalendarType: (next: CalendarType) => void;
  companyName: string;
  setCompanyName: (next: string) => void;
}

const CalendarContext = createContext<CalendarContextType>({
  calendarType: "bs",
  setCalendarType: () => {},
  companyName: "",
  setCompanyName: () => {},
});

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [calendarType, setType] = useState<CalendarType>(() => readStoredCalendarType());
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    setCalendarPreference(calendarType);
  }, [calendarType]);

  useEffect(() => {
    if (!user) {
      setCompanyName("");
      return;
    }
    if (user.role === "platform_admin" && !user.impersonating) {
      setCompanyName(user.companyName || "");
      return;
    }
    setCompanyName(user.companyName || user.tenantName || "");
    miscAPI.getSettings()
      .then((res) => {
        const next = res.data.data?.calendarType === "ad" ? "ad" : "bs";
        setType(next);
        setCalendarPreference(next);
        const name = String(res.data.data?.companyName || "").trim();
        if (name) setCompanyName(name);
      })
      .catch(() => {});
  }, [user]);

  const setCalendarType = (next: CalendarType) => {
    const value = next === "ad" ? "ad" : "bs";
    setType(value);
    setCalendarPreference(value);
  };

  return (
    <CalendarContext.Provider value={{ calendarType, setCalendarType, companyName, setCompanyName }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  return useContext(CalendarContext);
}
