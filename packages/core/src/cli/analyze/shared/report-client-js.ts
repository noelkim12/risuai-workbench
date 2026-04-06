/** Analyzer report client JS source — extracted IIFE string. */
export function getReportClientJs(): string {
  return `(() => {
      const docRoot = document;
      const i18n = JSON.parse(document.getElementById('report-i18n').textContent || '{}');

      function parseJsonScript(selector, scope) {
        const el = scope.querySelector(selector);
        if (!el) return null;
        try {
          return JSON.parse(el.textContent || 'null');
        } catch {
          return null;
        }
      }

      function setupTabs() {
        const buttons = Array.from(docRoot.querySelectorAll('.tab-button'));
        const sections = Array.from(docRoot.querySelectorAll('.section-card'));
        buttons.forEach((button) => {
          button.addEventListener('click', () => {
            const target = button.getAttribute('data-tab');
            buttons.forEach((item) => item.classList.toggle('active', item === button));
            sections.forEach((section) => {
              const isTarget = section.getAttribute('data-tab') === target;
              if (isTarget) {
                section.classList.add('active');
              } else {
                section.classList.remove('active');
              }
            });
          });
        });
      }

      function setupSeverityFilters() {
        const chips = Array.from(docRoot.querySelectorAll('.sev-chip'));
        const items = Array.from(docRoot.querySelectorAll('[data-severity-item="true"]'));

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
          var payload = parseJsonScript('[data-chart-config]', panel);
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
          const payload = parseJsonScript('[data-diagram-payload]', panel);
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
          if (library === 'force-graph' && typeof payload === 'object') {
            initForceGraph(mount, payload);
            return;
          }
        });
      }

      function initForceGraph(mount, data) {
        if (typeof d3 === 'undefined') { mount.innerHTML = '<p class="diagram-fallback">D3.js failed to load.</p>'; return; }
        var nodes = Array.isArray(data.nodes) ? data.nodes.map(function(n) { return Object.assign({}, n); }) : [];
        var edges = Array.isArray(data.edges) ? data.edges.map(function(e) { return Object.assign({}, e); }) : [];
        if (nodes.length === 0) { mount.innerHTML = '<p class="diagram-fallback">' + (i18n['shell.forceGraph.empty'] || 'No graph data available.') + '</p>'; return; }

        var graphH = Math.max(420, Math.min(nodes.length * 40, 800));
        mount.innerHTML = '';

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

        var g = svg.append('g');

        var zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', function(event) {
          g.attr('transform', event.transform);
        });
        svg.call(zoom);

        var linkGroup = g.append('g');
        var nodeGroup = g.append('g');

        var link = linkGroup.selectAll('line').data(edges).join('line')
          .attr('stroke', function(d) { return d.type === 'variable' ? 'rgba(251,191,36,0.35)' : 'rgba(96,165,250,0.3)'; })
          .attr('stroke-width', 1.2)
          .attr('marker-end', function(d) { return d.type === 'variable' ? 'url(#arrow-var)' : 'url(#arrow-kw)'; });

        var node = nodeGroup.selectAll('g').data(nodes).join('g').attr('cursor', 'grab');

        node.append('circle')
          .attr('r', 14)
          .attr('fill', function(d) { return d.color || '#60a5fa'; })
          .attr('opacity', 0.85)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 2);

        node.append('text')
          .text(function(d) { var l = d.label || d.id; return l.length > 18 ? l.slice(0, 16) + '\u2026' : l; })
          .attr('dy', 28)
          .attr('text-anchor', 'middle')
          .attr('fill', '#eaedf6')
          .attr('font-size', '11px')
          .attr('font-family', 'Inter, system-ui, sans-serif')
          .attr('pointer-events', 'none');

        node.on('mouseenter', function(event, d) {
          var connected = new Set();
          connected.add(d.id);
          edges.forEach(function(e) {
            var sid = typeof e.source === 'object' ? e.source.id : e.source;
            var tid = typeof e.target === 'object' ? e.target.id : e.target;
            if (sid === d.id) connected.add(tid);
            if (tid === d.id) connected.add(sid);
          });
          node.select('circle').attr('opacity', function(n) { return connected.has(n.id) ? 1 : 0.15; });
          node.select('text').attr('opacity', function(n) { return connected.has(n.id) ? 1 : 0.15; });
          link.attr('opacity', function(e) {
            var sid = typeof e.source === 'object' ? e.source.id : e.source;
            var tid = typeof e.target === 'object' ? e.target.id : e.target;
            return (sid === d.id || tid === d.id) ? 1 : 0.08;
          }).attr('stroke-width', function(e) {
            var sid = typeof e.source === 'object' ? e.source.id : e.source;
            var tid = typeof e.target === 'object' ? e.target.id : e.target;
            return (sid === d.id || tid === d.id) ? 2.5 : 1.2;
          });
          d3.select(this).select('circle').attr('stroke', '#fff').attr('r', 18);
        }).on('mouseleave', function() {
          node.select('circle').attr('opacity', 0.85).attr('stroke', 'transparent').attr('r', 14);
          node.select('text').attr('opacity', 1);
          link.attr('opacity', 1).attr('stroke-width', 1.2);
        });

        var simulation = d3.forceSimulation(nodes)
          .force('charge', d3.forceManyBody().strength(-300))
          .force('link', d3.forceLink(edges).id(function(d) { return d.id; }).distance(120))
          .force('center', d3.forceCenter(
            (mount.clientWidth || 720) / 2,
            graphH / 2
          ))
          .force('collide', d3.forceCollide(30))
          .on('tick', function() {
            link
              .attr('x1', function(d) { return d.source.x; })
              .attr('y1', function(d) { return d.source.y; })
              .attr('x2', function(d) { return d.target.x; })
              .attr('y2', function(d) { return d.target.y; });
            node.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
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

        var legendDiv = document.createElement('div');
        legendDiv.className = 'force-graph-legend';
        legendDiv.innerHTML = '<span style="color:#f87171">\u25cf ' + (i18n['shell.forceGraph.alwaysActive'] || 'Always active') + '</span>'
          + '<span style="color:#60a5fa">\u25cf ' + (i18n['shell.forceGraph.normal'] || 'Normal') + '</span>'
          + '<span style="color:#34d399">\u25cf ' + (i18n['shell.forceGraph.selective'] || 'Selective') + '</span>'
          + '<span style="color:#a78bfa">\u25cf ' + (i18n['shell.forceGraph.regex'] || 'Regex') + '</span>'
          + '<span style="color:rgba(96,165,250,0.7)">— ' + (i18n['shell.forceGraph.edgeKeyword'] || 'Keyword activation') + '</span>'
          + '<span style="color:rgba(251,191,36,0.7)">— ' + (i18n['shell.forceGraph.edgeVariable'] || 'Variable flow') + '</span>';
        mount.appendChild(legendDiv);
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
      initCharts();
      initDiagrams();
    })();`;
}
