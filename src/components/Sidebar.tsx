"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-neutral-800 p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:flex">
      <span className="mb-4 px-2 text-lg font-semibold tracking-tight">Triptales</span>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3 py-2 text-sm ${
            pathname === item.href ? "bg-neutral-800 font-medium" : "text-neutral-400 hover:bg-neutral-900"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </aside>
  );
}
