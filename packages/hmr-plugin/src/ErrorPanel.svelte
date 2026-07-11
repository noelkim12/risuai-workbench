<script lang="ts">
  import { PLUGIN_DISPLAY_NAME } from "./constants/plugin";

  type ErrorPanelProps = {
    readonly message: string;
    readonly onClose: () => Promise<void>;
  };

  const { message, onClose }: ErrorPanelProps = $props();
</script>

<main class="shell" aria-labelledby="error-title">
  <section class="card">
    <div class="header">
      <h1 id="error-title">{PLUGIN_DISPLAY_NAME} could not open</h1>
      <button class="close" type="button" onclick={onClose}>Close</button>
    </div>

    <p class="message">{message}</p>
  </section>
</main>
