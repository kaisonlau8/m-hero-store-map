import assert from "node:assert/strict";
import fs from "node:fs/promises";
import zlib from "node:zlib";
import test from "node:test";

test("显示用中国底图保持抽稀体积，并仍包含主要省级区域", async () => {
  const raw = await fs.readFile(new URL("../assets/china.geojson", import.meta.url));
  const gzipSize = zlib.gzipSync(raw).length;
  assert.ok(gzipSize < 200_000, `gzip ${gzipSize} is larger than the simplified budget`);
  const geojson = JSON.parse(raw.toString("utf8"));
  const names = new Set(geojson.features.map((feature) => feature.properties?.name));
  for (const name of ["北京市", "上海市", "广东省", "海南省", "台湾省", "新疆维吾尔自治区", "西藏自治区", "内蒙古自治区"]) {
    assert.equal(names.has(name), true, name);
  }
  assert.equal(names.has("境界线"), true);
});
