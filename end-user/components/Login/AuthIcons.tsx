import React from"react";

// Question Circle Icon for"(?) Need Help?"
export function QuestionCircleIcon({
 size = 18,
 color ="#2563eb",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" />
 <path
 d="M9.5 9.5C9.5 8.1 10.6 7 12 7C13.4 7 14.5 8.1 14.5 9.5C14.5 10.7 13.7 11.4 12.8 12C12.3 12.4 12 12.9 12 13.5V14"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <circle cx="12" cy="17" r="1" fill={color} />
 </svg>
 );
}

// Smartphone Icon for"Continue with Mobile Number"
export function SmartphoneIcon({
 size = 24,
 color ="#3b82f6",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <rect
 x="5.5"
 y="2.5"
 width="13"
 height="19"
 rx="3"
 stroke={color}
 strokeWidth="1.8"
 />
 <line
 x1="10"
 y1="18.5"
 x2="14"
 y2="18.5"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <line
 x1="10.5"
 y1="5.5"
 x2="13.5"
 y2="5.5"
 stroke={color}
 strokeWidth="1.5"
 strokeLinecap="round"
 />
 </svg>
 );
}

// Mail Envelope Icon for"Continue with Email Address"
export function MailEnvelopeIcon({
 size = 24,
 color ="#059669",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <rect
 x="3"
 y="5"
 width="18"
 height="14"
 rx="2.5"
 stroke={color}
 strokeWidth="1.8"
 />
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
 color ="#3b82f6",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path
 d="M9 18L15 12L9 6"
 stroke={color}
 strokeWidth="2.2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// Clean Chevron Left (Back button)
export function ChevronLeftIcon({
 size = 18,
 color ="#1e293b",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path
 d="M15 18L9 12L15 6"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// Chevron Down for Dropdown
export function ChevronDownIcon({
 size = 14,
 color ="#64748b",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path
 d="M6 9L12 15L18 9"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// Arrow Right for Primary Action Buttons
export function ArrowRightIcon({
 size = 18,
 color ="#ffffff",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path d="M5 12H19" stroke={color} strokeWidth="2" strokeLinecap="round" />
 <path
 d="M13 6L19 12L13 18"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// Shield Check Icon (Teal/Green for"Your information is secure with us")
export function ShieldCheckIcon({
 size = 18,
 color ="#0d9488",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path
 d="M12 2.5L4.5 5.5V11.5C4.5 16.5 7.8 20.8 12 22C16.2 20.8 19.5 16.5 19.5 11.5V5.5L12 2.5Z"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 <path
 d="M9 11.8L11.2 14L15.5 9.5"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// Privacy Lock Icon (for the bottom"We value your privacy" banner)
export function LockPrivacyIcon({
 size = 20,
 color ="#059669",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <rect
 x="4"
 y="10"
 width="16"
 height="11"
 rx="2.5"
 stroke={color}
 strokeWidth="1.8"
 />
 <path
 d="M7.5 10V6.5C7.5 4 9.5 2 12 2C14.5 2 16.5 4 16.5 6.5V10"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <circle cx="12" cy="15.5" r="1.5" fill={color} />
 </svg>
 );
}

// Municipal Portal Checkmark Badge Icon
export function MunicipalCheckBadge({ size = 16 }: { size?: number }) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <rect width="24" height="24" rx="12" fill="#2563eb" />
 <path
 d="M7 12L10.5 15.5L17 9"
 stroke="#ffffff"
 strokeWidth="2.5"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// Bolt Icon for"Fast & Secure"
export function BoltIcon({
 size = 15,
 color ="#2563eb",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill={color} />
 </svg>
 );
}

// Padlock Icon for"Safe & Encrypted"
export function PadlockIcon({
 size = 15,
 color ="#10b981",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <rect
 x="4"
 y="9"
 width="16"
 height="12"
 rx="2"
 stroke={color}
 strokeWidth="2"
 fill="none"
 />
 <path
 d="M8 9V6C8 3.8 9.8 2 12 2C14.2 2 16 3.8 16 6V9"
 stroke={color}
 strokeWidth="2"
 />
 <circle cx="12" cy="15" r="1.5" fill={color} />
 </svg>
 );
}

// India Flag Icon
export function IndiaFlagIcon({ size = 20 }: { size?: number }) {
 return (
 <svg
 width={size}
 height={size * 0.75}
 viewBox="0 0 30 20"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <rect width="30" height="20" rx="2" fill="#ffffff" />
 <rect width="30" height="6.67" fill="#FF9933" />
 <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
 <rect y="13.33" width="30" height="6.67" fill="#128807" />
 {/* Ashoka Chakra */}
 <circle
 cx="15"
 cy="10"
 r="2.5"
 stroke="#000088"
 strokeWidth="0.8"
 fill="none"
 />
 </svg>
 );
}

// Close (X) Icon
export function CloseIcon({
 size = 18,
 color ="#64748b",
}: {
 size?: number;
 color?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path
 d="M18 6L6 18"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 <path
 d="M6 6L18 18"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// Phone Icon alias for retro compatibility
export const PhoneIcon = SmartphoneIcon;
export const MailIcon = MailEnvelopeIcon;
