# 猛士售后服务网络地图

静态 GitHub Pages 页面。页面从 `assets/stores.json` 读取门店清单，用 `assets/china.geojson` 绘制中国地图，并在同一坐标投影上渲染一网、二网大头钉。

## 本地预览

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173/`。

## 更新数据

后续门店有增删改时，只需要更新 Excel，再重新生成 `assets/stores.json` 并推送到 GitHub。

默认读取项目内目录：

```text
data/source/
```

默认读取：

```text
data/source/售后网点省市覆盖.xlsx
```

脚本使用其中的 `门店明细` 工作表。省市区以校正后的「省份 / 城市 / 区县」为准。

如果这份文件不存在，才会回退到日期最新的 `猛士售后门店清单YYYYMMDD.xlsx`。

### 日常更新流程

1. 用新的售后网点清单覆盖 `data/source/售后网点省市覆盖.xlsx`。
2. 确认工作表名仍是 `门店明细`，且包含「网络、门店编码、门店名称、省份、城市」列。
3. 回到本项目目录：

```bash
cd /Users/i/myCode/service-network-map
```

4. 生成最新地图数据：

```bash
/Users/i/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-data.mjs
```

5. 本地预览确认：

```bash
python3 -m http.server 4173
```

打开 `http://localhost:4173/`，确认点位、搜索、筛选正常。

6. 提交并推送：

```bash
git add assets/stores.json
git commit -m "Update store map data"
git push
```

GitHub Pages 会自动更新线上页面。

建议把新的 Excel 原文件也一起提交，便于追溯数据来源：

```bash
git add data/source/售后网点省市覆盖.xlsx assets/stores.json
git commit -m "Update store map data"
git push
```

### 指定某个 Excel 文件

如果不想自动读取最新文件，也可以显式指定：

```bash
/Users/i/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-data.mjs "/完整路径/猛士售后门店清单20260601.xlsx"
```

也可以用环境变量：

```bash
STORE_MAP_XLSX="/完整路径/猛士售后门店清单20260601.xlsx" /Users/i/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-data.mjs
```

### 数据注意事项

- `门店明细` 的表头需要保留「网络、门店编码、门店名称、门店全称、省份、城市、区县」。新增或删除门店行后不需要改脚本。
- 脚本按城市中心点定位。同城多店会在页面中轻微散开，避免大头钉完全重叠。
- 如果城市无法识别，脚本会在输出里列出 `missing`。先修 Excel 的城市名称，再重新运行脚本。
- 旧版 `一网` / `二网` 清单仍可作为显式路径传入。那条路径里仍保留 `MSFWWD099`、`MSFWWD098` 两条历史省市区修正。

## GitHub Pages

新建仓库后，将本目录内文件作为仓库根目录提交。Pages 选择 `Deploy from a branch`，分支选 `main`，目录选 `/root` 即可。
