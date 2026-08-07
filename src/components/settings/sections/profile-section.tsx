"use client";

/**
 * Supa AI — Settings / Profile section.
 *
 * A Zod-validated form for the caller's editable profile fields. The form
 * is uncontrolled at the field level (state held in `useState` mirrors)
 * so per-field errors + dirty-state are easy to compute. On submit, the
 * dirty fields are sent to `/api/profile/update` via the
 * `useUpdateProfile` TanStack Query mutation.
 *
 * Field list:
 *   - full_name (Input)
 *   - username (Input, lowercased on blur)
 *   - phone_number (Input)
 *   - country (Select — ~50 ISO 3166-1 alpha-2 codes from `COUNTRIES`)
 *   - time_zone (Select — grouped IANA zones from `TIME_ZONES`)
 *   - locale (Select — supported locales from `SUPPORTED_LOCALES`)
 *   - bio (Textarea, max 500 chars with live counter)
 *   - company (Input)
 *   - job_title (Input)
 *   - website (Input, URL validation)
 *
 * Avatar uploads are rendered by the sibling {@link AvatarUpload} component
 * (live above the form).
 *
 * @module @/components/settings/sections/profile-section
 */
import * as React from "react";
import { toast } from "sonner";
import { z } from "zod";

import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  SUPPORTED_LOCALES,
  TIME_ZONES,
  findCountry,
} from "@/lib/constants";
import type { Profile } from "@/lib/auth";
import { useUpdateProfile } from "@/hooks/use-settings";
import type { SettingsApiError } from "@/hooks/use-settings";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BIO_MAX = 500;

/** Form values shape — every field is a string (we coerce on submit). */
interface ProfileFormValues {
  full_name: string;
  username: string;
  phone_number: string;
  country: string;
  time_zone: string;
  locale: string;
  bio: string;
  company: string;
  job_title: string;
  website: string;
}

/** Locale label map (BCP-47 → human label). */
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  ja: "日本語",
  zh: "中文",
  ar: "العربية",
};

function toFormValues(profile: Profile): ProfileFormValues {
  return {
    full_name: profile.full_name ?? "",
    username: profile.username ?? "",
    phone_number: profile.phone_number ?? "",
    country: profile.country ?? "",
    time_zone: profile.time_zone ?? "",
    locale: profile.locale ?? "",
    bio: profile.bio ?? "",
    company: profile.company ?? "",
    job_title: profile.job_title ?? "",
    website: profile.website ?? "",
  };
}

export interface ProfileSectionProps {
  profile: Profile;
  email?: string | null;
}

export function ProfileSection({ profile, email }: ProfileSectionProps) {
  const updateProfile = useUpdateProfile();
  const [values, setValues] = React.useState<ProfileFormValues>(() =>
    toFormValues(profile),
  );
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Re-sync when the upstream profile changes (e.g. after avatar upload
  // invalidates + refetches the profile query).
  React.useEffect(() => {
    setValues(toFormValues(profile));
  }, [profile]);

  function setField<K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    // Local pre-validation: bio length + website URL.
    const errors: Record<string, string> = {};
    if (values.bio.length > BIO_MAX) {
      errors.bio = `Bio must be at most ${BIO_MAX} characters.`;
    }
    if (values.website.trim() && !z.string().url().safeParse(values.website.trim()).success) {
      errors.website = "Please enter a valid URL (e.g. https://example.com).";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      await updateProfile.mutateAsync({
        full_name: values.full_name.trim() || null,
        username: values.username.trim() || null,
        phone_number: values.phone_number.trim() || null,
        country: values.country || null,
        time_zone: values.time_zone,
        locale: values.locale,
        bio: values.bio.trim() || null,
        company: values.company.trim() || null,
        job_title: values.job_title.trim() || null,
        website: values.website.trim() || null,
      });
      toast.success("Profile saved", {
        description: "Your changes are live.",
      });
    } catch (err) {
      const apiErr = err as SettingsApiError;
      if (apiErr?.fields) {
        setFieldErrors(apiErr.fields);
      }
      setSubmitError(apiErr?.message ?? "Couldn't save profile.");
    }
  }

  const countryMeta = findCountry(values.country);

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <AvatarUpload profile={profile} email={email} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name" error={fieldErrors.full_name}>
          <Input
            id="full_name"
            value={values.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            maxLength={80}
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.full_name)}
          />
        </Field>

        <Field label="Username" htmlFor="username" error={fieldErrors.username} hint="3–30 chars: letters, digits, underscore.">
          <Input
            id="username"
            value={values.username}
            onChange={(e) => setField("username", e.target.value)}
            onBlur={(e) => setField("username", e.target.value.trim())}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(fieldErrors.username)}
          />
        </Field>

        <Field label="Phone number" htmlFor="phone_number" error={fieldErrors.phone_number}>
          <Input
            id="phone_number"
            type="tel"
            value={values.phone_number}
            onChange={(e) => setField("phone_number", e.target.value)}
            maxLength={32}
            autoComplete="tel"
            aria-invalid={Boolean(fieldErrors.phone_number)}
          />
        </Field>

        <Field label="Company" htmlFor="company" error={fieldErrors.company}>
          <Input
            id="company"
            value={values.company}
            onChange={(e) => setField("company", e.target.value)}
            maxLength={100}
            autoComplete="organization"
            aria-invalid={Boolean(fieldErrors.company)}
          />
        </Field>

        <Field label="Job title" htmlFor="job_title" error={fieldErrors.job_title}>
          <Input
            id="job_title"
            value={values.job_title}
            onChange={(e) => setField("job_title", e.target.value)}
            maxLength={100}
            autoComplete="organization-title"
            aria-invalid={Boolean(fieldErrors.job_title)}
          />
        </Field>

        <Field label="Website" htmlFor="website" error={fieldErrors.website} hint="Include https://">
          <Input
            id="website"
            type="url"
            inputMode="url"
            value={values.website}
            onChange={(e) => setField("website", e.target.value)}
            maxLength={2048}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://example.com"
            aria-invalid={Boolean(fieldErrors.website)}
          />
        </Field>

        <Field label="Country" htmlFor="country" error={fieldErrors.country}>
          <Select
            value={values.country}
            onValueChange={(v) => setField("country", v)}
          >
            <SelectTrigger id="country" className="w-full" aria-invalid={Boolean(fieldErrors.country)}>
              <SelectValue placeholder="Select country">
                {countryMeta ? (
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true">{countryMeta.flag}</span>
                    <span>{countryMeta.name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select country</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true">{c.flag}</span>
                    <span>{c.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Time zone" htmlFor="time_zone" error={fieldErrors.time_zone}>
          <Select
            value={values.time_zone}
            onValueChange={(v) => setField("time_zone", v)}
          >
            <SelectTrigger id="time_zone" className="w-full" aria-invalid={Boolean(fieldErrors.time_zone)}>
              <SelectValue placeholder="Select time zone" />
            </SelectTrigger>
            <SelectContent>
              {TIME_ZONES.map((group) => (
                <SelectGroup key={group.region}>
                  <SelectLabel>{group.region}</SelectLabel>
                  {group.zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Locale" htmlFor="locale" error={fieldErrors.locale}>
          <Select
            value={values.locale}
            onValueChange={(v) => setField("locale", v)}
          >
            <SelectTrigger id="locale" className="w-full" aria-invalid={Boolean(fieldErrors.locale)}>
              <SelectValue placeholder="Select locale" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map((code) => (
                <SelectItem key={code} value={code}>
                  {LOCALE_LABELS[code] ?? code}
                  <span className="ml-2 text-xs text-muted-foreground">({code})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label="Bio"
        htmlFor="bio"
        error={fieldErrors.bio}
        hint={`${values.bio.length} / ${BIO_MAX}`}
      >
        <Textarea
          id="bio"
          value={values.bio}
          onChange={(e) => setField("bio", e.target.value.slice(0, BIO_MAX))}
          maxLength={BIO_MAX}
          rows={4}
          placeholder="A short description shown on your public profile."
          aria-invalid={Boolean(fieldErrors.bio)}
        />
      </Field>

      {submitError ? (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setValues(toFormValues(profile))}
          disabled={updateProfile.isPending}
        >
          Reset
        </Button>
        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
