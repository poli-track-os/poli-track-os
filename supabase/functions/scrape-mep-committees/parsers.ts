// Pure helpers for scrape-mep-committees. Loaded under both Deno and Node.

export const STABLE_UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00Z";

export function slugifyCommitteeForUrl(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function buildCommitteeSourceUrl(externalId: string, committee: string): string {
  return `https://www.europarl.europa.eu/meps/en/${externalId}#committee:${slugifyCommitteeForUrl(committee)}`;
}

// Merge a freshly-scraped committee list with the politician's existing
// committees, preserving the existing entries (so a transient EP page
// glitch can't wipe out a previously-tracked assignment) and case-folding
// the dedup so trivial casing differences don't multiply.
export function mergeCommittees(existing: string[] | null | undefined, scraped: string[]): {
  merged: string[];
  newMemberships: string[];
} {
  const existingArr = existing || [];
  const seenLower = new Set<string>(existingArr.map((c) => c.toLowerCase()));
  const merged = [...existingArr];
  const newMemberships: string[] = [];

  for (const c of scraped) {
    const key = c.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);
    merged.push(c);
    newMemberships.push(c);
  }

  return { merged, newMemberships };
}
