// Pure renderer for "entity Markdown cards" — a deterministic, LLM-friendly
// summary of one entity stitched together from canonical tables.
//
// The renderer takes a fully-populated `EntityCardInput` (a plain JS object,
// no DB calls) and returns a Markdown string. The data fetcher lives in the
// edge function `supabase/functions/entity/index.ts`; this module is only
// the layout so we can vitest it.

export interface EntityCardInput {
  entity: {
    id: string;
    kind: string;
    canonical_name: string;
    slug: string;
    summary: string | null;
    first_seen_at: string;
  };
  aliases: Array<{ scheme: string; value: string; trust_level: number | null }>;
  claims: Array<{
    key: string;
    value: unknown;
    value_type: string;
    valid_from: string | null;
    valid_to: string | null;
    data_source: string;
    trust_level: number | null;
  }>;
  relationshipsOut: Array<{
    predicate: string;
    object: { id: string; kind: string; canonical_name: string; slug: string } | null;
    valid_from: string | null;
    valid_to: string | null;
    role: string | null;
  }>;
  relationshipsIn: Array<{
    predicate: string;
    subject: { id: string; kind: string; canonical_name: string; slug: string } | null;
    valid_from: string | null;
    valid_to: string | null;
  }>;
  recentEvents: Array<{
    event_type: string;
    title: string;
    event_timestamp: string;
    source: string | null;
    source_url: string | null;
  }>;
}

function renderClaimValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'object') return String(value);
  const v = value as Record<string, unknown>;
  switch (type) {
    case 'number': return String(v.n);
    case 'string': return String(v.s);
    case 'date': return String(v.d);
    case 'boolean': return v.b ? 'true' : 'false';
    case 'url': return String(v.url);
    case 'currency': return `${v.amount} ${v.currency}`;
    case 'range': return `${v.low}–${v.high} ${v.unit ?? ''}`.trim();
    default: return JSON.stringify(value);
  }
}

function fmtDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return '';
  const f = from ? new Date(from).toISOString().slice(0, 10) : '?';
  const t = to ? new Date(to).toISOString().slice(0, 10) : 'present';
  return ` (${f}–${t})`;
}

export function renderEntityCard(input: EntityCardInput): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${input.entity.canonical_name}`);
  lines.push(`**Kind**: ${input.entity.kind}  **Slug**: \`${input.entity.slug}\``);
  if (input.entity.summary) lines.push('');
  if (input.entity.summary) lines.push(input.entity.summary);
  lines.push('');

  // Aliases
  if (input.aliases.length > 0) {
    lines.push('## Identifiers');
    const grouped = new Map<string, string[]>();
    for (const a of input.aliases) {
      if (!grouped.has(a.scheme)) grouped.set(a.scheme, []);
      grouped.get(a.scheme)!.push(a.value);
    }
    for (const [scheme, values] of grouped) {
      lines.push(`- **${scheme}**: ${values.join(', ')}`);
    }
    lines.push('');
  }

  // Claims (key/value facts)
  if (input.claims.length > 0) {
    lines.push('## Facts');
    // Group by key, ordered by trust_level then by valid_from desc.
    const byKey = new Map<string, typeof input.claims>();
    for (const c of input.claims) {
      if (!byKey.has(c.key)) byKey.set(c.key, []);
      byKey.get(c.key)!.push(c);
    }
    for (const [key, entries] of byKey) {
      const sorted = entries.slice().sort((a, b) => {
        if ((a.trust_level ?? 9) !== (b.trust_level ?? 9)) return (a.trust_level ?? 9) - (b.trust_level ?? 9);
        return (b.valid_from ?? '').localeCompare(a.valid_from ?? '');
      });
      const winner = sorted[0];
      const rendered = renderClaimValue(winner.value, winner.value_type);
      const range = fmtDateRange(winner.valid_from, winner.valid_to);
      lines.push(`- **${key}**: ${rendered}${range} _(source: ${winner.data_source})_`);
    }
    lines.push('');
  }

  // Outgoing relationships
  if (input.relationshipsOut.length > 0) {
    lines.push('## Outgoing relationships');
    const byPredicate = new Map<string, typeof input.relationshipsOut>();
    for (const r of input.relationshipsOut) {
      if (!byPredicate.has(r.predicate)) byPredicate.set(r.predicate, []);
      byPredicate.get(r.predicate)!.push(r);
    }
    for (const [predicate, rels] of byPredicate) {
      lines.push(`### ${predicate}`);
      for (const r of rels.slice(0, 20)) {
        const target = r.object ? `[${r.object.canonical_name}](/entity/${r.object.kind}/${r.object.slug})` : '_(unknown)_';
        const role = r.role ? ` — ${r.role}` : '';
        lines.push(`- ${target}${role}${fmtDateRange(r.valid_from, r.valid_to)}`);
      }
      if (rels.length > 20) lines.push(`- _(+${rels.length - 20} more)_`);
    }
    lines.push('');
  }

  // Incoming relationships
  if (input.relationshipsIn.length > 0) {
    lines.push('## Incoming relationships');
    const byPredicate = new Map<string, typeof input.relationshipsIn>();
    for (const r of input.relationshipsIn) {
      if (!byPredicate.has(r.predicate)) byPredicate.set(r.predicate, []);
      byPredicate.get(r.predicate)!.push(r);
    }
    for (const [predicate, rels] of byPredicate) {
      lines.push(`### ${predicate}`);
      for (const r of rels.slice(0, 10)) {
        const subject = r.subject ? `[${r.subject.canonical_name}](/entity/${r.subject.kind}/${r.subject.slug})` : '_(unknown)_';
        lines.push(`- ${subject}${fmtDateRange(r.valid_from, r.valid_to)}`);
      }
      if (rels.length > 10) lines.push(`- _(+${rels.length - 10} more)_`);
    }
    lines.push('');
  }

  // Timeline of recent events
  if (input.recentEvents.length > 0) {
    lines.push('## Recent timeline');
    for (const e of input.recentEvents.slice(0, 20)) {
      const dateStr = e.event_timestamp ? new Date(e.event_timestamp).toISOString().slice(0, 10) : 'unknown';
      const link = e.source_url ? ` [↗](${e.source_url})` : '';
      lines.push(`- **${dateStr}** _(${e.event_type})_  ${e.title}${link}`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`_First observed by Poli-Track: ${input.entity.first_seen_at}_`);

  return lines.join('\n');
}
