export const getPriorityStyles = (priority: string) => {
 switch (priority) {
 case"High":
 case"Critical":
 return"bg-red-50 text-red-600";
 case"Medium":
 return"bg-blue-50 text-blue-600";
 case"Low":
 return"bg-emerald-50 text-emerald-600";
 default:
 return"bg-slate-50 text-slate-600";
 }
};

// Takes the workflow status key (e.g. "IN_PROGRESS").
export const getStatusStyles = (status: string) => {
 switch (status) {
 case"ACKNOWLEDGED":
 case"IN_PROGRESS":
 return"bg-emerald-50 text-emerald-700";
 case"WAITING_FOR_INFORMATION":
 case"REJECTION_REQUESTED": // shown to citizens as "Under Review"
 return"bg-amber-50 text-amber-700";
 case"RESOLVED":
 case"CLOSED":
 return"bg-green-50 text-green-600";
 case"SUBMITTED":
 case"ASSIGNED":
 case"REOPENED":
 return"bg-red-50 text-red-500";
 case"REJECTED":
 return"bg-slate-700 text-white";
 default:
 return"bg-slate-50 text-slate-600";
 }
};
