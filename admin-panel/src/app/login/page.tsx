import { Suspense } from "react";
import { LoginFlow } from "@/components/portal/Login/LoginFlow";
import { ConfigProvider } from "@/lib/portalConfig";

export default function LoginPage() {
  return (
    <ConfigProvider>
      <Suspense>
        <LoginFlow />
      </Suspense>
    </ConfigProvider>
  );
}
