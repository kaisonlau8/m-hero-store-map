import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { buildMapDocument } from "../scripts/lib/build-map.mjs";
import { appendManualCityAdditions, regionFromExistingStores } from "../scripts/lib/manual-additions.mjs";
import { readCoverageWorkbook } from "../scripts/lib/workbook.mjs";

const spec = JSON.parse(await fs.readFile(new URL("../data/source/manual-additions/2026-11-19-second-network-cities.json", import.meta.url), "utf8"));
const centers = JSON.parse(await fs.readFile(new URL("../data/geo/city-centers.json", import.meta.url), "utf8")).centers;
const workbook = await readCoverageWorkbook(new URL("../data/source/售后网点省市覆盖.xlsx", import.meta.url));

test("同省售后大区不唯一时留空，不编造", () => {
  const result = regionFromExistingStores([
    { province: "示例省", region: "华东区" },
    { province: "示例省", region: "华南区" },
  ], "示例省");
  assert.equal(result.region, "");
  assert.equal(result.status, "待核");
});

test("新增 15 条二网保留原 171，不覆盖已有大理店", () => {
  const base = workbook.stores.filter((store) => !store.recordId.startsWith("local-manual:"));
  assert.equal(base.length, 171);
  const originalIds = base.map((store) => store.recordId);
  const originalDali = base.find((store) => store.code === "MSFWWD021");
  const first = appendManualCityAdditions(base, workbook.geography, spec);
  const second = appendManualCityAdditions(first.stores, workbook.geography, spec);

  assert.deepEqual(first.errors, []);
  assert.equal(first.additions.length, 15);
  assert.equal(first.stores.length, 186);
  assert.equal(second.additions.length, 0);
  assert.equal(second.stores.length, 186);
  assert.deepEqual(first.stores.slice(0, 171).map((store) => store.recordId), originalIds);
  assert.equal(first.stores.filter((store) => store.network === "一网").length, 114);
  assert.equal(first.stores.filter((store) => store.network === "二网").length, 72);

  const daliRows = first.stores.filter((store) => store.city === "大理白族自治州");
  assert.equal(daliRows.length, 2);
  assert.equal(daliRows.find((store) => store.code === "MSFWWD021").name, originalDali.name);
  assert.equal(daliRows.find((store) => store.code === "MSFWWD021").district, originalDali.district);

  const expected = new Map([
    ["大理白族自治州", "猛士大理授权店"],
    ["锡林郭勒盟", "猛士锡林郭勒授权店"],
    ["嘉兴市", "猛士嘉兴授权店"],
    ["清远市", "猛士清远授权店"],
    ["绍兴市", "猛士绍兴授权店"],
    ["桂林市", "猛士桂林授权店"],
    ["保山市", "猛士保山授权店"],
    ["济宁市", "猛士济宁授权店"],
    ["德阳市", "猛士德阳授权店"],
    ["连云港市", "猛士连云港授权店"],
    ["临汾市", "猛士临汾授权店"],
    ["大庆市", "猛士大庆授权店"],
    ["运城市", "猛士运城授权店"],
    ["三门峡市", "猛士三门峡授权店"],
    ["济源市", "猛士济源授权店"],
  ]);
  for (const store of first.additions) {
    assert.equal(store.name, expected.get(store.city));
    assert.equal(store.district, "");
    assert.equal(store.code, "");
    assert.equal(store.recordId.startsWith("local-manual:20261119:"), true);
    assert.equal(store.recordId.includes("rec"), false);
    assert.equal(store.dataSource, "用户手工新增，未同步飞书");
    assert.equal(store.network, "二网");
    assert.ok(store.region, `${store.city} 应能由同省现有门店唯一确定售后大区`);
  }

  const built = buildMapDocument(first.stores, {
    centers,
    sourceMeta: { sourceTime: "2026-11-19T11:45:35+08:00", sourceLabel: "售后网点省市覆盖.xlsx" },
  });
  assert.deepEqual(built.errors, []);
  for (const store of built.document.stores.filter((item) => item.recordId.startsWith("local-manual:"))) {
    assert.deepEqual([store.lng, store.lat], centers[store.city]);
    assert.equal(store.coordinateLevel, "city-center");
  }
  assert.equal(JSON.stringify(built.document).includes("13390543021"), false);
  const nameCounts = new Map();
  for (const store of first.stores) nameCounts.set(store.name, (nameCounts.get(store.name) ?? 0) + 1);
  const duplicates = [...nameCounts.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicates, [["猛士授权店（行政区待核）", 2]]);
});
