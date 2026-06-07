(() => {
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
      const mermaidState = new Map();
      let mermaidInitPromise = null;
      let mermaidRenderSequence = 0;

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
                renderVisibleMermaidDiagrams(targetSection);
                renderVisibleForceGraphs(targetSection);
              });
            }
          });
        });
      }

      function isVisibleDiagramPanel(panel, expectedLibrary) {
        if (!(panel instanceof HTMLElement)) return false;
        if (expectedLibrary && panel.getAttribute('data-library') !== expectedLibrary) return false;
        const section = panel.closest('.section-card');
        return !section || section.classList.contains('active');
      }

      function isVisibleMermaidPanel(panel) {
        return isVisibleDiagramPanel(panel, 'mermaid');
      }

      function isVisibleForceGraphPanel(panel) {
        return isVisibleDiagramPanel(panel, 'force-graph');
      }

      const forceGraphState = new Map();
      let activeForceGraphNodeMenu = null;
      let activeForceGraphNodeMenuState = null;

      function closeForceGraphNodeMenu() {
        if (!(activeForceGraphNodeMenu instanceof HTMLElement)) return;
        activeForceGraphNodeMenu.hidden = true;
        activeForceGraphNodeMenu.style.display = 'none';
        activeForceGraphNodeMenu.style.visibility = '';
        activeForceGraphNodeMenu = null;
        activeForceGraphNodeMenuState = null;
      }

      function activateForceGraphNodeMenuAction(event) {
        event.preventDefault();
        event.stopPropagation();
        var menuState = activeForceGraphNodeMenuState ? {
          stateKey: activeForceGraphNodeMenuState.stateKey,
          nodeId: activeForceGraphNodeMenuState.nodeId,
        } : null;
        closeForceGraphNodeMenu();
        if (!menuState) return;
        var state = forceGraphState.get(menuState.stateKey);
        if (state && typeof state.gatherConnectedNodes === 'function') {
          state.gatherConnectedNodes(menuState.nodeId);
        }
      }

      function ensureForceGraphNodeMenu() {
        var existing = document.body && document.body.querySelector('[data-force-graph-node-menu="true"]');
        if (existing instanceof HTMLElement) return existing;
        if (!document.body) return null;
        var menu = document.createElement('div');
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('data-force-graph-node-menu', 'true');
        menu.style.position = 'fixed';
        menu.style.zIndex = '80';
        menu.style.display = 'flex';
        menu.style.flexDirection = 'column';
        menu.style.gap = '6px';
        menu.style.minWidth = '220px';
        menu.style.padding = '8px';
        menu.style.borderRadius = '14px';
        menu.style.border = '1px solid rgba(148, 163, 184, 0.22)';
        menu.style.background = 'rgba(9, 11, 20, 0.96)';
        menu.style.boxShadow = '0 18px 36px rgba(0, 0, 0, 0.42)';
        menu.style.backdropFilter = 'blur(12px)';

        var action = document.createElement('button');
        action.type = 'button';
        action.setAttribute('role', 'menuitem');
        action.setAttribute('data-force-graph-menu-action', 'gather-neighbors');
        action.textContent = i18n['shell.forceGraph.pullConnectedCloser'] || 'Pull connected nodes closer';
        action.style.width = '100%';
        action.style.display = 'inline-flex';
        action.style.alignItems = 'center';
        action.style.justifyContent = 'flex-start';
        action.style.gap = '8px';
        action.style.padding = '10px 12px';
        action.style.borderRadius = '12px';
        action.style.border = '1px solid rgba(148, 163, 184, 0.18)';
        action.style.background = 'rgba(22, 25, 48, 0.5)';
        action.style.color = '#cbd5e1';
        action.style.cursor = 'pointer';
        action.style.fontSize = '0.875rem';
        action.style.fontWeight = '500';
        action.style.textAlign = 'left';
        action.addEventListener('click', activateForceGraphNodeMenuAction);

        menu.appendChild(action);
        document.body.appendChild(menu);
        return menu;
      }

      function openForceGraphNodeMenu(stateKey, nodeId, clientX, clientY) {
        var menu = ensureForceGraphNodeMenu();
        if (!(menu instanceof HTMLElement)) return;
        if (activeForceGraphNodeMenu && activeForceGraphNodeMenu !== menu) {
          closeForceGraphNodeMenu();
        }
        activeForceGraphNodeMenu = menu;
        activeForceGraphNodeMenuState = { stateKey: stateKey, nodeId: nodeId };
        menu.hidden = false;
        menu.style.display = 'flex';
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';
        var menuWidth = menu.offsetWidth || 220;
        var menuHeight = menu.offsetHeight || 52;
        var viewportW = window.innerWidth || docRoot.documentElement.clientWidth || (menuWidth + 24);
        var viewportH = window.innerHeight || docRoot.documentElement.clientHeight || (menuHeight + 24);
        var left = Math.max(12, Math.min(clientX + 10, viewportW - menuWidth - 12));
        var top = Math.max(12, Math.min(clientY + 10, viewportH - menuHeight - 12));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.visibility = 'visible';
      }

      function setupForceGraphNodeMenuDismiss() {
        if (!docRoot.body || docRoot.body.dataset.forceGraphNodeMenuBound === 'true') return;
        docRoot.body.dataset.forceGraphNodeMenuBound = 'true';
        docRoot.addEventListener('pointerdown', function(event) {
          if (!(activeForceGraphNodeMenu instanceof HTMLElement) || activeForceGraphNodeMenu.hidden) return;
          if (activeForceGraphNodeMenu.contains(event.target)) return;
          closeForceGraphNodeMenu();
        }, true);
        docRoot.addEventListener('keydown', function(event) {
          if (event.key !== 'Escape') return;
          if (!(activeForceGraphNodeMenu instanceof HTMLElement) || activeForceGraphNodeMenu.hidden) return;
          event.preventDefault();
          closeForceGraphNodeMenu();
        });
        docRoot.addEventListener('fullscreenchange', function() {
          closeForceGraphNodeMenu();
        });
      }

      function getForceGraphStateKey(panel) {
        return (panel && panel.getAttribute && panel.getAttribute('data-panel-id')) || '';
      }

      function buildForceGraphSignature(payload, panel) {
        var nodes = Array.isArray(payload && payload.nodes) ? payload.nodes : [];
        var edges = Array.isArray(payload && payload.edges) ? payload.edges : [];
        var layout = payload && payload.layout ? JSON.stringify(payload.layout) : '';
        var activeTypes = panel && panel.getAttribute ? (panel.getAttribute('data-force-graph-active-types') || '') : '';
        var activeEdgeTypes = panel && panel.getAttribute ? (panel.getAttribute('data-force-graph-active-edge-types') || '') : '';
        return JSON.stringify({
          nodes: nodes.map(function(node) { return [node.id, node.type, node.groupId || '', node.layoutBand || '']; }),
          edges: edges.map(function(edge) { return [edge.source, edge.target, edge.type, edge.label || '']; }),
          layout: layout,
          activeTypes: activeTypes,
          activeEdgeTypes: activeEdgeTypes,
        });
      }

      function computeForceGraphHeight(panel, nodeCount) {
        var isFullscreen = !!(panel && docRoot.fullscreenElement === panel);
        var base = Math.max(360, Math.min((nodeCount || 0) * 28, 620));
        if (isFullscreen) base = Math.max(base, Math.floor((window.innerHeight || 900) * 0.76));
        return base;
      }

      function ensureForceGraph(panel, mount, payload) {
        if (typeof d3 === 'undefined') { mount.innerHTML = '<p class="diagram-fallback">D3.js failed to load.</p>'; return; }
        var stateKey = getForceGraphStateKey(panel);
        var signature = buildForceGraphSignature(payload, panel);
        var existing = forceGraphState.get(stateKey);
        if (existing && existing.signature === signature && existing.mount === mount && mount.contains(existing.svg && existing.svg.node())) {
          refreshForceGraphViewport(panel, mount);
          return;
        }
        closeForceGraphNodeMenu();
        if (existing && existing.simulation && typeof existing.simulation.stop === 'function') {
          existing.simulation.stop();
        }
        mountForceGraph(panel, mount, payload, stateKey, signature);
      }

      function refreshForceGraphViewport(panel, mount) {
        var stateKey = getForceGraphStateKey(panel);
        var state = forceGraphState.get(stateKey);
        if (!state || !state.svg || state.mount !== mount) return;
        var nextH = computeForceGraphHeight(panel, state.nodes.length);
        if (nextH !== state.graphH) {
          state.graphH = nextH;
          state.svg.attr('height', nextH);
          var cx = (mount.clientWidth || 720) / 2;
          var cy = nextH / 2;
          if (state.simulation && typeof state.simulation.force === 'function') {
            // Recompute per-node anchors against the new viewport. The center/forceX/forceY
            // forces no longer exist — anchors are now per-node via groupX/groupY, so we
            // rebuild them (buildInitialNodePositions preserves live node.x/y and just
            // refreshes __anchorX/__anchorY/__anchorStrength).
            if (state.nodes && state.payload) {
              buildInitialNodePositions(state.nodes, state.payload, cx, cy, nextH);
              if (typeof state.syncAnchorForces === 'function') state.syncAnchorForces();
            }
            state.simulation.alpha(0.15).restart();
          }
        }
      }

      function buildInitialNodePositions(nodes, payload, centerX, centerY, graphH) {
        // Merge lorebook folder groups (from builder) with lua-file groups
        // (auto-detected in mountForceGraph). Both kinds are "pinned clusters"
        // treated symmetrically by the spiral packing + polar ring logic.
        var baseGroups = Array.isArray(payload && payload.groups) ? payload.groups : [];
        var synthGroups = Array.isArray(payload && payload.__syntheticGroups) ? payload.__syntheticGroups : [];
        var groups = baseGroups.concat(synthGroups);
        // Collect pinned-cluster members. A node is pinnable if it has a
        // groupId + groupKind in the pinned-cluster set.
        var PINNABLE_GROUP_KINDS = { 'lorebook-folder': true, 'lua-file': true, 'lua-component': true };
        var folderMembers = new Map();
        var folderLocalIndex = new Map();
        for (var ni = 0; ni < nodes.length; ni++) {
          var n = nodes[ni];
          if (!n.groupId) continue;
          if (!PINNABLE_GROUP_KINDS[n.groupKind]) continue;
          var list = folderMembers.get(n.groupId);
          if (!list) { list = []; folderMembers.set(n.groupId, list); }
          list.push(n);
        }
        folderMembers.forEach(function(list, gid) {
          var isLuaComp = gid.indexOf('lua-comp:') === 0;
          if (isLuaComp) {
            // Sort by (depth asc, in-degree desc, visualRadius desc). The
            // cumulative-area spiral places earlier entries at smaller
            // radius, so depth-0 roots and hubs end up at the cluster
            // center, leaves at the perimeter — a radial flow layout.
            list.sort(function(a, b) {
              var dA = Number.isFinite(a.__componentDepth) ? a.__componentDepth : 99;
              var dB = Number.isFinite(b.__componentDepth) ? b.__componentDepth : 99;
              if (dA !== dB) return dA - dB;
              var inA = a.__luaInDegree || 0;
              var inB = b.__luaInDegree || 0;
              if (inA !== inB) return inB - inA;
              return (b.__visualRadius || 20) - (a.__visualRadius || 20);
            });
          } else {
            list.sort(function(a, b) { return (b.__visualRadius || 20) - (a.__visualRadius || 20); });
          }
          list.forEach(function(member, idx) { folderLocalIndex.set(member.id, idx); });
        });
        var folderMemberCount = new Map();
        folderMembers.forEach(function(list, gid) { folderMemberCount.set(gid, list.length); });

        // Area-weighted folder radius: sum of π × r² for each member, then
        // solve for disc radius (with 1.15 packing slack for corner gaps).
        // This honors large labels (which inflate __visualRadius) instead of
        // assuming a fixed per-node spacing constant.
        var folderRadius = new Map();
        var maxFolderRadius = 0;
        groups.forEach(function(group) {
          var members = folderMembers.get(group.id) || [];
          var discR;
          if (members.length === 0) {
            discR = 40;
          } else {
            var totalArea = 0;
            for (var i = 0; i < members.length; i++) {
              var vr = members[i].__visualRadius || 20;
              totalArea += Math.PI * vr * vr;
            }
            discR = Math.sqrt(totalArea * 1.15 / Math.PI);
          }
          folderRadius.set(group.id, discR);
          if (discR > maxFolderRadius) maxFolderRadius = discR;
        });

        // Non-uniform arc allocation: each folder gets an arc slot
        // proportional to its OWN disc radius (not the max). Previously a
        // single large folder forced every slot to be as big as the biggest,
        // wasting circumference on small folders and inflating ringRadius by
        // ~3× when folder sizes were uneven.
        var groupCount = Math.max(groups.length, 1);
        var GAP_BETWEEN_FOLDERS = 24;
        var perimeterNeeded = 0;
        var groupArcs = groups.map(function(group) {
          var r = folderRadius.get(group.id) || 40;
          var arc = 2 * r + GAP_BETWEEN_FOLDERS; // chord ≈ 2r, plus breathing room
          perimeterNeeded += arc;
          return { id: group.id, arc: arc, r: r };
        });
        var ringFromArc = perimeterNeeded / (2 * Math.PI);
        var ringRadius = Math.max(180, graphH * 0.26, ringFromArc);

        var groupAnchors = new Map();
        // Assign angular slots proportional to per-folder arc length so large
        // folders get wider wedges and small folders pack tightly beside them.
        var cumArc = 0;
        groupArcs.forEach(function(slot, index) {
          var midArc = cumArc + slot.arc / 2;
          var angle = (midArc / perimeterNeeded) * Math.PI * 2;
          // Slight radial stagger so adjacent folder labels never share a
          // tangent line (larger folders stay closest to the base ring).
          var radiusOffset = ((index % 2) ? 1 : -1) * Math.min(slot.r * 0.12, 18);
          groupAnchors.set(slot.id, {
            x: centerX + Math.cos(angle) * (ringRadius + radiusOffset),
            y: centerY + Math.sin(angle) * (ringRadius + radiusOffset),
          });
          cumArc += slot.arc;
        });

        // Expose anchors + folder radii to the simulation via payload slots so
        // the custom cluster force can read them without recomputing.
        payload.__folderAnchors = groupAnchors;
        payload.__folderRadius = folderRadius;
        payload.__folderMemberCount = folderMemberCount;
        payload.__ringRadius = ringRadius;
        // Debug info: inspect via `panel.dataset` in devtools to verify
        // cluster groupings have real data to work with. Counts both lorebook
        // folders and lua-file clusters since either one can carry the layout.
        var lorebookFolderCount = 0;
        var luaFileCount = 0;
        var luaCompCount = 0;
        var totalLb = 0;
        var totalLua = 0;
        var maxClusterSize = 0;
        folderMembers.forEach(function(list, gid) {
          if (gid.indexOf('lua-comp:') === 0) {
            luaCompCount++;
            totalLua += list.length;
          } else if (gid.indexOf('lua-file:') === 0) {
            luaFileCount++;
            totalLua += list.length;
          } else {
            lorebookFolderCount++;
            totalLb += list.length;
          }
          if (list.length > maxClusterSize) maxClusterSize = list.length;
        });
        var totalMembers = totalLb + totalLua;
        payload.__folderDebug = {
          folderCount: lorebookFolderCount,
          luaFileCount: luaFileCount,
          luaComponentCount: luaCompCount,
          clusterCount: lorebookFolderCount + luaFileCount + luaCompCount,
          totalLorebook: totalLb,
          totalLua: totalLua,
          maxFolderSize: maxClusterSize,
          maxFolderShare: totalMembers > 0 ? maxClusterSize / totalMembers : 0,
        };

        var bandRank = { variable: 0, regex: 0, lua: 0, trigger: 0 };
        nodes.forEach(function(node, index) {
          var hasStickyPos = Number.isFinite(node.x) && Number.isFinite(node.y);
          var rank = Number.isFinite(node.layoutRank) ? node.layoutRank : index;
          var jitterX = ((rank * 53) % 17) - 8;
          var jitterY = ((rank * 97) % 17) - 8;

          // UNIFIED PINNED CLUSTER BRANCH: any node with a pinnable groupKind
          // (lorebook-folder, lua-file, lua-component) is hard-pinned using
          // cumulative-area spiral packing. The sort order inside each
          // cluster determines the semantics:
          //   - lorebook-folder / lua-file: biggest label → center
          //   - lua-component: lowest BFS depth → center (flow layout)
          if (node.groupId && PINNABLE_GROUP_KINDS[node.groupKind]) {
            var anchor = groupAnchors.get(node.groupId) || { x: centerX, y: centerY };
            var fRad = folderRadius.get(node.groupId) || 50;
            var localIdx = folderLocalIndex.get(node.id) || 0;
            var members = folderMembers.get(node.groupId) || [];
            var cumArea = 0;
            for (var mi = 0; mi < localIdx; mi++) {
              var prevR = members[mi].__visualRadius || 20;
              cumArea += Math.PI * prevR * prevR;
            }
            var selfR = node.__visualRadius || 20;
            cumArea += Math.PI * selfR * selfR * 0.5;
            var lR = Math.sqrt(cumArea / Math.PI) * 1.18;
            var lAngle = localIdx * 2.39996323;
            var pinX = anchor.x + Math.cos(lAngle) * lR;
            var pinY = anchor.y + Math.sin(lAngle) * lR;
            node.x = pinX;
            node.y = pinY;
            node.fx = pinX;
            node.fy = pinY;
            node.__pinnedByLayout = true;
            node.__anchorX = pinX;
            node.__anchorY = pinY;
            node.__anchorStrength = 0;
            node.__folderRadius = fRad;
            return;
          }

          if (node.layoutBand === 'variable') {
            var vi = bandRank.variable++;
            var vAngle = (vi * 2.4) + 0.3;
            var vR = 30 + (vi % 6) * 10;
            if (!hasStickyPos) {
              node.x = centerX + Math.cos(vAngle) * vR + jitterX * 0.5;
              node.y = centerY + Math.sin(vAngle) * vR + jitterY * 0.5;
            }
            // Variables float toward their connected cluster centroid via
            // link forces, but anchor strength must be strong enough to stop
            // weakly-connected variables from being flung past their host by
            // charge repulsion from the central variable blob. 0.08 keeps
            // orphans near center while still letting highly-connected ones
            // migrate to their folder's perimeter.
            node.__anchorX = centerX;
            node.__anchorY = centerY;
            node.__anchorStrength = 0.08;
            return;
          }
          // (old lorebook-folder-only branch removed; unified branch at the
          // top of this forEach now handles both lorebook folders and
          // lua-file clusters.)
          // Regex and lua nodes float freely — link forces pull each toward
          // the centroid of its connected lorebook/variable neighbors. They
          // used to be locked to an outer ring, which made them look isolated
          // from the clusters they actually belong to. Initial positions are
          // a mid-radius ring near center so they start close to the variable
          // hub and drift outward toward their connected folders during
          // pre-settle ticks. Anchor strength 0.08 matches variable — strong
          // enough that unconnected / weakly-connected nodes do not drift.
          if (node.layoutBand === 'regex') {
            var ri = bandRank.regex++;
            var rAngle = (ri * 2.1) + 0.8;
            var rR = 140 + (ri % 5) * 18;
            if (!hasStickyPos) {
              node.x = centerX + Math.cos(rAngle) * rR + jitterX;
              node.y = centerY + Math.sin(rAngle) * rR + jitterY;
            }
            node.__anchorX = centerX;
            node.__anchorY = centerY;
            node.__anchorStrength = 0.08;
            return;
          }
          if (node.layoutBand === 'lua') {
            // Lua functions that have groupKind='lua-file' (auto-assigned in
            // mountForceGraph when lua is a substantial part of the graph)
            // are handled by the pinning branch at the top of this forEach
            // and never reach here. Unpinned lua (no baseName) falls through
            // to float like variable/regex.
            var ui = bandRank.lua++;
            var uAngle = (ui * 2.4) + Math.PI * 0.3;
            var uR = 110 + (ui % 4) * 22;
            if (!hasStickyPos) {
              node.x = centerX + Math.cos(uAngle) * uR + jitterX;
              node.y = centerY + Math.sin(uAngle) * uR + jitterY;
            }
            node.__anchorX = centerX;
            node.__anchorY = centerY;
            node.__anchorStrength = 0.08;
            return;
          }
          if (node.layoutBand === 'trigger') {
            // Trigger-keyword position is resolved in a SECOND pass below,
            // after lorebook hosts are pinned — satellite clustering needs
            // known host positions to compute the centroid. This placeholder
            // position is only used for nodes with no resolvable hosts.
            var ti = bandRank.trigger++;
            var tAngle = (ti * 1.3) + Math.PI;
            var tR = ringRadius + maxFolderRadius + 80;
            if (!hasStickyPos) {
              node.x = centerX + Math.cos(tAngle) * tR + jitterX;
              node.y = centerY + Math.sin(tAngle) * tR + jitterY;
            }
            node.__anchorX = centerX;
            node.__anchorY = centerY;
            node.__anchorStrength = 0; // satellite force owns trigger layout
            return;
          }
          var fallbackAngle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
          if (!hasStickyPos) {
            node.x = centerX + Math.cos(fallbackAngle) * 80 + jitterX;
            node.y = centerY + Math.sin(fallbackAngle) * 80 + jitterY;
          }
          node.__anchorX = centerX;
          node.__anchorY = centerY;
          node.__anchorStrength = 0.03;
        });

        // SECOND PASS: satellite-place trigger-keyword nodes next to their
        // host lorebook centroid. Uses payload.__triggerHosts (pre-computed
        // in mountForceGraph from keyword edges) + the now-pinned lorebook
        // positions. Gives the simulation a warm start before the satellite
        // force takes over for fine positioning.
        var nodeById = new Map();
        for (var nbi = 0; nbi < nodes.length; nbi++) nodeById.set(nodes[nbi].id, nodes[nbi]);
        var triggerHosts = payload.__triggerHosts;
        if (triggerHosts) {
          var triggerOrbitIndex = 0;
          nodes.forEach(function(node) {
            if (node.layoutBand !== 'trigger') return;
            var hostIds = triggerHosts.get(node.id);
            if (!hostIds || hostIds.length === 0) return;
            var hcx = 0, hcy = 0, hn = 0;
            for (var hi = 0; hi < hostIds.length; hi++) {
              var host = nodeById.get(hostIds[hi]);
              if (!host || !Number.isFinite(host.x)) continue;
              hcx += host.x; hcy += host.y; hn++;
            }
            if (hn === 0) return;
            hcx /= hn; hcy /= hn;
            // Orbital offset so multiple keywords around the same host are
            // not stacked on top of each other. Angle is stable per trigger.
            var orbitR = 38 + Math.min(hn - 1, 4) * 10;
            var orbitA = (triggerOrbitIndex++ * 2.39996323) % (Math.PI * 2);
            node.__orbitAngle = orbitA;
            node.__orbitRadius = orbitR;
            node.x = hcx + Math.cos(orbitA) * orbitR;
            node.y = hcy + Math.sin(orbitA) * orbitR;
            // Anchor the satellite position as a fallback; the dynamic
            // satellite force below will refine it each tick.
            node.__anchorX = node.x;
            node.__anchorY = node.y;
            node.__anchorStrength = 0.15;
          });
        }
      }

      function renderVisibleForceGraphs(scope) {
        const root = scope || docRoot;
        root.querySelectorAll('[data-panel-kind="diagram"][data-library="force-graph"]').forEach((panel) => {
          if (!isVisibleForceGraphPanel(panel)) return;
          const payload = getPanelPayload(panel, 'diagram');
          const mount = panel.querySelector('.diagram-mount');
          if (!mount || payload == null || typeof payload !== 'object') return;
          ensureForceGraph(panel, mount, payload);
        });
      }

      function refreshVisibleForceGraphViewports() {
        docRoot.querySelectorAll('[data-panel-kind="diagram"][data-library="force-graph"]').forEach(function(panel) {
          if (!isVisibleForceGraphPanel(panel)) return;
          var mount = panel.querySelector('.diagram-mount');
          if (!mount) return;
          refreshForceGraphViewport(panel, mount);
        });
      }

      function setupForceGraphRefresh() {
        let rafId = null;
        window.addEventListener('resize', () => {
          if (rafId != null) window.cancelAnimationFrame(rafId);
          rafId = window.requestAnimationFrame(function() {
            refreshVisibleForceGraphViewports();
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
            refreshVisibleForceGraphViewports();
          });
        }

        updateFullscreenButtons();
      }

      function hydrateTables() {
        var bundle = getReportDataBundle();
        if (!bundle || !bundle.panels) return;
        var panels = Array.from(docRoot.querySelectorAll('[data-panel-kind="table"]'));
        panels.forEach(function(panel) {
          var key = panel.getAttribute('data-panel-id');
          if (!key) return;
          var entry = bundle.panels[key];
          if (!entry || entry.kind !== 'table' || !entry.payload) return;
          var tbody = panel.querySelector('tbody[data-report-table-body="true"]');
          if (!tbody) return;
          var rows = Array.isArray(entry.payload.rows) ? entry.payload.rows : [];
          if (rows.length === 0) return;
          var html = rows.map(function(row) {
            var cells = Array.isArray(row.cells) ? row.cells : [];
            var cellHtml = cells.map(function(cell) { return '<td>' + (cell == null ? '' : cell) + '</td>'; }).join('');
            var sourceCell = typeof row.sourceLabelsHtml === 'string'
              ? '<td class="text-text-muted">' + row.sourceLabelsHtml + '</td>'
              : '';
            var severity = row.severity || 'neutral';
            var searchAttr = escapeHtmlForClient(row.searchText || '');
            return '<tr data-search-text="' + searchAttr + '" data-severity-item="true" data-severity="' + escapeHtmlForClient(severity) + '">' + cellHtml + sourceCell + '</tr>';
          }).join('');
          tbody.innerHTML = html;
        });
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
          .text(function(d) { var l = String(d); return l.length > 20 ? l.slice(0, 18) + '…' : l; });

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
        const normalized = String(definition || '').split('\n').map((line) => line.trim()).filter(Boolean);
        const edgeLines = normalized.filter((line) => line.includes('-->'));
        if (edgeLines.length === 0) {
          return '<pre>' + escapeHtmlForClient(definition) + '</pre>';
        }
        const nodes = [];
        edgeLines.forEach((line) => {
          const parts = line.split('-->').map((part) => part.replace(/^flowchart\s+[A-Z]+/i, '').trim()).filter(Boolean);
          parts.forEach((part) => {
            if (part && !nodes.includes(part)) nodes.push(part);
          });
        });
        return '<div class="diagram-flow">' + nodes.map((node, index) => {
          const arrow = index < nodes.length - 1 ? '<span class="diagram-arrow">→</span>' : '';
          return '<div class="diagram-node">' + escapeHtmlForClient(node) + '</div>' + arrow;
        }).join('') + '</div>';
      }

      function getMermaidStateKey(panel) {
        return (panel && panel.getAttribute && panel.getAttribute('data-panel-id')) || '';
      }

      function isStructuredMermaidPayload(payload) {
        return !!payload && typeof payload === 'object' && payload.kind === 'mermaid' && typeof payload.definition === 'string';
      }

      function buildMermaidSignature(payload) {
        if (typeof payload === 'string') return payload;
        if (isStructuredMermaidPayload(payload)) {
          return JSON.stringify({ definition: payload.definition, fallbackText: payload.fallbackText || '' });
        }
        return '';
      }

      function renderMermaidFallback(message, fallbackText) {
        var detail = typeof fallbackText === 'string' && fallbackText.trim()
          ? '<pre>' + escapeHtmlForClient(fallbackText) + '</pre>'
          : '';
        return '<div class="diagram-fallback">' + escapeHtmlForClient(message) + '</div>' + detail;
      }

      function ensureMermaidRuntime() {
        if (mermaidInitPromise) return mermaidInitPromise;
        mermaidInitPromise = Promise.resolve().then(function() {
          var runtime = window.mermaid;
          if (!runtime || typeof runtime.initialize !== 'function' || typeof runtime.render !== 'function') {
            throw new Error('missing-mermaid-runtime');
          }
          runtime.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            maxTextSize: 300000,
            htmlLabels: true,
            flowchart: {
              htmlLabels: true,
              useMaxWidth: false,
            },
          });
          return runtime;
        }).catch(function(error) {
          mermaidInitPromise = null;
          throw error;
        });
        return mermaidInitPromise;
      }

      function renderMermaidPanel(panel, mount, payload) {
        var definition = payload.definition.trim();
        var stateKey = getMermaidStateKey(panel);
        var signature = buildMermaidSignature(payload);
        var existing = mermaidState.get(stateKey);
        if (existing && existing.signature === signature && existing.mount === mount) {
          return existing.promise || Promise.resolve();
        }
        if (!definition) {
          mount.removeAttribute('data-mermaid-runtime');
          mount.innerHTML = renderMermaidFallback(
            i18n['lua.diagram.empty'] || 'No Lua interaction flow was detected for this artifact.',
            payload.fallbackText,
          );
          var emptyPromise = Promise.resolve();
          mermaidState.set(stateKey, { signature: signature, mount: mount, promise: emptyPromise });
          return emptyPromise;
        }

        var renderPromise = ensureMermaidRuntime()
          .then(function(runtime) {
            mermaidRenderSequence += 1;
            var renderId = 'mermaid-' + (stateKey || 'panel') + '-' + mermaidRenderSequence;
            return Promise.resolve(runtime.render(renderId, definition));
          })
          .then(function(result) {
            if (!result || typeof result.svg !== 'string') {
              throw new Error('invalid-mermaid-render-result');
            }
            mount.setAttribute('data-mermaid-runtime', 'true');
            mount.innerHTML = result.svg;
            if (typeof result.bindFunctions === 'function') {
              result.bindFunctions(mount);
            }
          })
          .catch(function(error) {
            mount.removeAttribute('data-mermaid-runtime');
            var message = error && error.message === 'missing-mermaid-runtime'
              ? (i18n['lua.diagram.loadingFailed'] || 'Lua Mermaid diagram payload could not be loaded.')
              : (i18n['lua.diagram.renderFailed'] || 'Lua Mermaid diagram could not be rendered.');
            mount.innerHTML = renderMermaidFallback(message, payload.fallbackText || definition);
          });

        mermaidState.set(stateKey, { signature: signature, mount: mount, promise: renderPromise });
        return renderPromise;
      }

      function renderVisibleMermaidDiagrams(scope) {
        const root = scope || docRoot;
        root.querySelectorAll('[data-panel-kind="diagram"][data-library="mermaid"]').forEach((panel) => {
          const library = panel.getAttribute('data-library') || 'text';
          const payload = getPanelPayload(panel, 'diagram');
          const mount = panel.querySelector('.diagram-mount');
          if (!mount || !isVisibleMermaidPanel(panel)) return;
          if (library === 'mermaid') {
            if (payload == null) {
              mount.removeAttribute('data-mermaid-runtime');
              mount.innerHTML = renderMermaidFallback(
                i18n['lua.diagram.loadingFailed'] || 'Lua Mermaid diagram payload could not be loaded.',
              );
              return;
            }
            var stateKey = getMermaidStateKey(panel);
            var signature = buildMermaidSignature(payload);
            var existing = mermaidState.get(stateKey);
            if (existing && existing.signature === signature && existing.mount === mount) return;
            if (typeof payload === 'string') {
              mount.removeAttribute('data-mermaid-runtime');
              mount.innerHTML = renderSimpleFlow(payload);
              var legacyPromise = Promise.resolve();
              mermaidState.set(stateKey, { signature: signature, mount: mount, promise: legacyPromise });
              return;
            }
            if (isStructuredMermaidPayload(payload)) {
              renderMermaidPanel(panel, mount, payload);
              return;
            }
            mount.removeAttribute('data-mermaid-runtime');
            mount.innerHTML = renderMermaidFallback(
              i18n['lua.diagram.loadingFailed'] || 'Lua Mermaid diagram payload could not be loaded.',
            );
          }
        });
      }

      function renderCytoscapeSummary(payload) {
        const elements = Array.isArray(payload?.elements) ? payload.elements : [];
        const nodeCount = elements.filter((element) => !element?.data?.source && !element?.data?.target).length;
        const edgeCount = elements.filter((element) => element?.data?.source && element?.data?.target).length;
        const edges = elements
          .filter((element) => element?.data?.source && element?.data?.target)
          .map((element) => '<li><code>' + escapeHtmlForClient(String(element.data.source)) + '</code> → <code>' + escapeHtmlForClient(String(element.data.target)) + '</code></li>')
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
          if (library === 'mermaid') {
            return;
          }
          if (library === 'cytoscape' && typeof payload === 'object') {
            mount.innerHTML = renderCytoscapeSummary(payload);
            return;
          }
        });

        renderVisibleMermaidDiagrams();
        renderVisibleForceGraphs();
      }

      function mountForceGraph(panel, mount, payload, stateKey, signature) {
        var isRelationshipNetwork = !!(panel && panel.getAttribute('data-force-graph-mode') === 'relationship-network');
        var nodes = Array.isArray(payload.nodes) ? payload.nodes.map(function(n) { return Object.assign({}, n); }) : [];
        var edges = Array.isArray(payload.edges) ? payload.edges.map(function(e) { return Object.assign({}, e); }) : [];
        if (nodes.length === 0) { mount.innerHTML = '<p class="diagram-fallback">' + (i18n['shell.forceGraph.empty'] || 'No graph data available.') + '</p>'; return; }

        var allNodes = nodes;
        var allEdges = edges;

        var graphH = computeForceGraphHeight(panel, nodes.length);
        var centerX = (mount.clientWidth || 720) / 2;
        var centerY = graphH / 2;
        var positionsCache = new Map();
        // Compute per-node visual footprint BEFORE initial positioning so the
        // spiral packer can size folder discs to actual label bounding boxes.
        // (splitLabelLines / getNodeCircleRadius / computeVisualRadius are
        // function declarations below and are hoisted, so this call is safe.)
        nodes.forEach(function(node) {
          var labelLines = splitLabelLines(node.label || node.id);
          node.__labelLines = labelLines;
          node.__labelWidth = labelLines.reduce(function(max, line) { return Math.max(max, String(line).length); }, 0);
          node.__circleRadius = getNodeCircleRadius(node);
          node.__visualRadius = computeVisualRadius(node, labelLines, node.__labelWidth, node.__circleRadius);
          node.__radius = node.__visualRadius;
          // Pre-compute keyword count for lorebook entries. The Keywords
          // detail string is a comma-separated list; split and count. Used
          // by the 🔑N badge even when trigger-keyword nodes are hidden.
          if (node.groupKind === 'lorebook-folder' && node.details && typeof node.details.Keywords === 'string') {
            node.__keywordCount = node.details.Keywords
              .split(',')
              .map(function(s) { return s.trim(); })
              .filter(Boolean).length;
          } else {
            node.__keywordCount = 0;
          }
        });

        // Promote lua functions to pinned clusters by source file. Node IDs
        // follow `lua-fn:{baseName}:{functionName}`, so we extract baseName
        // and assign groupId/groupKind dynamically (no builder change needed).
        var detectedLuaFileGroups = new Map();
        var luaNodeCount = 0;
        nodes.forEach(function(node) {
          if (node.layoutBand !== 'lua') return;
          luaNodeCount++;
          if (typeof node.id !== 'string' || node.id.indexOf('lua-fn:') !== 0) return;
          // Format: lua-fn:{baseName}:{fnName}
          var rest = node.id.substring('lua-fn:'.length);
          var colonIdx = rest.indexOf(':');
          if (colonIdx <= 0) return;
          var baseName = rest.substring(0, colonIdx);
          var groupId = 'lua-file:' + baseName;
          node.groupId = groupId;
          node.groupKind = 'lua-file';
          if (!detectedLuaFileGroups.has(groupId)) {
            detectedLuaFileGroups.set(groupId, {
              id: groupId,
              kind: 'lua-file',
              label: baseName,
            });
          }
        });

        // LUA FLOW MODE: for cards where a single file holds most of the lua
        // logic (≥50 functions in ≤2 files), file-based grouping is useless —
        // they'd all end up in one mega disc. Instead we reveal internal
        // *flow structure* by computing weakly-connected components of the
        // lua-call graph and laying out each component as a radial dendrogram
        // (BFS depth = radius, parent angle inherited). Each component
        // becomes its own pinned cluster on the polar ring.
        var luaFlowActive = luaNodeCount >= 50 && detectedLuaFileGroups.size <= 2;
        if (luaFlowActive) {
          // Reset the file-based grouping — components will take over.
          detectedLuaFileGroups.clear();
          nodes.forEach(function(n) {
            if (n.groupKind === 'lua-file') { n.groupId = null; n.groupKind = null; }
          });

          // Build directed lua-call adjacency + in-degree.
          var luaOut = new Map();
          var luaIn = new Map();
          edges.forEach(function(e) {
            if (e.type !== 'lua-call') return;
            var s = typeof e.source === 'object' && e.source ? e.source.id : e.source;
            var t = typeof e.target === 'object' && e.target ? e.target.id : e.target;
            if (!luaOut.has(s)) luaOut.set(s, []);
            if (!luaIn.has(t)) luaIn.set(t, []);
            luaOut.get(s).push(t);
            luaIn.get(t).push(s);
          });

          // Gather all lua node ids + quick lookup
          var luaNodeMap = new Map();
          nodes.forEach(function(n) { if (n.layoutBand === 'lua') luaNodeMap.set(n.id, n); });

          // Weakly connected components via undirected traversal
          var visitedComp = new Set();
          var components = [];
          luaNodeMap.forEach(function(_n, id) {
            if (visitedComp.has(id)) return;
            var comp = new Set();
            var stack = [id];
            visitedComp.add(id);
            while (stack.length > 0) {
              var cur = stack.pop();
              comp.add(cur);
              var neigh = (luaOut.get(cur) || []).concat(luaIn.get(cur) || []);
              for (var ni2 = 0; ni2 < neigh.length; ni2++) {
                var nb = neigh[ni2];
                if (!visitedComp.has(nb) && luaNodeMap.has(nb)) {
                  visitedComp.add(nb);
                  stack.push(nb);
                }
              }
            }
            components.push(comp);
          });
          components.sort(function(a, b) { return b.size - a.size; });

          var syntheticLuaGroups = [];
          var orphanMembers = [];

          // Assign BFS depth + in-degree per lua node. Depth = graph-distance
          // from the component's "best root" (core function, else highest
          // in-degree hub). These are consumed by the pinned-cluster sort:
          // nodes with smaller depth land nearer the cluster center in the
          // cumulative-area spiral, while deeper / hub-less nodes spiral out.
          function assignDepthForComponent(comp) {
            var compRoots = [];
            comp.forEach(function(id) {
              var nd = luaNodeMap.get(id);
              if (nd && nd.type === 'lua-function-core') compRoots.push(id);
            });
            if (compRoots.length === 0) {
              // Single hub root: highest in-degree within component.
              // For islands of leaves that all fan into a shared helper,
              // this picks the helper — which then sits at the spiral center
              // and the 36 callers spiral around it.
              var bestId = null, bestIn = -1;
              comp.forEach(function(id) {
                var ins = luaIn.get(id) || [];
                var insideCount = 0;
                for (var pi = 0; pi < ins.length; pi++) {
                  if (comp.has(ins[pi])) insideCount++;
                }
                if (insideCount > bestIn) { bestIn = insideCount; bestId = id; }
              });
              if (bestId) compRoots.push(bestId);
            }
            if (compRoots.length === 0) {
              // Truly disconnected from hierarchy — pick arbitrary member.
              var any = null;
              comp.forEach(function(id) { if (!any) any = id; });
              if (any) compRoots.push(any);
            }
            var depthMap = new Map();
            compRoots.forEach(function(rootId) { depthMap.set(rootId, 0); });
            var q = compRoots.slice();
            while (q.length > 0) {
              var cur = q.shift();
              var d = depthMap.get(cur);
              var neigh = (luaOut.get(cur) || []).concat(luaIn.get(cur) || []);
              for (var ni3 = 0; ni3 < neigh.length; ni3++) {
                var nb = neigh[ni3];
                if (!comp.has(nb) || depthMap.has(nb)) continue;
                depthMap.set(nb, d + 1);
                q.push(nb);
              }
            }
            comp.forEach(function(id) {
              var nd = luaNodeMap.get(id);
              if (!nd) return;
              nd.__componentDepth = depthMap.has(id) ? depthMap.get(id) : 0;
              nd.__luaInDegree = (luaIn.get(id) || []).length;
            });
          }

          components.forEach(function(comp, idx) {
            if (comp.size < 3) {
              comp.forEach(function(id) { orphanMembers.push(id); });
              return;
            }
            var groupId = 'lua-comp:' + idx;
            comp.forEach(function(id) {
              var nd = luaNodeMap.get(id);
              if (!nd) return;
              nd.groupId = groupId;
              nd.groupKind = 'lua-component';
            });
            assignDepthForComponent(comp);
            syntheticLuaGroups.push({
              id: groupId,
              kind: 'lua-component',
              label: 'Flow ' + (idx + 1),
            });
          });

          // Orphan / small-component cluster — members get depth 0
          // so they spiral-pack uniformly with no hierarchy.
          if (orphanMembers.length > 0) {
            var orphanGroupId = 'lua-comp:orphans';
            orphanMembers.forEach(function(id) {
              var nd = luaNodeMap.get(id);
              if (!nd) return;
              nd.groupId = orphanGroupId;
              nd.groupKind = 'lua-component';
              nd.__componentDepth = 0;
              nd.__luaInDegree = (luaIn.get(id) || []).length;
            });
            syntheticLuaGroups.push({
              id: orphanGroupId,
              kind: 'lua-component',
              label: 'Unused (' + orphanMembers.length + ')',
            });
          }

          payload.__syntheticGroups = syntheticLuaGroups;
          payload.__luaFlowActive = true;
        } else {
          payload.__syntheticGroups = Array.from(detectedLuaFileGroups.values());
          payload.__luaFlowActive = false;
        }

        function splitLabelLines(value) {
          var text = String(value || '');
          text = text.replace(/[/]/g, '/​').replace(/_/g, '_​').replace(/ · /g, ' ·​ ');
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

        // Effective visual footprint = circle radius OR circumscribed circle
        // of the label bounding box, whichever is larger. Used by spiral
        // packing, collide force, and fitGraph padding so the layout honors
        // actual on-screen node size (including wrapped labels).
        function computeVisualRadius(node, labelLines, labelWidth, circleRadius) {
          var charW = 6.2;          // px per character (mixed Latin/CJK average)
          var lineH = 11;           // px per label line
          var halfW = labelWidth * charW * 0.5 + 6;
          var halfH = (labelLines.length * lineH) * 0.5 + 6;
          var labelCircleR = Math.hypot(halfW, halfH);
          // Label sits BELOW the circle, so the combined footprint radius is
          // approximately max(circle, label center offset + labelCircleR).
          var labelCenterOffset = circleRadius + halfH + 2;
          var combined = Math.max(circleRadius + 8, labelCenterOffset + 2);
          return Math.max(combined, labelCircleR);
        }

        // Visual-radius forEach was hoisted above buildInitialNodePositions
        // so the spiral packer can use it. See line ~752.

        var hasUserZoomed = false;
        var isApplyingAutoFit = false;
        var hoveredNodeId = null;
        var visibleNodeIds = new Set();

        function getRelationshipEdgeType(type) {
          if (type === 'variable') return 'variable';
          if (type === 'lb-lua-bridge') return 'lb-lua-bridge';
          if (type === 'lua-regex-bridge') return 'lua-regex-bridge';
          if (type === 'lore-direct') return 'lore-direct';
          if (type === 'text-mention') return 'text-mention';
          if (type === 'lua-call') return 'lua-call';
          return 'keyword';
        }

        var legendEntries = [
          { type: 'constant', color: '#f87171', label: i18n['shell.forceGraph.alwaysActive'] || 'Lorebook · Always active' },
          { type: 'keyword', color: '#60a5fa', label: i18n['shell.forceGraph.keyword'] || 'Lorebook · Keyword' },
          { type: 'keywordMulti', color: '#34d399', label: i18n['shell.forceGraph.keywordMulti'] || 'Lorebook · Keyword (multi-key)' },
          { type: 'referenceOnly', color: '#94a3b8', label: i18n['shell.forceGraph.referenceOnly'] || 'Lorebook · Reference-only' },
          { type: 'regex', color: '#a78bfa', label: i18n['shell.forceGraph.regex'] || 'Regex script' },
          { type: 'lua-function', color: '#2dd4bf', label: i18n['shell.forceGraph.luaFunction'] || 'Lua function' },
          { type: 'lua-function-core', color: '#ec4899', label: i18n['shell.forceGraph.luaFunctionCore'] || 'Lua core function' },
          { type: 'variable', color: '#fbbf24', label: i18n['shell.forceGraph.variable'] || 'Variable' },
          { type: 'trigger-keyword', color: '#f43f5e', label: i18n['shell.forceGraph.triggerKeyword'] || 'Trigger keyword' },
        ].filter(function(entry) {
          return allNodes.some(function(node) { return node.type === entry.type; });
        });

        var edgeLegendEntries = [
          { type: 'keyword', color: 'rgba(96,165,250,0.7)', label: i18n['shell.forceGraph.edgeKeyword'] || 'Keyword activation' },
          { type: 'variable', color: 'rgba(251,191,36,0.7)', label: i18n['shell.forceGraph.edgeVariable'] || 'Variable flow' },
          { type: 'lb-lua-bridge', color: 'rgba(16,185,129,0.82)', label: i18n['shell.forceGraph.edgeLbLuaBridge'] || 'Lorebook ↔ Lua bridge' },
          { type: 'lua-regex-bridge', color: 'rgba(168,85,247,0.82)', label: i18n['shell.forceGraph.edgeLuaRegexBridge'] || 'Lua ↔ Regex bridge' },
          { type: 'lore-direct', color: 'rgba(45,212,191,0.78)', label: i18n['shell.forceGraph.edgeLoreDirect'] || 'Lua direct lore access' },
          { type: 'text-mention', color: 'rgba(244,114,182,0.72)', label: i18n['shell.forceGraph.edgeTextMention'] || 'Text mention' },
          { type: 'lua-call', color: 'rgba(129,140,248,0.78)', label: i18n['shell.forceGraph.edgeLuaCall'] || 'Lua call flow' },
        ].filter(function(entry) {
          return edges.some(function(edge) { return getRelationshipEdgeType(edge.type) === entry.type; });
        });

        function getEdgeNodeId(value) {
          return typeof value === 'object' && value ? value.id : value;
        }

        // Node types that are hidden by default in the relationship network
        // panel. Trigger-keyword nodes (and the edge endpoints feeding them)
        // are the #1 source of visual clutter on any lorebook with >50
        // entries, so the first-impression view stays clean. Users can toggle
        // them back on via the legend chips.
        var RELATIONSHIP_DEFAULT_HIDDEN = new Set(['trigger-keyword']);

        function getInitialActiveTypes() {
          var defaultTypes = legendEntries.map(function(entry) { return entry.type; });
          if (!isRelationshipNetwork || !panel) return new Set(defaultTypes);
          var raw = panel.getAttribute('data-force-graph-active-types') || '';
          var requested = raw
            .split(',')
            .map(function(type) { return type.trim(); })
            .filter(Boolean);
          var activeTypes;
          if (requested.length > 0) {
            // User (or previous mount) already made an explicit selection.
            activeTypes = defaultTypes.filter(function(type) { return requested.includes(type); });
          } else {
            // First mount: start with all types except the default-hidden set.
            activeTypes = defaultTypes.filter(function(type) { return !RELATIONSHIP_DEFAULT_HIDDEN.has(type); });
          }
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

        nodes = allNodes.filter(function(node) {
          return !isRelationshipNetwork || activeNodeTypes.has(node.type);
        });
        var visibleNodeIdsForRender = new Set(nodes.map(function(node) { return node.id; }));
        edges = allEdges.filter(function(edge) {
          var sourceId = getEdgeNodeId(edge.source);
          var targetId = getEdgeNodeId(edge.target);
          if (!visibleNodeIdsForRender.has(sourceId) || !visibleNodeIdsForRender.has(targetId)) return false;
          return !isRelationshipNetwork || activeEdgeTypes.has(getRelationshipEdgeType(edge.type));
        });

        // Pre-index trigger-keyword → connected lorebook hosts for satellite
        // clustering. Builder convention: keyword edges run trigger → lb.
        var triggerHosts = new Map();
        for (var ei = 0; ei < edges.length; ei++) {
          var e = edges[ei];
          if (e.type !== 'keyword') continue;
          var sid = typeof e.source === 'object' && e.source ? e.source.id : e.source;
          var tid = typeof e.target === 'object' && e.target ? e.target.id : e.target;
          // Guard either direction just in case.
          var triggerId = null, hostId = null;
          if (typeof sid === 'string' && sid.indexOf('trig:') === 0) { triggerId = sid; hostId = tid; }
          else if (typeof tid === 'string' && tid.indexOf('trig:') === 0) { triggerId = tid; hostId = sid; }
          else continue;
          var hostList = triggerHosts.get(triggerId);
          if (!hostList) { hostList = []; triggerHosts.set(triggerId, hostList); }
          hostList.push(hostId);
        }
        payload.__triggerHosts = triggerHosts;

        buildInitialNodePositions(nodes, payload, centerX, centerY, graphH);
        var nodeById = new Map();
        nodes.forEach(function(nodeData) { nodeById.set(nodeData.id, nodeData); });
        if (isRelationshipNetwork && payload.__folderDebug) {
          var dbg = payload.__folderDebug;
          panel.dataset.forceGraphFolderCount = String(dbg.folderCount);
          panel.dataset.forceGraphLuaFileCount = String(dbg.luaFileCount);
          panel.dataset.forceGraphLuaComponentCount = String(dbg.luaComponentCount);
          panel.dataset.forceGraphLuaFlowActive = String(!!payload.__luaFlowActive);
          panel.dataset.forceGraphClusterCount = String(dbg.clusterCount);
          panel.dataset.forceGraphTotalLorebook = String(dbg.totalLorebook);
          panel.dataset.forceGraphTotalLua = String(dbg.totalLua);
          panel.dataset.forceGraphMaxFolderShare = dbg.maxFolderShare.toFixed(2);
          if (dbg.clusterCount <= 1 || dbg.maxFolderShare > 0.85) {
            // eslint-disable-next-line no-console
            console.warn('[relationship-network] Cluster layout degenerate:', dbg,
              dbg.clusterCount <= 1 ? '(no folder/lua-file structure to cluster by)' : '(one cluster holds >85% of pinnable nodes)');
          }
        }
        mount.innerHTML = '';

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
          // Min scale now matches zoom.scaleExtent (0.3) so oversized graphs
          // can auto-fit fully instead of being clamped and cropped. 0.94
          // multiplier leaves a thin margin without wasting viewport space.
          var scale = Math.max(0.3, Math.min(1.35, 0.94 / Math.max(boundsW / viewportW, boundsH / viewportH)));
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

        function getRelationshipNodeEventData(target) {
          if (!isRelationshipNetwork || !(target instanceof Element)) return null;
          var nodeEl = target.closest('[data-force-graph-node="true"]');
          if (!(nodeEl instanceof SVGGElement)) return null;
          var nodeData = nodeEl.__data__;
          return nodeData && visibleNodeIds.has(nodeData.id) ? nodeData : null;
        }

        var svgEl = svg.node();
        if (svgEl instanceof SVGSVGElement) {
          svgEl.addEventListener('contextmenu', function(event) {
            var nodeData = getRelationshipNodeEventData(event.target);
            if (!nodeData) return;
            event.preventDefault();
            event.stopPropagation();
            openForceGraphNodeMenu(stateKey, nodeData.id, event.clientX, event.clientY);
          }, true);
        }

        var defs = svg.append('defs');
        defs.append('marker').attr('id', 'arrow-kw').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(96,165,250,0.5)');
        defs.append('marker').attr('id', 'arrow-var').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(251,191,36,0.5)');
        defs.append('marker').attr('id', 'arrow-lb-lua-bridge').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(16,185,129,0.6)');
        defs.append('marker').attr('id', 'arrow-lua-regex-bridge').attr('viewBox', '0 -4 8 8')
          .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(168,85,247,0.6)');
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

        // Adaptive label visibility: labels fade out as the graph is zoomed
        // out, revealing cluster structure without letting overlapping text
        // create noise. Scale 0.9+ → fully visible, 0.55 → hidden.
        // Labels fade out as the user zooms OUT so dense clusters become
        // readable without text soup. Range is [0.35, 0.75]: at k=0.55 (common
        // initial fit) labels are ~50% visible, which keeps orientation cues
        // without letting overlapping text dominate. Below k=0.35 labels
        // vanish entirely (cluster overview mode).
        var zoomLabelFactor = 1;
        function computeZoomLabelFactor(k) {
          if (k >= 0.75) return 1;
          if (k <= 0.35) return 0;
          return (k - 0.35) / (0.75 - 0.35);
        }
        function applyZoomLabelOpacity() {
          if (!nodeGroupRef) return;
          nodeGroupRef.selectAll('g').select('text').attr('opacity', function(d) {
            var base = Number.isFinite(d.__labelBaseOpacity) ? d.__labelBaseOpacity : 1;
            return base * zoomLabelFactor;
          });
          // Keyword badges stay visible longer than labels (until k < 0.4)
          // because they're the main signal when labels are hidden.
          var badgeK = Math.max(0, Math.min(1, (Math.max(zoomLabelFactor, 0) + 0.35)));
          nodeGroupRef.selectAll('g.node-keyword-badge').attr('opacity', badgeK);
        }
        var nodeGroupRef = null; // set later, after nodeGroup is created

        var zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', function(event) {
          if (!isApplyingAutoFit) hasUserZoomed = true;
          g.attr('transform', event.transform);
          var nextFactor = computeZoomLabelFactor(event.transform.k);
          if (nextFactor !== zoomLabelFactor) {
            zoomLabelFactor = nextFactor;
            applyZoomLabelOpacity();
          }
        });
        svg.call(zoom);

        var linkGroup = g.append('g');
        var edgeLabelGroup = g.append('g');
        var nodeGroup = g.append('g');
        nodeGroupRef = nodeGroup;

        var link = linkGroup.selectAll('line').data(edges).join('line')
          .attr('stroke', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'variable') return 'rgba(251,191,36,0.35)';
            if (edgeType === 'lb-lua-bridge') return 'rgba(16,185,129,0.5)';
            if (edgeType === 'lua-regex-bridge') return 'rgba(168,85,247,0.5)';
            if (edgeType === 'lore-direct') return 'rgba(45,212,191,0.45)';
            if (edgeType === 'text-mention') return 'rgba(244,114,182,0.38)';
            if (edgeType === 'lua-call') return 'rgba(129,140,248,0.45)';
            return 'rgba(96,165,250,0.3)';
          })
          .attr('stroke-width', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'lb-lua-bridge' || edgeType === 'lua-regex-bridge') return 1.4;
            if (edgeType === 'lua-call') return 1.6;
            if (edgeType === 'text-mention') return 1.0;
            return 1.2;
          })
          .attr('stroke-dasharray', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'lb-lua-bridge') return '2 2';
            if (edgeType === 'lua-regex-bridge') return '3 2';
            if (edgeType === 'text-mention') return '4 3';
            if (edgeType === 'lua-call') return '6 2';
            return 'none';
          })
          .attr('marker-end', function(d) {
            var edgeType = getRelationshipEdgeType(d.type);
            if (edgeType === 'variable') return 'url(#arrow-var)';
            if (edgeType === 'lb-lua-bridge') return 'url(#arrow-lb-lua-bridge)';
            if (edgeType === 'lua-regex-bridge') return 'url(#arrow-lua-regex-bridge)';
            if (edgeType === 'lore-direct') return 'url(#arrow-lore-direct)';
            if (edgeType === 'text-mention') return 'url(#arrow-text-mention)';
            if (edgeType === 'lua-call') return 'url(#arrow-lua-call)';
            return 'url(#arrow-kw)';
          });

        var edgeLabel = edgeLabelGroup.selectAll('text').data(edges.filter(function(e) { return Boolean(e.label); })).join('text')
          .attr('class', 'force-graph-edge-label')
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

        var node = nodeGroup.selectAll('g').data(nodes).join('g')
          .attr('cursor', 'grab')
          .attr('data-force-graph-node', 'true');

        node.append('path')
          .attr('d', function(d) { return getNodeShapePath(d, d.__circleRadius || 18); })
          .attr('fill', function(d) { return d.color || '#60a5fa'; })
          .attr('opacity', 0.85)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 2);

        node.append('title').text(function(d) { return d.label || d.id; });

        var nodeLabel = node.append('text')
          .attr('class', 'force-graph-node-label')
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

        // 🔑N keyword badge on lorebook nodes. Displayed even when
        // trigger-keyword nodes are hidden in the legend, so users can see at
        // a glance which entries react to how many keywords. Click the parent
        // node to see the keyword list in the details dialog.
        var keywordBadge = node.filter(function(d) { return (d.__keywordCount || 0) > 0; })
          .append('g')
          .attr('class', 'node-keyword-badge')
          .attr('pointer-events', 'none')
          .attr('transform', function(d) {
            var r = d.__circleRadius || 18;
            return 'translate(' + (r * 0.8) + ',' + (-r * 0.9) + ')';
          });
        keywordBadge.append('circle')
          .attr('r', 8)
          .attr('fill', '#f43f5e')
          .attr('stroke', '#0c0e1a')
          .attr('stroke-width', 1.5);
        keywordBadge.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', 3)
          .attr('fill', '#fff')
          .attr('font-size', '9px')
          .attr('font-weight', '700')
          .attr('font-family', 'Inter, system-ui, sans-serif')
          .text(function(d) { return '🔑' + d.__keywordCount; });

        function isNodeTypeVisible(nodeData) {
          return !isRelationshipNetwork || activeNodeTypes.has(nodeData.type);
        }

        function isEdgeTypeVisible(edgeData) {
          return !isRelationshipNetwork || activeEdgeTypes.has(getRelationshipEdgeType(edgeData.type));
        }

        function isEdgeVisible(edgeData) {
          var sourceId = getEdgeNodeId(edgeData.source);
          var targetId = getEdgeNodeId(edgeData.target);
          return isEdgeTypeVisible(edgeData) && visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
        }

        function syncGraphVisibility() {
          // Legend chip toggles only affect nodes of the toggled type. We used to
          // switch to a "focus mode" that also hid orphan nodes of other types
          // whenever any chip was disabled, which caused disabling 'trigger-keyword'
          // to unintentionally hide regex/lua nodes that lacked an active edge.
          visibleNodeIds = new Set(nodes.filter(isNodeTypeVisible).map(function(nodeData) { return nodeData.id; }));
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
            var base;
            if (!visibleNodeIds.has(nodeData.id)) base = 0;
            else if (!connected) base = 1;
            else base = connected.has(nodeData.id) ? 1 : 0.15;
            nodeData.__labelBaseOpacity = base;
            return base * zoomLabelFactor;
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

        function gatherConnectedNodes(nodeId) {
          var focusNode = nodeById.get(nodeId);
          if (!focusNode || !visibleNodeIds.has(nodeId)) return;
          if (!Number.isFinite(focusNode.x) || !Number.isFinite(focusNode.y)) return;

          function applyGatherLock(node, targetX, targetY, anchorStrength) {
            node.__anchorX = targetX;
            node.__anchorY = targetY;
            node.__anchorStrength = Math.max(anchorStrength, Number.isFinite(node.__anchorStrength) ? node.__anchorStrength : 0);
            node.x = targetX;
            node.y = targetY;
            node.vx = 0;
            node.vy = 0;
            if (node.__pinnedByLayout || node.fx != null || node.fy != null) {
              node.fx = targetX;
              node.fy = targetY;
            }
          }

          var connectedIds = [];
          edges.forEach(function(edgeData) {
            if (!isEdgeVisible(edgeData)) return;
            var sourceId = getEdgeNodeId(edgeData.source);
            var targetId = getEdgeNodeId(edgeData.target);
            if (sourceId === nodeId && visibleNodeIds.has(targetId)) connectedIds.push(targetId);
            else if (targetId === nodeId && visibleNodeIds.has(sourceId)) connectedIds.push(sourceId);
          });

          var seen = new Set();
          var movableNeighbors = connectedIds
            .map(function(id) { return nodeById.get(id); })
            .filter(function(neighbor) {
              if (!neighbor || seen.has(neighbor.id)) return false;
              seen.add(neighbor.id);
              return true;
            });

          if (movableNeighbors.length === 0) return;

          applyGatherLock(focusNode, focusNode.x, focusNode.y, 0.56);

          var focusVisualRadius = focusNode.__visualRadius || focusNode.__radius || focusNode.__circleRadius || 24;
          var maxNeighborVisualRadius = movableNeighbors.reduce(function(maxRadius, neighbor) {
            var nextRadius = neighbor.__visualRadius || neighbor.__radius || neighbor.__circleRadius || 24;
            return Math.max(maxRadius, nextRadius);
          }, 24);
          var slotGap = 20;
          var ringGap = Math.max(maxNeighborVisualRadius * 0.9, 28);
          var baseRadius = Math.max(focusVisualRadius + maxNeighborVisualRadius + 40, 110);
          var stableNeighbors = movableNeighbors.map(function(neighbor) {
            var dx = neighbor.x - focusNode.x;
            var dy = neighbor.y - focusNode.y;
            var angle = Math.atan2(dy, dx);
            if (!Number.isFinite(angle)) angle = 0;
            return {
              node: neighbor,
              angle: angle,
              visualRadius: neighbor.__visualRadius || neighbor.__radius || neighbor.__circleRadius || 24,
            };
          }).sort(function(a, b) {
            return a.angle - b.angle;
          });
          var angleVectorX = 0;
          var angleVectorY = 0;
          stableNeighbors.forEach(function(entry) {
            angleVectorX += Math.cos(entry.angle);
            angleVectorY += Math.sin(entry.angle);
          });
          var baseAngle = Math.atan2(angleVectorY, angleVectorX);
          if (!Number.isFinite(baseAngle)) baseAngle = 0;
          var rings = [];

          stableNeighbors.forEach(function(entry) {
            var slotWidth = (entry.visualRadius * 2) + slotGap;
            var assignedRing = null;
            rings.forEach(function(ring) {
              if (assignedRing) return;
              var circumference = 2 * Math.PI * ring.radius;
              if ((ring.totalWidth + slotWidth) <= (circumference * 0.92)) {
                assignedRing = ring;
              }
            });
            if (!assignedRing) {
              assignedRing = {
                radius: baseRadius + (rings.length * ((maxNeighborVisualRadius * 2) + ringGap)),
                totalWidth: 0,
                entries: [],
              };
              rings.push(assignedRing);
            }
            assignedRing.entries.push({
              node: entry.node,
              slotWidth: slotWidth,
              visualRadius: entry.visualRadius,
            });
            assignedRing.totalWidth += slotWidth;
          });

          rings.forEach(function(ring, ringIndex) {
            var totalArc = ring.totalWidth / ring.radius;
            var startAngle = baseAngle - (totalArc / 2) + (ringIndex * 0.18);
            var consumedArc = 0;
            ring.entries.forEach(function(entry) {
              var slotArc = entry.slotWidth / ring.radius;
              var angle = startAngle + consumedArc + (slotArc / 2);
              var targetX = focusNode.x + Math.cos(angle) * ring.radius;
              var targetY = focusNode.y + Math.sin(angle) * ring.radius;
              applyGatherLock(entry.node, targetX, targetY, 0.92);
              consumedArc += slotArc;
            });
          });

          syncAnchorForces();
          paintTick(true);
          simulation.alpha(0.72).restart();
          persistPositionsCache();
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
            || valueText.indexOf('\n') >= 0
            || valueText.length > 120;
        }

        node.on('click', function(event, d) {
          closeForceGraphNodeMenu();
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

        var hasAutoFitted = false;
        // rAF-coalesce paintTick so simulation ticks that fire multiple times
        // per animation frame collapse into a single SVG repaint. Keeps paint
        // cost bounded to ~60fps regardless of d3-force internal tick rate.
        var paintRafScheduled = false;
        function paintGraphNow() {
          link
            .attr('x1', function(d) { return d.source.x; })
            .attr('y1', function(d) { return d.source.y; })
            .attr('x2', function(d) { return d.target.x; })
            .attr('y2', function(d) { return d.target.y; });
          edgeLabel
            .attr('x', function(d) { return (d.source.x + d.target.x) / 2; })
            .attr('y', function(d) { return (d.source.y + d.target.y) / 2 - 6; });
          node.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
        }

        function paintTick(immediate) {
          if (immediate) {
            paintGraphNow();
            return;
          }
          if (paintRafScheduled) return;
          paintRafScheduled = true;
          window.requestAnimationFrame(function() {
            paintRafScheduled = false;
            paintGraphNow();
          });
        }
        // positionsCache is only read when the graph settles or a drag ends,
        // so keep its O(n) write out of the paint hot loop.
        function persistPositionsCache() {
          for (var pi = 0; pi < nodes.length; pi++) {
            var pn = nodes[pi];
            positionsCache.set(pn.id, { x: pn.x, y: pn.y, vx: pn.vx, vy: pn.vy });
          }
        }

        // Endpoint-aware link strength. d3-force resolves source/target to
        // node objects before this accessor runs, so we can read layoutBand.
        // Lorebook nodes are position-pinned (fx/fy) so link forces to them
        // only affect the OTHER endpoint — which is exactly what we want:
        // variables/lua/regex get pulled toward their connected lorebook.
        // True when one endpoint is a regex and the other is a variable.
        // Regex ↔ variable ties are information-dense: a regex script reading
        // or writing a variable is the clearest signal of which regex owns
        // which piece of state, so we pull these endpoints tightly together.
        function isRegexVariableEdge(e) {
          var sb = e.source && e.source.layoutBand;
          var tb = e.target && e.target.layoutBand;
          return (sb === 'regex' && tb === 'variable') || (sb === 'variable' && tb === 'regex');
        }

        function linkStrengthFor(e) {
          var sb = e.source && e.source.layoutBand;
          var tb = e.target && e.target.layoutBand;
          if (sb === 'lorebook' && tb === 'lorebook') {
            // Both endpoints pinned → link force is a no-op anyway, but
            // keeping the SVG line visible is still useful.
            return 0.01;
          }
          // Keyword edges (trigger → lorebook) are weak: the satellite force
          // owns trigger-keyword placement, and strong link force would only
          // tangle satellites with long straight chords.
          if (e.type === 'keyword') return 0.05;
          // Regex ↔ variable should stay semantically related, but too much
          // tension makes variable nodes fight manual repositioning and keeps
          // the whole graph overly rigid.
          if (e.type === 'variable' && isRegexVariableEdge(e)) return 0.14;
          // Higher strengths so floating nodes (variable/lua/regex) converge
          // to their connected lorebook centroid in 200-ish pre-settle ticks.
          // These are the forces that do the "variable next to its heavy
          // caller" and "lua next to its host lorebook" placement.
          if (e.type === 'variable') return 0.08;
          if (e.type === 'lb-lua-bridge') return 0.2;
          if (e.type === 'lua-regex-bridge') return 0.18;
          if (e.type === 'text-mention') return 0.32;
          if (e.type === 'lore-direct') return 0.4;
          if (e.type === 'lua-call') return 0.35;
          return 0.3;
        }

        // Satellite cluster force for trigger-keyword nodes. Each trigger is
        // pulled toward (host-centroid + orbital offset) so it reads as a
        // visual satellite of its host lorebook cluster — never flying off to
        // an irrelevant outer ring.
        function forceTriggerSatellite(strength) {
          var simNodes;
          var nodeIndex;
          function initialize(_n) {
            simNodes = _n;
            nodeIndex = new Map();
            for (var i = 0; i < _n.length; i++) nodeIndex.set(_n[i].id, _n[i]);
          }
          function force(alpha) {
            if (!simNodes || !triggerHosts) return;
            var k = alpha * strength;
            for (var i = 0; i < simNodes.length; i++) {
              var tn = simNodes[i];
              if (tn.layoutBand !== 'trigger') continue;
              if (tn.fx != null || tn.fy != null) continue; // user dragged
              var hostIds = triggerHosts.get(tn.id);
              if (!hostIds || hostIds.length === 0) continue;
              var cx = 0, cy = 0, n = 0;
              for (var hi = 0; hi < hostIds.length; hi++) {
                var h = nodeIndex.get(hostIds[hi]);
                if (!h || !Number.isFinite(h.x)) continue;
                cx += h.x; cy += h.y; n++;
              }
              if (n === 0) continue;
              cx /= n; cy /= n;
              var orbitR = Number.isFinite(tn.__orbitRadius) ? tn.__orbitRadius : 42;
              var orbitA = Number.isFinite(tn.__orbitAngle) ? tn.__orbitAngle : 0;
              var targetX = cx + Math.cos(orbitA) * orbitR;
              var targetY = cy + Math.sin(orbitA) * orbitR;
              tn.vx -= (tn.x - targetX) * k;
              tn.vy -= (tn.y - targetY) * k;
            }
          }
          force.initialize = initialize;
          return force;
        }

        function createAnchorForceX() {
          return d3.forceX(function(d) { return Number.isFinite(d.__anchorX) ? d.__anchorX : centerX; })
            .strength(function(d) { return Number.isFinite(d.__anchorStrength) ? d.__anchorStrength : 0.03; });
        }

        function createAnchorForceY() {
          return d3.forceY(function(d) { return Number.isFinite(d.__anchorY) ? d.__anchorY : centerY; })
            .strength(function(d) { return Number.isFinite(d.__anchorStrength) ? d.__anchorStrength : 0.03; });
        }

        // Filter simulation nodes/edges to exclude hidden types so they don't
        // distort the layout. Legend toggles re-mount the graph, so the
        // simulation always reflects the currently-visible set.
        var simNodes = nodes.filter(function(n) { return activeNodeTypes.has(n.type); });
        var visibleNodeIdsForSim = new Set(simNodes.map(function(n) { return n.id; }));
        var simEdges = edges.filter(function(e) {
          var sid = getEdgeNodeId(e.source);
          var tid = getEdgeNodeId(e.target);
          return visibleNodeIdsForSim.has(sid) && visibleNodeIdsForSim.has(tid);
        });

        var simulation = d3.forceSimulation(simNodes)
          .force('charge', d3.forceManyBody()
            .strength(function(d) {
              // Lorebook nodes are pinned, so charge on them is wasted CPU.
              if (d.__pinnedByLayout) return 0;
              if (d.layoutBand === 'trigger') return -260;
              return -160;
            })
            .distanceMax(380))
          .force('link', d3.forceLink(simEdges).id(function(d) { return d.id; })
            .distance(function(e) {
               // Regex ↔ variable still clusters, but with more slack so
               // variable nodes remain repositionable and labels breathe.
          if (e.type === 'variable' && isRegexVariableEdge(e)) return 64;
          if (e.type === 'variable') return 132;
          if (e.type === 'lb-lua-bridge') return 92;
          if (e.type === 'lua-regex-bridge') return 84;
          if (e.type === 'text-mention' || e.type === 'lore-direct') return 100;
              return 55;
            })
            .strength(linkStrengthFor))
          // Per-node anchors for UN-pinned bands (variable/regex/lua/trigger).
          // Pinned lorebook nodes set __anchorStrength=0 so these forces are
          // no-ops on them anyway.
          .force('groupX', createAnchorForceX())
          .force('groupY', createAnchorForceY())
          // No radial force for variable/lua/regex — they are "floaters"
          // whose position comes from link equilibrium with connected pinned
          // lorebook nodes. This makes variable / lua nodes drift toward the
          // heaviest-caller folder automatically (weighted centroid of edges).
          // Only exotic layout bands would need a radial pull; currently none.
          .force('radial', d3.forceRadial(function() { return 0; }, centerX, centerY).strength(0))
          // Satellite clustering for trigger-keyword nodes (Part 2 idea ③).
          .force('triggerSatellite', forceTriggerSatellite(1.1))
          .force('collide', d3.forceCollide(function(d) { return (d.__visualRadius || d.__radius || 24) + 4; }).strength(0.95))
          .alphaDecay(0.04)
          .stop();

        function syncAnchorForces() {
          simulation.force('groupX', createAnchorForceX());
          simulation.force('groupY', createAnchorForceY());
        }

        // Pre-settle the layout invisibly so the first paint is already calm.
        // More pre-ticks so cluster force has time to converge before paint.
        var preTickCount = Math.max(200, Math.min(nodes.length * 5, 500));
        for (var __t = 0; __t < preTickCount; __t++) simulation.tick();
        simulation.on('tick', paintTick).on('end', function() {
          persistPositionsCache();
          if (!hasAutoFitted) {
            if (!hasUserZoomed) fitGraph(true);
            hasAutoFitted = true;
          }
        });

        var MANUAL_VARIABLE_ANCHOR_STRENGTH = 0.16;

        var drag = d3.drag()
          .on('start', function(event, d) {
            closeForceGraphNodeMenu();
            // Lower alphaTarget (was 0.25) so the simulation stays cool during
            // drag. High heat during drag was the dominant source of GPU-compositor
            // pressure bleeding into other browser tabs.
            if (!event.active) simulation.alphaTarget(0.02).restart();
            d.fx = d.x; d.fy = d.y;
            // Hide text nodes + keyword badges for the duration of the drag via
            // a single class toggle on the zoom root. See template.html
            // .force-graph-dragging rules.
            g.classed('force-graph-dragging', true);
          })
          .on('drag', function(event, d) {
            d.fx = event.x; d.fy = event.y;
          })
          .on('end', function(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            // Lorebook nodes are layout-pinned — keep them fixed at the
            // user's drop position rather than releasing. Other bands are
            // released so the force layout can re-settle them.
            if (d.__pinnedByLayout) {
              // fx/fy already equal drag position; leave them.
            } else if (d.layoutBand === 'variable') {
              var dropX = Number.isFinite(event.x) ? event.x : d.x;
              var dropY = Number.isFinite(event.y) ? event.y : d.y;
              d.x = dropX;
              d.y = dropY;
              d.vx = 0;
              d.vy = 0;
              d.__anchorX = dropX;
              d.__anchorY = dropY;
              d.__anchorStrength = Math.max(MANUAL_VARIABLE_ANCHOR_STRENGTH, Number.isFinite(d.__anchorStrength) ? d.__anchorStrength : 0);
              syncAnchorForces();
              d.fx = null;
              d.fy = null;
              simulation.alpha(Math.max(simulation.alpha(), 0.08)).restart();
            } else {
              d.fx = null; d.fy = null;
            }
            g.classed('force-graph-dragging', false);
            persistPositionsCache();
          });
        node.call(drag);
        paintTick();
        fitGraph(false);
        hasAutoFitted = true;

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
                ensureForceGraph(panel, mount, payload);
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
                ensureForceGraph(panel, mount, payload);
              });
              legendDiv.appendChild(chip);
            });
          } else {
            legendDiv.innerHTML = '<span style="color:#f87171">● ' + (i18n['shell.forceGraph.alwaysActive'] || 'Always active') + '</span>'
              + '<span style="color:#60a5fa">● ' + (i18n['shell.forceGraph.keyword'] || 'Keyword') + '</span>'
              + '<span style="color:#34d399">● ' + (i18n['shell.forceGraph.keywordMulti'] || 'Keyword (multi-key)') + '</span>'
              + '<span style="color:#94a3b8">● ' + (i18n['shell.forceGraph.referenceOnly'] || 'Reference-only') + '</span>'
              + '<span style="color:#a78bfa">● ' + (i18n['shell.forceGraph.regex'] || 'Regex') + '</span>'
              + '<span style="color:#2dd4bf">● ' + (i18n['shell.forceGraph.luaFunction'] || 'Lua function') + '</span>'
              + '<span style="color:#ec4899">● ' + (i18n['shell.forceGraph.luaFunctionCore'] || 'Core Lua Function') + '</span>'
              + '<span style="color:#f43f5e">● ' + (i18n['shell.forceGraph.triggerKeyword'] || 'Trigger Keyword') + '</span>'
              + '<span style="color:#fbbf24">● ' + (i18n['shell.forceGraph.variable'] || 'Variable') + '</span>';
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

        forceGraphState.set(stateKey, {
          signature: signature,
          svg: svg,
          simulation: simulation,
          gatherConnectedNodes: gatherConnectedNodes,
          syncAnchorForces: syncAnchorForces,
          zoom: zoom,
          g: g,
          nodes: nodes,
          edges: edges,
          mount: mount,
          graphH: graphH,
          payload: payload,
          positions: positionsCache,
        });
      }

      function escapeHtmlForClient(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      setupTabs();
      hydrateTables();
      setupSeverityFilters();
      setupTableFilters();
      setupForceGraphRefresh();
      setupForceGraphControls();
      setupForceGraphNodeMenuDismiss();
      initCharts();
      initDiagrams();
    })();
