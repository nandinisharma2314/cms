"use client";

import React, { useEffect, useState } from "react";
import { User } from "lucide-react";
import { useDocumentTitle } from "@/lib/portalConfig";
import { api, resolveAvatarUrl } from "@/lib/portalApi";

type HierarchyNode = {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatar_url?: string;
  color?: string;
  bgColor?: string;
  isMe?: boolean;
  children?: HierarchyNode[];
};

const depthColors = [
  { color: "text-rose-700", bgColor: "bg-rose-100" }, // Depth 0
  { color: "text-amber-700", bgColor: "bg-amber-100" }, // Depth 1
  { color: "text-blue-700", bgColor: "bg-blue-100" }, // Depth 2
  { color: "text-emerald-700", bgColor: "bg-emerald-100" }, // Depth 3
  { color: "text-indigo-700", bgColor: "bg-indigo-100" }, // Depth 4
  { color: "text-slate-700", bgColor: "bg-slate-200" }, // Depth 5+
];

function assignColors(node: HierarchyNode, depth: number = 0) {
  const scheme = depthColors[Math.min(depth, depthColors.length - 1)];
  node.color = scheme.color;
  node.bgColor = scheme.bgColor;
  if (node.children) {
    node.children.forEach((child) => assignColors(child, depth + 1));
  }
}

function OrgNode({ node }: { node: HierarchyNode }) {
  return (
    <li>
      <div className="inline-flex flex-col items-center">
        <div
          className={`relative flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-105 z-10 ${node.bgColor} ${
            node.isMe ? "ring-2 ring-indigo-500 ring-offset-1" : "border border-white"
          }`}
        >
          {node.avatar_url ? (
            <img src={resolveAvatarUrl(node.avatar_url)!} alt={node.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className={`text-[12px] sm:text-[14px] font-bold ${node.color}`}>{node.initials}</span>
          )}
          {node.isMe && (
            <span className="absolute -top-1 -right-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[8px] font-bold text-white shadow-sm z-20">
              You
            </span>
          )}
        </div>
        <div className="mt-1 text-center px-1">
          <h3 className="text-[11px] sm:text-[12px] font-bold text-slate-800 leading-tight whitespace-nowrap">{node.name}</h3>
          <p className="text-[9px] sm:text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-[1px] whitespace-nowrap">
            {node.role}
          </p>
        </div>
      </div>
      {node.children && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function TeamsPage() {
  useDocumentTitle("My Teams");

  const [hierarchy, setHierarchy] = useState<HierarchyNode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .hierarchy()
      .then((data: any) => {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        if (data && Object.keys(data).length > 0) {
          assignColors(data);
          setHierarchy(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col items-center md:flex-1 md:min-h-0 md:overflow-hidden bg-slate-50/50 p-3 sm:p-6 w-full max-w-full">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .org-tree ul {
          padding-top: 12px;
          position: relative;
          display: flex;
          justify-content: center;
          padding-left: 0;
          margin: 0;
        }
        
        .org-tree li {
          flex: 0 0 auto;
          text-align: center;
          list-style-type: none;
          position: relative;
          padding: 12px 4px 0 4px;
        }
        
        /* Connectors */
        .org-tree li::before, .org-tree li::after {
          content: '';
          position: absolute;
          top: 0;
          right: 50%;
          border-top: 2px solid #cbd5e1;
          width: 50%;
          height: 12px;
        }
        .org-tree li::after {
          right: auto;
          left: 50%;
          border-left: 2px solid #cbd5e1;
        }
        
        /* We need to remove left-right connectors from elements without siblings */
        .org-tree li:only-child::after, .org-tree li:only-child::before {
          display: none;
        }
        
        /* Remove space from the top of single children */
        .org-tree li:only-child {
          padding-top: 0;
        }
        
        /* Remove left connector from first child and right connector from last child */
        .org-tree li:first-child::before, .org-tree li:last-child::after {
          border: 0 none;
        }
        
        /* Adding back the vertical connector to the last nodes */
        .org-tree li:last-child::before {
          border-right: 2px solid #cbd5e1;
          border-radius: 0 4px 0 0;
        }
        .org-tree li:first-child::after {
          border-radius: 4px 0 0 0;
        }
        
        /* Downward connectors from parents */
        .org-tree ul ul::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          border-left: 2px solid #cbd5e1;
          width: 0;
          height: 12px;
          transform: translateX(-50%);
        }
      `,
        }}
      />
      <div className="w-full flex flex-col items-center flex-1">
        <div className="mb-3 sm:mb-6 text-center px-2 pt-4">
          <h1 className="text-base sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            Organization Hierarchy
          </h1>
          <p className="mt-0.5 text-[9px] sm:text-sm text-slate-500">View your reporting structure.</p>
        </div>

        {/* Tree Container */}
        <div className="relative rounded-xl sm:rounded-3xl border border-slate-200 bg-white p-2 sm:p-8 shadow-sm org-tree w-full overflow-auto flex flex-col justify-center flex-1">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : hierarchy ? (
            <div className="min-w-max px-2 m-auto">
              <ul>
                <OrgNode node={hierarchy} />
              </ul>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">
              Hierarchy data is unavailable.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
