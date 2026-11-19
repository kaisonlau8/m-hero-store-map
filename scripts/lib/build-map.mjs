export const CITY_CENTER_NOTE = "点位使用城市行政中心，同城门店只做防重叠散开，不是门店精确坐标。";

export function buildMapDocument(stores, { centers, sourceMeta }) {
  const errors = [];
  const located = [];

  stores.forEach((store, index) => {
    const center = centers?.[store.city];
    if (!Array.isArray(center) || center.length < 2) {
      errors.push(`找不到城市行政中心：${store.province}${store.city}（${store.code} / ${store.recordId}），未编造坐标`);
      return;
    }
    located.push({
      id: store.recordId,
      recordId: store.recordId,
      network: store.network,
      sequence: index + 1,
      code: store.code,
      region: store.region,
      name: store.name,
      originalName: store.originalName,
      fullName: store.fullName,
      province: store.province,
      city: store.city,
      district: store.district,
      address: store.address,
      level: "",
      storeType: store.storeType ?? "",
      functionType: "",
      rating: "",
      status: "",
      sourceView: store.sourceView ?? "",
      nameStatus: store.nameStatus,
      anomalyCode: store.anomalyCode || null,
      anomalyNote: store.anomalyNote ?? "",
      coordinateLevel: "city-center",
      lng: center[0],
      lat: center[1],
    });
  });

  if (errors.length) return { document: null, errors };

  return {
    document: {
      generatedAt: sourceMeta.sourceTime,
      source: sourceMeta.sourceLabel,
      sourceTime: sourceMeta.sourceTime,
      sourceViews: {
        firstNetwork: sourceMeta.firstView ?? "",
        secondNetwork: sourceMeta.secondView ?? "",
      },
      mapGeoJson: "china.geojson",
      coordinateLevel: "city-center",
      coordinateNote: CITY_CENTER_NOTE,
      counts: {
        total: located.length,
        firstNetwork: located.filter((store) => store.network === "一网").length,
        secondNetwork: located.filter((store) => store.network === "二网").length,
        provinces: new Set(located.map((store) => store.province)).size,
        cities: new Set(located.map((store) => store.city)).size,
      },
      anomalies: located
        .filter((store) => store.nameStatus === "行政区待核")
        .map((store) => ({
          recordId: store.recordId,
          code: store.code,
          originalName: store.originalName,
          province: store.province,
          city: store.city,
          district: store.district,
          name: store.name,
          anomalyNote: store.anomalyNote,
        })),
      stores: located,
    },
    errors,
  };
}
