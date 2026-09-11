"use client";

import { useParams } from "next/navigation";
import { ComposeEditor } from "@/components/ComposeEditor";

export function ComposeByIdClient() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  return <ComposeEditor id={id} />;
}
