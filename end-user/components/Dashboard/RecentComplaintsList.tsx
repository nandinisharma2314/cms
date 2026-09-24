"use client";

import React from"react";
import {
 CalendarIcon,
 ChevronRightIcon,
 FlagLampIcon,
 WaterSupplyIcon,
 SanitationIcon,
} from"./DashboardIcons";
import { ComplaintItem } from"./RecentComplaintsTable";

interface RecentComplaintsListProps {
 complaints?: any[];
 onViewAll?: () => void;
 onComplaintClick?: (item: ComplaintItem) => void;
}

export function RecentComplaintsList({
 complaints,
 onViewAll,
 onComplaintClick,
}: RecentComplaintsListProps) {
 const mobileComplaints: (ComplaintItem & {
 fullLocation: string;
 iconBoxBg: string;
 iconBoxColor: string;
 })[] = [
 {
 id:"1",
 cmpId:"CMP-10231",
 title:"Street Light Not Working",
 department:"Electricity",
 departmentIcon:"electricity",
 location:"Mansarovar",
 fullLocation:"Mansarovar, Jaipur",
 priority:"High",
 date:"22 Sep 2026",
 status:"In Progress",
 iconBoxBg:"#fef3c7",
 iconBoxColor:"#d97706",
 },
 {
 id:"2",
 cmpId:"CMP-10218",
 title:"Water Supply Issue",
 department:"Water Supply",
 departmentIcon:"water",
 location:"Vaishali Nagar",
 fullLocation:"Vaishali Nagar, Jaipur",
 priority:"Medium",
 date:"18 Sep 2026",
 status:"Resolved",
 iconBoxBg:"#eff6ff",
 iconBoxColor:"#0284c7",
 },
 {
 id:"3",
 cmpId:"CMP-10205",
 title:"Garbage Not Collected",
 department:"Sanitation",
 departmentIcon:"sanitation",
 location:"Malviya Nagar",
 fullLocation:"Malviya Nagar, Jaipur",
 priority:"High",
 date:"12 Sep 2026",
 status:"Open",
 iconBoxBg:"#fef2f2",
 iconBoxColor:"#ef4444",
 },
 ];

 function renderLeadingIcon(id: string) {
 if (id ==="1") return <FlagLampIcon size={20} color="#d97706" />;
 if (id ==="2") return <WaterSupplyIcon size={20} color="#0284c7" />;
 return <SanitationIcon size={20} color="#ef4444" />;
 }

 function getStatusClass(status: string) {
 switch (status) {
 case"In Progress":
 return"status-pill status-in-progress";
 case"Resolved":
 return"status-pill status-resolved";
 case"Open":
 return"status-pill status-open";
 default:
 return"status-pill";
 }
 }

 return (
 <section className="mobile-recent-complaints-section">
 {/* Section Header */}
 <div className="mobile-section-header">
 <h3 className="section-title">Recent Complaints</h3>
 <button
 type="button"
 className="section-view-all-btn"
 onClick={onViewAll}
 >
 <span>View All</span>
 <ChevronRightIcon size={14} color="#2563eb" />
 </button>
 </div>

 {/* Card List */}
 <div className="mobile-complaints-list">
 {(complaints && complaints.length > 0 ? complaints : mobileComplaints).slice(0, 5).map((item) => (
 <div
 key={item.id}
 className="mobile-complaint-card"
 onClick={() => onComplaintClick && onComplaintClick(item)}
 >
 {/* Leading Icon Box */}
 <div
 className="complaint-card-icon-box"
 style={{ backgroundColor: item.iconBoxBg || '#eff6ff' }}
 >
 {renderLeadingIcon(item.id)}
 </div>

 {/* Middle Content */}
 <div className="complaint-card-content">
 <div className="complaint-card-header-row">
 <h4 className="complaint-card-title">{item.title}</h4>
 <span className={getStatusClass(item.status)}>
 {item.status}
 </span>
 </div>

 <div className="complaint-card-meta-row">
 <span className="complaint-card-cmp-id">{item.cmpId || item.id}</span>
 <span className="complaint-card-meta-dot">•</span>
 <span className="complaint-card-loc">{item.fullLocation || item.location}</span>
 </div>

 <div className="complaint-card-date-row">
 <CalendarIcon size={13} color="#94a3b8" />
 <span className="complaint-card-date-text">{item.date}</span>
 </div>
 </div>

 {/* Trailing Chevron */}
 <div className="complaint-card-trailing-arrow">
 <ChevronRightIcon size={16} color="#94a3b8" />
 </div>
 </div>
 ))}
 </div>
 </section>
 );
}
