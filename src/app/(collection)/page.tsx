import { BoardView } from "@/components/board/BoardView";

export default function HomePage() {
  // Chrome and the Suspense boundary live in this group's layout.
  return <BoardView />;
}
