"use client";

import { use } from "react";
import ComplaintDetails from "@/components/Dashboard/ComplaintDetails";

export default function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  // keyed so moving between complaints starts from a fresh page
  return <ComplaintDetails key={id} complaintId={id} />;
}
