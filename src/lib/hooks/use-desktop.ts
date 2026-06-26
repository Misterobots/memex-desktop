"use client";
import { useEffect, useState } from "react";
import { isDesktop, desktop, type MemexBridge } from "../desktop";

export function useDesktop(): { inDesktop: boolean; bridge: MemexBridge | null } {
  const [inDesktop, setInDesktop] = useState(false);
  useEffect(() => { setInDesktop(isDesktop()); }, []);
  return { inDesktop, bridge: inDesktop ? desktop() : null };
}
