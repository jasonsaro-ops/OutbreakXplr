#!/usr/bin/env node
/**
 * OutbreakXplr data fetcher
 * Pulls public outbreak / disease surveillance sources and writes
 * normalized JSON into /data for GitHub Pages consumption.
 *
 * Sources:
 *  - CDC NORS (foodborne/waterborne/enteric outbreaks)
 *  - CDC NNDSS weekly (measles + selected notifiable conditions)
 *  - WHO Disease Outbreak News
 *  - disease.sh COVID-19 (US national + states)
 *  - Built-in curated measles 2025–2026 + historical anchors
 *
 * Run locally:  node scripts/fetch-outbreak-data.mjs
 * Run via GitHub Action on a schedule.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

mkdirSync(DATA, { recursive: true });

const STATE_CENTROIDS = {
  AL: [32.8, -86.8], AK: [64.2, -152.5], AZ: [34.3, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.4],
  CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], FL: [28.1, -81.7], GA: [32.7, -83.5],
  HI: [20.3, -156.4], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.0, -93.5],
  KS: [38.5, -98.3], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.3, -69.2], MD: [39.0, -76.6],
  MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5],
  MT: [47.0, -110.0], NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7],
  NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.8], ND: [47.5, -100.5], OH: [40.3, -82.8],
  OK: [35.6, -97.5], OR: [44.0, -120.5], PA: [40.9, -77.2], RI: [41.7, -71.5], SC: [33.9, -80.9],
  SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7],
  VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.8], WY: [43.0, -107.6],
  DC: [38.9, -77.0]
};

function jitter(coords, amount = 0.9) {
  return [
    coords[0] + (Math.random() - 0.5) * amount,
    coords[1] + (Math.random() - 0.5) * amount
  ];
}

function stateFromArea(area = "") {
  const a = area.toUpperCase();
  for (const k of Object.keys(STATE_CENTROIDS)) {
    if (a === k || a.startsWith(k + " ") || a.includes(" " + k) || a.startsWith(k)) return k;
  }
  // common full names
  const map = {
    ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
    COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA",
    HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
    KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
    MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO",
    MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND",
    OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI",
    "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT",
    VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI",
    WYOMING: "WY", "DISTRICT OF COLUMBIA": "DC", "NEW YORK CITY": "NY"
  };
  for (const [name, abbr] of Object.entries(map)) {
    if (a.includes(name)) return abbr;
  }
  return "";
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": "OutbreakXplr-GitHubAction/1.0 (public health dashboard)" },
    ...opts
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/* ---------- CURATED (always present, searchable) ---------- */
const CURATED = [
  {
    id: "m-nat-2026",
    date: "2026-10-30",
    disease: "Measles",
    location: "United States (national)",
    state: "",
    county: "",
    cases: 4852,
    level: "federal",
    source: "Curated",
    status: "current",
    lat: 39.8,
    lng: -98.5,
    text: "CDC and public health reporting: approximately 4,852 confirmed measles cases in the United States as of late October 2026 — highest yearly total in decades. ~43 outbreaks; majority outbreak-associated and among unvaccinated or unknown vaccination status. Pennsylvania remains a major hotspot. Numbers are provisional and revised weekly."
  },
  {
    id: "m-nat-2025",
    date: "2025-12-31",
    disease: "Measles",
    location: "United States (national)",
    state: "",
    county: "",
    cases: 2289,
    level: "federal",
    source: "Curated",
    status: "historical",
    lat: 39.8,
    lng: -98.5,
    text: "Full-year 2025 U.S. confirmed measles cases approximately 2,289. Baseline for comparison with the 2026 surge."
  },
  {
    id: "m-pa",
    date: "2026-10-28",
    disease: "Measles",
    location: "Pennsylvania",
    state: "PA",
    county: "",
    cases: 1200,
    level: "state",
    source: "Curated",
    status: "current",
    lat: 40.9,
    lng: -77.2,
    text: "Pennsylvania has been the leading U.S. measles hotspot in 2026 with extensive community transmission, multiple outbreaks, and deaths reported/investigated by state sources."
  },
  {
    id: "m-wi",
    date: "2026-10-25",
    disease: "Measles",
    location: "Wisconsin",
    state: "WI",
    county: "",
    cases: 350,
    level: "state",
    source: "Curated",
    status: "current",
    lat: 44.5,
    lng: -89.5,
    text: "Significant 2026 measles activity in Wisconsin contributing to national totals."
  },
  {
    id: "m-tx",
    date: "2026-10-20",
    disease: "Measles",
    location: "Texas",
    state: "TX",
    county: "",
    cases: 400,
    level: "state",
    source: "Curated",
    status: "current",
    lat: 31.5,
    lng: -99.3,
    text: "Texas reporting elevated measles cases and outbreak-associated transmission in 2026."
  },
  {
    id: "m-oh",
    date: "2026-10-15",
    disease: "Measles",
    location: "Ohio",
    state: "OH",
    county: "",
    cases: 180,
    level: "state",
    source: "Curated",
    status: "current",
    lat: 40.3,
    lng: -82.8,
    text: "Ohio measles activity within the multi-state 2026 surge."
  },
  {
    id: "m-az",
    date: "2026-10-10",
    disease: "Measles",
    location: "Arizona",
    state: "AZ",
    county: "",
    cases: 150,
    level: "state",
    source: "Curated",
    status: "current",
    lat: 34.3,
    lng: -111.7,
    text: "Arizona contributing cases to the 2026 national measles total."
  },
  {
    id: "m-ca",
    date: "2026-09-30",
    disease: "Measles",
    location: "California",
    state: "CA",
    county: "",
    cases: 120,
    level: "state",
    source: "Curated",
    status: "current",
    lat: 37.2,
    lng: -119.5,
    text: "California measles cases and exposure notifications in 2026."
  },
  {
    id: "m-ny",
    date: "2026-09-15",
    disease: "Measles",
    location: "New York (state + NYC)",
    state: "NY",
    county: "",
    cases: 100,
    level: "state",
    source: "Curated",
    status: "current",
    lat: 42.9,
    lng: -75.5,
    text: "New York State and New York City measles activity."
  },
  {
    id: "m-pa-phil",
    date: "2026-10-22",
    disease: "Measles — exposure investigation",
    location: "Philadelphia area, PA",
    state: "PA",
    county: "Philadelphia",
    cases: null,
    level: "county",
    source: "Curated",
    status: "current",
    lat: 39.95,
    lng: -75.17,
    text: "Public exposure notifications and contact tracing related to measles in the Philadelphia metro area during the 2026 Pennsylvania outbreak. Check PA DOH for current exposure locations and dates."
  },
  {
    id: "m-pa-alleg",
    date: "2026-10-18",
    disease: "Measles — exposure investigation",
    location: "Allegheny County, PA",
    state: "PA",
    county: "Allegheny",
    cases: null,
    level: "county",
    source: "Curated",
    status: "current",
    lat: 40.44,
    lng: -79.99,
    text: "County-level measles exposure and case investigation activity in Allegheny County (Pittsburgh region)."
  },
  {
    id: "m-wi-mil",
    date: "2026-10-12",
    disease: "Measles — outbreak cluster",
    location: "Milwaukee area, WI",
    state: "WI",
    county: "Milwaukee",
    cases: null,
    level: "county",
    source: "Curated",
    status: "current",
    lat: 43.04,
    lng: -87.91,
    text: "Cluster / outbreak-associated measles activity reported in the Milwaukee region."
  },
  {
    id: "m-tx-harris",
    date: "2026-09-28",
    disease: "Measles — exposure",
    location: "Harris County, TX",
    state: "TX",
    county: "Harris",
    cases: null,
    level: "county",
    source: "Curated",
    status: "current",
    lat: 29.76,
    lng: -95.37,
    text: "Exposure notification activity linked to measles cases in Harris County / Houston area."
  },
  {
    id: "c-us-current",
    date: "2026-10-01",
    disease: "COVID-19",
    location: "United States",
    state: "",
    county: "",
    cases: null,
    level: "federal",
    source: "Curated",
    status: "current",
    lat: 39.8,
    lng: -98.5,
    text: "Ongoing COVID-19 surveillance. Post-public-health-emergency reporting is less complete; metrics increasingly rely on residual clinical reporting, wastewater, and variant monitoring."
  },
  {
    id: "c-peak-2022",
    date: "2022-01-15",
    disease: "COVID-19 (Omicron peak period)",
    location: "United States",
    state: "",
    county: "",
    cases: null,
    level: "federal",
    source: "Curated",
    status: "historical",
    lat: 39.8,
    lng: -98.5,
    text: "Historical marker for the early-2022 Omicron wave — one of the highest case-volume periods of the pandemic in the United States."
  },
  {
    id: "c-2020",
    date: "2020-03-15",
    disease: "COVID-19 (pandemic onset)",
    location: "United States",
    state: "",
    county: "",
    cases: null,
    level: "federal",
    source: "Curated",
    status: "historical",
    lat: 39.8,
    lng: -98.5,
    text: "Historical marker for the start of widespread community transmission and emergency declarations in the United States (March 2020)."
  },
  {
    id: "who-ebola-2026",
    date: "2026-10-23",
    disease: "Ebola (Bundibugyo)",
    location: "Democratic Republic of the Congo / Kenya / Nigeria",
    state: "",
    county: "",
    cases: null,
    level: "federal",
    source: "Curated",
    status: "current",
    lat: 0.0,
    lng: 25.0,
    text: "WHO Disease Outbreak News context: ongoing Bundibugyo virus disease with cross-border transmission reported in 2026."
  },
  {
    id: "who-mers-2026",
    date: "2026-10-15",
    disease: "MERS-CoV",
    location: "Saudi Arabia",
    state: "",
    county: "",
    cases: 8,
    level: "federal",
    source: "Curated",
    status: "current",
    lat: 24.7,
    lng: 46.7,
    text: "WHO: MERS-CoV cases reported from the Kingdom of Saudi Arabia in 2026."
  }
];

/* ---------- FETCHERS ---------- */
async function fetchNORS() {
  console.log("Fetching CDC NORS…");
  try {
    const rows = await fetchJSON(
      "https://data.cdc.gov/resource/5xkq-dg7x.json?$limit=800&$order=year DESC"
    );
    return rows.map((r, i) => {
      const st = (r.state || r.state_name || "").toString().toUpperCase().slice(0, 2);
      const coords = STATE_CENTROIDS[st] || [39.8, -98.5];
      const [lat, lng] = jitter(coords);
      const year = parseInt(r.year, 10) || 0;
      return {
        id: `nors-${r.outbreak_id || i}`,
        date: r.year ? `${r.year}-06-01` : null,
        disease: r.etiology || r.primary_mode || "NORS outbreak",
        location: [r.county, r.state].filter(Boolean).join(", ") || "United States",
        state: st,
        county: r.county || "",
        cases: r.illnesses != null ? Number(r.illnesses) : r.total_ill != null ? Number(r.total_ill) : null,
        level: r.county ? "county" : "state",
        source: "CDC NORS",
        status: year >= 2024 ? "current" : "historical",
        lat,
        lng,
        text: `CDC National Outbreak Reporting System. Etiology/mode: ${r.etiology || r.primary_mode || "—"}. Year: ${r.year || "—"}. Illnesses: ${r.illnesses ?? "—"}. Mode of transmission and setting fields available in full NORS extract on data.cdc.gov.`
      };
    });
  } catch (e) {
    console.warn("NORS failed:", e.message);
    return [];
  }
}

async function fetchNNDSSMeasles() {
  console.log("Fetching CDC NNDSS (measles)…");
  try {
    const rows = await fetchJSON(
      "https://data.cdc.gov/resource/x9gk-5huc.json?$where=upper(label)%20like%20'%25MEASLES%25'&$limit=400&$order=year%20DESC,week%20DESC"
    );
    return rows.map((r, i) => {
      const area = (r.reporting_area || r.area || "").toString();
      const st = stateFromArea(area);
      const coords = STATE_CENTROIDS[st] || [39.8, -98.5];
      const [lat, lng] = jitter(coords, 0.7);
      const year = parseInt(r.year || r.current_mmwr_year, 10) || 0;
      const cases = r.m3 ?? r.m1 ?? r.cumulative_ytd_current_mmwr_year ?? null;
      return {
        id: `nndss-measles-${year}-${r.week || i}-${st || "US"}-${i}`,
        date: year ? `${year}-01-01` : null,
        disease: "Measles (NNDSS)",
        location: area || "United States",
        state: st,
        county: "",
        cases: cases != null && cases !== "" ? Number(cases) : null,
        level: st ? "state" : "federal",
        source: "CDC NNDSS",
        status: year >= 2025 ? "current" : "historical",
        lat,
        lng,
        text: `CDC NNDSS weekly provisional data for measles. Reporting area: ${area}. MMWR year ${year}, week ${r.week || "—"}. Counts are provisional and subject to revision. See data.cdc.gov NNDSS Weekly Data.`
      };
    });
  } catch (e) {
    console.warn("NNDSS measles failed:", e.message);
    return [];
  }
}

async function fetchWHO() {
  console.log("Fetching WHO Disease Outbreak News…");
  try {
    const data = await fetchJSON(
      "https://www.who.int/api/news/diseaseoutbreaknews?$orderby=PublicationDateAndTime%20desc&$top=40"
    );
    const items = data.value || [];
    return items.map((it, i) => {
      const title = it.Title || it.FormattedTitle || "WHO DON";
      let lat = 20,
        lng = 0;
      if (/congo|uganda|kenya|nigeria|drc/i.test(title)) {
        lat = 0;
        lng = 25;
      } else if (/saudi|mers/i.test(title)) {
        lat = 24.7;
        lng = 46.7;
      } else if (/russia|irkutsk/i.test(title)) {
        lat = 52.3;
        lng = 104.3;
      }
      const date = (it.PublicationDateAndTime || it.FormattedDate || "").slice(0, 10);
      return {
        id: `who-${it.Id || i}`,
        date: date || null,
        disease: title.split(" - ")[0] || title.slice(0, 60),
        location: title.includes(" - ") ? title.split(" - ").slice(1).join(" - ") : "Global",
        state: "",
        county: "",
        cases: null,
        level: "federal",
        source: "WHO DON",
        status: "current",
        lat,
        lng,
        text:
          ((it.PageContent || it.FormattedTitle || title) + "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1400) + "\n\nSource: WHO Disease Outbreak News."
      };
    });
  } catch (e) {
    console.warn("WHO failed:", e.message);
    return [];
  }
}

async function fetchCOVID() {
  console.log("Fetching disease.sh COVID…");
  try {
    const [usa, states] = await Promise.all([
      fetchJSON("https://disease.sh/v3/covid-19/countries/USA"),
      fetchJSON("https://disease.sh/v3/covid-19/states")
    ]);
    const out = [];
    if (usa) {
      out.push({
        id: "covid-us-live",
        date: new Date(usa.updated || Date.now()).toISOString().slice(0, 10),
        disease: "COVID-19",
        location: "United States",
        state: "",
        county: "",
        cases: usa.cases ?? null,
        level: "federal",
        source: "disease.sh",
        status: "current",
        lat: 39.8,
        lng: -98.5,
        text: `disease.sh aggregated COVID-19 metrics for the United States. Cases: ${usa.cases?.toLocaleString?.() ?? usa.cases}. Deaths: ${usa.deaths?.toLocaleString?.() ?? usa.deaths}. Active: ${usa.active ?? "—"}. Updated from source timestamp. Post-emergency reporting is incomplete relative to 2020–2023.`
      });
    }
    for (const [i, s] of (states || []).entries()) {
      const st = stateFromArea(s.state || "");
      const coords = STATE_CENTROIDS[st] || [39.8, -98.5];
      out.push({
        id: `covid-state-${st || i}`,
        date: new Date(s.updated || Date.now()).toISOString().slice(0, 10),
        disease: "COVID-19",
        location: s.state || "US state",
        state: st,
        county: "",
        cases: s.cases ?? null,
        level: "state",
        source: "disease.sh",
        status: "current",
        lat: coords[0],
        lng: coords[1],
        text: `State-level COVID-19 aggregate from disease.sh. Cases: ${s.cases?.toLocaleString?.() ?? s.cases}. Deaths: ${s.deaths?.toLocaleString?.() ?? s.deaths}.`
      });
    }
    return out;
  } catch (e) {
    console.warn("COVID failed:", e.message);
    return [];
  }
}

/* Country centroids for global HDX/WHO outbreak mapping (approx) */
const COUNTRY_CENTROIDS = {
  USA: [39.8, -98.5], US: [39.8, -98.5], CAN: [56.1, -106.3], MEX: [23.6, -102.5],
  BRA: [-14.2, -51.9], ARG: [-38.4, -63.6], GBR: [55.4, -3.4], FRA: [46.2, 2.2],
  DEU: [51.2, 10.4], ITA: [41.9, 12.6], ESP: [40.5, -3.7], RUS: [61.5, 105.3],
  CHN: [35.9, 104.2], IND: [20.6, 78.9], JPN: [36.2, 138.3], AUS: [-25.3, 133.8],
  ZAF: [-30.6, 22.9], NGA: [9.1, 8.7], KEN: [-0.0, 37.9], COD: [-4.0, 21.8],
  UGA: [1.4, 32.3], ETH: [9.1, 40.5], SDN: [12.9, 30.2], SAU: [23.9, 45.1],
  EGY: [26.8, 30.8], TUR: [38.9, 35.2], IRN: [32.4, 53.7], PAK: [30.4, 69.3],
  BGD: [23.7, 90.4], IDN: [-0.8, 113.9], PHL: [12.9, 121.8], VNM: [14.1, 108.3],
  THA: [15.9, 100.9], KOR: [35.9, 127.8], PRK: [40.3, 127.5], UKR: [48.4, 31.2],
  POL: [51.9, 19.1], NLD: [52.1, 5.3], BEL: [50.5, 4.5], SWE: [60.1, 18.6],
  NOR: [60.5, 8.5], FIN: [61.9, 25.7], DNK: [56.3, 9.5], CHE: [46.8, 8.2],
  AUT: [47.5, 14.6], GRC: [39.1, 21.8], PRT: [39.4, -8.2], IRL: [53.1, -8.0],
  NZL: [-40.9, 174.9], SGP: [1.4, 103.8], MYS: [4.2, 101.9], MMR: [19.8, 96.0],
  KHM: [12.6, 105.0], LAO: [19.9, 102.5], NPL: [28.4, 84.1], LKA: [7.9, 80.8],
  AFG: [33.9, 67.7], IRQ: [33.2, 43.7], SYR: [34.8, 39.0], YEM: [15.6, 48.5],
  SOM: [5.2, 46.2], TZA: [-6.4, 34.9], RWA: [-1.9, 29.9], BDI: [-3.4, 29.9],
  GHA: [7.9, -1.0], CIV: [7.5, -5.5], SEN: [14.5, -14.5], MLI: [17.6, -4.0],
  BFA: [12.2, -1.6], NER: [17.6, 8.1], TCD: [15.5, 19.0], CMR: [7.4, 12.4],
  AGO: [-11.2, 17.9], MOZ: [-18.7, 35.5], ZWE: [-19.0, 29.2], ZMB: [-13.1, 27.8],
  MWI: [-13.3, 34.3], MDG: [-18.8, 46.9], PER: [-9.2, -75.0], COL: [4.6, -74.3],
  VEN: [6.4, -66.6], CHL: [-35.7, -71.5], ECU: [-1.8, -78.2], BOL: [-16.3, -63.6],
  PRY: [-23.4, -58.4], URY: [-32.5, -55.8], CUB: [21.5, -78.0], HTI: [18.9, -72.3],
  DOM: [18.7, -70.2], GTM: [15.8, -90.2], HND: [15.2, -86.2], SLV: [13.8, -88.9],
  NIC: [12.9, -85.2], CRI: [9.7, -83.8], PAN: [8.5, -80.8], ISR: [31.0, 34.9],
  PSE: [31.9, 35.2], LBN: [33.9, 35.9], JOR: [30.6, 36.9], ARE: [23.4, 53.8],
  QAT: [25.4, 51.2], KWT: [29.3, 47.5], OMN: [21.5, 55.9], BHR: [26.0, 50.6]
};

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = [];
  let i = 0, cur = "", inQ = false;
  const line0 = lines[0];
  for (const ch of line0) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { headers.push(cur); cur = ""; continue; }
    cur += ch;
  }
  headers.push(cur);
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const row = [];
    cur = ""; inQ = false;
    for (const ch of lines[li]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { row.push(cur); cur = ""; continue; }
      cur += ch;
    }
    row.push(cur);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

async function fetchHDXOutbreaks() {
  console.log("Fetching HDX / WHO DON global outbreaks (1996–present)…");
  try {
    const url =
      "https://raw.githubusercontent.com/jatorresmunguia/disease_outbreak_news/main/Last%20update/outbreaks_10102026.csv";
    const res = await fetch(url, {
      headers: { "User-Agent": "OutbreakXplr-GitHubAction/1.0" }
    });
    if (!res.ok) throw new Error("HDX CSV " + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    return rows.map((r, i) => {
      const iso = (r.iso3 || r.iso2 || "").toUpperCase();
      const coords = COUNTRY_CENTROIDS[iso] || [20, 0];
      const year = parseInt(r.Year, 10) || 0;
      const disease = r.Disease || r.icd10n || "Outbreak";
      return {
        id: `hdx-${iso}-${year}-${disease.slice(0, 24).replace(/\W+/g, "_")}-${i}`,
        date: year ? `${year}-01-01` : null,
        disease: String(disease).slice(0, 120),
        location: r.Country || iso || "Unknown",
        state: "",
        county: "",
        cases: null,
        level: "federal",
        source: "HDX / WHO DON outbreaks",
        status: year >= 2024 ? "current" : "historical",
        lat: coords[0] + (Math.random() - 0.5) * 2,
        lng: coords[1] + (Math.random() - 0.5) * 2,
        text: `Country-year outbreak record from the Global Pandemic and Epidemic-Prone Disease Outbreaks dataset (HDX / Torres Munguía et al., derived from WHO Disease Outbreak News). Disease: ${disease}. Year: ${year}. ISO3: ${iso}. DON refs: ${r.DONs || "—"}. ICD: ${r.icd10c || r.icd11c1 || "—"}. Definition: ${(r.Definition || "").slice(0, 500)}`
      };
    });
  } catch (e) {
    console.warn("HDX outbreaks failed:", e.message);
    return [];
  }
}

async function fetchWHOGHO() {
  console.log("Fetching WHO GHO sample indicators…");
  const out = [];
  // Reported cholera cases is a classic epidemic indicator when available
  const codes = [
    { code: "CHOLERA_0000000001", label: "Cholera reported cases (GHO)" },
    { code: "WHS3_62", label: "Measles reported cases (GHO legacy code attempt)" }
  ];
  for (const { code, label } of codes) {
    try {
      const url = `https://ghoapi.azureedge.net/api/${code}?$top=80&$orderby=TimeDim desc`;
      const data = await fetchJSON(url);
      const values = data.value || [];
      for (const v of values.slice(0, 40)) {
        const year = v.TimeDim || v.year || "";
        const country = v.SpatialDim || v.COUNTRY || "";
        const num = v.NumericValue ?? v.Value;
        if (num == null || num === "") continue;
        const coords = COUNTRY_CENTROIDS[String(country).toUpperCase()] || [20, 0];
        out.push({
          id: `gho-${code}-${country}-${year}`,
          date: year ? `${year}-01-01` : null,
          disease: label,
          location: String(country),
          state: "",
          county: "",
          cases: Number(num),
          level: "federal",
          source: "WHO GHO",
          status: Number(year) >= 2020 ? "current" : "historical",
          lat: coords[0],
          lng: coords[1],
          text: `WHO Global Health Observatory indicator ${code}. Spatial: ${country}. Time: ${year}. Value: ${num}. Source: ghoapi.azureedge.net`
        });
      }
    } catch (e) {
      console.warn("GHO", code, e.message);
    }
  }
  return out;
}

async function fetchWorldBank() {
  console.log("Fetching World Bank health indicators…");
  const out = [];
  // TB incidence and measles immunization coverage as context (not outbreaks)
  const indicators = [
    { id: "SH.TBS.INCD", name: "TB incidence (per 100,000)" },
    { id: "SH.IMM.MEAS", name: "Measles immunization (% children 12–23 mo)" }
  ];
  for (const ind of indicators) {
    try {
      const url = `https://api.worldbank.org/v2/country/all/indicator/${ind.id}?format=json&per_page=60&mrnev=1`;
      const data = await fetchJSON(url);
      const rows = Array.isArray(data) && data[1] ? data[1] : [];
      for (const r of rows) {
        if (r.value == null) continue;
        const iso = (r.countryiso3code || "").toUpperCase();
        const coords = COUNTRY_CENTROIDS[iso] || [20, 0];
        out.push({
          id: `wb-${ind.id}-${iso}-${r.date}`,
          date: r.date ? `${r.date}-01-01` : null,
          disease: ind.name,
          location: r.country?.value || iso,
          state: "",
          county: "",
          cases: Number(r.value),
          level: "federal",
          source: "World Bank",
          status: Number(r.date) >= 2020 ? "current" : "historical",
          lat: coords[0],
          lng: coords[1],
          text: `World Bank Development Indicator ${ind.id}: ${ind.name}. Country: ${r.country?.value}. Year: ${r.date}. Value: ${r.value}. Context metric (incidence or coverage), not an outbreak event.`
        });
      }
    } catch (e) {
      console.warn("World Bank", ind.id, e.message);
    }
  }
  return out;
}


async function fetchJHUMeasles() {
  console.log("Fetching JHU CSSE/IVAC U.S. measles county data…");
  try {
    const url = "https://raw.githubusercontent.com/CSSEGISandData/measles_data/main/measles_county_all_updates.csv";
    const res = await fetch(url, { headers: { "User-Agent": "OutbreakXplr-GitHubAction/1.0" } });
    if (!res.ok) throw new Error("JHU measles " + res.status);
    const rows = parseCSV(await res.text());
    // Keep latest value per location (CSV is cumulative by date updates)
    const latest = new Map();
    for (const r of rows) {
      const key = r.location_id || r.location_name;
      const prev = latest.get(key);
      if (!prev || (r.date || "") > (prev.date || "")) latest.set(key, r);
    }
    const out = [];
    for (const r of latest.values()) {
      const name = r.location_name || "";
      const parts = name.split(",").map((s) => s.trim());
      let county = parts[0] || "";
      let stateName = parts[1] || "";
      const st = stateFromArea(stateName) || stateFromArea(name);
      const coords = STATE_CENTROIDS[st] || [39.8, -98.5];
      const [lat, lng] = jitter(coords, 0.6);
      const cases = r.value != null && r.value !== "" ? Number(r.value) : null;
      out.push({
        id: `jhu-measles-${r.location_id || name}-${r.date}`,
        date: r.date || null,
        disease: "Measles (JHU county tracker)",
        location: name,
        state: st,
        county,
        cases,
        level: r.location_type === "county" ? "county" : "state",
        source: "JHU Measles Tracker",
        status: "current",
        lat,
        lng,
        text: `Johns Hopkins CSSE/IVAC U.S. Measles Tracker county-level lab-confirmed cases. Location: ${name}. Outcome: ${r.outcome_type || "case_lab-confirmed"}. Value: ${cases}. Compiled from state/county health departments. GitHub: CSSEGISandData/measles_data. Dashboard: publichealth.jhu.edu/ivac.`
      });
    }
    console.log("JHU measles locations:", out.length);
    return out;
  } catch (e) {
    console.warn("JHU measles failed:", e.message);
    return [];
  }
}

async function fetchWastewaterSCAN() {
  console.log("Fetching WastewaterSCAN samples via CDC NWSS…");
  try {
    // Recent detections only to keep file size reasonable
    const url =
      "https://data.cdc.gov/resource/j9g8-acpt.json?$limit=400&$order=sample_collect_date DESC&$where=source='WastewaterSCAN' AND pcr_target_detect='yes'";
    const rows = await fetchJSON(url);
    return (rows || []).map((r, i) => {
      const st = (r.state_territory || "").toUpperCase().slice(0, 2);
      const coords = STATE_CENTROIDS[st] || [39.8, -98.5];
      const target = r.pcr_target || r.pcr_gene_target_agg || "pathogen";
      const conc = r.pcr_target_avg_conc != null ? Number(r.pcr_target_avg_conc) : null;
      return {
        id: `wwscan-${r.record_id || i}`,
        date: (r.sample_collect_date || "").slice(0, 10) || null,
        disease: `Wastewater: ${target}`,
        location: [r.counties_served, r.state_territory].filter(Boolean).join(", ") || st,
        state: st,
        county: r.counties_served || "",
        cases: conc,
        level: "county",
        source: "WastewaterSCAN",
        status: "current",
        lat: coords[0] + (Math.random() - 0.5) * 0.4,
        lng: coords[1] + (Math.random() - 0.5) * 0.4,
        text: `WastewaterSCAN (Stanford / Emory / Verily) via CDC National Wastewater Surveillance System. Site ${r.site}. Target: ${target}. Detected: ${r.pcr_target_detect}. Concentration: ${conc} ${r.pcr_target_units || ""}. Population served: ${r.population_served || "—"}. Sample matrix: ${r.sample_matrix || "—"}. License CC BY-NC 4.0; cite WastewaterSCAN for research use.`
      };
    });
  } catch (e) {
    console.warn("WastewaterSCAN failed:", e.message);
    return [];
  }
}

async function fetchNextstrainMeasles() {
  console.log("Fetching Nextstrain measles genomic context…");
  try {
    const res = await fetch("https://nextstrain.org/measles", {
      headers: { Accept: "application/json", "User-Agent": "OutbreakXplr-GitHubAction/1.0" }
    });
    if (!res.ok) throw new Error("Nextstrain " + res.status);
    const data = await res.json();
    const title = data?.meta?.title || "Nextstrain measles";
    const updated = data?.meta?.updated || new Date().toISOString().slice(0, 10);
    const n = data?.tree ? 1 : 0;
    // Count tips roughly if tree present
    let tips = 0;
    function walk(node) {
      if (!node) return;
      if (!node.children || !node.children.length) tips++;
      else (node.children || []).forEach(walk);
    }
    walk(data.tree);
    return [
      {
        id: "nextstrain-measles-global",
        date: updated,
        disease: "Measles (Nextstrain genomic)",
        location: "Global",
        state: "",
        county: "",
        cases: tips || null,
        level: "federal",
        source: "Nextstrain",
        status: "current",
        lat: 20,
        lng: 0,
        text: `${title}. Updated ${updated}. Phylogenetic genomic surveillance of measles virus (Fred Hutch / University of Basel and collaborators). Tip count in build ≈ ${tips || "see dashboard"}. Explore trees at https://nextstrain.org/measles. This record is context for genomic spread, not a clinical case count.`
      }
    ];
  } catch (e) {
    console.warn("Nextstrain failed:", e.message);
    return [];
  }
}

/* ---------- MAIN ---------- */
async function main() {
  const started = new Date().toISOString();
  console.log("OutbreakXplr fetch started", started);

  const [nors, nndss, who, covid, hdx, gho, wb, jhu, wwscan, nexts] = await Promise.all([
    fetchNORS(),
    fetchNNDSSMeasles(),
    fetchWHO(),
    fetchCOVID(),
    fetchHDXOutbreaks(),
    fetchWHOGHO(),
    fetchWorldBank(),
    fetchJHUMeasles(),
    fetchWastewaterSCAN(),
    fetchNextstrainMeasles()
  ]);

  // Prefer live event feeds; HDX fills global country-year history; university feeds enrich
  const live = [...covid, ...nndss, ...who, ...nors, ...gho, ...wb, ...hdx, ...jhu, ...wwscan, ...nexts];
  const seen = new Set(live.map((d) => d.id));
  const merged = [...live, ...CURATED.filter((c) => !seen.has(c.id))];

  // Also merge historical-outbreaks.json if present on disk
  try {
    const histPath = join(DATA, "historical-outbreaks.json");
    if (existsSync(histPath)) {
      const hist = JSON.parse(readFileSync(histPath, "utf8"));
      for (const h of hist) {
        if (!seen.has(h.id)) {
          merged.push(h);
          seen.add(h.id);
        }
      }
    }
  } catch (_) {}

  merged.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    return da < db ? 1 : da > db ? -1 : 0;
  });

  const measles = merged.filter((d) => /measles/i.test(d.disease));
  const covidOnly = merged.filter((d) => /covid/i.test(d.disease));

  const meta = {
    generatedAt: started,
    finishedAt: new Date().toISOString(),
    totalRecords: merged.length,
    bySource: {},
    byStatus: { current: 0, historical: 0 },
    measlesCount: measles.length,
    covidCount: covidOnly.length,
    sourcesIncorporated: {
      "WHO Disease Outbreak News API": "live pull",
      "WHO GHO OData API": "sample epidemic indicators",
      "CDC NORS (Socrata 5xkq-dg7x)": "live pull",
      "CDC NNDSS Weekly (measles filter)": "live pull",
      "HDX Global Pandemic & Epidemic Outbreaks (WHO DON derived CSV)": "full country-year history 1996–present",
      "disease.sh COVID-19": "US national + states",
      "World Bank Indicators API": "TB incidence + measles immunization context",
      "JHU CSSE/IVAC Measles Tracker (GitHub measles_data)": "county-level lab-confirmed measles",
      "WastewaterSCAN via CDC NWSS (j9g8-acpt)": "recent pathogen detections in wastewater",
      "Nextstrain measles": "genomic phylogeny context",
      Curated: "measles 2025–2026 + historical pandemic anchors + BSL labs"
    },
    sourcesLinkedNotBulkAutomated: {
      "WHO Outbreak Toolkit": "guidance/framework — not a case data feed",
      "CDC Data Portal (2000+ datasets)": "catalog; specific Socrata endpoints added as needed",
      "Global.health line lists": "requires free API key / account for bulk export",
      "IDDO": "individual participant data — registration / data use agreements",
      GIDS: "no stable public bulk API identified",
      "Figshare / Harvard Dataverse COVID collections": "research archives — not live outbreak feeds",
      HealthMap: "web UI; no stable free bulk API for redistribution",
      GIDEON: "commercial / premium database",
      "Yale PopHIVE": "dashboard + some GitHub parquet; primary value is interactive UI",
      "Brown Pandemic Center / Outbreak Observatory": "narrative synthesis reports, not bulk case API",
      "UCSD DIRE": "projection models / dashboard, not open bulk outbreak events"
    },
    notes:
      "Provisional surveillance data. NNDSS and NORS counts are subject to revision. COVID post-PHE reporting is incomplete. HDX dataset unit is country-year disease outbreak (WHO DON derived). World Bank rows are context indicators, not outbreak events."
  };

  for (const d of merged) {
    meta.bySource[d.source] = (meta.bySource[d.source] || 0) + 1;
    if (d.status === "current") meta.byStatus.current++;
    else meta.byStatus.historical++;
  }

  writeFileSync(join(DATA, "outbreaks.json"), JSON.stringify(merged, null, 2));
  writeFileSync(join(DATA, "measles.json"), JSON.stringify(measles, null, 2));
  writeFileSync(join(DATA, "covid.json"), JSON.stringify(covidOnly, null, 2));
  writeFileSync(join(DATA, "meta.json"), JSON.stringify(meta, null, 2));

  console.log("Wrote data/outbreaks.json —", merged.length, "records");
  console.log("Wrote data/measles.json —", measles.length, "records");
  console.log("Wrote data/covid.json —", covidOnly.length, "records");
  console.log("Wrote data/meta.json");
  console.log("By source:", meta.bySource);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
