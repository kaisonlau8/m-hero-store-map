import ExcelJS from "exceljs";

export const STORE_HEADERS = [
  "网络",
  "record_id",
  "门店编码",
  "门店名称",
  "原门店名称",
  "门店全称",
  "省份",
  "城市",
  "区县",
  "售后大区",
  "详细地址",
  "门店类型",
  "来源视图",
  "展示名状态",
  "异常代码",
  "异常说明",
];

const GEO_HEADERS = ["省份", "城市", "客户数量", "层级", "是否有店", "网络", "一网家数", "二网家数", "网点合计", "一网门店", "二网门店"];

function cellText(row, index) {
  const value = row.getCell(index).value;
  if (value == null) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("").trim();
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
  }
  return String(value).trim();
}

function sheetRows(sheet) {
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => rows.push(row));
  return rows;
}

export function annotateGeography(geography, stores) {
  const groups = new Map();
  for (const store of stores) {
    const key = `${store.province}\0${store.city}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(store);
  }

  return geography.map((row) => {
    const matched = groups.get(`${row.province}\0${row.city}`) ?? [];
    const first = matched.filter((store) => store.network === "一网");
    const second = matched.filter((store) => store.network === "二网");
    let network = "无";
    if (first.length && second.length) network = "一网+二网";
    else if (first.length) network = "一网";
    else if (second.length) network = "二网";
    return {
      province: String(row.province ?? "").trim(),
      city: String(row.city ?? "").trim(),
      customers: String(row.customers ?? "").trim(),
      level: String(row.level ?? "").trim(),
      hasStore: matched.length ? "有" : "无",
      network,
      firstCount: String(first.length),
      secondCount: String(second.length),
      totalCount: String(matched.length),
      firstNames: first.map((store) => store.name).join("、"),
      secondNames: second.map((store) => store.name).join("、"),
    };
  });
}

export function buildSummary(stores, geography, provinceCustomers) {
  const annotated = annotateGeography(geography, stores);
  const provinceOrder = [];
  for (const row of annotated) {
    if (!provinceOrder.includes(row.province)) provinceOrder.push(row.province);
  }
  const covered = annotated.filter((row) => row.hasStore === "有");
  const countyLevel = covered.filter((row) => row.level.includes("省直辖县级"));
  const provinceRows = provinceOrder.map((province) => {
    const rows = annotated.filter((row) => row.province === province);
    const provinceStores = stores.filter((store) => store.province === province);
    return {
      province,
      firstNetwork: provinceStores.filter((store) => store.network === "一网").length,
      secondNetwork: provinceStores.filter((store) => store.network === "二网").length,
      total: provinceStores.length,
      coveredCities: new Set(provinceStores.map((store) => store.city)).size,
      cityTotal: rows.length,
      customers: String(provinceCustomers?.[province] ?? ""),
    };
  });
  return {
    total: stores.length,
    firstNetwork: stores.filter((store) => store.network === "一网").length,
    secondNetwork: stores.filter((store) => store.network === "二网").length,
    firstCities: new Set(stores.filter((store) => store.network === "一网").map((store) => `${store.province}\0${store.city}`)).size,
    secondCities: new Set(stores.filter((store) => store.network === "二网").map((store) => `${store.province}\0${store.city}`)).size,
    coveredCities: covered.length,
    higherCities: covered.length - countyLevel.length,
    countyLevelCities: countyLevel.length,
    countyLevelNames: countyLevel.map((row) => `${row.province}${row.city}`),
    overlapCities: covered.filter((row) => row.network === "一网+二网").map((row) => `${row.province}${row.city}`),
    provinces: new Set(stores.map((store) => store.province)).size,
    provinceRows,
  };
}

function writeSummarySheet(workbook, summary, sourceMeta) {
  const sheet = workbook.addWorksheet("汇总");
  const sourceLine = [
    `数据来源：${sourceMeta.firstView || "一网有售后视图"}；${sourceMeta.secondView || "二网信息"}。`,
    `快照时间：${sourceMeta.sourceTime}。`,
    "门店行全部保留，不按名称或重复编码合并。",
    "客户数量沿用全国省市表原值，本轮不重算。",
    "地图点位为城市行政中心，不是门店精确坐标。",
  ].join("");
  sheet.addRow(["售后服务网点覆盖"]);
  sheet.addRow([sourceLine]);
  sheet.addRow([]);
  sheet.addRow(["指标", "数量", "说明"]);
  sheet.addRow(["快照时间", sourceMeta.sourceTime, "导入源时间；重复导入保持不变"]);
  sheet.addRow(["一网来源", sourceMeta.firstView ?? "", "只读溯源，不回写飞书"]);
  sheet.addRow(["二网来源", sourceMeta.secondView ?? "", "只读溯源，不回写飞书"]);
  const metrics = [
    ["售后网点合计", summary.total, "一网与二网相加"],
    ["一网", summary.firstNetwork, "开业门店清单的有售后视图"],
    ["二网", summary.secondNetwork, "二网信息表"],
    ["一网覆盖城市", summary.firstCities, ""],
    ["二网覆盖城市", summary.secondCities, ""],
    ["合计覆盖城市", summary.coveredCities, "一网城市与二网城市去重"],
    ["其中地级及以上", summary.higherCities, "直辖市、地级市、自治州、地区、盟"],
    ["其中省直辖县级", summary.countyLevelCities, summary.countyLevelNames.join("、")],
    ["一网二网重叠城市", summary.overlapCities.length, summary.overlapCities.join("、")],
    ["覆盖省份", summary.provinces, "有门店的省级行政区"],
  ];
  for (const metric of metrics) sheet.addRow(metric);
  sheet.addRow([]);
  sheet.addRow(["分省覆盖"]);
  sheet.addRow(["省份", "一网家数", "二网家数", "网点合计", "覆盖城市", "城市总数", "客户数量"]);
  for (const row of summary.provinceRows) {
    sheet.addRow([row.province, row.firstNetwork, row.secondNetwork, row.total, row.coveredCities, row.cityTotal, row.customers]);
  }
  const customerTotal = summary.provinceRows.reduce((sum, row) => sum + (Number(row.customers) || 0), 0);
  sheet.addRow([
    "合计",
    summary.firstNetwork,
    summary.secondNetwork,
    summary.total,
    summary.coveredCities,
    summary.provinceRows.reduce((sum, row) => sum + row.cityTotal, 0),
    customerTotal ? String(customerTotal) : "",
  ]);
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 42;
}

function writeGeographySheet(workbook, geography) {
  const sheet = workbook.addWorksheet("全国省市");
  sheet.addRow(GEO_HEADERS);
  for (const row of geography) {
    sheet.addRow([
      row.province,
      row.city,
      row.customers,
      row.level,
      row.hasStore,
      row.network,
      row.firstCount,
      row.secondCount,
      row.totalCount,
      row.firstNames,
      row.secondNames,
    ]);
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "K1" };
  sheet.getColumn(10).width = 48;
  sheet.getColumn(11).width = 48;
}

function writeStoreSheet(workbook, stores) {
  const sheet = workbook.addWorksheet("门店明细");
  sheet.addRow(STORE_HEADERS);
  for (const store of stores) {
    sheet.addRow([
      store.network,
      store.recordId,
      store.code,
      store.name,
      store.originalName,
      store.fullName,
      store.province,
      store.city,
      store.district,
      store.region,
      store.address,
      store.storeType,
      store.sourceView,
      store.nameStatus,
      store.anomalyCode ?? "",
      store.anomalyNote,
    ]);
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "P1" };
  sheet.getColumn(4).width = 36;
  sheet.getColumn(5).width = 42;
  sheet.getColumn(6).width = 42;
  sheet.getColumn(11).width = 42;
}

export async function writeCoverageWorkbook(filePath, { stores, geography, provinceCustomers, sourceMeta }) {
  const annotated = annotateGeography(geography, stores);
  const summary = buildSummary(stores, annotated, provinceCustomers);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "m-hero-store-map";
  writeSummarySheet(workbook, summary, sourceMeta);
  writeGeographySheet(workbook, annotated);
  writeStoreSheet(workbook, stores);
  await workbook.xlsx.writeFile(filePath);
}

function readSummary(sheet) {
  const summary = { firstNetwork: 0, secondNetwork: 0, total: 0, sourceTime: "", firstView: "", secondView: "" };
  const provinceCustomers = {};
  let mode = "metrics";
  for (const row of sheetRows(sheet)) {
    const label = cellText(row, 1);
    const second = cellText(row, 2);
    if (label === "省份" && second === "一网家数") {
      mode = "provinces";
      continue;
    }
    if (mode === "metrics") {
      if (label === "快照时间") summary.sourceTime = second;
      if (label === "一网来源") summary.firstView = second;
      if (label === "二网来源") summary.secondView = second;
      if (label === "售后网点合计") summary.total = Number(second);
      if (label === "一网") summary.firstNetwork = Number(second);
      if (label === "二网") summary.secondNetwork = Number(second);
    } else if (label && label !== "合计") {
      provinceCustomers[label] = cellText(row, 7);
    }
  }
  return { summary, provinceCustomers };
}

function readGeography(sheet) {
  const rows = sheetRows(sheet);
  const header = rows[0];
  const headers = GEO_HEADERS.map((_, index) => cellText(header, index + 1));
  if (headers[0] !== "省份" || headers[1] !== "城市") {
    throw new Error("全国省市表头无法识别。");
  }
  return rows.slice(1).map((row) => ({
    province: cellText(row, 1),
    city: cellText(row, 2),
    customers: cellText(row, 3),
    level: cellText(row, 4),
    hasStore: cellText(row, 5),
    network: cellText(row, 6),
    firstCount: cellText(row, 7),
    secondCount: cellText(row, 8),
    totalCount: cellText(row, 9),
    firstNames: cellText(row, 10),
    secondNames: cellText(row, 11),
  })).filter((row) => row.province || row.city);
}

function readStores(sheet) {
  const rows = sheetRows(sheet);
  if (!rows.length) throw new Error("门店明细是空的。");
  const headers = STORE_HEADERS.map((_, index) => cellText(rows[0], index + 1));
  const missing = STORE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`门店明细缺少列：${missing.join("、")}。请先用快照重新导入，不要把旧清单当成新数据。`);
  }
  const index = new Map(headers.map((header, position) => [header, position + 1]));
  return rows.slice(1).map((row) => ({
    recordId: cellText(row, index.get("record_id")),
    network: cellText(row, index.get("网络")),
    code: cellText(row, index.get("门店编码")),
    name: cellText(row, index.get("门店名称")),
    originalName: cellText(row, index.get("原门店名称")),
    fullName: cellText(row, index.get("门店全称")),
    province: cellText(row, index.get("省份")),
    city: cellText(row, index.get("城市")),
    district: cellText(row, index.get("区县")),
    region: cellText(row, index.get("售后大区")),
    address: cellText(row, index.get("详细地址")),
    storeType: cellText(row, index.get("门店类型")),
    sourceView: cellText(row, index.get("来源视图")),
    nameStatus: cellText(row, index.get("展示名状态")),
    anomalyCode: cellText(row, index.get("异常代码")),
    anomalyNote: cellText(row, index.get("异常说明")),
  })).filter((store) => store.recordId || store.code || store.name);
}

export async function readGeographyTemplate(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const geographySheet = workbook.getWorksheet("全国省市");
  const summarySheet = workbook.getWorksheet("汇总");
  if (!geographySheet || !summarySheet) throw new Error("工作簿缺少全国省市或汇总。");
  const geography = readGeography(geographySheet).map((row) => ({
    province: row.province,
    city: row.city,
    customers: row.customers,
    level: row.level,
  }));
  return { geography, ...readSummary(summarySheet) };
}

export async function readCoverageWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const storeSheet = workbook.getWorksheet("门店明细");
  const geographySheet = workbook.getWorksheet("全国省市");
  const summarySheet = workbook.getWorksheet("汇总");
  if (!storeSheet || !geographySheet || !summarySheet) {
    throw new Error("工作簿需要同时包含汇总、全国省市、门店明细。");
  }
  const { summary, provinceCustomers } = readSummary(summarySheet);
  return {
    stores: readStores(storeSheet),
    geography: readGeography(geographySheet),
    summary,
    provinceCustomers,
  };
}
