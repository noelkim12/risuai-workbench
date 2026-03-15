function renderHtml(ctx) {
  const {
    path,
    filePath,
    total,
    collected,
    stateOwnership,
    apiByCategory,
    moduleGroups,
    lorebookCorrelation,
    regexCorrelation,
    MAX_MODULES_IN_REPORT,
    computeExtractionOrder,
    computeCrossModuleDeps,
    generateModuleConversionNotes,
    moduleFns,
    extractRootSourceChunks,
  } = ctx;

  const h = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const moduleFilePath = (g) => `${g.dir}/${g.name}.ts`;
  const badgeOf = (dir) => {
    if (dir === "tstl/utils") return "utils";
    if (dir === "tstl/handlers") return "handlers";
    if (dir === "tstl/data") return "data";
    return "modules";
  };

  const filename = path.basename(filePath);
  const extractionOrder = computeExtractionOrder();
  const modByName = new Map(moduleGroups.map((g) => [g.name, g]));
  const topFunctions = [...collected.functions].sort((a, b) => b.lineCount - a.lineCount).slice(0, 12);
  const apiRows = [...apiByCategory.entries()].sort((a, b) => b[1].count - a[1].count);
  const deps = [...computeCrossModuleDeps().entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sortedModules = [...moduleGroups].sort((a, b) => `${a.dir}/${a.name}`.localeCompare(`${b.dir}/${b.name}`));
  const shownModules = sortedModules.slice(0, MAX_MODULES_IN_REPORT);

  const crossStateCount = stateOwnership.filter((item) => item.crossModule).length;
  const heavyFunctionCount = collected.functions.filter((fn) => fn.lineCount >= 200).length;
  const moduleTypeCounts = { handlers: 0, utils: 0, data: 0, modules: 0 };
  for (const g of sortedModules) {
    moduleTypeCounts[badgeOf(g.dir)] += 1;
  }

  const reportData = {
    fileName: filename,
    apiCategories: apiRows.map(([cat, info]) => ({ label: cat, value: info.count })),
    moduleTypes: moduleTypeCounts,
    topFunctions: topFunctions.map((fn) => ({ label: fn.displayName, value: fn.lineCount })),
    stateSpread: {
      cross: crossStateCount,
      local: Math.max(0, stateOwnership.length - crossStateCount),
    },
  };
  const reportDataJson = JSON.stringify(reportData).replace(/</g, "\\u003c");

  const apiTableRows = apiRows.length
    ? apiRows.map(([cat, info]) => {
      const names = [...info.apis].sort().slice(0, 3).map((name) => `<code>${h(name)}</code>`).join(", ");
      const more = info.apis.size > 3 ? ` +${info.apis.size - 3}` : "";
      return `<tr><td>${h(cat)}</td><td>${info.count}</td><td>${names}${more}</td></tr>`;
    }).join("")
    : "<tr><td colspan=\"3\" class=\"muted\">API 사용 데이터가 없습니다.</td></tr>";

  const topFunctionRows = topFunctions.length
    ? topFunctions.map((fn) => `<tr><td><code>${h(fn.displayName)}</code></td><td>${fn.lineCount}</td><td>L${fn.startLine}-L${fn.endLine}</td></tr>`).join("")
    : "<tr><td colspan=\"3\" class=\"muted\">함수 데이터가 없습니다.</td></tr>";

  const extractionRows = extractionOrder.length
    ? extractionOrder.map((name, idx) => {
      const g = modByName.get(name);
      if (!g) return "";
      return `<tr><td>${idx + 1}</td><td><code>${h(moduleFilePath(g))}</code></td><td>${h(g.reason)}</td><td>${g.functions.size}</td></tr>`;
    }).join("")
    : "<tr><td colspan=\"4\" class=\"muted\">추출 순서 데이터가 없습니다.</td></tr>";

  const stateRowsShown = stateOwnership.slice(0, 24);
  const stateRows = stateRowsShown.length
    ? stateRowsShown.map((s) => `<tr><td><code>${h(s.key)}</code></td><td>${h(s.ownerModule)}</td><td>${s.readBy.length}</td><td>${s.writers.length}</td><td>${s.crossModule ? "yes" : "no"}</td></tr>`).join("")
    : "<tr><td colspan=\"5\" class=\"muted\">상태 변수 데이터가 없습니다.</td></tr>";
  const stateMoreCount = Math.max(0, stateOwnership.length - stateRowsShown.length);

  const depRowsShown = deps.slice(0, 40);
  const depRows = depRowsShown.length
    ? depRowsShown.map(([key, via]) => {
      const [from, to] = key.split("\0");
      const bridge = [...via].slice(0, 4).map((name) => h(name)).join(", ");
      const more = via.size > 4 ? ` +${via.size - 4}` : "";
      return `<tr><td>${h(from)}</td><td>${h(to)}</td><td><code>${bridge}${more}</code></td></tr>`;
    }).join("")
    : "<tr><td colspan=\"3\" class=\"muted\">모듈 간 의존성이 없습니다.</td></tr>";
  const depMoreCount = Math.max(0, deps.length - depRowsShown.length);

  const handlerRows = collected.handlers.length
    ? collected.handlers.map((x) => `<tr><td><code>${h(x.functionName || x.type)}</code></td><td>${h(x.type === "listenEdit" ? `${x.type}(${x.detail})` : x.type)}</td><td>L${x.line}</td><td>${x.isAsync ? "yes" : "no"}</td></tr>`).join("")
    : "<tr><td colspan=\"4\" class=\"muted\">이벤트 핸들러가 없습니다.</td></tr>";

  const moduleBlocks = shownModules.map((g) => {
    const fnList = moduleFns(g);
    const notes = generateModuleConversionNotes(g);
    const preview = extractRootSourceChunks(g)[0];

    const functionItems = fnList.slice(0, 6)
      .map((fn) => `<li><code>${h(fn.displayName)}</code> <span class=\"muted\">L${fn.startLine}-L${fn.endLine}</span></li>`)
      .join("");
    const functionMore = fnList.length > 6 ? `<li class=\"muted\">+ ${fnList.length - 6}개 함수 더 있음</li>` : "";

    const noteItems = notes.slice(0, 3)
      .map((note) => `<li>${h(note)}</li>`)
      .join("");
    const notesMore = notes.length > 3 ? `<li class=\"muted\">+ ${notes.length - 3}개 메모 더 있음</li>` : "";

    const previewHtml = preview
      ? `<details class=\"nested\"><summary>Lua 미리보기 (${h(preview.name)})</summary><pre><code>${h(preview.source.split("\n").slice(0, 24).join("\n"))}</code></pre></details>`
      : "";

    return `<details class="module-detail">
      <summary><code>${h(moduleFilePath(g))}</code> <span class=\"pill\">${h(badgeOf(g.dir))}</span></summary>
      <div class=\"module-content\">
        <p class=\"muted\">분류 근거: <strong>${h(g.reason)}</strong> · 함수 ${fnList.length}개 · 테이블 ${g.tables.size}개</p>
        <div class=\"module-grid\">
          <div>
            <h4>함수 목록</h4>
            <ul>${functionItems}${functionMore}</ul>
          </div>
          <div>
            <h4>변환 메모</h4>
            <ul>${noteItems || "<li class=\"muted\">추가 메모 없음</li>"}${notesMore}</ul>
          </div>
        </div>
        ${previewHtml}
      </div>
    </details>`;
  }).join("");

  const moduleOmitted = sortedModules.length > shownModules.length
    ? `<p class=\"muted\">표시 제한으로 ${sortedModules.length - shownModules.length}개 모듈을 생략했습니다.</p>`
    : "";

  const correlationChips = [
    lorebookCorrelation
      ? `<span class=\"pill\">로어북 엔트리 ${lorebookCorrelation.totalEntries}개, 브리지 변수 ${lorebookCorrelation.bridgedVars.length}개</span>`
      : "",
    regexCorrelation
      ? `<span class=\"pill\">정규식 스크립트 ${regexCorrelation.totalScripts}개, 브리지 변수 ${regexCorrelation.bridgedVars.length}개</span>`
      : "",
  ].filter(Boolean).join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${h(filename)} - 분석 시트</title>
  <style>
    :root {
      --bg: #f5f2eb;
      --surface: #ffffff;
      --surface-soft: #fbf9f5;
      --ink: #1a2223;
      --muted: #5f6c6d;
      --line: #dbd5ca;
      --accent: #0f6f65;
      --accent-soft: #e7f4f1;
      --shadow: 0 10px 24px rgba(30, 40, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font: 14px/1.5 "IBM Plex Sans", "Noto Sans KR", "Segoe UI", sans-serif;
      background:
        radial-gradient(920px 380px at 100% 0%, rgba(15, 111, 101, 0.14), transparent 62%),
        radial-gradient(680px 300px at 0% 8%, rgba(190, 130, 60, 0.12), transparent 58%),
        var(--bg);
    }
    main { max-width: 1160px; margin: 0 auto; padding: 18px 16px 32px; }
    h1, h2, h3, h4 { margin: 0; }
    h1 { font-size: clamp(1.5rem, 2.2vw, 2.1rem); font-family: "Iowan Old Style", "Palatino Linotype", serif; }
    h2 { font-size: 1rem; letter-spacing: 0.02em; }
    h4 { font-size: 0.84rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.88em; }
    .muted { color: var(--muted); }
    .hero, .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
    .hero { padding: 16px; }
    .hero-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .hero-title { min-width: 0; }
    .hero-toolbar { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 310px; }
    .view-control { display: flex; justify-content: flex-end; width: 100%; }
    .sub { margin: 6px 0 0; color: var(--muted); }
    .meta, .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; }
    .toolbar-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
    .chip, .pill, button.ghost {
      border: 1px solid #b9d1cb;
      background: var(--accent-soft);
      color: #194840;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
    }
    button.ghost { cursor: pointer; border-color: var(--accent); background: #ffffff; color: var(--accent); font-weight: 600; }
    button.ghost.alt { border-color: #bfc8c9; color: #3f5153; }
    button.ghost:disabled { opacity: 0.55; cursor: not-allowed; }
    button.ghost:hover { filter: brightness(0.97); }
    .kpis { margin-top: 12px; display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
    .kpi { background: var(--surface-soft); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
    .kpi .label { color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
    .kpi .value { margin-top: 2px; font-size: 20px; font-weight: 700; }

    section { margin-top: 12px; }
    .card { overflow: hidden; }
    .card .hd { padding: 10px 12px; border-bottom: 1px solid var(--line); background: #f4f7f6; }
    .card .bd { padding: 10px 12px; }
    .grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    .grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .chart-wrap { min-height: 230px; min-width: 0; background: var(--surface-soft); border: 1px solid var(--line); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; overflow: hidden; }
    .chart-wide { grid-column: 1 / -1; min-height: 330px; }
    .chart-title { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .chart-canvas { position: relative; flex: 1 1 auto; min-height: 176px; width: 100%; overflow: hidden; }
    .chart-canvas canvas { width: 100% !important; height: 100% !important; max-width: 100%; max-height: 100%; display: block; pointer-events: auto; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 7px 6px; text-align: left; vertical-align: top; border-bottom: 1px solid #ece7de; }
    th { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #485758; background: #f6f8f7; position: sticky; top: 0; }
    tbody tr:nth-child(2n) { background: #faf8f4; }

    #report-root.export-capture-mode th {
      position: static;
    }
    #report-root.export-capture-mode *,
    #report-root.export-capture-mode *::before,
    #report-root.export-capture-mode *::after {
      animation: none !important;
      transition: none !important;
    }

    details { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
    details + details { margin-top: 8px; }
    summary { cursor: pointer; list-style: none; padding: 10px 12px; font-weight: 600; }
    summary::-webkit-details-marker { display: none; }
    details[open] summary { border-bottom: 1px solid var(--line); background: #f5f9f8; }
    .nested { margin-top: 8px; }
    .nested summary { font-weight: 500; font-size: 12px; }
    .module-content { padding: 10px 12px; }
    .module-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    ul { margin: 6px 0 0; padding-left: 18px; }
    li { margin: 3px 0; }
    pre { margin: 8px 0 0; border-radius: 8px; background: #1b2527; color: #e6ecec; padding: 10px; overflow: auto; font-size: 12px; }

    #report-root.mode-expanded .card .bd { padding: 14px 14px; }
    #report-root.mode-expanded th, #report-root.mode-expanded td { padding: 9px 8px; }
    #report-root.mode-expanded .chart-wrap { min-height: 280px; }
    #report-root.mode-expanded .chart-wide { min-height: 360px; }

    @media (max-width: 960px) {
      .hero-head { flex-direction: column; }
      .hero-toolbar { width: 100%; align-items: flex-start; min-width: 0; }
      .view-control, .actions { justify-content: flex-start; }
      .grid-2, .grid-4, .module-grid { grid-template-columns: 1fr; }
      .chart-wide { grid-column: auto; }
      .chart-wrap { min-height: 252px; }
    }
    @media print {
      body { background: #fff; }
      .hero, .card, details { box-shadow: none; }
      .hero-toolbar { display: none; }
    }
  </style>
  <script defer src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
</head>
<body>
<main id="report-root">
  <header class="hero">
    <div class="hero-head">
      <div class="hero-title">
        <h1>${h(filename)} <span class="pill">개발자 분석 시트</span></h1>
        <p class="sub">Risuai Character card - Lua script 분석 리포트입니다.</p>
      </div>

      <div class="hero-toolbar">
        <div class="view-control">
          <button id="toggle-density" class="ghost alt">확장 보기로 전환</button>
        </div>
        <div class="actions">
          <span class="toolbar-label">내보내기</span>
          <button id="export-report-png" class="ghost">리포트 PNG</button>
          <button id="export-charts-png" class="ghost">차트 PNG</button>
          <button id="download-report-data" class="ghost">데이터 JSON</button>
          <span id="export-status" class="muted"></span>
        </div>
      </div>
    </div>

    <div class="meta">
      <span class="chip">라인 수 ${total}</span>
      <span class="chip">함수 ${collected.functions.length}</span>
      <span class="chip">핸들러 ${collected.handlers.length}</span>
      <span class="chip">모듈 제안 ${moduleGroups.length}</span>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="label">API 호출</div><div class="value">${collected.apiCalls.length}</div></div>
      <div class="kpi"><div class="label">상태 변수</div><div class="value">${stateOwnership.length}</div></div>
      <div class="kpi"><div class="label">교차 모듈 상태</div><div class="value">${crossStateCount}</div></div>
      <div class="kpi"><div class="label">대형 함수 (200+)</div><div class="value">${heavyFunctionCount}</div></div>
    </div>
  </header>

  <section id="charts-zone" class="card">
    <div class="hd"><h2>시각 분석</h2></div>
    <div class="bd grid-4">
      <article class="chart-wrap chart-wide"><div class="chart-title">상위 함수 크기</div><div class="chart-canvas"><canvas id="chart-top-fns"></canvas></div></article>
      <article class="chart-wrap"><div class="chart-title">API 카테고리 분포</div><div class="chart-canvas"><canvas id="chart-api"></canvas></div></article>
      <article class="chart-wrap"><div class="chart-title">모듈 디렉토리 구성</div><div class="chart-canvas"><canvas id="chart-module-types"></canvas></div></article>
      <article class="chart-wrap"><div class="chart-title">상태 분포 (교차/로컬)</div><div class="chart-canvas"><canvas id="chart-state-spread"></canvas></div></article>
    </div>
  </section>

  <section class="grid-2">
    <article class="card">
      <div class="hd"><h2>API 사용 현황</h2></div>
      <div class="bd"><table><thead><tr><th>카테고리</th><th>호출 수</th><th>대표 API</th></tr></thead><tbody>${apiTableRows}</tbody></table></div>
    </article>
    <article class="card">
      <div class="hd"><h2>상위 함수</h2></div>
      <div class="bd"><table><thead><tr><th>함수</th><th>라인 수</th><th>범위</th></tr></thead><tbody>${topFunctionRows}</tbody></table></div>
    </article>
  </section>

  <section class="card">
    <div class="hd"><h2>추출 순서</h2></div>
    <div class="bd"><table><thead><tr><th>#</th><th>모듈</th><th>분류 근거</th><th>함수 수</th></tr></thead><tbody>${extractionRows}</tbody></table></div>
  </section>

  <section class="grid-2">
    <article class="card">
      <div class="hd"><h2>상태 변수 소유 (상위 24)</h2></div>
      <div class="bd">
        <table><thead><tr><th>키</th><th>소유 모듈</th><th>읽기</th><th>쓰기</th><th>교차</th></tr></thead><tbody>${stateRows}</tbody></table>
        ${stateMoreCount > 0 ? `<p class=\"muted\">가독성을 위해 ${stateMoreCount}개 키를 더 생략했습니다.</p>` : ""}
      </div>
    </article>

    <article class="card">
      <div class="hd"><h2>이벤트 핸들러</h2></div>
      <div class="bd"><table><thead><tr><th>이름</th><th>유형</th><th>라인</th><th>비동기</th></tr></thead><tbody>${handlerRows}</tbody></table></div>
    </article>
  </section>

  <section class="card">
    <div class="hd"><h2>모듈 상세</h2></div>
    <div class="bd">
      ${moduleBlocks || "<p class=\"muted\">생성된 모듈 상세가 없습니다.</p>"}
      ${moduleOmitted}
    </div>
  </section>

  <section class="grid-2">
    <article class="card">
      <div class="hd"><h2>모듈 간 의존성 (상위 40)</h2></div>
      <div class="bd">
        <table><thead><tr><th>출발 모듈</th><th>대상 모듈</th><th>경유 함수</th></tr></thead><tbody>${depRows}</tbody></table>
        ${depMoreCount > 0 ? `<p class=\"muted\">가독성을 위해 의존성 ${depMoreCount}개를 더 생략했습니다.</p>` : ""}
      </div>
    </article>

    <article class="card">
      <div class="hd"><h2>상관관계 요약</h2></div>
      <div class="bd">
        <div class="pill-row">${correlationChips || "<span class=\"muted\">상관관계 데이터가 없습니다.</span>"}</div>
      </div>
    </article>
  </section>

  <script>
    const reportData = ${reportDataJson};
    const statusEl = document.getElementById("export-status");
    const MAX_EXPORT_CANVAS_EDGE = 16384;
    const MAX_TILE_CANVAS_HEIGHT = 4096;
    const BASE_EXPORT_SCALE = 2;

    const waitNextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function triggerDownload(url, fileName) {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function shortLabel(text, maxLen = 18) {
      const s = String(text || "");
      return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + "...";
    }

    function chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { labels: { boxWidth: 11, color: "#2a3c3d" } },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(22, 31, 32, 0.94)",
            borderColor: "#4c6761",
            borderWidth: 1,
            titleColor: "#edf3f2",
            bodyColor: "#d6e2df",
            displayColors: true,
            padding: 10,
          },
        },
      };
    }

    function barOptions(horizontal) {
      const base = chartOptions();
      return {
        ...base,
        indexAxis: horizontal ? "y" : "x",
        plugins: { ...base.plugins, legend: { display: false } },
        scales: horizontal
          ? { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { color: "#2a3c3d" } } }
          : { y: { beginAtZero: true, ticks: { precision: 0 } } },
      };
    }

    function createCharts() {
      if (typeof Chart === "undefined") {
        setStatus("차트 CDN 로드에 실패했습니다.");
        return;
      }

      Chart.defaults.animation = false;
      Chart.defaults.devicePixelRatio = 2;

      new Chart(document.getElementById("chart-api"), {
        type: "bar",
        data: {
          labels: reportData.apiCategories.map((d) => shortLabel(d.label, 16)),
          datasets: [{
            label: "호출 수",
            data: reportData.apiCategories.map((d) => d.value),
            backgroundColor: ["#0f6f65", "#4b7f79", "#6a8c50", "#c68d3b", "#9f5f44", "#547694"],
            borderRadius: 6,
            maxBarThickness: 22,
          }],
        },
        options: barOptions(false),
      });

      const fnLabels = reportData.topFunctions.map((d) => shortLabel(d.label, 20));
      const topFnOptions = barOptions(false);
      topFnOptions.scales = {
        x: { ticks: { autoSkip: false, maxRotation: 55, minRotation: 40, color: "#2a3c3d" } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      };
      new Chart(document.getElementById("chart-top-fns"), {
        type: "bar",
        data: {
          labels: fnLabels,
          datasets: [{ label: "라인 수", data: reportData.topFunctions.map((d) => d.value), backgroundColor: "#2d746c", borderRadius: 5, maxBarThickness: 28 }],
        },
        options: topFnOptions,
      });

      const moduleEntries = Object.entries(reportData.moduleTypes).filter((item) => item[1] > 0);

      new Chart(document.getElementById("chart-module-types"), {
        type: "bar",
        data: {
          labels: moduleEntries.map((item) => shortLabel(item[0], 14)),
          datasets: [{
            label: "모듈 수",
            data: moduleEntries.map((item) => item[1]),
            backgroundColor: ["#2d746c", "#628859", "#ce9d4e", "#8a709a"],
            borderRadius: 6,
            maxBarThickness: 28,
          }],
        },
        options: barOptions(false),
      });

      new Chart(document.getElementById("chart-state-spread"), {
        type: "pie",
        data: {
          labels: ["교차 모듈", "로컬"],
          datasets: [{ data: [reportData.stateSpread.cross, reportData.stateSpread.local], backgroundColor: ["#c86143", "#6b8d56"] }],
        },
        options: chartOptions(),
      });
    }

    async function exportNodeAsPng(targetId, fileName) {
      const target = document.getElementById(targetId);
      if (!target) return;
      if (typeof html2canvas === "undefined") {
        setStatus("html2canvas CDN 로드에 실패했습니다.");
        return;
      }

      try {
        const fullWidth = Math.max(1, Math.ceil(target.scrollWidth));
        const fullHeight = Math.max(1, Math.ceil(target.scrollHeight));
        const longestEdge = Math.max(fullWidth, fullHeight);
        const scale = Math.max(1, Math.min(BASE_EXPORT_SCALE, MAX_EXPORT_CANVAS_EDGE / longestEdge));
        const tileCssHeight = Math.max(320, Math.floor(MAX_TILE_CANVAS_HEIGHT / scale));
        const totalTiles = Math.max(1, Math.ceil(fullHeight / tileCssHeight));

        target.classList.add("export-capture-mode");
        await waitNextFrame();

        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = Math.max(1, Math.round(fullWidth * scale));
        finalCanvas.height = Math.max(1, Math.round(fullHeight * scale));
        const finalCtx = finalCanvas.getContext("2d");

        if (!finalCtx) {
          throw new Error("최종 캔버스 컨텍스트를 만들 수 없습니다.");
        }

        for (let i = 0; i < totalTiles; i += 1) {
          const yOffset = i * tileCssHeight;
          const sliceHeight = Math.min(tileCssHeight, fullHeight - yOffset);
          setStatus("PNG 렌더링 중... (" + (i + 1) + "/" + totalTiles + ")");

          const tileCanvas = await html2canvas(target, {
            backgroundColor: "#ffffff",
            scale,
            useCORS: true,
            logging: false,
            x: 0,
            y: yOffset,
            width: fullWidth,
            height: sliceHeight,
            scrollX: 0,
            scrollY: 0,
            windowWidth: Math.max(document.documentElement.clientWidth, fullWidth),
            windowHeight: Math.max(document.documentElement.clientHeight, sliceHeight),
          });

          finalCtx.drawImage(tileCanvas, 0, Math.round(yOffset * scale));
          await waitNextFrame();
        }

        triggerDownload(finalCanvas.toDataURL("image/png"), fileName);
        setStatus("PNG 저장 완료");
      } catch (err) {
        setStatus("내보내기 실패: " + (err && err.message ? err.message : err));
      } finally {
        target.classList.remove("export-capture-mode");
        setTimeout(() => setStatus(""), 2200);
      }
    }

    document.addEventListener("DOMContentLoaded", () => {
      createCharts();

      const reportBase = reportData.fileName.replace(/\.lua$/i, "");
      const rootEl = document.getElementById("report-root");
      const densityBtn = document.getElementById("toggle-density");
      const reportBtn = document.getElementById("export-report-png");
      const chartsBtn = document.getElementById("export-charts-png");
      const dataBtn = document.getElementById("download-report-data");

      if (densityBtn && rootEl) {
        let expanded = false;
        const moduleDetails = Array.from(rootEl.querySelectorAll("details.module-detail"));
        const applyDensityMode = () => {
          rootEl.classList.toggle("mode-expanded", expanded);
          densityBtn.textContent = expanded ? "간결 보기로 전환" : "확장 보기로 전환";
          for (const detail of moduleDetails) detail.open = expanded;
        };
        densityBtn.addEventListener("click", () => {
          expanded = !expanded;
          applyDensityMode();
        });
        applyDensityMode();
      }

      if (reportBtn) reportBtn.addEventListener("click", () => exportNodeAsPng("report-root", reportBase + ".analysis.png"));
      if (chartsBtn) chartsBtn.addEventListener("click", () => exportNodeAsPng("charts-zone", reportBase + ".charts.png"));
      if (dataBtn) dataBtn.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, reportBase + ".analysis.json");
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    });
  </script>
</main>
</body>
</html>`;
}

module.exports = { renderHtml };
