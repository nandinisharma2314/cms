"use client";

import { useEffect } from"react";
import { useRouter } from"next/navigation";
import { CivicLogo } from"./Login/CivicLogo";

export function SplashScreen() {
 const router = useRouter();

 useEffect(() => {
 const timer = setTimeout(() => {
 router.push("/login");
 }, 1800);
 return () => clearTimeout(timer);
 }, [router]);

 return (
 <div
 className="splash-container"
 onClick={() => router.push("/login")}
 style={{ cursor:"pointer" }}
 >
 <div className="logo-wrapper">
 <div className="splash-logo-card">
 <CivicLogo size={64} showText={false} />
 </div>
 <h1 className="app-title">CivicCare</h1>
 <p className="app-subtitle">Your Voice Makes a Better Tomorrow</p>
 <div className="splash-loader-bar">
 <div className="splash-loader-progress" />
 </div>
 </div>
 </div>
 );
}
