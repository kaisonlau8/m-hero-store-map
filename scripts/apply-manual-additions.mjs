import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildMapDocument } from "./lib/build-map.mjs";
import { applyManualSpec } from "./import-snapshot.mjs";
import { readCoverageWorkbook, writeCoverageWorkbook } from "./lib/workbook.mjs";

const workbookPath = fileURLToPath(new URL("../data/source/售后网点省市覆盖.xlsx", import.meta.url));
const centersPath = fileURLToPath(new URL("../data/geo/city-centers.json", import.meta.url));
const outputPath = fileURLToPath(new URL("../assets/stores.json", import.meta.url));
const reportPath = fileURLToPath(new URL("../data/source/import-report.json", import.meta.url));
const manualPath = fileURLToPath(new URL("../data/source/manual-additions/2026-11-19-second-network-cities.json", import.meta.url));

async function main() {
  const workbook = await readCoverageWorkbook(workbookPath);
  const manualSpec = JSON.parse(await fs.readFile(manualPath, "utf8"));
  const centers = JSON.parse(await fs.readFile(centersPath, "utf8")).centers;
  const applied = applyManualSpec(workbook.stores, workbook.geography, {
    sourceTime: workbook.summary.sourceTime,
    sourceLabel: path.basename(workbookPath),
    firstView: workbook.summary.firstView,
    secondView: workbook.summary.secondView,
    sourceNote: workbook.summary.sourceNote,
  }, manualSpec);
  if (applied.errors.length) {
    console.error(JSON.stringify({ errors: applied.errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  const map = buildMapDocument(applied.stores, { centers, sourceMeta: applied.sourceMeta });
  if (!map.document) {
    console.error(JSON.stringify({ errors: map.errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  const nameCounts = new Map();
  for (const store of applied.stores) nameCounts.set(store.name, (nameCounts.get(store.name) ?? 0) + 1);
  const report = {
    sourceTime: applied.sourceMeta.sourceTime,
    sourceNote: applied.sourceMeta.sourceNote,
    counts: map.document.counts,
    errors: [],
    warnings: applied.notes,
    manualAdditions: applied.additions.map((store) => ({
      recordId: store.recordId,
      code: store.code,
      name: store.name,
      province: store.province,
      city: store.city,
      district: store.district,
      region: store.region,
      regionStatus: store.regionStatus,
      dataSource: store.dataSource,
    })),
    duplicateDisplayNames: [...nameCounts.entries()].filter(([, count]) => count > 1),
    anomalies: map.document.anomalies,
  };
  await writeCoverageWorkbook(workbookPath, {
    stores: applied.stores,
    geography: workbook.geography,
    provinceCustomers: workbook.provinceCustomers,
    sourceMeta: applied.sourceMeta,
  });
  await fs.writeFile(outputPath, `${JSON.stringify(map.document, null, 2)}\n`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    counts: map.document.counts,
    added: applied.additions.length,
    duplicates: report.duplicateDisplayNames,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
