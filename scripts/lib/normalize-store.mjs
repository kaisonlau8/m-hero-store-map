import { buildSecondNetworkName } from "./place-name.mjs";

const MISSING_ADDRESS = new Set(["", "无", "无详细地址", "-", "—", "/", "／", "暂无", "null", "NULL", "N/A", "n/a"]);
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOBILE_PATTERN = /(?:\+?86[-\s]?)?1[3-9]\d{9}/g;
const LANDLINE_PATTERN = /(?<!\d)0\d{2,3}[-\s]?\d{7,8}(?!\d)/g;

export function redactContacts(value) {
  let text = String(value ?? "");
  text = text.replace(EMAIL_PATTERN, "");
  text = text.replace(MOBILE_PATTERN, "");
  text = text.replace(LANDLINE_PATTERN, "");
  text = text.replace(/[（(]\s*[）)]/g, "");
  let extraClosers = (text.match(/[）)]/g) || []).length - (text.match(/[（(]/g) || []).length;
  if (extraClosers > 0) {
    const chars = [...text];
    for (let index = chars.length - 1; index >= 0 && extraClosers > 0; index -= 1) {
      if (chars[index] === "）" || chars[index] === ")") {
        chars.splice(index, 1);
        extraClosers -= 1;
      }
    }
    text = chars.join("");
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

export function normalizeAddress(value) {
  const text = String(value ?? "").trim();
  return MISSING_ADDRESS.has(text) ? "" : text;
}

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeSnapshot(snapshot) {
  const records = snapshot?.records ?? [];
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const seenCodes = new Set();
  const stores = [];

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const recordId = text(record.record_id);
    const code = text(record.门店编码);
    const network = text(record.类别);
    const originalName = redactContacts(text(record.名称));
    const province = text(record.省);
    const city = text(record.市);
    const district = text(record.区);

    if (!recordId) errors.push(`第 ${rowNumber} 行缺少 record_id`);
    else if (seenIds.has(recordId)) errors.push(`record_id ${recordId} 重复，两条都保留，拒绝发布`);
    if (recordId) seenIds.add(recordId);

    if (!code) errors.push(`第 ${rowNumber} 行 ${recordId || "(无 record_id)"} 缺少门店编码`);
    else if (seenCodes.has(code)) warnings.push(`门店编码 ${code} 重复，两条都保留，不按名称合并`);
    if (code) seenCodes.add(code);

    if (network !== "一网" && network !== "二网") {
      errors.push(`第 ${rowNumber} 行网络类别无法识别：${network || "空"}`);
    }

    let name = originalName;
    let nameStatus = "沿用原名";
    let anomalyCode = "";
    let anomalyNote = "";
    if (network === "二网") {
      const display = buildSecondNetworkName({ province, city, district, code });
      name = display.name;
      nameStatus = display.status === "anomaly" ? "行政区待核" : "标准";
      anomalyCode = display.anomalyCode ?? "";
      anomalyNote = display.anomalyNote;
    }

    stores.push({
      recordId,
      network,
      code,
      name,
      originalName,
      fullName: redactContacts(text(record.全称)),
      province,
      city,
      district,
      region: text(record.售后区),
      address: normalizeAddress(redactContacts(record.详细地址)),
      storeType: text(record.门店类型),
      sourceView: text(record.source_view),
      nameStatus,
      anomalyCode,
      anomalyNote,
    });
  });

  return { stores, errors, warnings };
}
