# 猛士售后服务网络地图

静态 GitHub Pages 页面。页面从 `assets/stores.json` 读取门店清单，用 `assets/china.geojson` 绘制中国地图，并在同一坐标投影上渲染一网、二网大头钉。

## 本地预览

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173/`。

## 更新数据

如需重新从 Excel 生成数据：

```bash
/Users/i/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-data.mjs
```

生成结果会写入 `assets/stores.json`。

## GitHub Pages

新建仓库后，将本目录内文件作为仓库根目录提交。Pages 选择 `Deploy from a branch`，分支选 `main`，目录选 `/root` 即可。
