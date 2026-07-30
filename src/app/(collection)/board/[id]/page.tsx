import { BoardView } from "@/components/board/BoardView";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Chrome and the Suspense boundary live in this group's layout.
  return <BoardView boardId={id} />;
}
