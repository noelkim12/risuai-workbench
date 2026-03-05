const safeArray = (v) => (Array.isArray(v) ? v : []);

const lineStart = (n) => (n && n.loc && n.loc.start ? n.loc.start.line : 0);

const lineEnd = (n) => (n && n.loc && n.loc.end ? n.loc.end.line : 0);

const lineCount = (n) => {
  const s = lineStart(n);
  const e = lineEnd(n);
  return s > 0 && e >= s ? e - s + 1 : 0;
};

const nodeKey = (n) => (n && Array.isArray(n.range) ? `${n.type}@${n.range[0]}:${n.range[1]}` : `${n && n.type}@${lineStart(n)}:${lineEnd(n)}`);

const callArgs = (n) => (Array.isArray(n && n.arguments) ? n.arguments : Array.isArray(n && n.args) ? n.args : []);

const strLit = (n) => {
  if (!n || typeof n !== "object") return null;
  if (n.type === "StringLiteral") {
    if (typeof n.value === "string") return n.value;
    if (typeof n.raw === "string") {
      const m = n.raw.match(/^['"](.*)['"]$/s);
      return m ? m[1] : n.raw;
    }
    return null;
  }
  if (n.type === "Literal" && typeof n.value === "string") return n.value;
  return null;
};

function exprName(n) {
  if (!n || typeof n !== "object") return null;
  if (n.type === "Identifier") return n.name || null;
  if (n.type === "MemberExpression") {
    const b = exprName(n.base);
    const i = exprName(n.identifier);
    return b && i ? `${b}${n.indexer === ":" ? ":" : "."}${i}` : i || b;
  }
  if (n.type === "IndexExpression") {
    const b = exprName(n.base) || "";
    const idx = exprName(n.index) || strLit(n.index) || "?";
    return `${b}[${idx}]`;
  }
  return null;
}

function assignName(n) {
  return n && n.type === "Identifier" ? n.name : exprName(n);
}

function directCalleeName(callNode) {
  const base = callNode && callNode.base;
  return base && base.type === "Identifier" ? base.name : null;
}

function sanitizeName(name, fallback) {
  const cleaned = String(name || "").toLowerCase().replace(/[\s/]+/g, "_").replace(/[<>:"'`|!?@#$%^&*()+={}\[\],.;~\\]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function toModuleName(name) {
  return String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "module";
}

function prefixOf(name) {
  const head = String(name || "").split(/[.:]/)[0];
  if (!head.includes("_")) return null;
  const p = head.split("_")[0];
  return p.length >= 3 ? p : null;
}

function createMaxBlankRun(lines, total) {
  return (fromLine, toLine) => {
    let run = 0;
    let max = 0;
    for (let i = Math.max(1, fromLine); i <= Math.min(total, toLine); i++) {
      if ((lines[i - 1] || "").trim() === "") {
        run += 1;
        if (run > max) max = run;
      } else run = 0;
    }
    return max;
  };
}

module.exports = {
  safeArray,
  lineStart,
  lineEnd,
  lineCount,
  nodeKey,
  callArgs,
  strLit,
  exprName,
  assignName,
  directCalleeName,
  sanitizeName,
  toModuleName,
  prefixOf,
  createMaxBlankRun,
};
