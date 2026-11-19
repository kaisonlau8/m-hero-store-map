import { buildSecondNetworkName } from "./place-name.mjs";

export const MANUAL_ID_PREFIX = "local-manual:";

export function manualRecordId(batchId, city) {
  return `${MANUAL_ID_PREFIX}${batchId}:${city}`;
}

export function regionFromExistingStores(stores, province) {
  const regions = [...new Set(
    stores
      .filter((store) => store.province === province && store.region)
      .map((store) => store.region),
  )];
  if (regions.length === 1) {
    return { region: regions[0], status: "同省现有门店售后大区唯一" };
  }
  return { region: "", status: "待核" };
}

export function appendManualCityAdditions(stores, geography, spec) {
  const errors = [];
  const notes = [];
  const existingIds = new Set(stores.map((store) => store.recordId));
  const additions = [];

  for (const city of spec.cities ?? []) {
    const matches = geography.filter((row) => row.city === city);
    if (matches.length !== 1) {
      errors.push(`全国省市里 ${city} 不是唯一一行（${matches.length}），未编造省份`);
      continue;
    }
    const geo = matches[0];
    const recordId = manualRecordId(spec.id, city);
    if (existingIds.has(recordId)) continue;

    const display = buildSecondNetworkName({
      province: geo.province,
      city: geo.city,
      district: "",
      level: geo.level,
    });
    if (display.status !== "standard") {
      errors.push(`${city} 无法按城市生成展示名：${display.anomalyNote}`);
      continue;
    }
    const region = regionFromExistingStores(stores, geo.province);
    if (!region.region) notes.push(`${city} 售后大区${region.status}`);

    additions.push({
      recordId,
      network: "二网",
      code: "",
      name: display.name,
      originalName: "",
      fullName: "",
      province: geo.province,
      city: geo.city,
      district: "",
      region: region.region,
      regionStatus: region.status,
      address: "",
      storeType: "",
      sourceView: "",
      nameStatus: "标准",
      anomalyCode: "",
      anomalyNote: "",
      dataSource: spec.dataSource,
    });
    existingIds.add(recordId);
  }

  return {
    stores: [...stores, ...additions],
    additions,
    errors,
    notes,
  };
}
