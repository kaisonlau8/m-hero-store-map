const MAP_WIDTH = 1200;
const MAP_HEIGHT = 900;
const MAP_PADDING = 34;

const state = {
  data: null,
  geojson: null,
  project: null,
  stores: [],
  filtered: [],
  selectedId: null,
  transform: { x: 0, y: 0, scale: 1 },
  dragging: false,
  dragStart: null,
};

const els = {
  viewport: document.querySelector("#mapViewport"),
  plane: document.querySelector("#mapPlane"),
  pinLayer: document.querySelector("#pinLayer"),
  tooltip: document.querySelector("#tooltip"),
  svg: document.querySelector("#chinaSvg"),
  search: document.querySelector("#searchInput"),
  first: document.querySelector("#filterFirst"),
  second: document.querySelector("#filterSecond"),
  resultCount: document.querySelector("#resultCount"),
  totalCount: document.querySelector("#totalCount"),
  cityCount: document.querySelector("#cityCount"),
  provinceCount: document.querySelector("#provinceCount"),
  sourceText: document.querySelector("#sourceText"),
  selectedStore: document.querySelector("#selectedStore"),
  storeList: document.querySelector("#storeList"),
  zoomRange: document.querySelector("#zoomRange"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomOut: document.querySelector("#zoomOut"),
  resetView: document.querySelector("#resetView"),
};

function walkCoordinates(value, visitor) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number") {
    visitor(value);
    return;
  }
  for (const child of value) walkCoordinates(child, visitor);
}

const DISPLAY_CENTER_LAT = 35;
const SOUTH_SEA_BASE_LAT = 18;
const SOUTH_SEA_COMPRESSION = 0.35;

function displayPoint(lng, lat) {
  const effectiveLat = lat < SOUTH_SEA_BASE_LAT
    ? SOUTH_SEA_BASE_LAT + (lat - SOUTH_SEA_BASE_LAT) * SOUTH_SEA_COMPRESSION
    : lat;
  return [
    lng * Math.cos(DISPLAY_CENTER_LAT * Math.PI / 180),
    effectiveLat,
  ];
}

function createProjection(geojson) {
  let minProjectedX = Infinity;
  let maxProjectedX = -Infinity;
  let minProjectedY = Infinity;
  let maxProjectedY = -Infinity;

  for (const feature of geojson.features ?? []) {
    walkCoordinates(feature.geometry?.coordinates, ([lng, lat]) => {
      const [x, y] = displayPoint(lng, lat);
      minProjectedX = Math.min(minProjectedX, x);
      maxProjectedX = Math.max(maxProjectedX, x);
      minProjectedY = Math.min(minProjectedY, y);
      maxProjectedY = Math.max(maxProjectedY, y);
    });
  }

  const scale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / (maxProjectedX - minProjectedX),
    (MAP_HEIGHT - MAP_PADDING * 2) / (maxProjectedY - minProjectedY),
  );
  const projectedWidth = (maxProjectedX - minProjectedX) * scale;
  const projectedHeight = (maxProjectedY - minProjectedY) * scale;
  const offsetX = (MAP_WIDTH - projectedWidth) / 2;
  const offsetY = (MAP_HEIGHT - projectedHeight) / 2;

  return ([lng, lat]) => [
    offsetX + (displayPoint(lng, lat)[0] - minProjectedX) * scale,
    offsetY + (maxProjectedY - displayPoint(lng, lat)[1]) * scale,
  ];
}

function ringPath(ring) {
  return ring
    .map((coord, index) => {
      const [x, y] = state.project(coord);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function geometryPath(geometry) {
  if (!geometry) return "";
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => `${ringPath(ring)} Z`).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) => polygon.map((ring) => `${ringPath(ring)} Z`).join(" "))
      .join(" ");
  }
  if (geometry.type === "LineString") {
    return ringPath(geometry.coordinates);
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.map((line) => ringPath(line)).join(" ");
  }
  return "";
}

function featureCenter(feature) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  walkCoordinates(feature.geometry?.coordinates, (coord) => {
    const [x, y] = state.project(coord);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function networkClass(store) {
  return store.network === "一网" ? "first" : "second";
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function storeMarkup(store) {
  const network = networkClass(store);
  const address = store.address || `${store.province}${store.city}${store.district}`;
  const tags = [
    `<span class="badge ${network}">${store.network}</span>`,
    store.region ? `<span class="badge neutral">${htmlEscape(store.region)}</span>` : "",
    store.functionType ? `<span class="badge neutral">${htmlEscape(store.functionType)}</span>` : "",
  ].join("");

  return `
    <h3>${htmlEscape(store.name)}</h3>
    <div class="meta">${tags}</div>
    <div class="info-line">${htmlEscape(store.province)} ${htmlEscape(store.city)} ${htmlEscape(store.district)}</div>
    <div class="info-line">${htmlEscape(address)}</div>
    <div class="info-line">${htmlEscape(store.code)}${store.rating ? ` · ${htmlEscape(store.rating)}` : ""}${store.status ? ` · ${htmlEscape(store.status)}` : ""}</div>
  `;
}

function setTransform(next = state.transform) {
  state.transform = next;
  els.plane.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
  els.zoomRange.value = String(next.scale);
}

function fitMap() {
  const rect = els.viewport.getBoundingClientRect();
  const scale = Math.min(rect.width / MAP_WIDTH, rect.height / MAP_HEIGHT) * 0.98;
  const x = (rect.width - MAP_WIDTH * scale) / 2;
  const y = (rect.height - MAP_HEIGHT * scale) / 2;
  setTransform({ x, y, scale });
}

function zoomTo(scale, anchorX = els.viewport.clientWidth / 2, anchorY = els.viewport.clientHeight / 2) {
  const current = state.transform;
  const nextScale = Math.min(2.3, Math.max(0.42, scale));
  const mapX = (anchorX - current.x) / current.scale;
  const mapY = (anchorY - current.y) / current.scale;
  setTransform({
    scale: nextScale,
    x: anchorX - mapX * nextScale,
    y: anchorY - mapY * nextScale,
  });
}

function matchesStore(store, query) {
  if (!query) return true;
  const haystack = [
    store.name,
    store.code,
    store.region,
    store.province,
    store.city,
    store.district,
    store.address,
    store.storeType,
    store.functionType,
    store.rating,
    store.status,
  ].join(" ");
  return haystack.toLowerCase().includes(query.toLowerCase());
}

function applyFilters() {
  const query = els.search.value.trim();
  state.filtered = state.stores.filter((store) => {
    if (store.network === "一网" && !els.first.checked) return false;
    if (store.network === "二网" && !els.second.checked) return false;
    return matchesStore(store, query);
  });
  renderPins();
  renderList();
  els.resultCount.textContent = `${state.filtered.length} 个点位`;
}

function renderStats() {
  const stores = state.stores;
  els.totalCount.textContent = stores.length;
  els.cityCount.textContent = new Set(stores.map((store) => store.city)).size;
  els.provinceCount.textContent = new Set(stores.map((store) => store.province)).size;
  els.sourceText.textContent = `${state.data.source} · ${state.data.counts.firstNetwork} 个一网 · ${state.data.counts.secondNetwork} 个二网`;
}

function renderGeoMap() {
  state.project = createProjection(state.geojson);
  els.svg.setAttribute("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
  els.svg.replaceChildren();

  const pathFragment = document.createDocumentFragment();
  const labelFragment = document.createDocumentFragment();

  for (const feature of state.geojson.features ?? []) {
    const name = feature.properties?.name ?? "";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", geometryPath(feature.geometry));
    path.setAttribute("class", name === "境界线" ? "boundary-line" : "province");
    path.setAttribute("data-name", name);
    pathFragment.append(path);

    if (name && name !== "境界线" && feature.geometry?.type.includes("Polygon")) {
      const [x, y] = featureCenter(feature);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("class", "province-label");
      text.setAttribute("x", x.toFixed(1));
      text.setAttribute("y", y.toFixed(1));
      text.textContent = name.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, "");
      labelFragment.append(text);
    }
  }

  els.svg.append(pathFragment, labelFragment);

  for (const store of state.stores) {
    const [x, y] = state.project([store.lng, store.lat]);
    store.x = Math.round(x * 10) / 10;
    store.y = Math.round(y * 10) / 10;
  }

  offsetDuplicatePins(state.stores);
}

function offsetDuplicatePins(stores) {
  const byCity = new Map();
  for (const store of stores) {
    const key = `${store.city}|${store.lng}|${store.lat}`;
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(store);
  }
  for (const group of byCity.values()) {
    if (group.length === 1) continue;
    const radius = Math.min(15, 6 + group.length * 0.38);
    group.forEach((store, index) => {
      const angle = (index / group.length) * Math.PI * 2;
      store.x = Math.round((store.x + Math.cos(angle) * radius) * 10) / 10;
      store.y = Math.round((store.y + Math.sin(angle) * radius) * 10) / 10;
    });
  }
}

function renderPins() {
  const visible = new Set(state.filtered.map((store) => store.id));
  for (const button of els.pinLayer.querySelectorAll(".pin")) {
    const show = visible.has(button.dataset.id);
    button.hidden = !show;
    button.classList.toggle("active", button.dataset.id === state.selectedId);
  }
}

function createPins() {
  const fragment = document.createDocumentFragment();
  for (const store of state.stores) {
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = `pin ${networkClass(store)}`;
    pin.dataset.id = store.id;
    pin.style.left = `${store.x}px`;
    pin.style.top = `${store.y}px`;
    pin.setAttribute("aria-label", `${store.network} ${store.name}`);
    pin.addEventListener("mouseenter", (event) => showStore(store, event, false));
    pin.addEventListener("mousemove", moveTooltip);
    pin.addEventListener("mouseleave", hideTooltip);
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      showStore(store, event, true);
    });
    fragment.append(pin);
  }
  els.pinLayer.replaceChildren(fragment);
}

function renderList() {
  const fragment = document.createDocumentFragment();
  for (const store of state.filtered) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "store-card";
    card.classList.toggle("active", store.id === state.selectedId);
    card.dataset.id = store.id;
    card.innerHTML = storeMarkup(store);
    card.addEventListener("mouseenter", (event) => showStore(store, event, false));
    card.addEventListener("mousemove", moveTooltip);
    card.addEventListener("mouseleave", hideTooltip);
    card.addEventListener("click", (event) => showStore(store, event, true));
    fragment.append(card);
  }
  els.storeList.replaceChildren(fragment);
}

function showStore(store, event, lockSelection) {
  if (lockSelection) {
    state.selectedId = store.id;
    renderPins();
    renderList();
  }
  els.selectedStore.innerHTML = storeMarkup(store);
  els.tooltip.innerHTML = storeMarkup(store);
  els.tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  if (els.tooltip.hidden) return;
  const pad = 16;
  const tooltipRect = els.tooltip.getBoundingClientRect();
  let x = event.clientX + 16;
  let y = event.clientY + 16;
  if (x + tooltipRect.width + pad > window.innerWidth) x = event.clientX - tooltipRect.width - 16;
  if (y + tooltipRect.height + pad > window.innerHeight) y = event.clientY - tooltipRect.height - 16;
  els.tooltip.style.left = `${Math.max(pad, x)}px`;
  els.tooltip.style.top = `${Math.max(pad, y)}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

function bindMapInteractions() {
  els.viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = els.viewport.getBoundingClientRect();
    const scale = state.transform.scale * (event.deltaY > 0 ? 0.9 : 1.1);
    zoomTo(scale, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  els.viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".pin")) return;
    state.dragging = true;
    state.dragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: state.transform.x,
      startY: state.transform.y,
    };
    els.viewport.setPointerCapture(event.pointerId);
    els.viewport.classList.add("dragging");
  });

  els.viewport.addEventListener("pointermove", (event) => {
    if (!state.dragging || !state.dragStart) return;
    const dx = event.clientX - state.dragStart.x;
    const dy = event.clientY - state.dragStart.y;
    setTransform({
      ...state.transform,
      x: state.dragStart.startX + dx,
      y: state.dragStart.startY + dy,
    });
  });

  els.viewport.addEventListener("pointerup", () => {
    state.dragging = false;
    state.dragStart = null;
    els.viewport.classList.remove("dragging");
  });

  els.viewport.addEventListener("pointercancel", () => {
    state.dragging = false;
    state.dragStart = null;
    els.viewport.classList.remove("dragging");
  });
}

function bindControls() {
  els.search.addEventListener("input", applyFilters);
  els.first.addEventListener("change", applyFilters);
  els.second.addEventListener("change", applyFilters);
  els.zoomRange.addEventListener("input", () => zoomTo(Number(els.zoomRange.value)));
  els.zoomIn.addEventListener("click", () => zoomTo(state.transform.scale * 1.14));
  els.zoomOut.addEventListener("click", () => zoomTo(state.transform.scale / 1.14));
  els.resetView.addEventListener("click", fitMap);
  window.addEventListener("resize", fitMap);
}

async function boot() {
  const [storeResponse, geoResponse] = await Promise.all([
    fetch("./assets/stores.json"),
    fetch("./assets/china.geojson"),
  ]);
  state.data = await storeResponse.json();
  state.geojson = await geoResponse.json();
  state.stores = state.data.stores;
  state.filtered = state.stores;
  renderStats();
  renderGeoMap();
  createPins();
  applyFilters();
  fitMap();
  bindMapInteractions();
  bindControls();
}

boot().catch((error) => {
  els.sourceText.textContent = "门店数据加载失败";
  els.selectedStore.innerHTML = `<span class="empty-text">${htmlEscape(error.message)}</span>`;
  console.error(error);
});
