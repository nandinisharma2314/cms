import React from"react";

export function CivicLogo({
 size = 52,
 showText = true,
 idPrefix ="logo_",
}: {
 size?: number;
 showText?: boolean;
 idPrefix?: string;
}) {
 const p = idPrefix;

 return (
 <div className="civic-logo-container">
 <svg
 width={size}
 height={size}
 viewBox="0 0 64 64"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 className="civic-logo-svg"
 >
 <defs>
 <linearGradient
 id={`${p}leftLeafGrad`}
 x1="14"
 y1="25"
 x2="30"
 y2="45"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#34d399" />
 <stop offset="100%" stopColor="#0ea5e9" />
 </linearGradient>
 <linearGradient
 id={`${p}rightLeafGrad`}
 x1="34"
 y1="25"
 x2="50"
 y2="45"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#2563eb" />
 <stop offset="100%" stopColor="#1d4ed8" />
 </linearGradient>
 </defs>

 {/* Top circle / head */}
 <circle cx="32" cy="13" r="6" fill="#2563eb" />

 {/* Left leaf (Emerald to cyan gradient) */}
 <path
 d="M30 25C19 25 13 33 15 44C21 44 30 40 30 25Z"
 fill={`url(#${p}leftLeafGrad)`}
 />

 {/* Right leaf (Civic blue) */}
 <path
 d="M34 25C45 25 51 33 49 44C43 44 34 40 34 25Z"
 fill={`url(#${p}rightLeafGrad)`}
 />

 {/* Center stem subtle highlight */}
 <path
 d="M32 30V43"
 stroke="#ffffff"
 strokeWidth="2.5"
 strokeLinecap="round"
 strokeOpacity="0.5"
 />
 </svg>

 {showText && (
 <div className="civic-logo-text">
 <h1 className="civic-brand-name">CivicCare</h1>
 <p className="civic-brand-tagline">Complaint Management System</p>
 </div>
 )}
 </div>
 );
}
