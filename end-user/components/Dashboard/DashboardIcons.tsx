import React from"react";

export function HomeIcon({
 size = 20,
 color ="currentColor",
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
 d="M3 10.5L12 3L21 10.5V20C21 20.5523 20.5523 21 20 21H15V14H9V21H4C3.44772 21 3 20.5523 3 20V10.5Z"
 fill={color}
 />
 </svg>
 );
}

export function DocumentListIcon({
 size = 20,
 color ="currentColor",
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
 y="3"
 width="16"
 height="18"
 rx="3"
 stroke={color}
 strokeWidth="1.8"
 />
 <path
 d="M8 8H16"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <path
 d="M8 12H16"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <path
 d="M8 16H13"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function PlusCircleIcon({
 size = 20,
 color ="currentColor",
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
 <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.8" />
 <path
 d="M12 8V16M8 12H16"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function BellBadgeIcon({
 size = 20,
 color ="currentColor",
 hasBadge = true,
}: {
 size?: number;
 color?: string;
 hasBadge?: boolean;
}) {
 return (
 <div
 style={{
 position:"relative",
 display:"inline-flex",
 alignItems:"center",
 justifyContent:"center",
 }}
 >
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path
 d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21S18 15 18 8Z"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 <path
 d="M13.73 21A2 2 0 0 1 10.27 21"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 {hasBadge && (
 <span
 style={{
 position:"absolute",
 top:"-1px",
 right:"-1px",
 width:"8px",
 height:"8px",
 backgroundColor:"#ef4444",
 borderRadius:"50%",
 border:"1.5px solid #ffffff",
 }}
 />
 )}
 </div>
 );
}

export function UserSilhouetteIcon({
 size = 20,
 color ="currentColor",
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
 <circle cx="12" cy="7" r="4.2" stroke={color} strokeWidth="1.8" />
 <path
 d="M4.5 20C4.5 16.5 8 14.5 12 14.5C16 14.5 19.5 16.5 19.5 20"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function HeadsetIcon({
 size = 20,
 color ="currentColor",
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
 d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12V18C21 19.6569 19.6569 21 18 21H17V15H20V12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12V15H7V21H6C4.34315 21 3 19.6569 3 18V12Z"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function SearchIcon({
 size = 18,
 color ="currentColor",
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
 <circle cx="11" cy="11" r="7" stroke={color} strokeWidth="1.8" />
 <path
 d="M16.5 16.5L21 21"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function ChevronDownIcon({
 size = 16,
 color ="currentColor",
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

export function ChevronRightIcon({
 size = 16,
 color ="currentColor",
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
 d="M9 6L15 12L9 18"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function CalendarIcon({
 size = 14,
 color ="currentColor",
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
 y="4"
 width="18"
 height="17"
 rx="3"
 stroke={color}
 strokeWidth="1.8"
 />
 <path d="M3 9H21" stroke={color} strokeWidth="1.8" />
 <path
 d="M8 2V5M16 2V5"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function MapPinIcon({
 size = 14,
 color ="currentColor",
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
 d="M12 21C16 16.5 19 13.5 19 9.5C19 5.63401 15.866 2.5 12 2.5C8.13401 2.5 5 5.63401 5 9.5C5 13.5 8 16.5 12 21Z"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <circle cx="12" cy="9.5" r="2.8" stroke={color} strokeWidth="1.8" />
 </svg>
 );
}

export function LeafIcon({
 size = 18,
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
 <path
 d="M4 20C4 20 6.5 17 11 15C16 13 19 7 20 4C17 5 11 8 9 13C7 17.5 4 20 4 20Z"
 fill={color}
 fillOpacity="0.2"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M9 13C12 11 15 8 16 6"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

/* Department Icons */
export function ElectricityIcon({
 size = 16,
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
 <path
 d="M3 21H21"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <path
 d="M5 21V7L13 3V21"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M13 10L19 13V21"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M8 8V9M8 12V13M8 16V17"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function WaterSupplyIcon({
 size = 16,
 color ="#0284c7",
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
 d="M12 3.5C12 3.5 5 11.5 5 15.5C5 19.0899 8.13401 22 12 22C15.866 22 19 19.0899 19 15.5C19 11.5 12 3.5 12 3.5Z"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M9.5 16C9.5 18 10.5 19.5 12 20"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function SanitationIcon({
 size = 16,
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
 <path
 d="M4 6H20M10 6V3H14V6M5 6L6.5 20C6.6 20.6 7.1 21 7.7 21H16.3C16.9 21 17.4 20.6 17.5 20L19 6"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 <path
 d="M10 11V16M14 11V16"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function PublicWorksIcon({
 size = 16,
 color ="#475569",
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
 d="M4 19L9 5H15L20 19"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 <path d="M7 14H17" stroke={color} strokeWidth="1.8" />
 <path
 d="M12 9V11M12 15V17"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function ParksGardensIcon({
 size = 16,
 color ="#16a34a",
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
 d="M12 21V16"
 stroke="#854d0e"
 strokeWidth="2"
 strokeLinecap="round"
 />
 <path
 d="M12 3C7 3 5 8 7 11C5 12 5 15 8 16C10 17 14 17 16 16C19 15 19 12 17 11C19 8 17 3 12 3Z"
 fill={color}
 fillOpacity="0.2"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 </svg>
 );
}

/* Activity Icons */
export function PaperPlaneIcon({
 size = 16,
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
 <path
 d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function AgentUserIcon({
 size = 16,
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
 <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.8" />
 <path
 d="M5 20C5 16.5 8 15 12 15C16 15 19 16.5 19 20"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function CogGearIcon({
 size = 16,
 color ="#7c3aed",
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
 <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" />
 <path
 d="M19.4 15A1.65 1.65 0 0 0 19.73 16.82L20.2 17.63A2 2 0 0 1 17.63 20.2L16.82 19.73A1.65 1.65 0 0 0 15 19.4V20.5A2 2 0 0 1 13 22.5H11A2 2 0 0 1 9 20.5V19.4A1.65 1.65 0 0 0 7.18 19.73L6.37 20.2A2 2 0 0 1 3.8 17.63L4.27 16.82A1.65 1.65 0 0 0 3.94 15H2.84A2 2 0 0 1 0.84 13V11A2 2 0 0 1 2.84 9H3.94A1.65 1.65 0 0 0 4.27 7.18L3.8 6.37A2 2 0 0 1 6.37 3.8L7.18 4.27A1.65 1.65 0 0 0 9 3.94V2.84A2 2 0 0 1 11 0.84H13A2 2 0 0 1 15 2.84V3.94A1.65 1.65 0 0 0 16.82 4.27L17.63 3.8A2 2 0 0 1 20.2 6.37L19.73 7.18A1.65 1.65 0 0 0 19.4 9H20.5A2 2 0 0 1 22.5 11V13A2 2 0 0 1 20.5 15H19.4Z"
 stroke={color}
 strokeWidth="1.6"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function CheckCircleIcon({
 size = 16,
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
 <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
 <path
 d="M8.5 12L11 14.5L15.5 9.5"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function AnnouncementMegaphoneIcon({
 size = 16,
 color ="#0284c7",
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
 d="M3 11V13C3 14.1 3.9 15 5 15H6L11 18V6L6 9H5C3.9 9 3 9.9 3 11Z"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M15 8C16.5 9.5 16.5 14.5 15 16"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <path
 d="M18 5C20.5 7.5 20.5 16.5 18 19"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <path
 d="M8 15V20"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

/* Metric card icons */
export function MetricDocIcon({
 size = 22,
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
 <path
 d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M14 2V8H20"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M8 13H16"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 <path
 d="M8 17H13"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function MetricClockIcon({
 size = 22,
 color ="#ef4444",
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
 <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
 <path
 d="M12 7V12L15 14"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function MetricCheckIcon({
 size = 22,
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
 <circle
 cx="12"
 cy="12"
 r="9"
 fill={color}
 fillOpacity="0.15"
 stroke={color}
 strokeWidth="1.8"
 />
 <path
 d="M8.5 12L11 14.5L15.5 9.5"
 stroke={color}
 strokeWidth="2.2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function MetricHourglassIcon({
 size = 22,
 color ="#8b5cf6",
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
 d="M6 3H18M6 21H18M7 3L12 12L17 3M7 21L12 12L17 21"
 stroke={color}
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

/* Mobile Quick Action Icons */
export function QuickDocIcon({
 size = 24,
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
 <path
 d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z"
 fill={color}
 fillOpacity="0.12"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 <path
 d="M9 12H15M9 16H13"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 />
 </svg>
 );
}

export function QuickClockIcon({
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
 <circle
 cx="12"
 cy="12"
 r="9.5"
 fill={color}
 fillOpacity="0.12"
 stroke={color}
 strokeWidth="1.8"
 />
 <path
 d="M12 7V12L15.5 14"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function QuickBulbIcon({
 size = 24,
 color ="#d97706",
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
 d="M9 18H15M10 21H14M12 2C7.58 2 4 5.58 4 10C4 12.8 5.46 15.25 7.69 16.69C8.3 17.08 8.68 17.75 8.74 18.47L8.76 18.75H15.24L15.26 18.47C15.32 17.75 15.7 17.08 16.31 16.69C18.54 15.25 20 12.8 20 10C20 5.58 16.42 2 12 2Z"
 fill={color}
 fillOpacity="0.12"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function QuickHeadsetIcon({
 size = 24,
 color ="#7c3aed",
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
 d="M3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12V18C21 19.66 19.66 21 18 21H17V15H20V12C20 7.58 16.42 4 12 4C7.58 4 4 7.58 4 12V15H7V21H6C4.34 21 3 19.66 3 18V12Z"
 fill={color}
 fillOpacity="0.12"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 </svg>
 );
}

export function FlagLampIcon({
 size = 18,
 color ="#d97706",
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
 <path d="M5 21V3" stroke={color} strokeWidth="2" strokeLinecap="round" />
 <path
 d="M5 4H16L13.5 8.5L16 13H5"
 fill={color}
 fillOpacity="0.15"
 stroke={color}
 strokeWidth="1.8"
 strokeLinejoin="round"
 />
 </svg>
 );
}
