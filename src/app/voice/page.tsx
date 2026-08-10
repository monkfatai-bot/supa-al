import { VoiceStudio } from "@/components/voice/voice-studio";
import { getVoiceHistory } from "@/services/voice/actions";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const result = await getVoiceHistory({ pageSize: 20 });
  return <VoiceStudio initialHistory={result.items} />;
}
