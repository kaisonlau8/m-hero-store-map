import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMapDocument } from "./lib/build-map.mjs";
import { readCoverageWorkbook } from "./lib/workbook.mjs";

const workbookPath = process.argv[2] || process.env.STORE_MAP_XLSX || fileURLToPath(new URL("../data/source/售后网点省市覆盖.xlsx", import.meta.url));
const centersPath = new URL("../data/geo/city-centers.json", import.meta.url);
const outputPath = new URL("../assets/stores.json", import.meta.url);

const workbook = await readCoverageWorkbook(workbookPath);
const centerDocument = JSON.parse(await fs.readFile(centersPath, "utf8"));
const sourceTime = process.env.STORE_MAP_SOURCE_TIME || workbook.summary.sourceTime;
if (!sourceTime) {
  console.error("工作簿缺少快照时间，拒绝用当前时钟生成地图，以免重复构建结果漂移。");
  process.exitCode = 1;
} else {
  const result = buildMapDocument(workbook.stores, {
    centers: centerDocument.centers,
    sourceMeta: {
      sourceTime,
      sourceLabel: path.basename(workbookPath),
      firstView: workbook.summary.firstView,
      secondView: workbook.summary.secondView,
      sourceNote: workbook.summary.sourceNote,
    },
  });
  if (!result.document) {
    console.error(JSON.stringify({ errors: result.errors }, null, 2));
    process.exitCode = 1;
  } else {
    await fs.writeFile(outputPath, `${JSON.stringify(result.document, null, 2)}\n`);
    console.log(JSON.stringify({
      output: outputPath.pathname,
      counts: result.document.counts,
      anomalies: result.document.anomalies,
    }, null, 2));
  }
}
