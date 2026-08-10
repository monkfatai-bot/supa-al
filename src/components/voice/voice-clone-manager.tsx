"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Trash2, Users, CheckCircle, XCircle } from "lucide-react";
import { getVoiceProfiles, deleteVoiceProfile } from "@/services/voice/actions";
import type { VoiceProfile } from "@/types/generated/database";

export function VoiceCloneManager() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const data = await getVoiceProfiles();
      setProfiles(data);
      setIsLoading(false);
    }
    load();
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteVoiceProfile(id);
    if (result.success) {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    }
    setDeletingId(null);
  }

  if (isLoading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <span className="animate-spin">&#9696;</span>
        <span className="ml-2 text-sm text-muted-foreground">Loading voice profiles...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="text-base font-semibold">Voice Profiles</h3>
          <Badge variant="secondary">{profiles.length}</Badge>
        </div>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Upload Sample
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No voice profiles yet. Clone a voice to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <Card key={profile.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm">{profile.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(profile.id)}
                    disabled={deletingId === profile.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    {profile.provider}
                  </Badge>
                  {profile.language && (
                    <Badge variant="secondary" className="text-xs">
                      {profile.language}
                    </Badge>
                  )}
                  <Badge
                    variant={profile.is_verified ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {profile.is_verified ? (
                      <><CheckCircle className="mr-1 h-3 w-3" />Verified</>
                    ) : (
                      <><XCircle className="mr-1 h-3 w-3" />Unverified</>
                    )}
                  </Badge>
                </div>
                {profile.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {profile.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
