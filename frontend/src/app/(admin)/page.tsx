import { DashboardView } from "@/components/DashboardView";
import { StaffMobileDashboard } from "@/components/StaffMobileDashboard";

export default function HomePage() {
  return (
    <>
      <div className="block md:hidden">
        <StaffMobileDashboard />
      </div>
      <div className="hidden md:block">
        <DashboardView />
      </div>
    </>
  );
}
