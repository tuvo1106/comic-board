import { Suspense } from "react";
import { BoardView } from "@/components/board/BoardView";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <BoardView boardId={id} />
    </Suspense>
  );
}
