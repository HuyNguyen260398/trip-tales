export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Trips" },
  { href: "/settings", label: "Settings" },
];
