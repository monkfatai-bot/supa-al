import { ImageStudio } from "@/components/image/image-studio";
import { getImageHistorySimple, getSavedPrompts } from "@/services/image/actions";

export const dynamic = "force-dynamic";

export default async function ImagePage() {
  const [history, prompts] = await Promise.all([
    getImageHistorySimple(),
    getSavedPrompts(),
  ]);

  return <ImageStudio initialHistory={history} initialPrompts={prompts} />;
}
