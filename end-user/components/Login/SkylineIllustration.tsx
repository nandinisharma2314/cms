import React from"react";

export function SkylineIllustration({
 idPrefix ="sky_",
}: {
 idPrefix?: string;
}) {
 const p = idPrefix;

 return (
 <div className="skyline-illustration-wrapper">
 <svg
 viewBox="0 0 380 200"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 className="skyline-svg"
 preserveAspectRatio="xMidYMid meet"
 >
 <defs>
 {/* Sky Gradient */}
 <linearGradient
 id={`${p}skyGrad`}
 x1="0"
 y1="0"
 x2="0"
 y2="200"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#f0f9ff" stopOpacity="0.9" />
 <stop offset="55%" stopColor="#e0f2fe" stopOpacity="0.4" />
 <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
 </linearGradient>

 {/* Distant building gradient */}
 <linearGradient
 id={`${p}distGrad`}
 x1="0"
 y1="50"
 x2="0"
 y2="160"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#bfdbfe" stopOpacity="0.55" />
 <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.25" />
 </linearGradient>

 {/* Mid building gradient */}
 <linearGradient
 id={`${p}midGrad`}
 x1="0"
 y1="40"
 x2="0"
 y2="160"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
 <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.35" />
 </linearGradient>

 {/* Front building gradient */}
 <linearGradient
 id={`${p}frontGrad`}
 x1="0"
 y1="45"
 x2="0"
 y2="160"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#2563eb" stopOpacity="0.95" />
 <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.45" />
 </linearGradient>

 {/* Lake Water gradient */}
 <linearGradient
 id={`${p}waterGrad`}
 x1="160"
 y1="140"
 x2="380"
 y2="195"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.75" />
 <stop offset="50%" stopColor="#7dd3fc" stopOpacity="0.6" />
 <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
 </linearGradient>

 {/* Park Lawn gradient */}
 <linearGradient
 id={`${p}lawnGrad`}
 x1="0"
 y1="135"
 x2="0"
 y2="190"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
 <stop offset="100%" stopColor="#059669" stopOpacity="1" />
 </linearGradient>

 {/* Tree gradients */}
 <linearGradient id={`${p}tree1`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="#34d399" />
 <stop offset="100%" stopColor="#059669" />
 </linearGradient>
 <linearGradient id={`${p}tree2`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="#10b981" />
 <stop offset="100%" stopColor="#047857" />
 </linearGradient>
 <linearGradient id={`${p}tree3`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="#6ee7b7" />
 <stop offset="100%" stopColor="#10b981" />
 </linearGradient>

 {/* Badge shadow filter */}
 <filter
 id={`${p}badgeShadow`}
 x="-30%"
 y="-30%"
 width="160%"
 height="160%"
 >
 <feDropShadow
 dx="0"
 dy="3"
 stdDeviation="3.5"
 floodColor="#0284c7"
 floodOpacity="0.22"
 />
 </filter>
 </defs>

 {/* Sky Background */}
 <rect width="380" height="200" fill={`url(#${p}skyGrad)`} rx="14" />

 {/* Soft Background Clouds */}
 <ellipse
 cx="60"
 cy="85"
 rx="35"
 ry="12"
 fill="#ffffff"
 fillOpacity="0.6"
 />
 <ellipse
 cx="320"
 cy="80"
 rx="40"
 ry="14"
 fill="#ffffff"
 fillOpacity="0.55"
 />

 {/* Distant background buildings */}
 <rect
 x="25"
 y="80"
 width="22"
 height="70"
 rx="2"
 fill={`url(#${p}distGrad)`}
 />
 <rect
 x="52"
 y="95"
 width="18"
 height="55"
 rx="1.5"
 fill={`url(#${p}distGrad)`}
 />
 <rect
 x="315"
 y="65"
 width="26"
 height="85"
 rx="2"
 fill={`url(#${p}distGrad)`}
 />
 <rect
 x="345"
 y="85"
 width="20"
 height="65"
 rx="1.5"
 fill={`url(#${p}distGrad)`}
 />

 {/* Mid-ground skyline towers */}
 {/* Left tower */}
 <rect
 x="75"
 y="65"
 width="28"
 height="85"
 rx="2"
 fill={`url(#${p}midGrad)`}
 />
 {[0, 1, 2, 3, 4].map((r) => (
 <g key={`w1-${r}`}>
 <rect
 x="80"
 y={74 + r * 10}
 width="4"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.8"
 />
 <rect
 x="88"
 y={74 + r * 10}
 width="4"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.8"
 />
 <rect
 x="95"
 y={74 + r * 10}
 width="4"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.8"
 />
 </g>
 ))}

 {/* Slanted glass tower center-left */}
 <polygon
 points="110,150 110,70 135,50 135,150"
 fill={`url(#${p}midGrad)`}
 />
 <line
 x1="122"
 y1="58"
 x2="122"
 y2="150"
 stroke="#ffffff"
 strokeWidth="1"
 strokeOpacity="0.5"
 />

 {/* Tall skyscraper with spire (center) */}
 <rect
 x="145"
 y="55"
 width="34"
 height="95"
 rx="2"
 fill={`url(#${p}frontGrad)`}
 />
 <line
 x1="162"
 y1="36"
 x2="162"
 y2="55"
 stroke="#2563eb"
 strokeWidth="2"
 strokeLinecap="round"
 />
 <circle cx="162" cy="34" r="2.5" fill="#1d4ed8" />
 {[0, 1, 2, 3, 4, 5].map((r) => (
 <g key={`w2-${r}`}>
 <rect
 x="151"
 y={64 + r * 11}
 width="5"
 height="5"
 rx="1"
 fill="#ffffff"
 fillOpacity="0.85"
 />
 <rect
 x="160"
 y={64 + r * 11}
 width="5"
 height="5"
 rx="1"
 fill="#ffffff"
 fillOpacity="0.85"
 />
 <rect
 x="169"
 y={64 + r * 11}
 width="5"
 height="5"
 rx="1"
 fill="#ffffff"
 fillOpacity="0.85"
 />
 </g>
 ))}

 {/* Modern corporate tower (center-right) */}
 <rect
 x="188"
 y="70"
 width="32"
 height="80"
 rx="2"
 fill={`url(#${p}midGrad)`}
 />
 {[0, 1, 2, 3, 4].map((r) => (
 <g key={`w3-${r}`}>
 <rect
 x="194"
 y={78 + r * 10}
 width="4"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.75"
 />
 <rect
 x="202"
 y={78 + r * 10}
 width="4"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.75"
 />
 <rect
 x="210"
 y={78 + r * 10}
 width="4"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.75"
 />
 </g>
 ))}

 {/* Modern grid tower right */}
 <rect
 x="230"
 y="60"
 width="35"
 height="90"
 rx="2"
 fill={`url(#${p}frontGrad)`}
 />
 {[0, 1, 2, 3, 4, 5].map((r) => (
 <g key={`w4-${r}`}>
 <rect
 x="236"
 y={68 + r * 10}
 width="5"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.85"
 />
 <rect
 x="245"
 y={68 + r * 10}
 width="5"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.85"
 />
 <rect
 x="254"
 y={68 + r * 10}
 width="5"
 height="4"
 rx="0.5"
 fill="#ffffff"
 fillOpacity="0.85"
 />
 </g>
 ))}

 {/* Low-rise civic pavilion / glass atrium */}
 <rect
 x="190"
 y="125"
 width="60"
 height="26"
 rx="2"
 fill="#bfdbfe"
 fillOpacity="0.8"
 />
 <polygon points="188,125 220,118 252,125" fill="#93c5fd" />

 {/* --- Curved Lake / Waterfront (Right half) --- */}
 <path
 d="M 175 160 C 210 155, 270 155, 380 158 L 380 200 L 160 200 C 160 178, 168 165, 175 160 Z"
 fill={`url(#${p}waterGrad)`}
 />
 {/* Soft water wave ripples & reflections */}
 <path
 d="M 210 168 C 240 166, 270 170, 300 168"
 stroke="#ffffff"
 strokeWidth="1.5"
 strokeOpacity="0.65"
 strokeLinecap="round"
 />
 <path
 d="M 250 177 C 280 175, 320 179, 360 176"
 stroke="#ffffff"
 strokeWidth="1.5"
 strokeOpacity="0.55"
 strokeLinecap="round"
 />
 <path
 d="M 185 183 C 215 181, 245 185, 275 182"
 stroke="#ffffff"
 strokeWidth="1.2"
 strokeOpacity="0.45"
 strokeLinecap="round"
 />

 {/* --- Park Lawn Foreground (Left & Center) --- */}
 <path
 d="M 0 150 C 40 148, 100 146, 170 150 C 200 152, 230 157, 260 158 C 290 159, 340 158, 380 160 L 380 165 C 320 164, 250 164, 200 166 C 160 168, 140 185, 0 190 Z"
 fill={`url(#${p}lawnGrad)`}
 />
 <rect
 x="0"
 y="165"
 width="180"
 height="35"
 fill={`url(#${p}lawnGrad)`}
 />

 {/* --- Park Trees --- */}
 {/* Far left trees */}
 <ellipse cx="32" cy="148" rx="16" ry="20" fill={`url(#${p}tree2)`} />
 <ellipse cx="48" cy="144" rx="20" ry="24" fill={`url(#${p}tree1)`} />
 <ellipse cx="68" cy="150" rx="14" ry="18" fill={`url(#${p}tree3)`} />

 {/* Center park trees */}
 <ellipse cx="140" cy="154" rx="12" ry="16" fill={`url(#${p}tree2)`} />
 <ellipse cx="180" cy="150" rx="15" ry="19" fill={`url(#${p}tree1)`} />

 {/* Waterfront shoreline trees right */}
 <ellipse cx="280" cy="154" rx="14" ry="18" fill={`url(#${p}tree2)`} />
 <ellipse cx="298" cy="148" rx="17" ry="21" fill={`url(#${p}tree1)`} />
 <ellipse cx="320" cy="155" rx="15" ry="18" fill={`url(#${p}tree3)`} />

 {/* Tree trunks */}
 <rect x="46" y="162" width="4" height="10" rx="1" fill="#065f46" />
 <rect x="296" y="162" width="4" height="10" rx="1" fill="#065f46" />

 {/* Park Street Light */}
 <line
 x1="112"
 y1="140"
 x2="112"
 y2="168"
 stroke="#1e293b"
 strokeWidth="2"
 strokeLinecap="round"
 />
 <circle cx="112" cy="138" r="3.5" fill="#fef08a" />
 <circle cx="112" cy="138" r="6" fill="#fde047" fillOpacity="0.4" />

 {/* Park Bench */}
 <rect x="120" y="157" width="22" height="4" rx="1" fill="#1e3a8a" />
 <rect x="120" y="163" width="22" height="2" rx="0.5" fill="#1e3a8a" />
 <line
 x1="123"
 y1="165"
 x2="123"
 y2="171"
 stroke="#1e3a8a"
 strokeWidth="1.5"
 />
 <line
 x1="139"
 y1="165"
 x2="139"
 y2="171"
 stroke="#1e3a8a"
 strokeWidth="1.5"
 />

 {/* --- Arched Dotted Connecting Line in Sky --- */}
 <path
 d="M 98 100 C 130 52, 230 48, 275 108"
 stroke="#93c5fd"
 strokeWidth="1.8"
 strokeDasharray="4 4"
 strokeOpacity="0.85"
 fill="none"
 />

 {/* --- Floating Badges along the Arc --- */}
 {/* Badge 1 (Left): White pill with green leaf */}
 <g transform="translate(100, 90)" filter={`url(#${p}badgeShadow)`}>
 <circle cx="12" cy="12" r="13" fill="#ffffff" />
 <circle cx="12" cy="12" r="12" fill="#f0fdf4" />
 {/* Leaf Icon */}
 <path
 d="M 12 7 C 8 7 7 11 8 15 C 10 15 15 14 16 10 C 16 7 14 7 12 7 Z"
 fill="#10b981"
 />
 <path
 d="M 8 15 L 12 11"
 stroke="#047857"
 strokeWidth="1"
 strokeLinecap="round"
 />
 </g>

 {/* Badge 2 (Center-Top): Royal Blue pill with white shield */}
 <g transform="translate(186, 50)" filter={`url(#${p}badgeShadow)`}>
 <circle cx="13" cy="13" r="13" fill="#2563eb" />
 {/* White Shield Icon */}
 <path
 d="M 13 8 L 8 10.5 V 13.5 C 8 16.5 10.5 19 13 20 C 15.5 19 18 16.5 18 13.5 V 10.5 L 13 8 Z"
 fill="#ffffff"
 />
 <path
 d="M 11 13.5 L 12.5 15 L 15.5 11.5"
 stroke="#2563eb"
 strokeWidth="1.5"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </g>

 {/* Badge 3 (Right): White pill with purple/blue community icon */}
 <g transform="translate(262, 98)" filter={`url(#${p}badgeShadow)`}>
 <circle cx="13" cy="13" r="13" fill="#ffffff" />
 <circle cx="13" cy="13" r="12" fill="#eff6ff" />
 {/* 3 People Icon */}
 <circle cx="13" cy="9.5" r="2.2" fill="#4f46e5" />
 <path
 d="M 9.5 16.5 C 9.5 14 11 13 13 13 C 15 13 16.5 14 16.5 16.5"
 fill="#4f46e5"
 />
 <circle cx="8" cy="11" r="1.6" fill="#818cf8" />
 <path
 d="M 5.5 16.5 C 5.5 14.8 6.8 14.2 8 14.2"
 stroke="#818cf8"
 strokeWidth="1.2"
 strokeLinecap="round"
 fill="none"
 />
 <circle cx="18" cy="11" r="1.6" fill="#818cf8" />
 <path
 d="M 20.5 16.5 C 20.5 14.8 19.2 14.2 18 14.2"
 stroke="#818cf8"
 strokeWidth="1.2"
 strokeLinecap="round"
 fill="none"
 />
 </g>
 </svg>
 </div>
 );
}
