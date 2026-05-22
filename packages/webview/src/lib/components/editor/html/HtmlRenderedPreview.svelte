<!--
  Sandboxed iframe renderer for .risuhtml preview output.
  @file packages/webview/src/lib/components/editor/html/HtmlRenderedPreview.svelte
-->

<script lang="ts">
  export let srcdoc: string;
  export let sandbox: '' | 'allow-scripts';
</script>

<section class="html-rendered-preview" aria-label="Rendered HTML preview">
  <iframe
    title="Rendered .risuhtml preview"
    {sandbox}
    {srcdoc}
    referrerpolicy="no-referrer"
  ></iframe>
</section>
