import { ComicDetail } from "@/components/detail/ComicDetail";

export default async function InterceptedComicModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ComicDetail id={id} asModal />;
}
