import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { buildMapDocument } from "../scripts/lib/build-map.mjs";
import { readCoverageWorkbook } from "../scripts/lib/workbook.mjs";

const mapText = await fs.readFile(new URL("../assets/stores.json", import.meta.url), "utf8");
const reportText = await fs.readFile(new URL("../data/source/import-report.json", import.meta.url), "utf8");
const map = JSON.parse(mapText);
const centers = JSON.parse(await fs.readFile(new URL("../data/geo/city-centers.json", import.meta.url), "utf8"));
const workbook = await readCoverageWorkbook(new URL("../data/source/售后网点省市覆盖.xlsx", import.meta.url));
const contactPattern = /1[3-9]\d{9}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

test("发布的地图与 Excel 一致，且不含电话或邮箱", () => {
  assert.equal(map.counts.total, 171);
  assert.equal(map.counts.firstNetwork, 114);
  assert.equal(map.counts.secondNetwork, 57);
  assert.equal(map.stores.length, 171);
  assert.equal(workbook.stores.length, 171);
  assert.equal(workbook.summary.total, 171);
  assert.equal(workbook.summary.firstNetwork, 114);
  assert.equal(workbook.summary.secondNetwork, 57);
  assert.equal(new Set(map.stores.map((store) => store.recordId)).size, 171);
  assert.equal(new Set(map.stores.map((store) => store.id)).size, 171);
  assert.equal(new Set(map.stores.map((store) => store.code)).size, 171);
  assert.equal(map.generatedAt, "2026-11-19T11:45:35+08:00");
  assert.equal(map.sourceNote.includes("只更新 3 条二网"), true);
  assert.equal(map.sourceNote.includes("不是本次全表新读"), true);
  assert.equal(mapText.includes("电话已隐"), false);
  assert.equal(map.coordinateLevel, "city-center");
  assert.equal(mapText.includes("KRj0bzGA3aOkcgskRAbcSMX1nad"), false);
  assert.equal(contactPattern.test(mapText), false);
  assert.equal(contactPattern.test(reportText), false);
  assert.equal(contactPattern.test(JSON.stringify(workbook)), false);

  map.stores.forEach((store, index) => {
    const imported = workbook.stores[index];
    assert.notEqual(store.address, "无");
    assert.deepEqual([store.lng, store.lat], centers.centers[store.city]);
    for (const field of ["recordId", "code", "network", "name", "originalName", "province", "city", "district", "region", "address"]) {
      assert.equal(imported[field], store[field]);
    }
  });

  const dalian = map.stores.find((store) => store.code === "MSFWWD131");
  assert.equal(dalian.recordId, "reczz28WDhQnIw6r");
  assert.equal(dalian.originalName, "猛士大连授权服务中心（进店时请预约）");
});

test("二网展示名覆盖用户例子和特殊行政区，异常记录单独降级", () => {
  const byCode = new Map(map.stores.map((store) => [store.code, store]));
  assert.equal(byCode.get("MSFWWD031").name, "猛士盐城亭湖授权店");
  assert.equal(byCode.get("MSFWWD031").city, "盐城市");
  assert.equal(byCode.get("MSFWWD031").district, "亭湖区");
  assert.equal(byCode.get("MSFWWD021").name, "猛士大理大理授权店");
  assert.equal(byCode.get("MSFWWD034").name, "猛士恩施恩施授权店");
  assert.equal(byCode.get("MSFWWD124").name, "猛士伊犁伊宁授权店");
  assert.equal(byCode.get("MSFWWD058").name, "猛士儋州那大授权店");
  assert.equal(byCode.get("MSFWWD101").name, "猛士绥化北林授权店");
  assert.equal(byCode.get("MSFWWD127").name, "猛士克拉玛依克拉玛依授权店");
  assert.equal(byCode.get("MSFWWD098").name, "猛士林芝巴宜授权店");
  assert.equal(byCode.get("MSFWWD098").province, "西藏自治区");
  assert.equal(byCode.get("MSFWWD098").city, "林芝市");
  assert.equal(byCode.get("MSFWWD098").district, "巴宜区");
  assert.equal(byCode.get("MSFWWD098").region, "西南区");
  assert.equal(byCode.get("MSFWWD129").name, "猛士北屯授权店");
  assert.equal(byCode.get("MSFWWD129").city, "北屯市");
  assert.equal(byCode.get("MSFWWD129").district, "");
  assert.equal(byCode.get("MSFWWD129").nameStatus, "标准");
  assert.equal(byCode.get("MSFWWD128").name, "猛士石河子授权店");
  assert.equal(byCode.get("MSFWWD128").city, "石河子市");
  assert.equal(byCode.get("MSFWWD128").district, "");
  assert.equal(byCode.get("MSFWWD128").region, "西南区");

  for (const code of ["MSFWWD114", "MSFWWD131"]) {
    const store = byCode.get(code);
    assert.equal(store.name, "猛士授权店（行政区待核）");
    assert.equal(store.address, "");
    assert.equal(store.name.includes("大连"), false);
    assert.equal(store.name.includes("东方"), false);
    assert.equal(store.originalName.includes("13390543021"), false);
    assert.equal(store.name.includes("13390543021"), false);
    assert.equal(store.district, store.city);
  }
  assert.deepEqual(map.anomalies.map((item) => item.code), ["MSFWWD114", "MSFWWD131"]);
  assert.equal(map.stores.filter((store) => store.network === "一网" && store.name !== store.originalName).length, 0);
  assert.equal(map.stores.filter((store) => store.network === "二网" && store.address !== "").length, 0);
});

test("全国省市客户数保持原值，门店名单改用同一展示名", () => {
  assert.equal(workbook.geography.length, 369);
  assert.equal(workbook.geography.find((row) => row.city === "伊犁哈萨克自治州").customers, "225");
  assert.equal(workbook.geography.find((row) => row.city === "伊犁哈萨克自治州").secondNames, "猛士伊犁伊宁授权店");
  assert.equal(workbook.geography.find((row) => row.city === "盐城市").secondNames, "猛士盐城亭湖授权店");
  assert.equal(workbook.geography.find((row) => row.city === "大连市").secondNames, "猛士授权店（行政区待核）");
  assert.equal(workbook.geography.find((row) => row.city === "石河子市").hasStore, "有");
  assert.equal(workbook.geography.find((row) => row.city === "石河子市").customers, "12");
  assert.equal(workbook.provinceCustomers["新疆维吾尔自治区"], "685");
  assert.equal(workbook.summary.sourceTime, "2026-11-19T11:45:35+08:00");
  assert.equal(workbook.geography.find((row) => row.city === "北屯市").secondNames, "猛士北屯授权店");
  assert.equal(workbook.geography.find((row) => row.city === "石河子市").secondNames, "猛士石河子授权店");
  assert.equal(workbook.geography.find((row) => row.city === "北屯市").customers, "2");
  assert.equal(workbook.geography.find((row) => row.city === "阿勒泰地区").hasStore, "无");
});

test("从 Excel 重建地图与已发布 JSON 相同", () => {
  const rebuilt = buildMapDocument(workbook.stores, {
    centers: centers.centers,
    sourceMeta: {
      sourceTime: workbook.summary.sourceTime,
      sourceLabel: "售后网点省市覆盖.xlsx",
      firstView: workbook.summary.firstView,
      secondView: workbook.summary.secondView,
      sourceNote: workbook.summary.sourceNote,
    },
  });
  assert.deepEqual(rebuilt.errors, []);
  assert.deepEqual(rebuilt.document, map);
});
