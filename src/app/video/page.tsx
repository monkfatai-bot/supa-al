import { VideoStudio } from "@/components/video/video-studio";
import { getVideoHistorySimple } from "@/services/video/actions";

export const dynamic = "force-dynamic";

export default async function VideoPage() {
  const history = await getVideoHistorySimple();

  return <VideoStudio initialHistory={history} />;
}
