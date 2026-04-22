// Pure parser for Eurostat JSON-stat 2.0 responses.
//
// JSON-stat uses a row-major (C-order) flat `value` object keyed by the
// integer offset of a multi-dimensional coordinate. To decode:
//
//   1. `id` gives the dimension order, e.g. ["freq","unit","sector","cofog99","na_item","geo","time"]
//   2. `size` gives the cardinality of each dimension, parallel to `id`
//   3. Each dim has `dimension[<name>].category.index` mapping label -> integer offset
//   4. `value` is a sparse {"<flat_index>": number} object
//   5. `status` is an optional sparse {"<flat_index>": "p"|"e"|"f"|...} object
//
// Row-major strides for size [a,b,c,d] are [b*c*d, c*d, d, 1]. We compute
// the offsets on the fly; each record in the output carries the full
// decoded label map so callers don't have to know anything about the
// flattening.
//
// This module is pure (no network, no Node-specific imports) so it loads
// under Deno, Node, Vite, and vitest identically.

export interface JsonStatDataset {
  class?: string;
  label?: string;
  source?: string;
  updated?: string;
  id: string[];
  size: number[];
  value: Record<string, number | null>;
  status?: Record<string, string>;
  dimension: Record<string, JsonStatDimension>;
}

export interface JsonStatDimension {
  label?: string;
  category: {
    index: Record<string, number> | string[];
    label?: Record<string, string>;
  };
}

export interface JsonStatRecord {
  /** The label-to-label coordinate of this observation across all dimensions. */
  labels: Record<string, string>;
  /** The human-readable label for each dimension's value, when available. */
  labelTexts: Record<string, string>;
  /** The numeric value (null if missing from the sparse value map). */
  value: number | null;
  /** Eurostat status flag ("p" = provisional, "e" = estimated, etc.), or null. */
  status: string | null;
}

/**
 * Normalize a JSON-stat dimension.category.index into a label -> offset map.
 * Eurostat sometimes returns it as an object (keyed by label) and sometimes
 * as an array (implicit offsets). This helper unifies both.
 */
function normalizeIndex(index: Record<string, number> | string[]): Record<string, number> {
  if (Array.isArray(index)) {
    const out: Record<string, number> = {};
    for (let i = 0; i < index.length; i += 1) out[index[i]] = i;
    return out;
  }
  return index;
}

/**
 * Compute row-major strides for the given dimension sizes.
 * strides[i] = product of size[i+1..n-1], with strides[n-1] = 1.
 *
 * Example: size [1,1,1,2,1,1,2] -> strides [4,4,4,2,2,2,1]
 */
export function rowMajorStrides(size: number[]): number[] {
  const n = size.length;
  if (n === 0) return [];
  const strides = new Array<number>(n);
  strides[n - 1] = 1;
  for (let i = n - 2; i >= 0; i -= 1) {
    strides[i] = strides[i + 1] * size[i + 1];
  }
  return strides;
}

/**
 * Enumerate all records in a JSON-stat dataset, yielding one JsonStatRecord
 * per observation (whether present in `value` or not). The caller can filter
 * out null values if they only want present observations.
 *
 * The record order is dictionary-order over dimension indexes, which matches
 * the row-major flattening.
 */
export function* iterateJsonStat(doc: JsonStatDataset): Generator<JsonStatRecord> {
  const strides = rowMajorStrides(doc.size);

  // Precompute, for each dimension, a list of [label, offset] sorted by offset.
  const ordered = doc.id.map((dimName) => {
    const dim = doc.dimension[dimName];
    if (!dim) throw new Error(`JSON-stat: dimension "${dimName}" is declared in id[] but missing from dimension map`);
    const index = normalizeIndex(dim.category.index);
    const labelMap = dim.category.label ?? {};
    const pairs: { code: string; offset: number; label: string }[] = [];
    for (const [code, offset] of Object.entries(index)) {
      pairs.push({ code, offset, label: labelMap[code] ?? code });
    }
    pairs.sort((a, b) => a.offset - b.offset);
    return { dimName, pairs };
  });

  // n-ary odometer across all dimensions.
  const cursor = new Array<number>(doc.id.length).fill(0);
  const total = doc.size.reduce((a, b) => a * b, 1);

  for (let seq = 0; seq < total; seq += 1) {
    // Compute the flat index from the current cursor.
    let flat = 0;
    for (let i = 0; i < cursor.length; i += 1) flat += cursor[i] * strides[i];

    const labels: Record<string, string> = {};
    const labelTexts: Record<string, string> = {};
    for (let i = 0; i < cursor.length; i += 1) {
      const dim = ordered[i];
      const entry = dim.pairs[cursor[i]];
      labels[dim.dimName] = entry.code;
      labelTexts[dim.dimName] = entry.label;
    }

    const value = doc.value[String(flat)] ?? null;
    const status = doc.status?.[String(flat)] ?? null;

    yield { labels, labelTexts, value, status };

    // Advance the cursor.
    for (let i = cursor.length - 1; i >= 0; i -= 1) {
      cursor[i] += 1;
      if (cursor[i] < doc.size[i]) break;
      cursor[i] = 0;
    }
  }
}

/**
 * Convenience: consume the whole generator into an array.
 */
export function jsonStatToRecords(doc: JsonStatDataset): JsonStatRecord[] {
  return Array.from(iterateJsonStat(doc));
}

/**
 * Convenience: filter to records with a non-null value.
 */
export function jsonStatToPresentRecords(doc: JsonStatDataset): JsonStatRecord[] {
  return jsonStatToRecords(doc).filter((r) => r.value !== null);
}
