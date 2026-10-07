import React from "react";

// Question Circle Icon for"(?) Need Help?"
export function SmartphoneIcon({ size = 24, color = "#3b82f6" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5.5" y="2.5" width="13" height="19" rx="3" stroke={color} strokeWidth="1.8" />
      <line x1="10" y1="18.5" x2="14" y2="18.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="10.5" y1="5.5" x2="13.5" y2="5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Mail Envelope Icon for"Continue with Email Address"
export function MailEnvelopeIcon({ size = 24, color = "#059669" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke={color} strokeWidth="1.8" />
      <path
        d="M3.5 6.5L11.1 12.3C11.6 12.7 12.4 12.7 12.9 12.3L20.5 6.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Clean Chevron Right
export function ChevronRightIcon({
  size = 18,
  color = "#3b82f6",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M9 18L15 12L9 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Clean Chevron Left (Back button)
export function ChevronLeftIcon({ size = 18, color = "#1e293b" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 18L9 12L15 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Chevron Down for Dropdown
export function ArrowRightIcon({
  size = 18,
  color = "#ffffff",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M5 12H19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M13 6L19 12L13 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Shield Check Icon (Teal/Green for"Your information is secure with us")
export function ShieldCheckIcon({ size = 18, color = "#0d9488" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2.5L4.5 5.5V11.5C4.5 16.5 7.8 20.8 12 22C16.2 20.8 19.5 16.5 19.5 11.5V5.5L12 2.5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 11.8L11.2 14L15.5 9.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Privacy Lock Icon (for the bottom"We value your privacy" banner)
