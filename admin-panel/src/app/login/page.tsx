import { AdminLogin } from "@/components/AdminLogin";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Officer & Admin Login | CivicCare CMS",
  description: "Centralized login portal for CivicCare Complaint Management System administrators and municipal officers",
};

export default function LoginPage() {
  return <AdminLogin />;
}
