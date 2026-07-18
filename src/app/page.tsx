import { Suspense } from "react";
import { BoardView } from "@/components/board/BoardView";

export default function HomePage() {
  return (
    <Suspense>
      <BoardView />
    </Suspense>
  );
}
