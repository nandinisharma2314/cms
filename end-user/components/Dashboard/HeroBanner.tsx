"use client";

import React from"react";
import { MegaphoneArtwork } from"./MegaphoneArtwork";

interface HeroBannerProps {
 onRegisterClick?: () => void;
  userName?: string;
}

export function HeroBanner({ onRegisterClick, userName = "User" }: HeroBannerProps) {
 return (
 <section className="relative w-full bg-gradient-to-r from-[#4F39F6] via-[#5b40f6] to-[#7851f5] overflow-hidden shadow-lg flex flex-col md:flex-row items-center justify-between px-6 md:px-12 py-6 md:py-12 min-h-[150px] md:min-h-[220px]">
 {/* Background Ambience / Glow circles */}
 <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
 <div className="absolute -top-[20%] -left-[5%] w-[400px] h-[400px] bg-white/10 blur-3xl" />
 <div className="absolute -bottom-[50%] right-[20%] w-[500px] h-[500px] bg-white/5 blur-3xl" />
 </div>

 {/* Left Content Column */}
 <div className="relative z-10 flex flex-col items-start gap-2 text-white max-w-lg w-full">
 <span className="text-sm font-medium text-white/90">Good Morning,</span>
 <h2 className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight mb-1">
 {userName}{""}
 <span role="img" aria-label="waving hand">
 👋
 </span>
 </h2>
 <p className="text-white/90 font-medium text-sm md:text-base mb-4">
 Together for a cleaner, safer and better community.
 </p>

 <button
 type="button"
 className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-white transition-colors font-semibold text-sm px-5 py-2.5 shadow-sm"
 onClick={onRegisterClick}
 >
 <span className="text-lg leading-none">+</span>
 <span>Register Complaint</span>
 </button>
 </div>

 {/* Center/Right Text (Handwritten style) */}
 <div className="hidden lg:block absolute left-[55%] top-[25%] -rotate-6 z-20">
 <p
 className="text-white/90 text-2xl font-caveat font-bold leading-tight"
 style={{ fontFamily:"cursive" }}
 >
 Small actions <br /> make a big <br /> difference
 </p>
 </div>

 {/* Right Artwork: City Park Illustration */}
 <div className="hidden md:block absolute bottom-0 right-0 z-10 w-[60%] h-full pointer-events-none opacity-90">
 <svg
 width="100%"
 height="100%"
 viewBox="0 0 800 220"
 preserveAspectRatio="none"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 {/* Distant Buildings */}
 <rect
 x="500"
 y="70"
 width="30"
 height="150"
 rx="2"
 fill="#3b82f6"
 fillOpacity="0.4"
 />
 <rect
 x="550"
 y="40"
 width="40"
 height="180"
 rx="2"
 fill="#2563eb"
 fillOpacity="0.6"
 />
 <rect
 x="610"
 y="90"
 width="35"
 height="130"
 rx="2"
 fill="#1d4ed8"
 fillOpacity="0.5"
 />
 <rect
 x="660"
 y="30"
 width="45"
 height="190"
 rx="2"
 fill="#1e40af"
 fillOpacity="0.7"
 />
 <rect
 x="720"
 y="60"
 width="30"
 height="160"
 rx="2"
 fill="#1e3a8a"
 fillOpacity="0.8"
 />
 {/* Windows on a building */}
 <rect x="670" y="50" width="6" height="10" fill="#93c5fd" />
 <rect x="685" y="50" width="6" height="10" fill="#93c5fd" />
 <rect x="670" y="70" width="6" height="10" fill="#93c5fd" />
 <rect x="685" y="70" width="6" height="10" fill="#93c5fd" />
 <rect x="670" y="90" width="6" height="10" fill="#93c5fd" />
 <rect x="685" y="90" width="6" height="10" fill="#93c5fd" />

 {/* Hills / Ground */}
 <path
 d="M300 220 Q 450 160 600 220 Z"
 fill="#22c55e"
 fillOpacity="0.8"
 />
 <path d="M500 220 Q 650 140 800 220 Z" fill="#16a34a" />

 {/* Road */}
 <path
 d="M400 220 Q 600 180 800 220 Z"
 fill="#475569"
 fillOpacity="0.8"
 />
 <path
 d="M450 220 Q 600 190 750 220"
 stroke="#cbd5e1"
 strokeWidth="2"
 strokeDasharray="10 10"
 fill="none"
 />

 {/* Trees Foreground */}
 <circle cx="550" cy="180" r="25" fill="#15803d" />
 <circle cx="530" cy="190" r="20" fill="#16a34a" />
 <circle cx="570" cy="195" r="15" fill="#22c55e" />

 <circle cx="750" cy="160" r="30" fill="#14532d" />
 <circle cx="720" cy="175" r="25" fill="#15803d" />
 <circle cx="770" cy="180" r="20" fill="#16a34a" />
 </svg>
 </div>
 </section>
 );
}
