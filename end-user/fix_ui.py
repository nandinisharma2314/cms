import os

base_dir = "/home/nandini/cms/end-user"

replacements = {
    "components/Dashboard/Header.tsx": [
        (r'className="flex items-center gap-2 bg-white rounded-full p-1 pr-3 shadow-\[0_2px_10px_-4px_rgba\(0,0,0,0\.1\)\] hover:bg-slate-50 transition-colors"', 'className="flex items-center gap-2 bg-white rounded-full p-1 md:pr-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:bg-slate-50 transition-colors"'),
        (r'<ChevronDown className="w-4 h-4 text-slate-400" />', '<ChevronDown className="hidden md:block w-4 h-4 text-slate-400" />')
    ],
    "components/Dashboard/Banner.tsx": [
        (r'{/\* Text overlay on right \*/}.*?</p>\s*</div>', ''),
        (r'px-6 md:px-10', 'px-5 md:px-10'),
        (r'right-0 bottom-0 h-full w-1/2', 'right-0 bottom-0 h-full w-1/2 overflow-hidden md:overflow-visible'),
        (r'right-24', 'right-4 md:right-24')
    ],
    "components/Dashboard/QuickActions.tsx": [
        (r'bg-white p-4 rounded-2xl shadow-sm', 'px-2 pt-2'),
        (r'gap-3 mb-6', 'gap-2 mb-6'),
        (r'w-12 h-12 rounded-2xl', 'w-14 h-14 rounded-2xl shadow-sm'),
        (r'text-\[10px\] font-semibold text-slate-600', 'text-[11px] font-semibold text-slate-700')
    ],
    "components/Dashboard/StatCard.tsx": [
        (r'bg-white rounded-2xl p-2 py-3 md:p-3 flex flex-col md:flex-row items-center gap-2 md:gap-4 shadow-sm border border-slate-100', 'bg-white md:bg-white rounded-2xl p-2 py-4 md:p-3 flex flex-col md:flex-row items-center gap-2 md:gap-4 shadow-sm md:border border-slate-100 ${stat.cardBg}'),
        (r'w-10 h-10 rounded-xl flex items-center justify-center \$\{stat.iconBg\}', 'w-10 h-10 rounded-full md:rounded-xl flex items-center justify-center ${stat.iconBg} bg-white/60 md:bg-opacity-100'),
        (r'const stats = \[.*?\];', '''const stats = [
    { title: 'Total\\nComplaints', value: '12', icon: FileText, iconColor: 'text-blue-600', iconBg: 'bg-blue-100', cardBg: 'bg-blue-50/70 border-blue-100/50' },
    { title: 'Open\\nComplaints', value: '3', icon: Clock, iconColor: 'text-red-500', iconBg: 'bg-red-100', cardBg: 'bg-red-50/70 border-red-100/50' },
    { title: 'Resolved\\nComplaints', value: '8', icon: CheckCircle, iconColor: 'text-green-600', iconBg: 'bg-green-100', cardBg: 'bg-green-50/70 border-green-100/50' },
    { title: 'In\\nProgress', value: '1', icon: Hourglass, iconColor: 'text-purple-600', iconBg: 'bg-purple-100', cardBg: 'bg-purple-50/70 border-purple-100/50' },
  ];'''),
        (r'FileText, Clock, CheckCircle, ChevronRight', 'FileText, Clock, CheckCircle, ChevronRight, Hourglass'),
        (r'import \{ FileText, Clock, CheckCircle, ChevronRight, Hourglass \}', 'import { FileText, Clock, CheckCircle, ChevronRight, Hourglass }')
    ],
    "components/Dashboard/MobileBottomNav.tsx": [
        (r'pb-0\.5', ''),
        (r'border-b-2 border-blue-600', ''),
        (r'absolute left-1/2 bottom-6 -translate-x-1/2', 'absolute left-1/2 -top-5 -translate-x-1/2'),
        (r'pb-safe pt-2', 'pb-4 pt-3')
    ],
    "app/dashboard/layout.tsx": [
        (r'<div className="md:hidden absolute top-0 left-0 w-full h-\[300px\] pointer-events-none z-0">.*?</div>\s*</div>', '''<div className="md:hidden absolute top-0 left-0 w-full h-[280px] pointer-events-none z-0 overflow-hidden bg-gradient-to-b from-blue-50/80 to-transparent">
         <div className="absolute right-4 top-16 transform rotate-[-5deg] z-10">
           <p className="font-serif italic text-blue-600/80 text-lg whitespace-nowrap" style={{ fontFamily: 'Brush Script MT, cursive' }}>
             Your Voice<br />Makes a<br />Better Tomorrow
           </p>
         </div>
         <div className="absolute bottom-0 w-full h-32 flex items-end opacity-20">
            <div className="w-1/6 h-12 bg-blue-400 rounded-t-sm"></div>
            <div className="w-1/6 h-20 bg-blue-500 rounded-t-sm"></div>
            <div className="w-1/5 h-32 bg-blue-600 rounded-t-sm"></div>
            <div className="w-1/4 h-24 bg-blue-500 rounded-t-sm"></div>
            <div className="w-1/6 h-16 bg-blue-400 rounded-t-sm"></div>
            <div className="w-1/6 h-28 bg-blue-600 rounded-t-sm"></div>
         </div>
      </div>''')
    ]
}

import re

for file_path, rules in replacements.items():
    full_path = os.path.join(base_dir, file_path)
    try:
        with open(full_path, 'r') as f:
            content = f.read()
        
        for old, new in rules:
            if not old.startswith('import { FileText') and not old.startswith('const stats'):
                content = re.sub(old, new, content, flags=re.DOTALL)
            else:
                content = re.sub(old, new, content, flags=re.DOTALL)
                
        with open(full_path, 'w') as f:
            f.write(content)
        print(f"Updated {file_path}")
    except Exception as e:
        print(f"Error {file_path}: {e}")

