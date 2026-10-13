import { DashboardView } from "@/components/DashboardView";
import { StaffMobileDashboard } from "@/components/StaffMobileDashboard";

export default function HomePage() {
  return (
    <>
      <div className="block lg:hidden">
        <StaffMobileDashboard />
      </div>
      <div className="hidden lg:flex flex-col gap-5">
        <DashboardView />
      </div>
    </>
  );
}
