"use client";

import React from"react";
import Link from"next/link";
import { FileText, Clock, Lightbulb, Headphones } from"lucide-react";

interface QuickActionsProps {
 onRegisterComplaint?: () => void;
 onTrackStatus?: () => void;
 onSendSuggestion?: () => void;
 onHelpSupport?: () => void;
}

const QuickActions = ({
 onRegisterComplaint,
 onTrackStatus,
 onSendSuggestion,
 onHelpSupport,
}: QuickActionsProps) => {
 const actions = [
 {
 name:"Register\nComplaint",
 icon: FileText,
 color:"text-blue-500",
 bg:"bg-blue-50",
 href:"/dashboard/register",
 onClick: onRegisterComplaint,
 },
 {
 name:"Track\nStatus",
 icon: Clock,
 color:"text-emerald-500",
 bg:"bg-emerald-50",
 href:"#",
 onClick: onTrackStatus,
 },
 {
 name:"Send\nSuggestion",
 icon: Lightbulb,
 color:"text-orange-500",
 bg:"bg-orange-50",
 href:"#",
 onClick: onSendSuggestion,
 },
 {
 name:"Help &\nSupport",
 icon: Headphones,
 color:"text-purple-500",
 bg:"bg-purple-50",
 href:"#",
 onClick: onHelpSupport,
 },
 ];

 return (
 <div className="md:hidden flex justify-between gap-2 mb-6 px-2 pt-2">
 {actions.map((action, index) => {
 const handleClick = (e: React.MouseEvent) => {
 if (action.href ==="#" && action.onClick) {
 e.preventDefault();
 action.onClick();
 } else if (action.onClick) {
 action.onClick();
 }
 };

 return (
 <Link
 href={action.href}
 key={index}
 className="flex flex-col items-center gap-2 flex-1"
 onClick={handleClick}
 >
 <div
 className={`w-14 h-14 shadow-sm flex items-center justify-center ${action.bg}`}
 >
 <action.icon className={`w-6 h-6 ${action.color}`} />
 </div>
 <span className="text-[11px] font-semibold text-slate-700 text-center whitespace-pre-line leading-tight">
 {action.name}
 </span>
 </Link>
 );
 })}
 </div>
 );
};

export default QuickActions;
