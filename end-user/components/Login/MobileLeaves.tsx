import React from "react";

export function MobileLeaves({
  color = "blue",
}: {
  color?: "blue" | "pink";
}) {
  const isPink = color === "pink";
  const primary = isPink ? "#fbcfe8" : "#bfdbfe";
  const secondary = isPink ? "#f9a8d4" : "#93c5fd";
  const fill = isPink ? "#fdf2f8" : "#eff6ff";

  return (
    <div className="mobile-leaves-container" aria-hidden="true" style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: '100%',
      height: '140px',
      zIndex: 0,
      pointerEvents: 'none',
    }}>
      <svg
        viewBox="0 0 375 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        preserveAspectRatio="none"
      >
        {/* Soft fluid background */}
        <path d="M0 60 C 150 120, 250 20, 375 80 L 375 140 L 0 140 Z" fill={fill} />
        
        {/* Left leaf cluster */}
        <g transform="translate(10, 80) scale(1.2)">
          <path d="M 10 30 C 5 20, 10 5, 20 0 C 25 10, 20 25, 10 30 Z" fill={primary} />
          <path d="M 20 30 C 15 25, 18 15, 25 12 C 28 18, 25 28, 20 30 Z" fill={secondary} />
          <path d="M 5 35 C 2 28, 5 18, 12 15 C 15 22, 12 32, 5 35 Z" fill={secondary} />
        </g>
        
        {/* Right leaf cluster */}
        <g transform="translate(320, 65) scale(1.4) scale(-1, 1)">
          <path d="M 10 30 C 5 20, 10 5, 20 0 C 25 10, 20 25, 10 30 Z" fill={primary} />
          <path d="M 20 30 C 15 25, 18 15, 25 12 C 28 18, 25 28, 20 30 Z" fill={secondary} />
          <path d="M 5 35 C 2 28, 5 18, 12 15 C 15 22, 12 32, 5 35 Z" fill={secondary} />
        </g>
      </svg>
    </div>
  );
}
