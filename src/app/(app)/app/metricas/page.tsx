import type { Metadata } from "next";
import { MetricsDashboard } from "@/components/metrics/MetricsDashboard";

export const metadata: Metadata = { title: "Métricas" };

export default function Page() {
  return <MetricsDashboard />;
}
