export const ROOT_ATTR = 'x-workbench-hmr-preview';
const R = `[${ROOT_ATTR}]`;

export const PREVIEW_CSS = `
${R} {
  --bg:#000000; --surface:#181818; --raised:#202020; --line:#202020; --line-strong:#313131;
  --ink:#ffffff; --smoke:#f5f5f5; --muted:#969696; --gold:#ffc000; --gold-dark:#917300;
  --gold-text:#ffce3e; --red:#e05252; --green:#3fb950; --ghost-border:rgba(255,255,255,.5);
  --mono:ui-monospace,"Cascadia Mono","JetBrains Mono","SFMono-Regular",Menlo,Consolas,monospace;
  position:fixed; inset:0; z-index:2147483646; display:grid; place-items:center; padding:16px;
  background:rgba(0,0,0,.7); color:var(--ink); color-scheme:dark;
  font:14px/1.5 "Helvetica Neue",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
}
${R}, ${R} * { box-sizing:border-box; }
${R} [data-hmr-dialog] { width:min(880px,100%); max-height:calc(100dvh - 32px); min-height:0; display:flex; flex-direction:column; overflow:hidden; background:var(--surface); border:1px solid var(--line-strong); }
${R} [data-hmr-part] { min-width:0; padding:20px 24px; }
${R} [data-hmr-part="header"], ${R} [data-hmr-part="footer"] { flex:none; }
${R} [data-hmr-part="body"] { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain; background:var(--bg); border-block:1px solid var(--line-strong); scrollbar-width:thin; }
${R} [data-hmr-heading], ${R} [data-hmr-footer-actions], ${R} [data-hmr-modes] { display:flex; align-items:center; gap:10px; }
${R} [data-hmr-heading] { justify-content:space-between; }
${R} [data-hmr-footer-actions] { justify-content:flex-end; flex-wrap:wrap; margin-top:12px; }
${R} [data-hmr-modes] { flex-wrap:wrap; }
${R} h2 { margin:0; font-size:1.35rem; font-weight:400; letter-spacing:.04em; }
${R} p { margin:8px 0; overflow-wrap:anywhere; }
${R} [data-hmr-eyebrow] { color:var(--muted); font-size:.63rem; letter-spacing:.18em; }
${R} [data-hmr-target] { font-family:var(--mono); overflow-wrap:anywhere; }
${R} [data-hmr-note] { color:var(--muted); font-size:.85rem; }
${R} button { min-height:44px; padding:10px 16px; margin:0; border:1px solid var(--ghost-border); border-radius:0; background:transparent; color:var(--ink); font:inherit; cursor:pointer; }
${R} button:hover:not(:disabled), ${R} button[aria-pressed="true"] { background:var(--raised); }
${R} button[aria-pressed="true"] { border-color:var(--ink); }
${R} button:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
${R} button:disabled { opacity:.4; cursor:not-allowed; }
${R} [data-hmr-primary] { background:var(--gold); color:var(--bg); border-color:var(--gold); }
${R} [data-hmr-primary]:hover:not(:disabled) { background:var(--gold-dark); color:var(--ink); }
${R} [data-hmr-fields] { list-style:none; margin:0; padding:0; }
${R} [data-hmr-action="details"] { display:flex; justify-content:space-between; gap:12px; width:100%; text-align:left; border:0; border-bottom:1px solid var(--line); overflow-wrap:anywhere; font-family:var(--mono); }
${R} [data-hmr-lines] { margin:8px 0; padding:8px 10px; overflow:auto; max-height:240px; white-space:pre; font:12px/1.55 var(--mono); border:1px solid var(--line-strong); }
${R} [data-hmr-line] { display:block; min-width:max-content; }
${R} [data-hmr-line="added"] { background:rgba(63,185,80,.12); }
${R} [data-hmr-line="removed"] { background:rgba(224,82,82,.12); }
${R} [data-hmr-kind="added"] { color:var(--green); }
${R} [data-hmr-kind="removed"], ${R} [data-hmr-error] { color:var(--red); }
${R} [data-hmr-kind="modified"] { color:var(--gold-text); }
${R} [data-hmr-entry] { margin:8px 0 8px 12px; padding-left:12px; border-left:1px solid var(--line-strong); }
@media (max-width:480px) {
  ${R} { padding:8px; }
  ${R} [data-hmr-dialog] { width:100%; max-height:calc(100dvh - 16px); }
  ${R} [data-hmr-part] { padding:12px; }
  ${R} [data-hmr-modes] button { flex:1; }
}
`;
