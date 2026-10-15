"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { miscAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  CalendarType,
  getCalendarType,
  readStoredCalendarType,
  setCalendarPreference,
} from "@/lib/nepaliDate";

interface CalendarContextType {
  calendarType: CalendarType;
  setCalendarType: (next: CalendarType) => void;
}

const CalendarContext = createContext<CalendarContextType>({
  calendarType: "bs",
  setCalendarType: () => {},
});

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [calendarType, setType] = useState<CalendarType>(() => readStoredCalendarType());

  useEffect(() => {
    setCalendarPreference(calendarType);
  }, [calendarType]);

  useEffect(() => {
    if (!user) return;
    miscAPI.getSettings()
      .then((res) => {
        const next = res.data.data?.calendarType === "ad" ? "ad" : "bs";
        setType(next);
        setCalendarPreference(next);
      })
      .catch(() => {});
  }, [user]);

  const setCalendarType = (next: CalendarType) => {
    const value = next === "ad" ? "ad" : "bs";
    setType(value);
    setCalendarPreference(value);
  };

  return (
    <CalendarContext.Provider value={{ calendarType, setCalendarType }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  return useContext(CalendarContext);
}

export { getCalendarType };
