import fs from "node:fs/promises";

const country = await fetch("https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json").then((response) => {
  if (!response.ok) throw new Error(`country ${response.status}`);
  return response.json();
});

const centers = {};
function put(name, center) {
  if (!name || !Array.isArray(center) || center.length < 2) return;
  centers[name] = [Number(center[0]), Number(center[1])];
}

for (const feature of country.features ?? []) {
  const props = feature.properties ?? {};
  put(props.name, props.center ?? props.centroid);
}

for (const feature of country.features ?? []) {
  const adcode = feature.properties?.adcode;
  if (!adcode || adcode === 100000) continue;
  const response = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`);
  if (!response.ok) {
    console.error("skip", adcode, response.status);
    continue;
  }
  const province = await response.json();
  for (const cityFeature of province.features ?? []) {
    const props = cityFeature.properties ?? {};
    put(props.name, props.center ?? props.centroid);
  }
}

const output = {
  source: "https://geo.datav.aliyun.com/areas_v3/bound/",
  level: "city-center",
  note: "地级行政区、直辖市、自治州、地区、盟和省直辖县级市的行政中心。不是门店精确坐标。",
  centers,
};
await fs.mkdir(new URL("../data/geo/", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../data/geo/city-centers.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ cities: Object.keys(centers).length }, null, 2));
