import './styles.css';

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'pong' };

type OutgoingMessage =
  | { type: 'webview-ready' }
  | { type: 'ping' };

type VsCodeApi = {
  postMessage(message: OutgoingMessage): void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const vscode = window.acquireVsCodeApi?.();

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root for Risu Workbench webview.');
}

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Risu Workbench / Webview</p>
      <h1>Vite 8-powered panel is live.</h1>
      <p class="lede">
        The extension host stays TypeScript-first, while the webview now ships as a fast,
        dedicated browser bundle.
      </p>
    </section>

    <section class="grid">
      <article class="card card--signal">
        <span class="card-label">Bridge</span>
        <strong id="status-text">Waiting for extension handshake…</strong>
        <button id="ping-button" type="button">Ping extension host</button>
      </article>

      <article class="card">
        <span class="card-label">Build path</span>
        <strong>packages/webview → packages/vscode/dist/webview</strong>
        <p>Vite owns browser assets. The extension just serves the finished bundle.</p>
      </article>

      <article class="card">
        <span class="card-label">Why this split</span>
        <strong>Faster front-end iteration without disturbing VS Code runtime constraints</strong>
        <p>That keeps CommonJS extension code stable while moving UI work onto modern tooling.</p>
      </article>
    </section>
  </main>
`;

const statusText = document.querySelector<HTMLElement>('#status-text');
const pingButton = document.querySelector<HTMLButtonElement>('#ping-button');

pingButton?.addEventListener('click', () => {
  vscode?.postMessage({ type: 'ping' });
  setStatus('Ping sent to extension host.');
});

window.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
  if (event.data.type === 'ready') {
    setStatus('Extension host connected.');
  }

  if (event.data.type === 'pong') {
    setStatus('Round-trip confirmed.');
  }
});

vscode?.postMessage({ type: 'webview-ready' });

function setStatus(text: string): void {
  if (statusText) {
    statusText.textContent = text;
  }
}
