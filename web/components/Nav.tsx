"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/last-24h", label: "آخر 24 ساعة" },
  { href: "/ads", label: "تقرير الإعلانات" },
  { href: "/videos", label: "تقرير الفيديوهات" },
  { href: "/leads", label: "العملاء" },
  { href: "/settings", label: "الإعدادات" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <h1>تتبع الطلبات - Meta</h1>
      <nav>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
