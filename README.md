# 猛士售后服务网络地图

静态 GitHub Pages 页面。页面从 `assets/stores.json` 读取门店清单，用 `assets/china.geojson` 绘制中国地图，并在同一坐标投影上渲染一网、二网大头钉。

## 本地预览

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173/`。

## 更新数据

地图只读 `assets/stores.json`。这份 JSON 由导入源 Excel 生成，三张表必须一起更新：

- `汇总`
- `全国省市`
- `门店明细`

导入可以读取本地私有快照 `data/source/snapshot/stores-for-map.json`，该目录不进入仓库。快照里如果把手机号写进店名，发布前会去掉号码尾注，业务店名和门店编码保留。已发布的 Excel / `assets/stores.json` 不含这批联系方式。快照来自飞书 Base 的两个视图，时间写在快照 `meta.source_time`：

- 一网：开业门店清单 / 有售后视图，不是该表全量
- 二网：二网信息

导入不会登录飞书，也不会改飞书记录。

```bash
npm install
npm test
node scripts/import-snapshot.mjs
node scripts/build-data.mjs
```

`import-snapshot.mjs` 用快照重写 Excel，并生成地图 JSON。`build-data.mjs` 只从 Excel 重建 JSON，用来确认两边一致。重复执行应得到同一份 JSON；快照时间取自源数据，不取运行时钟。

二网展示名按「猛士 + 市 + 区 + 授权店」生成，例如盐城市 / 亭湖区为「猛士盐城亭湖授权店」。省、市、区字段仍保留标准全称。原门店名称写入 `原门店名称` / `originalName`。一网继续使用原名。

区为空、区不是行政区，或区字段与市、省相同（如大连市 / 大连市）时，不编造区名。展示名降为「猛士授权店（行政区待核）」，并在 `data/source/import-report.json` 和地图 JSON 的 `anomalies` 中单列。相同展示名不合并，用 `record_id` 区分。

详细地址只有源里有真实地址才保留。二网快照里的「无」是缺失值，导入后为空，页面不显示。

点位使用 `data/geo/city-centers.json` 里的城市行政中心。同城门店只在页面上散开，避免大头钉重叠；这不是门店精确坐标。城市没有中心点时构建失败，不会猜一个坐标。

`npm test` 检查命名、导入诊断、发布后的计数、唯一记录和 Excel / JSON 一致性。

## GitHub Pages

新建仓库后，将本目录内文件作为仓库根目录提交。Pages 选择 `Deploy from a branch`，分支选 `main`，目录选 `/root` 即可。
