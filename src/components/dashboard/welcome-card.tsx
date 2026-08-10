import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import type { Profile } from "@/types/generated/database";

interface WelcomeCardProps {
  profile: Profile;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function WelcomeCard({ profile }: WelcomeCardProps) {
  const greeting = getGreeting();
  const displayName = profile.full_name ?? "there";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">
              {greeting}, {displayName}
            </CardTitle>
            <CardDescription>
              Welcome to your Supa AI workspace. Here is an overview of your
              account and recent activity.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            Foundation
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="mb-2 text-sm font-medium">Getting Started</h3>
          <p className="text-muted-foreground text-sm">
            Your dashboard is ready. Navigate the sidebar to explore different
            sections of the platform. Visit Settings to customize your profile
            and preferences. More features will be available in upcoming
            releases.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
