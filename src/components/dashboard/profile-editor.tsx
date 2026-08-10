"use client";

import { useState } from "react";
import { Save, Loader2, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile } from "@/services/auth/actions";
import { uploadAvatar, removeAvatar } from "@/services/avatar/actions";
import { getInitials } from "@/lib/utils";
import { toast } from "sonner";

interface ProfileEditorProps {
  userName: string | null;
  avatarUrl: string | null;
  userId: string;
}

export function ProfileEditor({ userName, avatarUrl, userId }: ProfileEditorProps) {
  const [name, setName] = useState(userName ?? "");
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function handleSaveProfile() {
    setIsSaving(true);
    const result = await updateProfile({ fullName: name.trim() || null });
    if (result.success) {
      toast.success("Profile updated");
    } else {
      toast.error(result.message);
    }
    setIsSaving(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);

    const result = await uploadAvatar(formData);
    if (result.success && result.avatarUrl) {
      setCurrentAvatar(result.avatarUrl);
      toast.success("Avatar updated");
    } else {
      toast.error(result.message);
    }
    setIsUploading(false);
  }

  async function handleRemoveAvatar() {
    const result = await removeAvatar();
    if (result.success) {
      setCurrentAvatar(null);
      toast.success("Avatar removed");
    } else {
      toast.error(result.message);
    }
  }

  const initials = getInitials(name);
  const hasChanges = (name.trim() !== (userName ?? ""));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your display name and avatar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={currentAvatar ?? undefined} alt={name} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <Button variant="outline" size="sm" asChild disabled={isUploading}>
                  {isUploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                  Upload
                </Button>
              </Label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={isUploading}
              />
              {currentAvatar && (
                <Button variant="ghost" size="sm" onClick={handleRemoveAvatar}>
                  <Trash2 className="mr-1 h-3 w-3" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">PNG, JPEG, WebP, or GIF. Max 2MB.</p>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="display-name">Display Name</Label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={100}
          />
        </div>

        {/* User ID (read-only) */}
        <div className="space-y-2">
          <Label>User ID</Label>
          <p className="text-muted-foreground font-mono text-xs">{userId.slice(0, 8)}...{userId.slice(-4)}</p>
        </div>

        <Button onClick={handleSaveProfile} disabled={isSaving || !hasChanges}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}
