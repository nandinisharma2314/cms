import React from "react";

interface CivicLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  theme?: "dark" | "light";
}

export function CivicLogo({
  size = 40,
  showText = true,
  className = "",
  theme = "dark",
}: CivicLogoProps) {
  const isDark = theme === "dark";

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <div className="relative flex-shrink-0 flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transition-transform hover:scale-105 duration-200"
        >
          <defs>
            <linearGradient id="adminLeftLeafGrad" x1="12" y1="22" x2="30" y2="46" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="60%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
            <linearGradient id="adminRightLeafGrad" x1="34" y1="22" x2="52" y2="46" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0284c7" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Top circle / head */}
          <circle cx="32" cy="13" r="6" fill="#38bdf8" />

          {/* Left leaf (Teal to Cyan to Sky Blue) */}
          <path
            d="M30 25C17 25 11 34 14 46C20 46 30 42 30 25Z"
            fill="url(#adminLeftLeafGrad)"
          />

          {/* Right leaf (Sky Blue to Royal Blue) */}
          <path
            d="M34 25C47 25 53 34 50 46C44 46 34 42 34 25Z"
            fill="url(#adminRightLeafGrad)"
          />

          {/* Center stem subtle highlight */}
          <path
            d="M32 30V44"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeOpacity="0.6"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span
              className={`text-xl font-bold tracking-tight ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              Civic<span className="text-sky-400">Care</span>
            </span>
          </div>
          <span
            className={`text-[11px] font-medium tracking-wide mt-1 leading-tight ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            Complaint Management System
          </span>
        </div>
      )}
    </div>
  );
}
