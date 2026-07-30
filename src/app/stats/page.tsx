import { Suspense } from "react";
import { StatsView } from "@/components/stats/StatsView";

export default function StatsPage() {
  return (
    <Suspense>
      <StatsView />
    </Suspense>
  );
}
