import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:min-h-dvh">
      <Sidebar />
      <div className="flex-1 pb-[max(4rem,env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
