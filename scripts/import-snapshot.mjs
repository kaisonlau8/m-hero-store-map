import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildMapDocument } from "./lib/build-map.mjs";
import { appendManualCityAdditions, MANUAL_ID_PREFIX } from "./lib/manual-additions.mjs";
import { normalizeSnapshot } from "./lib/normalize-store.mjs";
import { readGeographyTemplate, writeCoverageWorkbook } from "./lib/workbook.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const snapshotPath = fileURLToPath(new URL("../data/source/snapshot/stores-for-map.json", import.meta.url));
const workbookPath = fileURLToPath(new URL("../data/source/售后网点省市覆盖.xlsx", import.meta.url));
const centersPath = fileURLToPath(new URL("../data/geo/city-centers.json", import.meta.url));
const outputPath = fileURLToPath(new URL("../assets/stores.json", import.meta.url));
const reportPath = fileURLToPath(new URL("../data/source/import-report.json", import.meta.url));
const manualPath = fileURLToPath(new URL("../data/source/manual-additions/2026-11-19-second-network-cities.json", import.meta.url));

export function canonicalSourceTime(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!match) throw new Error(`无法识别快照时间：${text || "空"}`);
  return `${match[1]}T${match[2]}+08:00`;
}

export function sourceMetaFromSnapshot(snapshot) {
  const meta = snapshot.meta ?? {};
  return {
    sourceTime: canonicalSourceTime(meta.source_time ?? meta.generated_at),
    sourceLabel: "售后网点省市覆盖.xlsx",
    firstView: `${meta.t1?.table_name ?? "开业门店清单"} / ${meta.t1?.view_name ?? "有售后视图"} ${meta.t1?.view_id ?? ""}`.trim(),
    secondView: `${meta.t2?.table_name ?? "二网信息"} / ${meta.t2?.view_name ?? "表格"} ${meta.t2?.view_id ?? ""}`.trim(),
    sourceNote: sourceNoteFromSnapshot(meta),
  };
}

function sourceNoteFromSnapshot(meta) {
  const correction = meta.correction;
  if (!correction) return "";
  const codes = (correction.records ?? []).map((row) => row.门店编码).filter(Boolean);
  const basedOn = meta.based_on_snapshot || "先前快照";
  return [
    `纠正时间 ${correction.at || meta.source_time}。`,
    `只更新 ${codes.length} 条二网${codes.length ? `（${codes.join("、")}）` : ""}。`,
    `一网仍为 ${basedOn} 的有售后视图，修订号 ${correction.t1_rev_unchanged ?? "未变"}，不是本次全表新读。`,
  ].join("");
}

export function applyManualSpec(stores, geography, sourceMeta, spec) {
  const labeled = stores.map((store) => ({
    ...store,
    dataSource: store.dataSource || (String(store.recordId).startsWith(MANUAL_ID_PREFIX) ? "" : "飞书快照"),
  }));
  const manual = appendManualCityAdditions(labeled, geography, spec);
  const manualNote = `${spec.cities.length} 条二网为用户手工新增，未同步飞书，无飞书 record_id 与门店编码。`;
  const sourceNote = sourceMeta.sourceNote?.includes("用户手工新增")
    ? sourceMeta.sourceNote
    : `${sourceMeta.sourceNote || ""}${manualNote}`;
  return { ...manual, sourceMeta: { ...sourceMeta, sourceNote } };
}

export async function importSnapshot({ snapshot, geography, provinceCustomers, centers, manualSpec }) {
  const levels = new Map((geography ?? []).map((row) => [`${row.province}\0${row.city}`, row.level ?? ""]));
  const normalized = normalizeSnapshot(snapshot, { levels });
  const warnings = [...normalized.warnings];
  for (const store of normalized.stores) {
    const known = geography.some((row) => row.province === store.province && row.city === store.city);
    if (!known) warnings.push(`全国省市没有 ${store.province}${store.city}（${store.code}），门店仍保留`);
  }
  const sourceMeta = sourceMetaFromSnapshot(snapshot);
  if (normalized.errors.length) {
    return { ok: false, errors: normalized.errors, warnings, sourceMeta, stores: normalized.stores };
  }
  const applied = manualSpec
    ? applyManualSpec(normalized.stores, geography, sourceMeta, manualSpec)
    : { stores: normalized.stores, additions: [], errors: [], notes: [], sourceMeta };
  if (applied.errors.length) {
    return { ok: false, errors: applied.errors, warnings, sourceMeta: applied.sourceMeta, stores: applied.stores };
  }
  const map = buildMapDocument(applied.stores, { centers, sourceMeta: applied.sourceMeta });
  return {
    ok: map.errors.length === 0,
    errors: map.errors,
    warnings: [...warnings, ...applied.notes],
    sourceMeta: applied.sourceMeta,
    stores: applied.stores,
    additions: applied.additions,
    geography,
    provinceCustomers,
    document: map.document,
  };
}

async function main() {
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  const manualSpec = JSON.parse(await fs.readFile(manualPath, "utf8"));
  const template = await readGeographyTemplate(workbookPath);
  const centerDocument = JSON.parse(await fs.readFile(centersPath, "utf8"));
  const result = await importSnapshot({
    snapshot,
    geography: template.geography,
    provinceCustomers: template.provinceCustomers,
    centers: centerDocument.centers,
    manualSpec,
  });
  const report = {
    sourceTime: result.sourceMeta.sourceTime,
    counts: {
      total: result.stores.length,
      firstNetwork: result.stores.filter((store) => store.network === "一网").length,
      secondNetwork: result.stores.filter((store) => store.network === "二网").length,
    },
    errors: result.errors,
    warnings: result.warnings,
    anomalies: result.stores
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
        address: store.address,
      })),
  };
  if (!result.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }
  await writeCoverageWorkbook(workbookPath, {
    stores: result.stores,
    geography: result.geography,
    provinceCustomers: result.provinceCustomers,
    sourceMeta: result.sourceMeta,
  });
  await fs.writeFile(outputPath, `${JSON.stringify(result.document, null, 2)}\n`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    workbook: path.relative(projectRoot, workbookPath),
    output: path.relative(projectRoot, outputPath),
    counts: result.document.counts,
    anomalies: report.anomalies.length,
    warnings: report.warnings.length,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
