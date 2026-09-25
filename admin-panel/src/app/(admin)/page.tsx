import { DashboardView } from "@/components/DashboardView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | CivicCare Complaint Management System",
  description: "CivicCare Complaint Management System Super Admin Dashboard",
};

export default function HomePage() {
  return <DashboardView />;
}
