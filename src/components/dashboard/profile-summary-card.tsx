"use client";

/**
 * Supa AI — Profile summary card.
 *
 * The post-login dashboard's "Profile Summary" surface. Renders the user's
 * avatar (with initials fallback), full name, @username, email, job title @
 * company, country (with flag emoji when the value looks like an ISO-2
 * code), and bio (truncated). An "Edit Profile" button switches the
 * dashboard to the settings/profile section.
 *
 * Avatar fallback: derived from `full_name` (first + last initials), falling
 * back to `username` and finally to "U". This mirrors the topbar user-menu
 * initials derivation so the two surfaces never disagree.
 *
 * Country flag: if `country` is a 2-letter ASCII uppercase code (e.g. "US",
 * "GB", "NG"), we render the corresponding regional-indicator flag emoji.
 * Otherwise we render the raw string as-is (the value might be a full
 * country name like "United States" — there's no point trying to map that
 * client-side without a lookup table).
 *
 * @module @/components/dashboard/profile-summary-card
 */
import * as React from "react";
import {
  Briefcase,
  Globe,
  Mail,
  MapPin,
  Pencil,
  User as UserIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { truncate } from "@/lib/utils/index";
import type { Profile } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export interface ProfileSummaryCardProps {
  /** The user's profile row. */
  profile: Profile;
  /** The user's email (from `auth.users.email`, threaded via the page). */
  email: string | null;
  /** Called when the user clicks "Edit Profile". */
  onEditProfile: () => void;
  /** Extra class names on the card. */
  className?: string;
}

/** ISO-2 country code pattern (2 ASCII letters). */
const ISO2 = /^[A-Za-z]{2}$/;

/**
 * Convert a 2-letter ISO country code into the corresponding flag emoji
 * using regional indicator symbols. Returns the input unchanged when it
 * isn't a 2-letter ASCII code (so a full country name renders as text).
 */
function countryFlag(country: string | null): string | null {
  if (!country || !ISO2.test(country)) return null;
  const upper = country.toUpperCase();
  // Regional indicator A starts at code point 0x1F1E6; "A" is 0x41.
  const A = 0x1f1e6 - 0x41;
  const cp1 = A + upper.charCodeAt(0);
  const cp2 = A + upper.charCodeAt(1);
  return String.fromCodePoint(cp1, cp2);
}

/** Derive display initials from a name / username. */
function initialsFor(profile: Profile): string {
  const name = (profile.full_name ?? "").trim();
  if (name) {
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
  }
  if (profile.username) {
    return profile.username.slice(0, 2).toUpperCase();
  }
  return "U";
}

export function ProfileSummaryCard({
  profile,
  email,
  onEditProfile,
  className,
}: ProfileSummaryCardProps) {
  const fullName = (profile.full_name ?? "").trim() || "Unnamed user";
  const flag = countryFlag(profile.country);
  const jobLine = [profile.job_title, profile.company]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(" · ");

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-4">
        <div className="flex items-center gap-2">
          <UserIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-sm font-semibold">Profile</CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onEditProfile}
          className="gap-1.5"
          aria-label="Edit profile"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit Profile
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        {/* Avatar + identity ------------------------------------------------ */}
        <div className="flex items-start gap-4">
          <Avatar className="size-16 rounded-full">
            {profile.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="text-lg font-medium">
              {initialsFor(profile)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-base font-semibold leading-tight">
              {fullName}
            </p>
            {profile.username ? (
              <p className="truncate text-sm text-muted-foreground">
                @{profile.username}
              </p>
            ) : null}
            {email ? (
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <Mail className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{email}</span>
              </p>
            ) : null}
          </div>
        </div>

        <Separator />

        {/* Detail rows ------------------------------------------------------ */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {jobLine ? (
            <DetailRow icon={Briefcase} label="Role">
              {jobLine}
            </DetailRow>
          ) : null}
          {profile.country ? (
            <DetailRow icon={MapPin} label="Country">
              <span className="inline-flex items-center gap-1.5">
                {flag ? (
                  <span aria-hidden="true" className="text-base leading-none">
                    {flag}
                  </span>
                ) : null}
                <span>{profile.country}</span>
              </span>
            </DetailRow>
          ) : null}
          {profile.website ? (
            <DetailRow icon={Globe} label="Website">
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-brand transition-opacity hover:opacity-80"
              >
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            </DetailRow>
          ) : null}
          <DetailRow icon={Mail} label="Verified">
            {profile.email_verified ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
                Pending
              </span>
            )}
          </DetailRow>
        </dl>

        {/* Bio -------------------------------------------------------------- */}
        {profile.bio ? (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bio
            </p>
            <p className="text-sm text-foreground/90 text-pretty">
              {truncate(profile.bio, 240)}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Small helper row: an icon + a label + a value, in a stable 3-col grid. */
function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Briefcase;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-0.5">
        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="truncate text-sm">{children}</dd>
      </div>
    </div>
  );
}
