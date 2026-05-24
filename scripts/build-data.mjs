import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtimeRequire = createRequire("/Users/i/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/");
const { FileBlob, SpreadsheetFile } = (() => {
  try {
    return require("@oai/artifact-tool");
  } catch {
    return runtimeRequire("@oai/artifact-tool");
  }
})();

const channelDir = "/Users/i/Library/CloudStorage/OneDrive-个人/工作相关/猛士科技（襄阳）有限公司/服务运营/渠道";
const sourceXlsx = await resolveSourceWorkbook();
const outputDir = new URL("../assets/", import.meta.url);
const dataPath = new URL("stores.json", outputDir);

const provinceNameFix = new Map([
  ["北京", "北京市"],
  ["天津", "天津市"],
  ["上海", "上海市"],
  ["重庆", "重庆市"],
  ["香港特别行政区", "香港特别行政区"],
  ["澳门特别行政区", "澳门特别行政区"],
]);

const manualCityCenters = new Map([
  ["北京市", [116.405285, 39.904989]],
  ["天津市", [117.190182, 39.125596]],
  ["上海市", [121.472644, 31.231706]],
  ["重庆市", [106.504962, 29.533155]],
  ["香港特别行政区", [114.173355, 22.320048]],
  ["澳门特别行政区", [113.54909, 22.198951]],
]);

const storeAreaCorrections = new Map([
  [
    "MSFWWD099",
    {
      province: "四川省",
      city: "成都市",
      district: "武侯区",
      address: "四川省成都市武侯区",
    },
  ],
  [
    "MSFWWD098",
    {
      province: "西藏自治区",
      city: "林芝市",
      district: "巴宜区",
      address: "西藏自治区林芝市巴宜区",
    },
  ],
]);

function clean(value) {
  return String(value ?? "").trim();
}

async function resolveSourceWorkbook() {
  const explicitPath = process.argv[2] || process.env.STORE_MAP_XLSX;
  if (explicitPath) return path.resolve(explicitPath);

  const entries = await fs.readdir(channelDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => /^猛士售后门店清单\d{8}\.xlsx$/.test(entry.name))
      .map(async (entry) => {
        const fullPath = path.join(channelDir, entry.name);
        const dateMatch = entry.name.match(/(\d{8})/);
        const stat = await fs.stat(fullPath);
        return { fullPath, dateKey: dateMatch?.[1] ?? "", mtimeMs: stat.mtimeMs };
      }),
  );

  if (!candidates.length) {
    throw new Error(`No workbook matched 猛士售后门店清单YYYYMMDD.xlsx in ${channelDir}`);
  }

  candidates.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.mtimeMs - a.mtimeMs);
  return candidates[0].fullPath;
}

function provinceForMap(name) {
  return provinceNameFix.get(clean(name)) || clean(name);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

async function buildCityCenters() {
  const country = await fetchJson("https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json");
  const centers = new Map(manualCityCenters);

  for (const feature of country.features ?? []) {
    const props = feature.properties ?? {};
    if (props.name && props.center) centers.set(props.name, props.center);
  }

  for (const feature of country.features ?? []) {
    const props = feature.properties ?? {};
    if (!props.adcode || props.adcode === 100000) continue;
    let province;
    try {
      province = await fetchJson(`https://geo.datav.aliyun.com/areas_v3/bound/${props.adcode}_full.json`);
    } catch {
      continue;
    }
    for (const cityFeature of province.features ?? []) {
      const cityProps = cityFeature.properties ?? {};
      if (cityProps.name && cityProps.center) centers.set(cityProps.name, cityProps.center);
    }
  }

  return centers;
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourceXlsx));
const cityCenters = await buildCityCenters();
const configs = [
  {
    sheet: "一网",
    network: "一网",
    mapRow(row) {
      return {
        sequence: row[0],
        code: clean(row[1]),
        region: clean(row[2]),
        name: clean(row[3]),
        province: clean(row[4]),
        city: clean(row[5]),
        district: clean(row[6]),
        address: clean(row[7]),
        storeType: clean(row[8]),
        functionType: clean(row[9]),
        rating: clean(row[10]),
        status: clean(row[11]),
      };
    },
  },
  {
    sheet: "二网",
    network: "二网",
    mapRow(row) {
      return {
        sequence: row[0],
        code: clean(row[1]),
        region: "",
        name: clean(row[2]),
        province: clean(row[5]),
        city: clean(row[6]),
        district: clean(row[7]),
        address: `${clean(row[5])}${clean(row[6])}${clean(row[7])}`,
        storeType: clean(row[4]),
        functionType: clean(row[3]),
        rating: "",
        status: "",
      };
    },
  },
];

const stores = [];
const missing = [];

for (const config of configs) {
  const sheet = workbook.worksheets.getItem(config.sheet);
  const range = sheet.getUsedRange()?.address;
  if (!range) throw new Error(`Sheet ${config.sheet} has no used range.`);
  const values = sheet.getRange(range).values;
  for (let i = 1; i < values.length; i += 1) {
    const store = { id: `${config.network}-${i}`, network: config.network, ...config.mapRow(values[i]) };
    if (!store.code || !store.name) continue;
    const correction = storeAreaCorrections.get(store.code);
    if (correction) Object.assign(store, correction);
    const center = cityCenters.get(store.city) || cityCenters.get(provinceForMap(store.province));
    if (!center) {
      missing.push({ sheet: config.sheet, row: i + 1, name: store.name, province: store.province, city: store.city });
      continue;
    }
    store.lng = center[0];
    store.lat = center[1];
    stores.push(store);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  source: path.basename(sourceXlsx),
  mapGeoJson: "china.geojson",
  counts: {
    total: stores.length,
    firstNetwork: stores.filter((store) => store.network === "一网").length,
    secondNetwork: stores.filter((store) => store.network === "二网").length,
    provinces: new Set(stores.map((store) => store.province)).size,
    cities: new Set(stores.map((store) => store.city)).size,
  },
  stores,
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(dataPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: dataPath.pathname, counts: summary.counts, missing }, null, 2));
if (missing.length) process.exitCode = 1;
