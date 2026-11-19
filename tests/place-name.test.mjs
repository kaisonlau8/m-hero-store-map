import assert from "node:assert/strict";
import test from "node:test";

import { buildSecondNetworkName, shortenAdminName } from "../scripts/lib/place-name.mjs";

test("盐城市亭湖区生成猛士盐城亭湖授权店", () => {
  const result = buildSecondNetworkName({ city: "盐城市", district: "亭湖区" });
  assert.equal(result.name, "猛士盐城亭湖授权店");
  assert.equal(result.status, "standard");
  assert.equal(result.anomalyCode, null);
});

test("直辖市只去掉市级后缀，区名单独缩短", () => {
  assert.equal(buildSecondNetworkName({ city: "北京市", district: "朝阳区" }).name, "猛士北京朝阳授权店");
  assert.equal(buildSecondNetworkName({ city: "上海市", district: "浦东新区" }).name, "猛士上海浦东授权店");
  assert.equal(buildSecondNetworkName({ city: "天津市", district: "北辰区" }).name, "猛士天津北辰授权店");
  assert.equal(buildSecondNetworkName({ city: "重庆市", district: "南岸区" }).name, "猛士重庆南岸授权店");
});

test("县、县级市和单字县不盲目截断", () => {
  assert.equal(buildSecondNetworkName({ city: "安阳市", district: "安阳县" }).name, "猛士安阳安阳授权店");
  assert.equal(buildSecondNetworkName({ city: "酒泉市", district: "敦煌市" }).name, "猛士酒泉敦煌授权店");
  assert.equal(buildSecondNetworkName({ city: "沧州市", district: "沧县" }).name, "猛士沧州沧县授权店");
  assert.equal(shortenAdminName("芒市"), "芒市");
  assert.equal(shortenAdminName("津市市"), "津市");
  assert.equal(shortenAdminName("寿县"), "寿县");
});

test("自治州、地区、盟去掉行政后缀但保留专名", () => {
  assert.equal(buildSecondNetworkName({ city: "大理白族自治州", district: "大理市" }).name, "猛士大理大理授权店");
  assert.equal(buildSecondNetworkName({ city: "恩施土家族苗族自治州", district: "恩施市" }).name, "猛士恩施恩施授权店");
  assert.equal(buildSecondNetworkName({ city: "伊犁哈萨克自治州", district: "伊宁市" }).name, "猛士伊犁伊宁授权店");
  assert.equal(buildSecondNetworkName({ city: "红河哈尼族彝族自治州", district: "蒙自市" }).name, "猛士红河蒙自授权店");
  assert.equal(buildSecondNetworkName({ city: "西双版纳傣族自治州", district: "景洪市" }).name, "猛士西双版纳景洪授权店");
  assert.equal(buildSecondNetworkName({ city: "黔东南苗族侗族自治州", district: "凯里市" }).name, "猛士黔东南凯里授权店");
  assert.equal(buildSecondNetworkName({ city: "文山壮族苗族自治州", district: "文山市" }).name, "猛士文山文山授权店");
  assert.equal(buildSecondNetworkName({ city: "喀什地区", district: "喀什市" }).name, "猛士喀什喀什授权店");
  assert.equal(buildSecondNetworkName({ city: "阿里地区", district: "噶尔县" }).name, "猛士阿里噶尔授权店");
  assert.equal(buildSecondNetworkName({ city: "阿勒泰地区", district: "阿勒泰市" }).name, "猛士阿勒泰阿勒泰授权店");
  assert.equal(shortenAdminName("延边朝鲜族自治州"), "延边");
  assert.equal(shortenAdminName("博尔塔拉蒙古自治州"), "博尔塔拉");
  assert.equal(shortenAdminName("海西蒙古族藏族自治州"), "海西");
  assert.equal(shortenAdminName("克孜勒苏柯尔克孜自治州"), "克孜勒苏");
  assert.equal(shortenAdminName("湘西土家族苗族自治州"), "湘西");
  assert.equal(shortenAdminName("巴音郭楞蒙古自治州"), "巴音郭楞");
  assert.equal(shortenAdminName("凉山彝族自治州"), "凉山");
  assert.equal(shortenAdminName("锡林郭勒盟"), "锡林郭勒");
  assert.equal(shortenAdminName("兴安盟"), "兴安");
});

test("镇街、市中、西区、新区和民族区县按专名处理", () => {
  assert.equal(buildSecondNetworkName({ city: "儋州市", district: "那大镇" }).name, "猛士儋州那大授权店");
  assert.equal(buildSecondNetworkName({ city: "东莞市", district: "寮步镇" }).name, "猛士东莞寮步授权店");
  assert.equal(buildSecondNetworkName({ city: "乐山市", district: "市中区" }).name, "猛士乐山市中授权店");
  assert.equal(buildSecondNetworkName({ city: "攀枝花市", district: "西区" }).name, "猛士攀枝花西区授权店");
  assert.equal(shortenAdminName("沙市区"), "沙市");
  assert.equal(shortenAdminName("高新区"), "高新");
  assert.equal(shortenAdminName("星海街道"), "星海");
  assert.equal(shortenAdminName("神农架林区"), "神农架");
  assert.equal(shortenAdminName("瀍河回族区"), "瀍河");
  assert.equal(shortenAdminName("管城回族区"), "管城");
  assert.equal(shortenAdminName("鄂温克族自治旗"), "鄂温克");
  assert.equal(shortenAdminName("堆龙德庆区"), "堆龙德庆");
  assert.equal(shortenAdminName("香港特别行政区"), "香港");
});

test("北林区只去掉区，林字留在专名里", () => {
  assert.equal(shortenAdminName("北林区"), "北林");
  assert.equal(buildSecondNetworkName({ city: "绥化市", district: "北林区" }).name, "猛士绥化北林授权店");
  assert.equal(shortenAdminName("神农架林区"), "神农架");
});

test("真实区名与市专名相同仍按规则生成，不改成别的名字", () => {
  const result = buildSecondNetworkName({ city: "克拉玛依市", district: "克拉玛依区" });
  assert.equal(result.status, "standard");
  assert.equal(result.name, "猛士克拉玛依克拉玛依授权店");
});

test("区字段与市重复时不编造区名，展示名不含该地点", () => {
  for (const district of ["大连市", "东方市"]) {
    const result = buildSecondNetworkName({
      province: district === "大连市" ? "辽宁省" : "海南省",
      city: district,
      district,
      code: "MSFWWD000",
    });
    assert.equal(result.status, "anomaly");
    assert.equal(result.anomalyCode, "district-equals-city");
    assert.equal(result.name, "猛士授权店（行政区待核）");
    assert.equal(result.name.includes("大连"), false);
    assert.equal(result.name.includes("东方"), false);
    assert.equal(result.name.includes("冀东"), false);
    assert.match(result.anomalyNote, /未编造/);
  }
});

test("自治区直辖县级市区留空时保留城市，不编造区", () => {
  for (const [city, displayName] of [["北屯市", "猛士北屯授权店"], ["石河子市", "猛士石河子授权店"]]) {
    const result = buildSecondNetworkName({
      province: "新疆维吾尔自治区",
      city,
      district: "",
      level: "省直辖县级市",
    });
    assert.equal(result.status, "standard");
    assert.equal(result.anomalyCode, null);
    assert.equal(result.name, displayName);
    assert.equal(result.city, city);
    assert.equal(result.district, "");
    assert.equal(result.name.includes("区"), false);
  }
  assert.equal(buildSecondNetworkName({ city: "林芝市", district: "巴宜区" }).name, "猛士林芝巴宜授权店");
});

test("无区、缺失值和无法识别的区名都降级且不把原文写进展示名", () => {
  for (const district of ["", "无", "—", "冀东"]) {
    const result = buildSecondNetworkName({ city: "大连市", district, code: "MSFWWD131" });
    assert.equal(result.status, "anomaly");
    assert.equal(result.name, "猛士授权店（行政区待核）");
    assert.equal(result.name.includes("大连"), false);
    assert.equal(result.name.includes("冀东"), false);
  }
  assert.equal(buildSecondNetworkName({ city: "大连市", district: "" }).anomalyCode, "district-missing");
  assert.equal(buildSecondNetworkName({ city: "大连市", district: "无" }).anomalyCode, "district-missing");
  assert.equal(buildSecondNetworkName({ city: "大连市", district: "冀东" }).anomalyCode, "district-unrecognized");
});

test("标准省市区字段不因展示名缩短而被改写", () => {
  const result = buildSecondNetworkName({
    province: "江苏省",
    city: "盐城市",
    district: "亭湖区",
  });
  assert.equal(result.province, "江苏省");
  assert.equal(result.city, "盐城市");
  assert.equal(result.district, "亭湖区");
});
