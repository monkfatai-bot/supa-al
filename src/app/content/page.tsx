import { ContentStudio } from "@/components/content/content-studio";
import { getContentList } from "@/services/content/actions";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const contentList = await getContentList();

  return <ContentStudio initialContent={contentList} />;
}
