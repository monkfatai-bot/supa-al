import { VoiceHeader } from "@/components/voice/voice-header";
import { requireAuth } from "@/services/auth/session";

export const metadata = {
  title: "Voice Studio",
  description: "AI-powered voice generation and transcription workspace.",
};

export default async function VoiceLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="flex h-screen flex-col">
      <VoiceHeader />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
