import React from "react";

export function BellBadgeIcon({
  size = 20,
  color = "currentColor",
  hasBadge = true,
}: {
  size?: number;
  color?: string;
  hasBadge?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21S18 15 18 8Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13.73 21A2 2 0 0 1 10.27 21" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {hasBadge && (
        <span
          style={{
            position: "absolute",
            top: "-1px",
            right: "-1px",
            width: "8px",
            height: "8px",
            backgroundColor: "#ef4444",
            borderRadius: "50%",
            border: "1.5px solid #ffffff",
          }}
        />
      )}
    </div>
  );
}
