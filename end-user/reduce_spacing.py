import os
import re

base_dir = "/home/nandini/cms/end-user"

replacements = {
    "app/dashboard/layout.tsx": [
        (r'className="flex min-h-screen bg-slate-100 font-sans"', 'className="flex h-screen overflow-hidden bg-slate-100 font-sans"'),
        (r'<main className="flex-1 p-8 overflow-y-auto h-screen">', '<main className="flex-1 p-4 flex flex-col overflow-hidden h-screen">')
    ],
    "app/dashboard/page.tsx": [
        (r'<div className="flex gap-6 items-start pb-6">', '<div className="flex gap-4 items-stretch flex-1 min-h-0">')
    ],
    "components/Dashboard/Header.tsx": [
        (r'<header className="flex items-start justify-between mb-8">', '<header className="flex items-start justify-between mb-4">'),
        (r'className="text-2xl font-bold text-slate-800 flex items-center gap-2"', 'className="text-xl font-bold text-slate-800 flex items-center gap-2"'),
        (r'text-sm mt-1', 'text-xs mt-0.5')
    ],
    "components/Dashboard/Banner.tsx": [
        (r'className="relative w-full h-48 bg-gradient-to-r', 'className="relative w-full h-32 shrink-0 bg-gradient-to-r'),
        (r'mb-6 flex items-center', 'mb-4 flex items-center'),
        (r'text-3xl font-bold text-white mb-2', 'text-2xl font-bold text-white mb-1'),
        (r'text-blue-100 mb-6 text-sm', 'text-blue-100 mb-3 text-xs'),
        (r'py-2.5 px-5', 'py-2 px-4'),
        (r'size={120}', 'size={90}'),
        (r'absolute right-32 top-1/2', 'absolute right-24 top-1/2'),
        (r'top-6 right-10', 'top-4 right-8'),
        (r'text-xl whitespace-nowrap', 'text-lg whitespace-nowrap')
    ],
    "components/Dashboard/StatCard.tsx": [
        (r'mb-6', 'mb-4 shrink-0'),
        (r'p-4 flex', 'p-3 flex'),
        (r'w-12 h-12', 'w-10 h-10 rounded-lg'),
        (r'w-6 h-6', 'w-5 h-5'),
        (r'text-2xl font-bold', 'text-xl font-bold')
    ],
    "components/Dashboard/RecentComplaints.tsx": [
        (r'border border-slate-100 flex-1 overflow-hidden', 'border border-slate-100 flex-1 flex flex-col overflow-hidden'),
        (r'p-5 border-b', 'p-3 px-4 border-b shrink-0'),
        (r'<div className="overflow-x-auto">', '<div className="overflow-auto flex-1">'),
        (r'px-5 py-3', 'px-4 py-2'),
        (r'px-5 py-4', 'px-4 py-2.5'),
        (r'p-4 border-t', 'p-3 border-t shrink-0')
    ],
    "components/Dashboard/RecentActivity.tsx": [
        (r'border border-slate-100 flex flex-col', 'border border-slate-100 flex flex-col h-full overflow-hidden'),
        (r'p-5 border-b', 'p-3 px-4 border-b shrink-0'),
        (r'flex-1 p-5 pb-2', 'flex-1 overflow-y-auto p-4 pb-2'),
        (r'gap-6', 'gap-4'),
        (r'p-4 mt-auto', 'p-3 mt-auto shrink-0'),
        (r'rounded-xl p-4', 'rounded-lg p-3')
    ]
}

for file_path, rules in replacements.items():
    full_path = os.path.join(base_dir, file_path)
    with open(full_path, 'r') as f:
        content = f.read()
    
    for old, new in rules:
        content = content.replace(old, new)
        
    with open(full_path, 'w') as f:
        f.write(content)

print("Done")
