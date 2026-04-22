import { describe, expect, it } from "vitest";
import {
  iterateJsonStat,
  jsonStatToPresentRecords,
  jsonStatToRecords,
  rowMajorStrides,
  type JsonStatDataset,
} from "../lib/jsonstat-parser";

// Captured verbatim from a real Eurostat call:
//   gov_10a_exp?na_item=TE&sector=S13&unit=MIO_EUR&geo=DE&cofog99=GF01&cofog99=GF07&time=2021&time=2022
// Strides for size [1,1,1,2,1,1,2] are [4,4,4,2,2,2,1], so:
//   GF01 2021 -> flat 0 -> 219515
//   GF01 2022 -> flat 1 -> 232877 (provisional)
//   GF07 2021 -> flat 2 -> 313269
//   GF07 2022 -> flat 3 -> 329207 (provisional)
const EUROSTAT_COFOG_SAMPLE: JsonStatDataset = {
  class: "dataset",
  label: "General government expenditure by function (COFOG)",
  value: { "0": 219515.0, "1": 232877.0, "2": 313269.0, "3": 329207.0 },
  status: { "1": "p", "3": "p" },
  id: ["freq", "unit", "sector", "cofog99", "na_item", "geo", "time"],
  size: [1, 1, 1, 2, 1, 1, 2],
  dimension: {
    freq: {
      label: "Time frequency",
      category: { index: { A: 0 }, label: { A: "Annual" } },
    },
    unit: {
      label: "Unit of measure",
      category: { index: { MIO_EUR: 0 }, label: { MIO_EUR: "Million euro" } },
    },
    sector: {
      label: "Sector",
      category: { index: { S13: 0 }, label: { S13: "General government" } },
    },
    cofog99: {
      label: "Classification of the functions of government (COFOG 1999)",
      category: {
        index: { GF01: 0, GF07: 1 },
        label: { GF01: "General public services", GF07: "Health" },
      },
    },
    na_item: {
      label: "National accounts indicator (ESA 2010)",
      category: {
        index: { TE: 0 },
        label: { TE: "Total general government expenditure" },
      },
    },
    geo: {
      label: "Geopolitical entity (reporting)",
      category: { index: { DE: 0 }, label: { DE: "Germany" } },
    },
    time: {
      label: "Time",
      category: {
        index: { "2021": 0, "2022": 1 },
        label: { "2021": "2021", "2022": "2022" },
      },
    },
  },
};

describe("rowMajorStrides", () => {
  it("computes row-major strides from dimension sizes", () => {
    expect(rowMajorStrides([1, 1, 1, 2, 1, 1, 2])).toEqual([4, 4, 4, 2, 2, 2, 1]);
    expect(rowMajorStrides([3, 4])).toEqual([4, 1]);
    expect(rowMajorStrides([2])).toEqual([1]);
    expect(rowMajorStrides([])).toEqual([]);
  });
});

describe("iterateJsonStat — real Eurostat COFOG sample", () => {
  it("yields one record per (cofog, time) pair in odometer order", () => {
    const records = jsonStatToRecords(EUROSTAT_COFOG_SAMPLE);
    expect(records).toHaveLength(4);
  });

  it("binds the right value to each coordinate", () => {
    const records = jsonStatToRecords(EUROSTAT_COFOG_SAMPLE);

    // Flat 0: GF01 2021
    expect(records[0].labels.cofog99).toBe("GF01");
    expect(records[0].labels.time).toBe("2021");
    expect(records[0].value).toBe(219515.0);
    expect(records[0].status).toBeNull();

    // Flat 1: GF01 2022 (provisional)
    expect(records[1].labels.cofog99).toBe("GF01");
    expect(records[1].labels.time).toBe("2022");
    expect(records[1].value).toBe(232877.0);
    expect(records[1].status).toBe("p");

    // Flat 2: GF07 2021
    expect(records[2].labels.cofog99).toBe("GF07");
    expect(records[2].labels.time).toBe("2021");
    expect(records[2].value).toBe(313269.0);
    expect(records[2].status).toBeNull();

    // Flat 3: GF07 2022 (provisional)
    expect(records[3].labels.cofog99).toBe("GF07");
    expect(records[3].labels.time).toBe("2022");
    expect(records[3].value).toBe(329207.0);
    expect(records[3].status).toBe("p");
  });

  it("exposes human-readable labels for each coordinate", () => {
    const records = jsonStatToRecords(EUROSTAT_COFOG_SAMPLE);
    expect(records[0].labelTexts.cofog99).toBe("General public services");
    expect(records[2].labelTexts.cofog99).toBe("Health");
    expect(records[0].labelTexts.geo).toBe("Germany");
    expect(records[0].labelTexts.unit).toBe("Million euro");
  });
});

describe("jsonStatToPresentRecords", () => {
  it("filters out records whose value is null (missing from sparse value map)", () => {
    // Simulate a sparse dataset where one cell is missing.
    const sparseDoc: JsonStatDataset = {
      ...EUROSTAT_COFOG_SAMPLE,
      value: { "0": 100.0, "2": 200.0 }, // flat 1 and 3 absent
    };
    const records = jsonStatToPresentRecords(sparseDoc);
    expect(records).toHaveLength(2);
    expect(records[0].value).toBe(100.0);
    expect(records[1].value).toBe(200.0);
    expect(records[0].labels.time).toBe("2021");
    expect(records[1].labels.time).toBe("2021");
  });
});

describe("iterateJsonStat — single-cell response", () => {
  it("handles a fully-reduced request (size = [1,...,1])", () => {
    const doc: JsonStatDataset = {
      class: "dataset",
      id: ["unit", "geo", "time"],
      size: [1, 1, 1],
      value: { "0": 42.5 },
      dimension: {
        unit: { category: { index: { PC_GDP: 0 }, label: { PC_GDP: "% of GDP" } } },
        geo: { category: { index: { FR: 0 }, label: { FR: "France" } } },
        time: { category: { index: { "2023": 0 }, label: { "2023": "2023" } } },
      },
    };
    const records = jsonStatToRecords(doc);
    expect(records).toHaveLength(1);
    expect(records[0].value).toBe(42.5);
    expect(records[0].labels).toEqual({ unit: "PC_GDP", geo: "FR", time: "2023" });
  });
});

describe("iterateJsonStat — array-form category.index", () => {
  it("supports category.index as an array as well as an object", () => {
    const doc: JsonStatDataset = {
      class: "dataset",
      id: ["geo"],
      size: [3],
      value: { "0": 1, "1": 2, "2": 3 },
      dimension: {
        geo: {
          category: {
            // some Eurostat payloads use array form
            index: ["DE", "FR", "IT"] as unknown as Record<string, number>,
            label: { DE: "Germany", FR: "France", IT: "Italy" },
          },
        },
      },
    };
    const records = jsonStatToRecords(doc);
    expect(records.map((r) => r.labels.geo)).toEqual(["DE", "FR", "IT"]);
    expect(records.map((r) => r.value)).toEqual([1, 2, 3]);
  });
});

describe("iterateJsonStat — uses generator lazily", () => {
  it("supports early termination via `break`", () => {
    const doc: JsonStatDataset = {
      class: "dataset",
      id: ["geo"],
      size: [5],
      value: { "0": 1, "1": 2, "2": 3, "3": 4, "4": 5 },
      dimension: {
        geo: {
          category: {
            index: { A: 0, B: 1, C: 2, D: 3, E: 4 },
          },
        },
      },
    };
    let count = 0;
    for (const _ of iterateJsonStat(doc)) {
      count += 1;
      if (count === 2) break;
    }
    expect(count).toBe(2);
  });
});
