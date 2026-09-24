import React from"react";

export function MegaphoneArtwork({
 isMobile = false,
 className ="",
}: {
 isMobile?: boolean;
 className?: string;
}) {
 return (
 <div
 className={`megaphone-artwork-wrapper ${isMobile ?"mobile" :"desktop"} ${className}`}
 >
 <svg
 viewBox={isMobile ?"0 0 200 165" :"0 0 540 180"}
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 className="megaphone-svg"
 preserveAspectRatio="xMidYMid meet"
 >
 <defs>
 {/* Subtle Drop Shadow */}
 <filter id="megaShadow" x="-20%" y="-20%" width="140%" height="140%">
 <feDropShadow
 dx="0"
 dy="4"
 stdDeviation="5"
 floodColor="#0f172a"
 floodOpacity="0.25"
 />
 </filter>
 </defs>

 {/* ========================================================
 BACKGROUND CITY SKYLINE & TREES (Desktop Only)
 ======================================================== */}
 {!isMobile && (
 <g className="banner-city-group" transform="translate(190, 15)">
 {/* Distant Skyscrapers */}
 <rect
 x="70"
 y="35"
 width="22"
 height="120"
 rx="2"
 fill="#93c5fd"
 fillOpacity="0.45"
 />
 <rect
 x="96"
 y="10"
 width="30"
 height="145"
 rx="2"
 fill="#93c5fd"
 fillOpacity="0.5"
 />

 {/* Windows on tallest building */}
 <g fill="#ffffff" fillOpacity="0.75">
 <rect x="102" y="20" width="4" height="4" rx="1" />
 <rect x="110" y="20" width="4" height="4" rx="1" />
 <rect x="118" y="20" width="4" height="4" rx="1" />
 <rect x="102" y="30" width="4" height="4" rx="1" />
 <rect x="110" y="30" width="4" height="4" rx="1" />
 <rect x="118" y="30" width="4" height="4" rx="1" />
 <rect x="102" y="40" width="4" height="4" rx="1" />
 <rect x="110" y="40" width="4" height="4" rx="1" />
 <rect x="118" y="40" width="4" height="4" rx="1" />
 <rect x="102" y="52" width="4" height="4" rx="1" />
 <rect x="110" y="52" width="4" height="4" rx="1" />
 <rect x="118" y="52" width="4" height="4" rx="1" />
 <rect x="102" y="64" width="4" height="4" rx="1" />
 <rect x="110" y="64" width="4" height="4" rx="1" />
 <rect x="118" y="64" width="4" height="4" rx="1" />
 </g>

 <rect
 x="130"
 y="45"
 width="24"
 height="110"
 rx="2"
 fill="#93c5fd"
 fillOpacity="0.4"
 />
 <rect
 x="158"
 y="25"
 width="28"
 height="130"
 rx="2"
 fill="#93c5fd"
 fillOpacity="0.5"
 />
 <polygon
 points="172,12 168,25 176,25"
 fill="#93c5fd"
 fillOpacity="0.5"
 />

 <rect
 x="190"
 y="55"
 width="22"
 height="100"
 rx="2"
 fill="#93c5fd"
 fillOpacity="0.38"
 />
 <rect
 x="216"
 y="38"
 width="26"
 height="118"
 rx="2"
 fill="#93c5fd"
 fillOpacity="0.45"
 />
 <rect
 x="246"
 y="70"
 width="20"
 height="85"
 rx="2"
 fill="#93c5fd"
 fillOpacity="0.35"
 />

 {/* Lush Park Trees in Foreground of Skyline */}
 <circle cx="65" cy="145" r="18" fill="#10b981" />
 <circle cx="85" cy="140" r="22" fill="#059669" />
 <circle cx="110" cy="144" r="20" fill="#10b981" />
 <circle cx="135" cy="142" r="24" fill="#047857" />
 <circle cx="165" cy="138" r="26" fill="#10b981" />
 <circle cx="195" cy="142" r="22" fill="#059669" />
 <circle cx="225" cy="144" r="25" fill="#10b981" />
 <circle cx="255" cy="146" r="20" fill="#047857" />
 </g>
 )}

 {/* ========================================================
 MEGAPHONE WITH HAND ILLUSTRATION
 ======================================================== */}
 <g
 className="megaphone-hand-group"
 transform={
 isMobile ?"translate(15, -8) scale(0.9)" :"translate(55, -5)"
 }
 >
 {/* Main Megaphone + Hand Rotated 22 degrees upwards */}
 <g transform="rotate(22, 110, 85)">
 {/* Sound Waves radiating in front of horn */}
 <g
 stroke="#ffffff"
 strokeWidth="3.5"
 strokeLinecap="round"
 opacity="0.95"
 >
 <path d="M 24 68 A 24 24 0 0 0 24 102" fill="none" />
 <path d="M 14 56 A 38 38 0 0 0 14 114" fill="none" />
 <path d="M 4 44 A 54 54 0 0 0 4 126" fill="none" />
 </g>

 {/* Dark Blue Base Chamber */}
 <rect
 x="135"
 y="65"
 width="28"
 height="40"
 rx="10"
 fill="#1d4ed8"
 />
 {/* End Cap */}
 <ellipse cx="163" cy="85" rx="6" ry="18" fill="#1e3a8a" />

 {/* White Main Cone Expansion */}
 <path
 d="M 140 68 L 50 44 C 44 42 38 48 38 54 L 38 116 C 38 122 44 128 50 126 L 140 102 Z"
 fill="#ffffff"
 />
 {/* Cone lower soft shade */}
 <path
 d="M 140 85 L 38 85 L 38 116 C 38 122 44 128 50 126 L 140 102 Z"
 fill="#f1f5f9"
 />

 {/* Blue Flared Horn Mouth */}
 <ellipse cx="44" cy="85" rx="11" ry="43" fill="#2563eb" />
 <ellipse cx="42" cy="85" rx="8" ry="39" fill="#1d4ed8" />
 <ellipse cx="40" cy="85" rx="5" ry="32" fill="#1e3a8a" />

 {/* Megaphone Handle */}
 <rect
 x="115"
 y="100"
 width="14"
 height="44"
 rx="7"
 fill="#1e3a8a"
 />

 {/* Hand Clasping Handle */}
 <ellipse cx="114" cy="112" rx="7" ry="5" fill="#fef08a" />
 <rect
 x="108"
 y="112"
 width="22"
 height="7"
 rx="3.5"
 fill="#fef08a"
 />
 <rect
 x="107"
 y="120"
 width="23"
 height="7"
 rx="3.5"
 fill="#fed7aa"
 />
 <rect
 x="107"
 y="128"
 width="23"
 height="7"
 rx="3.5"
 fill="#fef08a"
 />
 <rect
 x="108"
 y="136"
 width="22"
 height="7"
 rx="3.5"
 fill="#fed7aa"
 />

 {/* Cuff / Sleeve */}
 <path d="M 100 148 L 132 148 L 136 172 L 96 172 Z" fill="#1e293b" />
 <rect x="98" y="146" width="36" height="5" rx="2" fill="#ffffff" />
 </g>
 </g>

 {/* ========================================================
 SCRIPT TAGLINE:"Your Voice Makes a Better Tomorrow"
 ======================================================== */}
 {!isMobile && (
 <g
 className="banner-script-tagline"
 transform="translate(430, 26) rotate(-5)"
 >
 <text
 x="0"
 y="0"
 fill="#1e3a8a"
 fontSize="20"
 fontFamily="'Caveat', 'Dancing Script', 'Brush Script MT', cursive, sans-serif"
 fontWeight="700"
 opacity="0.9"
 >
 Your Voice
 </text>
 <text
 x="14"
 y="22"
 fill="#1e3a8a"
 fontSize="20"
 fontFamily="'Caveat', 'Dancing Script', 'Brush Script MT', cursive, sans-serif"
 fontWeight="700"
 opacity="0.9"
 >
 Makes a
 </text>
 <text
 x="-8"
 y="44"
 fill="#1d4ed8"
 fontSize="21"
 fontFamily="'Caveat', 'Dancing Script', 'Brush Script MT', cursive, sans-serif"
 fontWeight="800"
 opacity="0.95"
 >
 Better Tomorrow
 </text>
 </g>
 )}
 </svg>
 </div>
 );
}
