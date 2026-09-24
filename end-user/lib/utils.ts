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

export const getStatusStyles = (status: string) => {
 switch (status) {
 case"In Progress":
 return"bg-emerald-50 text-emerald-700";
 case"Resolved":
 return"bg-green-50 text-green-600";
 case"Open":
 case"Submitted":
 return"bg-red-50 text-red-500";
 default:
 return"bg-slate-50 text-slate-600";
 }
};
