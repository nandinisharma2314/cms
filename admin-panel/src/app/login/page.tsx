import { Suspense } from "react";
import { AdminLogin } from "@/components/AdminLogin";

export default function LoginPage() {
  return (
    <Suspense>
      <AdminLogin />
    </Suspense>
  );
}
