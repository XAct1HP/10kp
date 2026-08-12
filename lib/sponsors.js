// Helper for constructing public sponsor logo URLs from Supabase Storage.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export function sponsorLogoUrl(logoPath) {
  if (!logoPath) return null;
  if (/^https?:\/\//i.test(logoPath)) return logoPath; // already a full URL
  const base = SUPABASE_URL?.replace(/\/$/, "") || "";
  return `${base}/storage/v1/object/public/sponsor-logos/${logoPath}`;
}

// Expand a sponsor row for the client — adds `logo_url`.
export function decorateSponsor(sponsor) {
  if (!sponsor) return sponsor;
  return { ...sponsor, logo_url: sponsorLogoUrl(sponsor.logo_path) };
}
