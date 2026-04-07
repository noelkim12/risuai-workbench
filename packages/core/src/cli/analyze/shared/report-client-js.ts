/** Analyzer report client JS source — extracted IIFE string. */
export function getReportClientJs(): string {
  return `(() => {
      const docRoot = document;

      function parseJsonScript(selector, scope) {
        const el = scope.querySelector(selector);
        if (!el) return null;
        try {
          return JSON.parse(el.textContent || 'null');
        } catch {
          return null;
        }
      }

      function getReportDataBundle() {
        var bundle = window.__RISU_REPORT_DATA__;
        return bundle && typeof bundle === 'object' ? bundle : null;
      }

      function getI18n() {
        var bundle = getReportDataBundle();
        if (bundle && bundle.i18n && typeof bundle.i18n === 'object') return bundle.i18n;
        var inline = document.getElementById('report-i18n');
        return inline ? JSON.parse(inline.textContent || '{}') : {};
      }

      const i18n = getI18n();

      function getPanelPayload(panel, expectedKind) {
        var bundle = getReportDataBundle();
        var key = panel.getAttribute('data-report-payload-key');
        if (bundle && key && bundle.panels && bundle.panels[key] && bundle.panels[key].kind === expectedKind) {
          return bundle.panels[key].payload;
        }
        if (expectedKind === 'chart') return parseJsonScript('[data-chart-config]', panel);
        return parseJsonScript('[data-diagram-payload]', panel);
      }

      function setupTabs() {
        const buttons = Array.from(docRoot.querySelectorAll('.tab-button'));
        const sections = Array.from(docRoot.querySelectorAll('.section-card'));
        buttons.forEach((button) => {
          button.addEventListener('click', () => {
            const target = button.getAttribute('data-tab');
            var targetSection = null;
            buttons.forEach((item) => item.classList.toggle('active', item === button));
            sections.forEach((section) => {
              const isTarget = section.getAttribute('data-tab') === target;
              if (isTarget) {
                section.classList.add('active');
                targetSection = section;
              } else {
                section.classList.remove('active');
              }
            });
            if (targetSection) {
              window.requestAnimationFrame(function() {
                renderVisibleForceGraphs(targetSection);
              });
            }
          });
        });
      }

      function isVisibleForceGraphPanel(panel) {
        if (!(panel instanceof HTMLElement)) return false;
        if (panel.getAttribute('data-library') !== 'force-graph') return false;
        const section = panel.closest('.section-card');
        return !section || section.classList.contains('active');
      }

      function renderVisibleForceGraphs(scope) {
        const root = scope || docRoot;
        root.querySelectorAll('[data-panel-kind="diagram"][data-library="force-graph"]').forEach((panel) => {
          if (!isVisibleForceGraphPanel(panel)) return;
          const payload = getPanelPayload(panel, 'diagram');
          const mount = panel.querySelector('.diagram-mount');
          if (!mount || payload == null || typeof payload !== 'object') return;
          initForceGraph(mount, payload);
        });
      }

      function setupForceGraphRefresh() {
        let rafId = null;
        window.addEventListener('resize', () => {
          if (rafId != null) window.cancelAnimationFrame(rafId);
          rafId = window.requestAnimationFrame(function() {
            renderVisibleForceGraphs();
            rafId = null;
          });
        });
      }

      function setupForceGraphControls() {
        var panels = Array.from(docRoot.querySelectorAll('[data-force-graph-mode="relationship-network"]'));
        var enterLabel = i18n['shell.forceGraph.enterFullscreen'] || 'Fullscreen';
        var exitLabel = i18n['shell.forceGraph.exitFullscreen'] || 'Exit fullscreen';

        function updateFullscreenButtons() {
          panels.forEach(function(panel) {
            var button = panel.querySelector('[data-force-graph-fullscreen-toggle="true"]');
            if (!(button instanceof HTMLButtonElement)) return;
            var isFullscreen = docRoot.fullscreenElement === panel;
            button.textContent = isFullscreen ? exitLabel : enterLabel;
            button.classList.toggle('active', isFullscreen);
            button.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
          });
        }

        panels.forEach(function(panel) {
          var button = panel.querySelector('[data-force-graph-fullscreen-toggle="true"]');
          if (!(button instanceof HTMLButtonElement) || button.dataset.bound === 'true') return;
          button.dataset.bound = 'true';
          if (typeof panel.requestFullscreen !== 'function') {
            button.hidden = true;
            return;
          }
          button.addEventListener('click', function() {
            if (docRoot.fullscreenElement === panel) {
              if (typeof docRoot.exitFullscreen === 'function') {
                docRoot.exitFullscreen().catch(function() {});
              }
              return;
            }
            if (docRoot.fullscreenElement && typeof docRoot.exitFullscreen === 'function') {
              docRoot.exitFullscreen().catch(function() {});
            }
            panel.requestFullscreen().catch(function() {});
          });
        });

        if (panels.length > 0 && docRoot.body && docRoot.body.dataset.forceGraphFullscreenBound !== 'true') {
          docRoot.body.dataset.forceGraphFullscreenBound = 'true';
          docRoot.addEventListener('fullscreenchange', function() {
            updateFullscreenButtons();
            renderVisibleForceGraphs();
          });
        }

        updateFullscreenButtons();
      }

      function setupSeverityFilters() {
        const filterBars = Array.from(docRoot.querySelectorAll('[data-severity-filter-bar="true"]'));

        filterBars.forEach((bar) => {
          const panel = bar.closest('[data-panel-id]');
          if (!panel) return;
          const chips = Array.from(bar.querySelectorAll('.sev-chip'));
          const items = Array.from(panel.querySelectorAll('[data-severity-item="true"]'));
          if (chips.length === 0 || items.length === 0) return;

          chips.forEach((chip) => {
            chip.addEventListener('click', () => {
              const severity = chip.getAttribute('data-severity') || 'all';
              chips.forEach((item) => item.classList.toggle('active', item === chip));
              items.forEach((item) => {
                const itemSeverity = item.getAttribute('data-severity') || 'neutral';
                item.style.display = severity === 'all' || severity === itemSeverity ? '' : 'none';
              });
            });
          });
        });
      }

      function setupTableFilters() {
        const toolbars = Array.from(docRoot.querySelectorAll('[data-table-filter-target]'));
        toolbars.forEach((input) => {
          input.addEventListener('input', () => {
            const targetId = input.getAttribute('data-table-filter-target');
            if (!targetId) return;
            const table = docRoot.querySelector('[data-panel-id="' + targetId + '"]');
            if (!table) return;
            const term = String(input.value || '').toLowerCase();
            table.querySelectorAll('tbody tr').forEach((row) => {
              const haystack = (row.getAttribute('data-search-text') || '').toLowerCase();
              row.style.display = haystack.includes(term) ? '' : 'none';
            });
          });
        });
      }

      function flattenValues(items) {
        return Array.isArray(items) ? items.map((value) => Number(value) || 0) : [];
      }

      function d3BarChart(mount, config) {
        var labels = Array.isArray(config?.data?.labels) ? config.data.labels : [];
        var dataset = Array.isArray(config?.data?.datasets) ? config.data.datasets[0] : null;
        var values = flattenValues(dataset?.data);
        if (values.length === 0) return false;
        var colors = Array.isArray(dataset?.backgroundColor) ? dataset.backgroundColor : values.map(function() { return '#60a5fa'; });
        var max = Math.max.apply(null, values.concat([1]));

        var rect = mount.getBoundingClientRect();
        var width = rect.width || 720;
        var height = rect.height || 320;
        var margin = { top: 28, right: 22, bottom: 56, left: 52 };
        var plotW = width - margin.left - margin.right;
        var plotH = height - margin.top - margin.bottom;

        mount.innerHTML = '';
        var svg = d3.select(mount).append('svg')
          .attr('width', width).attr('height', height)
          .style('display', 'block').style('border-radius', '8px');

        var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        var x = d3.scaleBand().domain(labels).range([0, plotW]).padding(0.35);
        var y = d3.scaleLinear().domain([0, max]).nice().range([plotH, 0]);

        g.selectAll('.grid-line').data(y.ticks(4)).join('line')
          .attr('x1', 0).attr('x2', plotW)
          .attr('y1', function(d) { return y(d); })
          .attr('y2', function(d) { return y(d); })
          .attr('stroke', 'rgba(255,255,255,0.05)');

        g.selectAll('.y-label').data(y.ticks(4)).join('text')
          .attr('x', -8).attr('y', function(d) { return y(d) + 4; })
          .attr('text-anchor', 'end')
          .attr('fill', '#a0a8c4').attr('font-size', '12px').attr('font-family', 'Inter, sans-serif')
          .text(function(d) { return d; });

        g.selectAll('.bar').data(values).join('rect')
          .attr('x', function(d, i) { return x(labels[i]); })
          .attr('y', function(d) { return y(d); })
          .attr('width', x.bandwidth())
          .attr('height', function(d) { return Math.max(plotH - y(d), 2); })
          .attr('rx', Math.min(8, x.bandwidth() / 2))
          .attr('fill', function(d, i) { return colors[i] || '#60a5fa'; });

        g.selectAll('.val-label').data(values).join('text')
          .attr('x', function(d, i) { return x(labels[i]) + x.bandwidth() / 2; })
          .attr('y', function(d) { return y(d) - 8; })
          .attr('text-anchor', 'middle')
          .attr('fill', '#eaedf6').attr('font-size', '12px').attr('font-family', 'Inter, sans-serif')
          .text(function(d) { return d; });

        g.selectAll('.x-label').data(labels).join('text')
          .attr('x', function(d) { return x(d) + x.bandwidth() / 2; })
          .attr('y', plotH + 24)
          .attr('text-anchor', 'middle')
          .attr('fill', '#a0a8c4').attr('font-size', '12px').attr('font-family', 'Inter, sans-serif')
          .each(function(d) {
            var el = d3.select(this);
            var label = String(d);
            if (label.length > 12) {
              var mid = Math.ceil(label.length / 2);
              el.append('tspan').attr('x', el.attr('x')).attr('dy', '0').text(label.slice(0, mid));
              el.append('tspan').attr('x', el.attr('x')).attr('dy', '1.1em').text(label.slice(mid));
            } else {
              el.text(label);
            }
          });

        return true;
      }

      function d3HorizontalBarChart(mount, config) {
        var labels = Array.isArray(config?.data?.labels) ? config.data.labels : [];
        var dataset = Array.isArray(config?.data?.datasets) ? config.data.datasets[0] : null;
        var values = flattenValues(dataset?.data);
        if (values.length === 0) return false;
        var colors = Array.isArray(dataset?.backgroundColor) ? dataset.backgroundColor : values.map(function() { return '#60a5fa'; });
        var max = Math.max.apply(null, values.concat([1]));

        var leftMargin = 160;
        var barHeight = 28;
        var gap = 8;
        var topMargin = 20;
        var bottomMargin = 32;
        var rect = mount.getBoundingClientRect();
        var width = rect.width || 720;
        var height = Math.max(300, values.length * (barHeight + gap) + topMargin + bottomMargin);
        var plotW = width - leftMargin - 40;

        mount.innerHTML = '';
        mount.style.height = height + 'px';
        var svg = d3.select(mount).append('svg')
          .attr('width', width).attr('height', height)
          .style('display', 'block').style('border-radius', '8px');

        var x = d3.scaleLinear().domain([0, max]).nice().range([0, plotW]);

        svg.selectAll('.grid-v').data(x.ticks(4)).join('line')
          .attr('x1', function(d) { return leftMargin + x(d); })
          .attr('x2', function(d) { return leftMargin + x(d); })
          .attr('y1', topMargin)
          .attr('y2', height - bottomMargin)
          .attr('stroke', 'rgba(255,255,255,0.05)');

        svg.selectAll('.x-tick').data(x.ticks(4)).join('text')
          .attr('x', function(d) { return leftMargin + x(d); })
          .attr('y', height - 12)
          .attr('text-anchor', 'middle')
          .attr('fill', '#a0a8c4').attr('font-size', '11px').attr('font-family', 'Inter, sans-serif')
          .text(function(d) { return d; });

        svg.selectAll('.h-bar').data(values).join('rect')
          .attr('x', leftMargin)
          .attr('y', function(d, i) { return topMargin + i * (barHeight + gap); })
          .attr('width', function(d) { return Math.max(x(d), 4); })
          .attr('height', barHeight)
          .attr('rx', 6)
          .attr('fill', function(d, i) { return colors[i] || '#60a5fa'; });

        svg.selectAll('.h-val').data(values).join('text')
          .attr('x', function(d) { return leftMargin + Math.max(x(d), 4) + 8; })
          .attr('y', function(d, i) { return topMargin + i * (barHeight + gap) + barHeight / 2 + 4; })
          .attr('fill', '#eaedf6').attr('font-size', '12px').attr('font-family', 'Inter, sans-serif')
          .text(function(d) { return d; });

        svg.selectAll('.h-label').data(labels).join('text')
          .attr('x', leftMargin - 10)
          .attr('y', function(d, i) { return topMargin + i * (barHeight + gap) + barHeight / 2 + 4; })
          .attr('text-anchor', 'end')
          .attr('fill', '#a0a8c4').attr('font-size', '12px').attr('font-family', 'Inter, sans-serif')
          .text(function(d) { var l = String(d); return l.length > 20 ? l.slice(0, 18) + '\u2026' : l; });

        return true;
      }

      function d3DoughnutChart(mount, config) {
        var labels = Array.isArray(config?.data?.labels) ? config.data.labels : [];
        var dataset = Array.isArray(config?.data?.datasets) ? config.data.datasets[0] : null;
        var values = flattenValues(dataset?.data);
        if (values.length === 0) return false;
        var colors = Array.isArray(dataset?.backgroundColor) ? dataset.backgroundColor : values.map(function() { return '#60a5fa'; });
        var total = values.reduce(function(s, v) { return s + v; }, 0);
        if (total <= 0) return false;

        var rect = mount.getBoundingClientRect();
        var width = rect.width || 720;
        var height = rect.height || 320;
        var centerX = width * 0.32;
        var centerY = height * 0.5;
        var radius = Math.min(width, height) * 0.24;
        var innerRadius = radius * 0.58;

        mount.innerHTML = '';
        var svg = d3.select(mount).append('svg')
          .attr('width', width).attr('height', height)
          .style('display', 'block').style('border-radius', '8px');

        var pie = d3.pie().sort(null).value(function(d) { return d; });
        var arc = d3.arc().innerRadius(innerRadius).outerRadius(radius);

        var g = svg.append('g').attr('transform', 'translate(' + centerX + ',' + centerY + ')');

        g.selectAll('.slice').data(pie(values)).join('path')
          .attr('d', arc)
          .attr('fill', function(d, i) { return colors[i] || '#60a5fa'; });

        g.append('text')
          .attr('text-anchor', 'middle').attr('dy', '0.1em')
          .attr('fill', '#eaedf6').attr('font-size', '28px').attr('font-weight', '700').attr('font-family', 'Inter, sans-serif')
          .text(total);
        g.append('text')
          .attr('text-anchor', 'middle').attr('dy', '2em')
          .attr('fill', '#a0a8c4').attr('font-size', '12px').attr('font-family', 'Inter, sans-serif')
          .text(i18n['shell.chart.total'] || 'total');

        var legendX = width * 0.58;
        var legendY = height * 0.22;
        var legendG = svg.append('g');

        values.forEach(function(value, i) {
          var ly = legendY + i * 26;
          legendG.append('rect')
            .attr('x', legendX).attr('y', ly - 10)
            .attr('width', 14).attr('height', 14).attr('rx', 4)
            .attr('fill', colors[i] || '#60a5fa');
          legendG.append('text')
            .attr('x', legendX + 22).attr('y', ly + 1)
            .attr('fill', '#eaedf6').attr('font-size', '13px').attr('font-family', 'Inter, sans-serif')
            .text(labels[i] || 'Item');
          legendG.append('text')
            .attr('x', legendX + 170).attr('y', ly + 1)
            .attr('fill', '#a0a8c4').attr('font-size', '13px').attr('font-family', 'Inter, sans-serif')
            .text(value);
        });

        return true;
      }

      function renderChartFallback(panel, scope, reason) {
        const fallback = scope.querySelector('.chart-fallback');
        if (!fallback) return;
        fallback.textContent = reason || i18n['shell.chart.fallback'] || 'Chart could not be rendered.';
      }

      function initCharts() {
        docRoot.querySelectorAll('[data-panel-kind="chart"]').forEach(function(panel) {
          var payload = getPanelPayload(panel, 'chart');
          var mount = panel.querySelector('.chart-mount');
          if (!payload || !mount) {
            renderChartFallback(panel, panel, i18n['shell.chart.missingPayload'] || 'Missing chart payload.');
            return;
          }
          var chartType = String(payload.type || 'bar');
          var rendered = false;
          if (chartType === 'doughnut' || chartType === 'pie') {
            rendered = d3DoughnutChart(mount, payload);
          } else if (chartType === 'horizontalBar') {
            rendered = d3HorizontalBarChart(mount, payload);
          } else if (chartType === 'bar') {
            rendered = d3BarChart(mount, payload);
          }
          if (!rendered) {
            renderChartFallback(panel, panel, (i18n['shell.chart.unsupportedType'] || 'Unsupported chart type: ') + chartType);
          }
        });
      }

      function renderSimpleFlow(definition) {
        const normalized = String(definition || '').split('\\n').map((line) => line.trim()).filter(Boolean);
        const edgeLines = normalized.filter((line) => line.includes('-->'));
        if (edgeLines.length === 0) {
          return '<pre>' + escapeHtmlForClient(definition) + '</pre>';
        }
        const nodes = [];
        edgeLines.forEach((line) => {
          const parts = line.split('-->').map((part) => part.replace(/^flowchart\\s+[A-Z]+/i, '').trim()).filter(Boolean);
          parts.forEach((part) => {
            if (part && !nodes.includes(part)) nodes.push(part);
          });
        });
        return '<div class="diagram-flow">' + nodes.map((node, index) => {
          const arrow = index < nodes.length - 1 ? '<span class="diagram-arrow">\u2192</span>' : '';
          return '<div class="diagram-node">' + escapeHtmlForClient(node) + '</div>' + arrow;
        }).join('') + '</div>';
      }

      function renderCytoscapeSummary(payload) {
        const elements = Array.isArray(payload?.elements) ? payload.elements : [];
        const nodeCount = elements.filter((element) => !element?.data?.source && !element?.data?.target).length;
        const edgeCount = elements.filter((element) => element?.data?.source && element?.data?.target).length;
        const edges = elements
          .filter((element) => element?.data?.source && element?.data?.target)
          .map((element) => '<li><code>' + escapeHtmlForClient(String(element.data.source)) + '</code> \u2192 <code>' + escapeHtmlForClient(String(element.data.target)) + '</code></li>')
          .join('');
        return '<div class="cyto-summary">'
          + '<div class="cyto-stat-grid">'
          + '<div class="cyto-stat"><strong>' + nodeCount + '</strong><span>' + (i18n['shell.diagram.nodes'] || 'nodes') + '</span></div>'
          + '<div class="cyto-stat"><strong>' + edgeCount + '</strong><span>' + (i18n['shell.diagram.edges'] || 'edges') + '</span></div>'
          + '</div>'
          + '<div>' + (edges ? '<ul>' + edges + '</ul>' : '<p class="diagram-fallback">' + (i18n['shell.diagram.noEdges'] || 'No edges to render.') + '</p>') + '</div>'
          + '</div>';
      }

      function initDiagrams() {
        docRoot.querySelectorAll('[data-panel-kind="diagram"]').forEach((panel) => {
          const library = panel.getAttribute('data-library') || 'text';
          const payload = getPanelPayload(panel, 'diagram');
          const mount = panel.querySelector('.diagram-mount');
          if (!mount || payload == null) return;
          if (library === 'mermaid' && typeof payload === 'string') {
            mount.innerHTML = renderSimpleFlow(payload);
            return;
          }
          if (library === 'cytoscape' && typeof payload === 'object') {
            mount.innerHTML = renderCytoscapeSummary(payload);
            return;
          }
        });

        renderVisibleForceGraphs();
      }

      function initForceGraph(mount, data) {
        if (typeof d3 === 'undefined') { mount.innerHTML = '<p class="diagram-fallback">D3.js failed to load.</p>'; return; }
        var panel = mount.closest('[data-panel-kind="diagram"]');
        var isRelationshipNetwork = !!(panel && panel.getAttribute('data-force-graph-mode') === 'relationship-network');
        var nodes = Array.isArray(data.nodes) ? data.nodes.map(function(n) { return Object.assign({}, n); }) : [];
        var edges = Array.isArray(data.edges) ? data.edges.map(function(e) { return Object.assign({}, e); }) : [];
        if (nodes.length === 0) { mount.innerHTML = '<p class="diagram-fallback">' + (i18n['shell.forceGraph.empty'] || 'No graph data available.') + '</p>'; return; }

        var isFullscreen = !!(panel && docRoot.fullscreenElement === panel);
        var graphH = Math.max(360, Math.min(nodes.length * 28, 620));
        if (isFullscreen) {
          graphH = Math.max(graphH, Math.floor((window.innerHeight || 900) * 0.76));
        }
        var centerX = (mount.clientWidth || 720) / 2;
        var centerY = graphH / 2;
        var seedRadius = Math.max(24, Math.min(nodes.length * 8, 96));
        nodes.forEach(function(node, index) {
          if (Number.isFinite(node.x) && Number.isFinite(node.y)) return;
          var angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
          node.x = centerX + Math.cos(angle) * seedRadius;
          node.y = centerY + Math.sin(angle) * seedRadius;
        });
        mount.innerHTML = '';

        function splitLabelLines(value) {
          var text = String(value || '');
          text = text.replace(/[\/]/g, '/\u200b').replace(/_/g, '_\u200b').replace(/ · /g, ' ·\u200b ');
          var lines = [];
          for (var i = 0; i < text.length; i += 12) lines.push(text.slice(i, i + 12));
          return lines.length > 0 ? lines : [''];
        }

        function getNodeCircleRadius(node) {
          if (node.type === 'variable') return 7;
          if (node.type === 'regex') return 16;
          if (node.type === 'trigger-keyword') return 12;
          if (node.type === 'lua-function') return 16;
          if (node.type === 'lua-function-core') return 24;
          return 20;
        }

        function getNodeShapeType(node) {
          if (node.type === 'regex') return 'triangle';
          if (node.type === 'lua-function' || node.type === 'lua-function-core') return 'square';
          if (node.type === 'variable') return 'star';
          if (node.type === 'trigger-keyword') return 'rect';
          return 'circle';
        }

        function getNodeShapePath(node, radius) {
          var shapeType = getNodeShapeType(node);
          if (shapeType === 'rect') {
            var halfWidth = Math.max(radius * 1.3, 14);
            var halfHeight = Math.max(radius * 0.75, 9);
            return 'M' + (-halfWidth) + ',' + (-halfHeight)
              + 'L' + halfWidth + ',' + (-halfHeight)
              + 'L' + halfWidth + ',' + halfHeight
              + 'L' + (-halfWidth) + ',' + halfHeight
              + 'Z';
          }
          var symbolType = d3.symbolCircle;
          if (shapeType === 'triangle') symbolType = d3.symbolTriangle;
          else if (shapeType === 'square') symbolType = d3.symbolSquare;
          else if (shapeType === 'star') {
            return d3.symbol().type(d3.symbolStar).size(Math.PI * radius * radius * 0.55)();
          }
          return d3.symbol().type(symbolType).size(Math.PI * radius * radius)();
        }

        nodes.forEach(function(node) {
          var labelLines = splitLabelLines(node.label || node.id);
          node.__labelLines = labelLines;
          node.__labelWidth = labelLines.reduce(function(max, line) { return Math.max(max, String(line).length); }, 0);
          node.__circleRadius = getNodeCircleRadius(node);
          node.__radius = Math.max(
            node.__circleRadius + 10,
            node.__circleRadius + Math.max(labelLines.length - 1, 0) * 8 + Math.max(node.__labelWidth - 10, 0) * 0.8,
          );
        });

        var hasUserZoomed = false;
        var isApplyingAutoFit = false;
        var hoveredNodeId = null;
        var visibleNodeIds = new Set();

        function getRelationshipEdgeType(type) {
          if (type === 'variable') return 'variable';
          if (type === 'lore-direct') return 'lore-direct';
          if (type === 'text-mention') return 'text-mention';
          if (type === 'lua-call') return 'lua-call';
          return 'keyword';
        }

        var legendEntries = [
          { type: 'always-active', color: '#f87171', label: i18n['shell.forceGraph.alwaysActive'] || 'Lorebook · Always active' },
          { type: 'selective', color: '#34d399', label: i18n['shell.forceGraph.selective'] || 'Lorebook · Selective' },
          { type: 'normal', color: '#60a5fa', label: i18n['shell.forceGraph.normal'] || 'Lorebook · Standard' },
          { type: 'regex', color: '#a78bfa', label: i18n['shell.forceGraph.regex'] || 'Regex script' },
          { type: 'lua-function', color: '#2dd4bf', label: i18n['shell.forceGraph.luaFunction'] || 'Lua function' },
          { type: 'lua-function-core', color: '#ec4899', label: i18n['shell.forceGraph.luaFunctionCore'] || 'Lua core function' },
          { type: 'variable', color: '#fbbf24', label: i18n['shell.forceGraph.variable'] || 'Variable' },
          { type: 'trigger-keyword', color: '#f43f5e', label: i18n['shell.forceGraph.triggerKeyword'] || 'Trigger keyword' },
        ].filter(function(entry) {
          return nodes.some(function(node) { return node.type === entry.type; });
        });

        var edgeLegendEntries = [
          { type: 'keyword', color: 'rgba(96,165,250,0.7)', label: i18n['shell.forceGraph.edgeKeyword'] || 'Keyword activation' },
          { type: 'variable', color: 'rgba(251,191,36,0.7)', label: i18n['shell.forceGraph.edgeVariable'] || 'Variable flow' },
          { type: 'lore-direct', color: 'rgba(45,212,191,0.78)', label: i18n['shell.forceGraph.edgeLoreDirect'] || 'Lua direct lore access' },
          { type: 'text-mention', color: 'rgba(244,114,182,0.72)', label: i18n['shell.forceGraph.edgeTextMention'] || 'Text mention' },
          { type: 'lua-call', color: 'rgba(129,140,248,0.78)', label: i18n['shell.forceGraph.edgeLuaCall'] || 'Lua call flow' },
        ].filter(function(entry) {
          return edges.some(function(edge) { return getRelationshipEdgeType(edge.type) === entry.type; });
        });

        function getEdgeNodeId(value) {
          return typeof value === 'object' && value ? value.id : value;
        }

        function getInitialActiveTypes() {
          var defaultTypes = legendEntries.map(function(entry) { return entry.type; });
          if (!isRelationshipNetwork || !panel) return new Set(defaultTypes);
          var raw = panel.getAttribute('data-force-graph-active-types') || '';
          var requested = raw
            .split(',')
            .map(function(type) { return type.trim(); })
            .filter(Boolean);
          var activeTypes = requested.length > 0
            ? defaultTypes.filter(function(type) { return requested.includes(type); })
            : defaultTypes;
          if (activeTypes.length === 0) activeTypes = defaultTypes;
          panel.setAttribute('data-force-graph-active-types', activeTypes.join(','));
          return new Set(activeTypes);
        }

        function getInitialActiveEdgeTypes() {
          var defaultTypes = edgeLegendEntries.map(function(entry) { return entry.type; });
          if (!isRelationshipNetwork || !panel || defaultTypes.length === 0) return new Set(defaultTypes);
          var raw = panel.getAttribute('data-force-graph-active-edge-types') || '';
          var requested = raw
            .split(',')
            .map(function(type) { return type.trim(); })
            .filter(Boolean);
          var activeTypes = requested.length > 0
            ? defaultTypes.filter(function(type) { return requested.includes(type); })
            : defaultTypes;
          if (activeTypes.length === 0) activeTypes = defaultTypes;
          panel.setAttribute('data-force-graph-active-edge-types', activeTypes.join(','));
          return new Set(activeTypes);
        }

        var activeNodeTypes = getInitialActiveTypes();
        var activeEdgeTypes = getInitialActiveEdgeTypes();

        function fitGraph(animated) {
          if (nodes.length === 0) return;
          var minX = Infinity;
          var minY = Infinity;
          var maxX = -Infinity;
          var maxY = -Infinity;
          nodes.forEach(function(node) {
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
            var radius = Number.isFinite(node.__radius) ? node.__radius : 36;
            var labelDepth = Math.max((node.__labelLines ? node.__labelLines.length : 1) - 1, 0) * 11;
            minX = Math.min(minX, node.x - radius);
            minY = Math.min(minY, node.y - radius);
            maxX = Math.max(maxX, node.x + radius);
            maxY = Math.max(maxY, node.y + radius + 28 + labelDepth);
          });
          if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;
          var boundsW = Math.max(maxX - minX, 1);
          var boundsH = Math.max(maxY - minY, 1);
          var viewportW = mount.clientWidth || 720;
          var viewportH = graphH;
          var scale = Math.max(0.55, Math.min(1.35, 0.88 / Math.max(boundsW / viewportW, boundsH / viewportH)));
          var tx = viewportW / 2 - ((minX + maxX) / 2) * scale;
          var ty = viewportH / 2 - ((minY + maxY) / 2) * scale;
          var transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
          if (animated) {
            isApplyingAutoFit = true;
            svg.transition().duration(250).call(zoom.transform, transform).on('end', function() {
              isApplyingAutoFit = false;
            });
          } else {
            isApplyingAutoFit = true;
            svg.call(zoom.transform, transform);
            isApplyingAutoFit = false;
          }
        }

        var svg = d3.select(mount).append('svg')
          .attr('width', '100%')
          .attr('height', graphH)
          .style('display', 'block')
          .style('border-radius', '8px')
          .style('background', '#0c0e1a');

        var defs = svg.append('defs');
        defs.append('marker').attr('id', 'arrow-kw').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(96,165,250,0.5)');
        defs.append('marker').attr('id', 'arrow-var').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(251,191,36,0.5)');
        defs.append('marker').attr('id', 'arrow-lore-direct').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(45,212,191,0.6)');
        defs.append('marker').attr('id', 'arrow-text-mention').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-3L6,0L0,3').attr('fill', 'rgba(244,114,182,0.6)');
        defs.append('marker').attr('id', 'arrow-lua-call').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4L2,0Z').attr('fill', 'rgba(129,140,248,0.7)');

        var g = svg.append('g');

        var zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', function(event) {
          if (!isApplyingAutoFit) hasUserZoomed = true;
          g.attr('transform', event.transform);
        });
        svg.call(zoom);

        var linkGroup = g.append('g');
        var edgeLabelGroup = g.append('g');
        var nodeGroup = g.append('g');

        var link = linkGroup.selectAll('line').data(edges).join('line')
          .attr('stroke', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'variable') return 'rgba(251,191,36,0.35)';
            if (edgeType === 'lore-direct') return 'rgba(45,212,191,0.45)';
            if (edgeType === 'text-mention') return 'rgba(244,114,182,0.38)';
            if (edgeType === 'lua-call') return 'rgba(129,140,248,0.45)';
            return 'rgba(96,165,250,0.3)';
          })
          .attr('stroke-width', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'lua-call') return 1.6;
            if (edgeType === 'text-mention') return 1.0;
            return 1.2;
          })
          .attr('stroke-dasharray', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'text-mention') return '4 3';
            if (edgeType === 'lua-call') return '6 2';
            return 'none';
          })
          .attr('marker-end', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'variable') return 'url(#arrow-var)';
            if (edgeType === 'lore-direct') return 'url(#arrow-lore-direct)';
            if (edgeType === 'text-mention') return 'url(#arrow-text-mention)';
            if (edgeType === 'lua-call') return 'url(#arrow-lua-call)';
            return 'url(#arrow-kw)';
          });

        var edgeLabel = edgeLabelGroup.selectAll('text').data(edges.filter(function(e) { return Boolean(e.label); })).join('text')
          .text(function(d) { return d.label; })
          .attr('text-anchor', 'middle')
          .attr('fill', '#f8d26a')
          .attr('font-size', '10px')
          .attr('font-family', 'Inter, system-ui, sans-serif')
          .attr('stroke', '#0c0e1a')
          .attr('stroke-width', 3)
          .attr('paint-order', 'stroke')
          .attr('pointer-events', 'none')
          .attr('opacity', 0.82);

        var node = nodeGroup.selectAll('g').data(nodes).join('g').attr('cursor', 'grab');

        node.append('path')
          .attr('d', function(d) { return getNodeShapePath(d, d.__circleRadius || 18); })
          .attr('fill', function(d) { return d.color || '#60a5fa'; })
          .attr('opacity', 0.85)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 2);

        node.append('title').text(function(d) { return d.label || d.id; });

        var nodeLabel = node.append('text')
          .attr('dy', function(d) { return (d.__circleRadius || 18) + 12; })
          .attr('text-anchor', 'middle')
          .attr('fill', '#eaedf6')
          .attr('font-size', '10px')
          .attr('font-family', 'Inter, system-ui, sans-serif')
          .attr('pointer-events', 'none');

        nodeLabel.each(function(d) {
          var label = d3.select(this);
          (d.__labelLines || splitLabelLines(d.label || d.id)).forEach(function(line, index) {
            label.append('tspan')
              .attr('x', 0)
              .attr('dy', index === 0 ? 0 : 11)
              .text(line);
          });
        });

        function isNodeTypeVisible(nodeData) {
          return !isRelationshipNetwork || activeNodeTypes.has(nodeData.type);
        }

        function isEdgeTypeVisible(edgeData) {
          return !isRelationshipNetwork || activeEdgeTypes.has(getRelationshipEdgeType(edgeData.type));
        }

        function isFocusModeActive() {
          return isRelationshipNetwork && legendEntries.length > 0 && activeNodeTypes.size < legendEntries.length;
        }

        function isEdgeVisible(edgeData) {
          var sourceId = getEdgeNodeId(edgeData.source);
          var targetId = getEdgeNodeId(edgeData.target);
          return isEdgeTypeVisible(edgeData) && visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
        }

        function syncGraphVisibility() {
          var nodeTypeVisibleIds = new Set(nodes.filter(isNodeTypeVisible).map(function(nodeData) { return nodeData.id; }));
          if (isFocusModeActive()) {
            visibleNodeIds = new Set();
            edges.forEach(function(edgeData) {
              if (!isEdgeTypeVisible(edgeData)) return;
              var sourceId = getEdgeNodeId(edgeData.source);
              var targetId = getEdgeNodeId(edgeData.target);
              if (nodeTypeVisibleIds.has(sourceId)) visibleNodeIds.add(sourceId);
              if (nodeTypeVisibleIds.has(targetId)) visibleNodeIds.add(targetId);
            });
          } else {
            visibleNodeIds = nodeTypeVisibleIds;
          }
          var connected = hoveredNodeId ? new Set([hoveredNodeId]) : null;

          if (connected) {
            edges.forEach(function(edgeData) {
              if (!isEdgeVisible(edgeData)) return;
              var sourceId = getEdgeNodeId(edgeData.source);
              var targetId = getEdgeNodeId(edgeData.target);
              if (sourceId === hoveredNodeId) connected.add(targetId);
              if (targetId === hoveredNodeId) connected.add(sourceId);
            });
          }

          node.style('display', function(nodeData) {
            return visibleNodeIds.has(nodeData.id) ? '' : 'none';
          });

          node.select('path')
            .attr('opacity', function(nodeData) {
              if (!visibleNodeIds.has(nodeData.id)) return 0;
              if (!connected) return 0.85;
              return connected.has(nodeData.id) ? 1 : 0.15;
            })
            .attr('stroke', function(nodeData) {
              return hoveredNodeId === nodeData.id && visibleNodeIds.has(nodeData.id) ? '#fff' : 'transparent';
            })
            .attr('d', function(nodeData) {
              var radius = nodeData.__circleRadius || 18;
              return getNodeShapePath(nodeData, hoveredNodeId === nodeData.id && visibleNodeIds.has(nodeData.id) ? radius + 4 : radius);
            });

          node.select('text').attr('opacity', function(nodeData) {
            if (!visibleNodeIds.has(nodeData.id)) return 0;
            if (!connected) return 1;
            return connected.has(nodeData.id) ? 1 : 0.15;
          });

          link
            .style('display', function(edgeData) { return isEdgeVisible(edgeData) ? '' : 'none'; })
            .attr('opacity', function(edgeData) {
              if (!isEdgeVisible(edgeData)) return 0;
              if (!connected) return 1;
              var sourceId = getEdgeNodeId(edgeData.source);
              var targetId = getEdgeNodeId(edgeData.target);
              return (sourceId === hoveredNodeId || targetId === hoveredNodeId) ? 1 : 0.08;
            })
            .attr('stroke-width', function(edgeData) {
              if (!isEdgeVisible(edgeData)) return 0;
              if (!connected) return 1.2;
              var sourceId = getEdgeNodeId(edgeData.source);
              var targetId = getEdgeNodeId(edgeData.target);
              return (sourceId === hoveredNodeId || targetId === hoveredNodeId) ? 2.5 : 1.2;
            });

          edgeLabel
            .style('display', function(edgeData) { return isEdgeVisible(edgeData) ? '' : 'none'; })
            .attr('opacity', function(edgeData) {
              if (!isEdgeVisible(edgeData)) return 0;
              if (!connected) return 0.82;
              var sourceId = getEdgeNodeId(edgeData.source);
              var targetId = getEdgeNodeId(edgeData.target);
              return (sourceId === hoveredNodeId || targetId === hoveredNodeId) ? 1 : 0.08;
            });
        }

        node.on('mouseenter', function(event, d) {
          if (!visibleNodeIds.has(d.id)) return;
          hoveredNodeId = d.id;
          syncGraphVisibility();
        }).on('mouseleave', function() {
          hoveredNodeId = null;
          syncGraphVisibility();
        });

        var dialog = document.getElementById('node-details-dialog');
        var dialogTitle = document.getElementById('node-details-title');
        var dialogList = document.getElementById('node-details-list');
        var dialogClose = document.getElementById('node-details-close');

        if (dialogClose && dialogClose.dataset.bound !== 'true') {
          dialogClose.dataset.bound = 'true';
          dialogClose.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            if (dialog && typeof dialog.close === 'function') dialog.close('close-button');
          });
        }

        function shouldRenderBlockValue(key, valueText) {
          return key === 'Content'
            || key === 'In'
            || key === 'Out'
            || key === 'Body'
            || key === 'Expected vars'
            || valueText.indexOf('\\n') >= 0
            || valueText.length > 120;
        }

        node.on('click', function(event, d) {
          if (!dialog || !visibleNodeIds.has(d.id)) return;
          if (!dialogTitle || !dialogList) return;
          dialogTitle.textContent = d.label || d.id;
          dialogList.innerHTML = '';
          if (d.details && typeof d.details === 'object') {
            for (var key in d.details) {
              if (!Object.prototype.hasOwnProperty.call(d.details, key) || !d.details[key]) continue;
              var valueText = String(d.details[key]);
              var li = document.createElement('li');
              li.innerHTML = '<strong>' + escapeHtmlForClient(key) + '</strong>';
              if (shouldRenderBlockValue(key, valueText)) {
                var block = document.createElement('pre');
                block.className = 'node-details-pre';
                block.textContent = valueText;
                li.appendChild(block);
              } else {
                li.insertAdjacentHTML('beforeend', ' ' + escapeHtmlForClient(valueText));
              }
              dialogList.appendChild(li);
            }
          }
          if (dialogList.children.length === 0) {
            var emptyLi = document.createElement('li');
            emptyLi.textContent = 'No detailed information available.';
            dialogList.appendChild(emptyLi);
          }
          if (typeof dialog.showModal === 'function' && !dialog.open) {
            dialog.showModal();
          }
          dialog.scrollTop = 0;
          dialogList.scrollTop = 0;
          window.requestAnimationFrame(function() {
            dialog.scrollTop = 0;
            dialogList.scrollTop = 0;
            if (dialogTitle && typeof dialogTitle.focus === 'function') {
              dialogTitle.focus();
            }
          });
        });

        var simulation = d3.forceSimulation(nodes)
          .force('charge', d3.forceManyBody().strength(-120))
          .force('link', d3.forceLink(edges).id(function(d) { return d.id; }).distance(72).strength(0.6))
          .force('center', d3.forceCenter(
            centerX,
            centerY
          ))
          .force('forceX', d3.forceX(centerX).strength(0.05))
          .force('forceY', d3.forceY(centerY).strength(0.05))
          .force('collide', d3.forceCollide(function(d) { return d.__radius || 24; }).strength(0.9))
          .on('tick', function() {
            link
              .attr('x1', function(d) { return d.source.x; })
              .attr('y1', function(d) { return d.source.y; })
              .attr('x2', function(d) { return d.target.x; })
              .attr('y2', function(d) { return d.target.y; });
            edgeLabel
              .attr('x', function(d) { return (d.source.x + d.target.x) / 2; })
              .attr('y', function(d) { return (d.source.y + d.target.y) / 2 - 6; });
            node.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
          })
          .on('end', function() {
            if (!hasUserZoomed) fitGraph(true);
          });

        var drag = d3.drag()
          .on('start', function(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', function(event, d) {
            d.fx = event.x; d.fy = event.y;
          })
          .on('end', function(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          });
        node.call(drag);
        fitGraph(false);

        function updateLegendChipState(chip, isActive) {
          chip.dataset.active = isActive ? 'true' : 'false';
          chip.classList.toggle('active', isActive);
          chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        }

        function buildLegendChip(entry, attributeName, isActive) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'force-graph-chip';
          chip.setAttribute(attributeName, entry.type);
          chip.innerHTML = '<span class="force-graph-chip-dot" style="background:' + escapeHtmlForClient(entry.color) + '"></span>' + escapeHtmlForClient(entry.label);
          updateLegendChipState(chip, isActive);
          return chip;
        }

        function renderLegend() {
          var legendDiv = document.createElement('div');
          legendDiv.className = 'force-graph-legend';

          if (isRelationshipNetwork) {
            legendDiv.setAttribute('data-force-graph-legend-filter', 'true');
            legendEntries.forEach(function(entry) {
              var chip = buildLegendChip(entry, 'data-node-type', activeNodeTypes.has(entry.type));
              chip.addEventListener('click', function() {
                if (activeNodeTypes.has(entry.type) && activeNodeTypes.size === 1) return;
                if (activeNodeTypes.has(entry.type)) {
                  activeNodeTypes.delete(entry.type);
                } else {
                  activeNodeTypes.add(entry.type);
                }
                if (panel) panel.setAttribute('data-force-graph-active-types', Array.from(activeNodeTypes).join(','));
                legendDiv.querySelectorAll('[data-node-type]').forEach(function(item) {
                  var type = item.getAttribute('data-node-type') || '';
                  updateLegendChipState(item, activeNodeTypes.has(type));
                });
                hoveredNodeId = null;
                syncGraphVisibility();
              });
              legendDiv.appendChild(chip);
            });

            edgeLegendEntries.forEach(function(entry) {
              var chip = buildLegendChip(entry, 'data-edge-type', activeEdgeTypes.has(entry.type));
              chip.addEventListener('click', function() {
                if (activeEdgeTypes.has(entry.type) && activeEdgeTypes.size === 1) return;
                if (activeEdgeTypes.has(entry.type)) {
                  activeEdgeTypes.delete(entry.type);
                } else {
                  activeEdgeTypes.add(entry.type);
                }
                if (panel) panel.setAttribute('data-force-graph-active-edge-types', Array.from(activeEdgeTypes).join(','));
                legendDiv.querySelectorAll('[data-edge-type]').forEach(function(item) {
                  var type = item.getAttribute('data-edge-type') || '';
                  updateLegendChipState(item, activeEdgeTypes.has(type));
                });
                hoveredNodeId = null;
                syncGraphVisibility();
              });
              legendDiv.appendChild(chip);
            });
          } else {
            legendDiv.innerHTML = '<span style="color:#f87171">\u25cf ' + (i18n['shell.forceGraph.alwaysActive'] || 'Always active') + '</span>'
              + '<span style="color:#60a5fa">\u25cf ' + (i18n['shell.forceGraph.normal'] || 'Normal') + '</span>'
              + '<span style="color:#34d399">\u25cf ' + (i18n['shell.forceGraph.selective'] || 'Selective') + '</span>'
              + '<span style="color:#a78bfa">\u25cf ' + (i18n['shell.forceGraph.regex'] || 'Regex') + '</span>'
              + '<span style="color:#2dd4bf">\u25cf ' + (i18n['shell.forceGraph.luaFunction'] || 'Lua function') + '</span>'
              + '<span style="color:#ec4899">\u25cf ' + (i18n['shell.forceGraph.luaFunctionCore'] || 'Core Lua Function') + '</span>'
              + '<span style="color:#f43f5e">\u25cf ' + (i18n['shell.forceGraph.triggerKeyword'] || 'Trigger Keyword') + '</span>'
              + '<span style="color:#fbbf24">\u25cf ' + (i18n['shell.forceGraph.variable'] || 'Variable') + '</span>';
            legendDiv.insertAdjacentHTML(
              'beforeend',
              '<span style="color:rgba(96,165,250,0.7)">— ' + (i18n['shell.forceGraph.edgeKeyword'] || 'Keyword activation') + '</span>'
              + '<span style="color:rgba(251,191,36,0.7)">— ' + (i18n['shell.forceGraph.edgeVariable'] || 'Variable flow') + '</span>'
              + '<span style="color:rgba(45,212,191,0.78)">— ' + (i18n['shell.forceGraph.edgeLoreDirect'] || 'Lua direct lore access') + '</span>',
            );
          }
          mount.appendChild(legendDiv);
        }

        syncGraphVisibility();
        renderLegend();
      }

      function escapeHtmlForClient(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      setupTabs();
      setupSeverityFilters();
      setupTableFilters();
      setupForceGraphRefresh();
      setupForceGraphControls();
      initCharts();
      initDiagrams();
    })();`;
}
