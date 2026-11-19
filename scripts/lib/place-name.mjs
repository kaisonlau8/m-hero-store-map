const ETHNIC_SUFFIXES = [
  "乌孜别克族",
  "柯尔克孜族",
  "维吾尔族",
  "鄂伦春族",
  "达斡尔族",
  "鄂温克族",
  "塔吉克族",
  "哈萨克族",
  "俄罗斯族",
  "塔塔尔族",
  "土家族",
  "哈尼族",
  "景颇族",
  "傈僳族",
  "蒙古族",
  "朝鲜族",
  "布依族",
  "高山族",
  "东乡族",
  "撒拉族",
  "仡佬族",
  "仫佬族",
  "毛南族",
  "纳西族",
  "拉祜族",
  "布朗族",
  "阿昌族",
  "普米族",
  "德昂族",
  "独龙族",
  "基诺族",
  "保安族",
  "裕固族",
  "珞巴族",
  "门巴族",
  "锡伯族",
  "赫哲族",
  "柯尔克孜",
  "哈萨克",
  "蒙古族",
  "藏族",
  "回族",
  "壮族",
  "满族",
  "侗族",
  "瑶族",
  "白族",
  "傣族",
  "黎族",
  "彝族",
  "苗族",
  "土族",
  "羌族",
  "畲族",
  "水族",
  "佤族",
  "怒族",
  "京族",
  "蒙古",
].sort((left, right) => right.length - left.length);

const MISSING_DISTRICT = new Set(["", "无", "无详细地址", "-", "—", "/", "／", "暂无", "null", "NULL", "N/A", "n/a"]);

const RECOGNIZED_SUFFIXES = [
  "特别行政区",
  "自治旗",
  "自治县",
  "矿区",
  "林区",
  "新区",
  "街道",
  "地区",
  "自治州",
  "苏木",
  "市",
  "区",
  "县",
  "旗",
  "盟",
  "镇",
  "乡",
];

export const SECOND_NETWORK_ANOMALY_NAME = "猛士授权店（行政区待核）";

function stripTrailingEthnics(body) {
  let value = body;
  let changed = true;
  while (changed) {
    changed = false;
    for (const ethnic of ETHNIC_SUFFIXES) {
      if (value.endsWith(ethnic) && value.length - ethnic.length >= 2) {
        value = value.slice(0, -ethnic.length);
        changed = true;
        break;
      }
    }
  }
  if (value.endsWith("族")) {
    const withoutMarker = value.slice(0, -1);
    const knownEthnic = ETHNIC_SUFFIXES.some((ethnic) => ethnic === value || ethnic === withoutMarker);
    if (knownEthnic && withoutMarker.length >= 2) return withoutMarker;
  }
  return value;
}

function stripOnce(name, suffix) {
  const body = name.slice(0, -suffix.length);
  return body.length >= 2 ? body : null;
}

export function shortenAdminName(raw) {
  const name = String(raw ?? "").trim();
  if (!name) return "";

  if (name.endsWith("自治州")) {
    const body = stripTrailingEthnics(name.slice(0, -3));
    if (body.length >= 2) return body;
    return name;
  }

  if (name.endsWith("自治县") || name.endsWith("自治旗")) {
    const suffix = name.endsWith("自治县") ? "自治县" : "自治旗";
    const body = stripTrailingEthnics(name.slice(0, -suffix.length));
    if (body.length >= 2) return body;
    return name;
  }

  for (const suffix of ["特别行政区", "矿区", "林区", "街道", "地区", "苏木"]) {
    if (!name.endsWith(suffix)) continue;
    const body = stripOnce(name, suffix);
    if (body) return body;
  }

  if (name.endsWith("新区")) {
    const body = stripOnce(name, "新区");
    if (body) return body;
  }

  if (name.endsWith("区")) {
    const withoutDistrict = name.slice(0, -1);
    const withoutEthnic = stripTrailingEthnics(withoutDistrict);
    if (withoutEthnic !== withoutDistrict && withoutEthnic.length >= 2) return withoutEthnic;
    if (withoutDistrict.length >= 2) return withoutDistrict;
    return name;
  }

  for (const suffix of ["市", "县", "旗", "盟", "镇", "乡"]) {
    if (!name.endsWith(suffix)) continue;
    const body = stripOnce(name, suffix);
    return body ?? name;
  }

  return name;
}

export function isRecognizedAdminName(raw) {
  const name = String(raw ?? "").trim();
  return RECOGNIZED_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function anomalyResult(fields, anomalyCode, rawDistrict) {
  const reason = {
    "city-missing": "无有效市",
    "district-missing": "无有效区",
    "district-equals-city": "区字段与市重复",
    "district-equals-province": "区字段与省重复",
    "district-unrecognized": "区字段不是可识别的行政区",
  }[anomalyCode];
  return {
    ...fields,
    name: SECOND_NETWORK_ANOMALY_NAME,
    status: "anomaly",
    anomalyCode,
    anomalyNote: `${reason}（${rawDistrict || "空"}），未编造区名`,
  };
}

export function buildSecondNetworkName(input = {}) {
  const province = String(input.province ?? "").trim();
  const city = String(input.city ?? "").trim();
  const district = String(input.district ?? "").trim();
  const fields = { province, city, district };

  if (!city || MISSING_DISTRICT.has(city)) {
    return anomalyResult(fields, "city-missing", district);
  }
  if (MISSING_DISTRICT.has(district)) {
    const level = String(input.level ?? "");
    const cityShort = shortenAdminName(city);
    if (/直辖县级/.test(level) && cityShort.length >= 2) {
      return {
        ...fields,
        name: `猛士${cityShort}授权店`,
        status: "standard",
        anomalyCode: null,
        anomalyNote: "",
      };
    }
    return anomalyResult(fields, "district-missing", district);
  }
  if (district === city) {
    return anomalyResult(fields, "district-equals-city", district);
  }
  if (province && district === province) {
    return anomalyResult(fields, "district-equals-province", district);
  }
  if (!isRecognizedAdminName(district)) {
    return anomalyResult(fields, "district-unrecognized", district);
  }

  return {
    ...fields,
    name: `猛士${shortenAdminName(city)}${shortenAdminName(district)}授权店`,
    status: "standard",
    anomalyCode: null,
    anomalyNote: "",
  };
}
