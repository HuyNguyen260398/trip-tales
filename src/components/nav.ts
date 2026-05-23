export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Trips" },
  // M6 adds: { href: "/settings", label: "Settings" },
];
