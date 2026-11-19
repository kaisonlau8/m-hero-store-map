import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildMapDocument } from "../scripts/lib/build-map.mjs";
import { normalizeSnapshot } from "../scripts/lib/normalize-store.mjs";
import { readCoverageWorkbook, writeCoverageWorkbook } from "../scripts/lib/workbook.mjs";

const sourceTime = "2026-11-19T10:59:42+08:00";

function record(overrides) {
  return {
    类别: "二网",
    record_id: "rec-default",
    门店编码: "MSFWWD000",
    名称: "原名",
    全称: "全称",
    省: "江苏省",
    市: "盐城市",
    区: "亭湖区",
    售后区: "华东区",
    详细地址: "无",
    门店类型: "经销店",
    source_view: "vew8ip5Nf3",
    ...overrides,
  };
}

function snapshot(records) {
  return {
    meta: { source_time: "2026-11-19 10:59:42 UTC+08:00" },
    records,
  };
}

const geography = [
  { province: "江苏省", city: "盐城市", customers: "12", level: "地级市" },
  { province: "辽宁省", city: "大连市", customers: "58", level: "地级市" },
  { province: "海南省", city: "东方市", customers: "2", level: "省直辖县级市" },
  { province: "江苏省", city: "南京市", customers: "9", level: "地级市" },
];

test("快照规范化保留标准行政区、原名和唯一记录，且不靠名称去重", () => {
  const result = normalizeSnapshot(snapshot([
    record({ record_id: "rec-yan", 门店编码: "MSFWWD031", 名称: "猛士盐城授权服务中心（请电话预约）" }),
    record({
      record_id: "rec-yan-2",
      门店编码: "MSFWWD031B",
      名称: "猛士盐城授权服务中心（请电话预约）",
      全称: "另一家全称",
    }),
    record({
      record_id: "rec-dalian",
      门店编码: "MSFWWD131",
      名称: "猛士大连授权服务中心",
      省: "辽宁省",
      市: "大连市",
      区: "大连市",
      售后区: "华北区",
      详细地址: "无",
    }),
    record({
      类别: "一网",
      record_id: "rec-qd",
      门店编码: "MSCSDS001",
      名称: "猛士汽车青岛市北零售中心",
      全称: "青岛猛士之星汽车销售有限公司",
      省: "山东省",
      市: "青岛市",
      区: "市北区",
      售后区: "华北区",
      详细地址: "城阳区赵红路5号",
      门店类型: "代理店",
      source_view: "vewW8YCXOD",
    }),
    record({
      record_id: "rec-dup-code",
      门店编码: "MSFWWD031",
      名称: "编码重复但不是同一条",
      市: "南京市",
      区: "玄武区",
    }),
  ]));

  assert.deepEqual(result.errors, []);
  assert.equal(result.stores.length, 5);
  assert.equal(new Set(result.stores.map((store) => store.recordId)).size, 5);
  assert.equal(result.stores.filter((store) => store.code === "MSFWWD031").length, 2);
  assert.equal(result.warnings.some((warning) => warning.includes("MSFWWD031")), true);

  const yancheng = result.stores.filter((store) => store.recordId.startsWith("rec-yan"));
  assert.equal(yancheng.length, 2);
  for (const store of yancheng) {
    assert.equal(store.name, "猛士盐城亭湖授权店");
    assert.equal(store.originalName, "猛士盐城授权服务中心（请电话预约）");
    assert.equal(store.province, "江苏省");
    assert.equal(store.city, "盐城市");
    assert.equal(store.district, "亭湖区");
    assert.equal(store.address, "");
    assert.equal(store.region, "华东区");
  }

  const dalian = result.stores.find((store) => store.recordId === "rec-dalian");
  assert.equal(dalian.name, "猛士授权店（行政区待核）");
  assert.equal(dalian.name.includes("大连"), false);
  assert.equal(dalian.city, "大连市");
  assert.equal(dalian.district, "大连市");
  assert.equal(dalian.address, "");
  assert.equal(dalian.nameStatus, "行政区待核");

  const qingdao = result.stores.find((store) => store.recordId === "rec-qd");
  assert.equal(qingdao.network, "一网");
  assert.equal(qingdao.name, "猛士汽车青岛市北零售中心");
  assert.equal(qingdao.originalName, "猛士汽车青岛市北零售中心");
  assert.equal(qingdao.address, "城阳区赵红路5号");
  assert.equal(qingdao.district, "市北区");
});

test("店名里的手机号尾注不进入发布文本，店代码保留", () => {
  const result = normalizeSnapshot(snapshot([
    record({
      record_id: "rec-dalian",
      门店编码: "MSFWWD131",
      名称: "猛士大连授权服务中心（进店时请预约13390543021））",
      全称: "大连冀东汽车贸易有限公司",
      省: "辽宁省",
      市: "大连市",
      区: "大连市",
      售后区: "华北区",
    }),
    record({
      record_id: "rec-yan",
      门店编码: "MSFWWD031",
      名称: "猛士盐城授权服务中心（请电话预约）",
    }),
  ]));

  const dalian = result.stores.find((store) => store.recordId === "rec-dalian");
  assert.equal(dalian.code, "MSFWWD131");
  assert.equal(dalian.originalName, "猛士大连授权服务中心（进店时请预约）");
  assert.equal(dalian.originalName.includes("13390543021"), false);
  assert.equal(dalian.fullName, "大连冀东汽车贸易有限公司");
  assert.equal(result.stores.find((store) => store.code === "MSFWWD031").originalName, "猛士盐城授权服务中心（请电话预约）");
});

test("重复 record_id 报错且不合并成一条", () => {
  const result = normalizeSnapshot(snapshot([
    record({ record_id: "rec-same", 门店编码: "A" }),
    record({ record_id: "rec-same", 门店编码: "B", 名称: "另一原名" }),
  ]));
  assert.equal(result.stores.length, 2);
  assert.equal(result.errors.some((error) => error.includes("rec-same")), true);
});

test("Excel 与地图 JSON 一致、可重复导入，且不把缺失地址写成「无」", async () => {
  const normalized = normalizeSnapshot(snapshot([
    record({ record_id: "rec-yan", 门店编码: "MSFWWD031", 名称: "猛士盐城授权服务中心（请电话预约）" }),
    record({
      record_id: "rec-dalian",
      门店编码: "MSFWWD131",
      名称: "猛士大连授权服务中心",
      省: "辽宁省",
      市: "大连市",
      区: "大连市",
      售后区: "华北区",
    }),
    record({
      类别: "一网",
      record_id: "rec-nj",
      门店编码: "MSCNJ001",
      名称: "猛士汽车南京江宁交付服务中心",
      省: "江苏省",
      市: "南京市",
      区: "江宁区",
      详细地址: "上高路186号",
      source_view: "vewW8YCXOD",
    }),
  ]));
  assert.deepEqual(normalized.errors, []);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "store-map-"));
  const workbookPath = path.join(directory, "coverage.xlsx");
  const sourceMeta = {
    sourceTime,
    sourceLabel: "售后网点省市覆盖.xlsx",
    firstView: "有售后视图 vewW8YCXOD",
    secondView: "二网信息 vew8ip5Nf3",
  };
  await writeCoverageWorkbook(workbookPath, {
    stores: normalized.stores,
    geography,
    provinceCustomers: { 江苏省: "21", 辽宁省: "58", 海南省: "2" },
    sourceMeta,
  });
  const firstRead = await readCoverageWorkbook(workbookPath);
  await writeCoverageWorkbook(workbookPath, {
    stores: normalized.stores,
    geography: firstRead.geography,
    provinceCustomers: firstRead.provinceCustomers,
    sourceMeta,
  });
  const secondRead = await readCoverageWorkbook(workbookPath);

  assert.deepEqual(secondRead.stores, firstRead.stores);
  assert.equal(secondRead.stores.length, 3);
  assert.deepEqual(
    secondRead.stores.map((store) => store.recordId),
    ["rec-yan", "rec-dalian", "rec-nj"],
  );
  assert.equal(secondRead.geography.find((row) => row.city === "盐城市").customers, "12");
  assert.equal(secondRead.geography.find((row) => row.city === "盐城市").secondNames, "猛士盐城亭湖授权店");
  assert.equal(secondRead.geography.find((row) => row.city === "大连市").secondNames, "猛士授权店（行政区待核）");
  assert.equal(secondRead.geography.find((row) => row.city === "大连市").secondNames.includes("大连"), false);
  assert.equal(secondRead.geography.find((row) => row.city === "南京市").customers, "9");
  assert.equal(secondRead.geography.find((row) => row.city === "南京市").firstNames, "猛士汽车南京江宁交付服务中心");
  assert.equal(secondRead.geography.find((row) => row.city === "东方市").hasStore, "无");
  assert.equal(secondRead.summary.firstNetwork, 1);
  assert.equal(secondRead.summary.secondNetwork, 2);
  assert.equal(secondRead.summary.total, 3);
  assert.equal(secondRead.provinceCustomers["辽宁省"], "58");

  const centers = {
    盐城市: [120.163, 33.347],
    大连市: [121.614, 38.914],
    南京市: [118.796, 32.059],
  };
  const mapDocument = buildMapDocument(secondRead.stores, { centers, sourceMeta });
  assert.equal(mapDocument.errors.length, 0);
  assert.equal(mapDocument.document.counts.total, 3);
  assert.equal(mapDocument.document.counts.firstNetwork, 1);
  assert.equal(mapDocument.document.counts.secondNetwork, 2);
  assert.equal(mapDocument.document.generatedAt, sourceTime);
  assert.equal(mapDocument.document.coordinateLevel, "city-center");
  const exported = mapDocument.document.stores;
  assert.deepEqual(exported.map((store) => [store.recordId, store.name, store.province, store.city, store.district, store.address]), [
    ["rec-yan", "猛士盐城亭湖授权店", "江苏省", "盐城市", "亭湖区", ""],
    ["rec-dalian", "猛士授权店（行政区待核）", "辽宁省", "大连市", "大连市", ""],
    ["rec-nj", "猛士汽车南京江宁交付服务中心", "江苏省", "南京市", "江宁区", "上高路186号"],
  ]);
  assert.deepEqual([exported[0].lng, exported[0].lat], centers["盐城市"]);
  assert.equal(JSON.stringify(exported).includes("无"), false);

  const again = buildMapDocument(secondRead.stores, { centers, sourceMeta });
  assert.deepEqual(again.document, mapDocument.document);
});

test("找不到城市中心时失败并列出城市，不编造坐标", () => {
  const normalized = normalizeSnapshot(snapshot([
    record({ record_id: "rec-yan", 门店编码: "MSFWWD031" }),
  ]));
  const mapDocument = buildMapDocument(normalized.stores, {
    centers: {},
    sourceMeta: { sourceTime, sourceLabel: "售后网点省市覆盖.xlsx" },
  });
  assert.equal(mapDocument.document, null);
  assert.equal(mapDocument.errors.some((error) => error.includes("盐城市")), true);
  assert.equal(JSON.stringify(mapDocument).includes("lng"), false);
});
