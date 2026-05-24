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

默认匹配文件名：

```text
猛士售后门店清单YYYYMMDD.xlsx
```

脚本会自动选择日期最新的清单文件。例如目录里同时有 `猛士售后门店清单20260524.xlsx` 和 `猛士售后门店清单20260601.xlsx`，会自动读取 `20260601` 这份。

### 日常更新流程

1. 把新的门店清单 Excel 放进本项目的 `data/source/` 目录。
2. 文件名保持 `猛士售后门店清单YYYYMMDD.xlsx` 格式。
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
git add data/source/猛士售后门店清单YYYYMMDD.xlsx assets/stores.json
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

- 一网、二网工作表名称需要保持为 `一网`、`二网`。
- 表头列名和现有模板保持一致即可，新增或删除门店行后不需要改脚本。
- 脚本按城市中心点定位。同城多店会在页面中轻微散开，避免大头钉完全重叠。
- 如果 Excel 里省市区填反或城市无法识别，脚本会在输出里列出 `missing`。先修 Excel，再重新运行脚本。
- 当前脚本内保留了两条历史修正：`MSFWWD099` 成都授权服务中心、`MSFWWD098` 林芝授权服务中心，用来修复原始表里成都/林芝省市区互填的问题。

## GitHub Pages

新建仓库后，将本目录内文件作为仓库根目录提交。Pages 选择 `Deploy from a branch`，分支选 `main`，目录选 `/root` 即可。
