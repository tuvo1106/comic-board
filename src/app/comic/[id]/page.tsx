import { ComicDetail } from "@/components/detail/ComicDetail";

/** Full-page detail — used for deep links and hard refreshes. */
export default async function ComicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ComicDetail id={id} />;
}
