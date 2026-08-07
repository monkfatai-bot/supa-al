/**
 * Supa AI — Region constants.
 *
 * Catalogs used by the user-facing Settings → Profile form:
 *
 *   - `COUNTRIES` — a trimmed list of ~50 common countries (ISO 3166-1
 *     alpha-2 code + flag emoji + display name). Not exhaustive — focus is
 *     on the most common residence countries.
 *   - `TIME_ZONES` — common IANA time-zone identifiers grouped by region,
 *     suitable for a `<Select>`.
 *
 * Both lists are intentionally small + hand-curated. They live in the
 * constants module so the dropdown choices stay consistent across the
 * Profile form, the onboarding wizard, and any future surface.
 *
 * @module @/lib/constants/regions
 */

/** A country entry used by the Profile → Country `<Select>`. */
export interface Country {
  /** ISO 3166-1 alpha-2 code (lowercased for storage). */
  code: string;
  /** Display label. */
  name: string;
  /** Flag emoji derived from the country code. */
  flag: string;
}

/** Convert an ISO alpha-2 code into the corresponding flag emoji. */
export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  const upper = code.toUpperCase();
  const cp1 = 0x1f1e6 + (upper.charCodeAt(0) - "A".charCodeAt(0));
  const cp2 = 0x1f1e6 + (upper.charCodeAt(1) - "A".charCodeAt(0));
  return String.fromCodePoint(cp1, cp2);
}

/** Trimmed list of ~50 common residence countries. */
export const COUNTRIES: readonly Country[] = [
  { code: "us", name: "United States", flag: "🇺🇸" },
  { code: "ca", name: "Canada", flag: "🇨🇦" },
  { code: "mx", name: "Mexico", flag: "🇲🇽" },
  { code: "br", name: "Brazil", flag: "🇧🇷" },
  { code: "ar", name: "Argentina", flag: "🇦🇷" },
  { code: "gb", name: "United Kingdom", flag: "🇬🇧" },
  { code: "ie", name: "Ireland", flag: "🇮🇪" },
  { code: "fr", name: "France", flag: "🇫🇷" },
  { code: "de", name: "Germany", flag: "🇩🇪" },
  { code: "it", name: "Italy", flag: "🇮🇹" },
  { code: "es", name: "Spain", flag: "🇪🇸" },
  { code: "pt", name: "Portugal", flag: "🇵🇹" },
  { code: "nl", name: "Netherlands", flag: "🇳🇱" },
  { code: "be", name: "Belgium", flag: "🇧🇪" },
  { code: "ch", name: "Switzerland", flag: "🇨🇭" },
  { code: "at", name: "Austria", flag: "🇦🇹" },
  { code: "se", name: "Sweden", flag: "🇸🇪" },
  { code: "no", name: "Norway", flag: "🇳🇴" },
  { code: "dk", name: "Denmark", flag: "🇩🇰" },
  { code: "fi", name: "Finland", flag: "🇫🇮" },
  { code: "pl", name: "Poland", flag: "🇵🇱" },
  { code: "cz", name: "Czechia", flag: "🇨🇿" },
  { code: "gr", name: "Greece", flag: "🇬🇷" },
  { code: "tr", name: "Türkiye", flag: "🇹🇷" },
  { code: "ru", name: "Russia", flag: "🇷🇺" },
  { code: "ua", name: "Ukraine", flag: "🇺🇦" },
  { code: "ae", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "sa", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "il", name: "Israel", flag: "🇮🇱" },
  { code: "eg", name: "Egypt", flag: "🇪🇬" },
  { code: "za", name: "South Africa", flag: "🇿🇦" },
  { code: "ng", name: "Nigeria", flag: "🇳🇬" },
  { code: "ke", name: "Kenya", flag: "🇰🇪" },
  { code: "in", name: "India", flag: "🇮🇳" },
  { code: "pk", name: "Pakistan", flag: "🇵🇰" },
  { code: "bd", name: "Bangladesh", flag: "🇧🇩" },
  { code: "sg", name: "Singapore", flag: "🇸🇬" },
  { code: "my", name: "Malaysia", flag: "🇲🇾" },
  { code: "id", name: "Indonesia", flag: "🇮🇩" },
  { code: "ph", name: "Philippines", flag: "🇵🇭" },
  { code: "th", name: "Thailand", flag: "🇹🇭" },
  { code: "vn", name: "Vietnam", flag: "🇻🇳" },
  { code: "cn", name: "China", flag: "🇨🇳" },
  { code: "hk", name: "Hong Kong", flag: "🇭🇰" },
  { code: "tw", name: "Taiwan", flag: "🇹🇼" },
  { code: "jp", name: "Japan", flag: "🇯🇵" },
  { code: "kr", name: "South Korea", flag: "🇰🇷" },
  { code: "au", name: "Australia", flag: "🇦🇺" },
  { code: "nz", name: "New Zealand", flag: "🇳🇿" },
];

/** Look up a `Country` by its ISO alpha-2 code. */
export function findCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  return COUNTRIES.find((c) => c.code === lower) ?? null;
}

/** A time-zone entry used by the Profile → Time zone `<Select>`. */
export interface TimeZoneGroup {
  /** Display label for the `<SelectGroup>`. */
  region: string;
  /** IANA zone identifiers in this region. */
  zones: readonly string[];
}

/** Common IANA time zones grouped by region. */
export const TIME_ZONES: readonly TimeZoneGroup[] = [
  {
    region: "Universal",
    zones: ["UTC"],
  },
  {
    region: "Americas",
    zones: [
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
      "America/Toronto",
      "America/Mexico_City",
      "America/Bogota",
      "America/Sao_Paulo",
      "America/Buenos_Aires",
    ],
  },
  {
    region: "Europe & Africa",
    zones: [
      "Europe/London",
      "Europe/Dublin",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Brussels",
      "Europe/Zurich",
      "Europe/Vienna",
      "Europe/Stockholm",
      "Europe/Oslo",
      "Europe/Copenhagen",
      "Europe/Helsinki",
      "Europe/Warsaw",
      "Europe/Athens",
      "Europe/Istanbul",
      "Africa/Cairo",
      "Africa/Lagos",
      "Africa/Johannesburg",
    ],
  },
  {
    region: "Middle East & Asia",
    zones: [
      "Asia/Dubai",
      "Asia/Riyadh",
      "Asia/Tehran",
      "Asia/Karachi",
      "Asia/Kolkata",
      "Asia/Dhaka",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Manila",
      "Asia/Hong_Kong",
      "Asia/Shanghai",
      "Asia/Taipei",
      "Asia/Seoul",
      "Asia/Tokyo",
    ],
  },
  {
    region: "Oceania",
    zones: ["Australia/Sydney", "Australia/Perth", "Pacific/Auckland"],
  },
];

/** Flat list of all time-zone identifiers across all groups. */
export const ALL_TIME_ZONES: readonly string[] = TIME_ZONES.flatMap((g) => g.zones);
