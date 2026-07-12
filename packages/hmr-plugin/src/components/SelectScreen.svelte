<script lang="ts">
  import { onDestroy } from "svelte";
  import { risuUi } from "../helpers/risu-api";
  import type { HmrController } from "../hmr/controller";
  import type { WizardSelection } from "./selection";

  type Target = {
    key: string;
    label: string;
    description?: string | undefined;
    imagePath?: string | undefined;
    selection: WizardSelection;
  };

  type Props = {
    readonly controller: HmrController;
    readonly kind: "character" | "module";
    readonly projectName: string;
    readonly onSelected: (selection: WizardSelection) => void;
  };
  const { controller, kind, projectName, onSelected }: Props = $props();

  let query = $state("");
  let targets = $state<Target[]>([]);
  let loaded = $state(false);
  const thumbnails = $state<Record<string, string>>({});
  const objectUrls: string[] = [];

  // 썸네일은 목록 로드 직후 일괄 로드 — RisuAI 로컬 RPC라 수용 가능한 비용.
  // 목록이 매우 큰 사용자에게 느리면 IntersectionObserver lazy-load로 전환 검토.
  const loadThumbnail = async (target: Target): Promise<void> => {
    if (!target.imagePath) return;
    if (/^https?:/.test(target.imagePath)) {
      thumbnails[target.key] = target.imagePath;
      return;
    }
    const bytes = await risuUi.readImageBytes(target.imagePath);
    if (!bytes) return;
    // bytes.slice() returns Uint8Array<ArrayBuffer> (fresh allocation), satisfying BlobPart
    // under TS 5.7+ where Uint8Array<ArrayBufferLike> is not assignable to BlobPart.
    const url = URL.createObjectURL(new Blob([bytes.slice()]));
    objectUrls.push(url);
    thumbnails[target.key] = url;
  };

  const load = async (): Promise<void> => {
    loaded = false;
    targets =
      kind === "character"
        ? (await controller.listCharacterTargets()).map((target) => ({
            key: target.chaId,
            label: target.name,
            imagePath: target.image,
            selection: { chaId: target.chaId, label: target.name },
          }))
        : (await controller.listModuleTargets()).map((target) => ({
            key: target.id,
            label: target.name,
            description: target.description,
            selection: { moduleId: target.id, label: target.name },
          }));
    loaded = true;
    for (const target of targets) void loadThumbnail(target);
  };

  const filtered = $derived(
    targets.filter((target) => !query || target.label.toLowerCase().includes(query.toLowerCase())),
  );

  void load();

  onDestroy(() => {
    for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url);
  });
</script>

<section class="screen">
  <header class="screen-head">
    <h2>
      수신할 {kind === "character" ? "캐릭터" : "모듈"} 선택
      {#if loaded}<span class="count-chip">{filtered.length} / {targets.length}</span>{/if}
    </h2>
    <p class="note">워크벤치: "{projectName}" ({kind}) — RisuAI가 DB 권한을 물으면 허용해주세요.</p>
  </header>
  <input placeholder="이름으로 필터…" bind:value={query} />
  <div class="target-list">
    {#each filtered as target (target.key)}
      <button class="target-row" type="button" onclick={() => onSelected(target.selection)}>
        {#if kind === "character" && thumbnails[target.key]}
          <img class="thumb" alt="" src={thumbnails[target.key]} />
        {:else}
          <span class="thumb thumb-fallback" aria-hidden="true">{target.label.slice(0, 1)}</span>
        {/if}
        <span class="target-meta">
          <span class="target-name">{target.label}</span>
          {#if target.description}<span class="target-desc">{target.description}</span>{/if}
        </span>
        <span class="target-go" aria-hidden="true">→</span>
      </button>
    {/each}
    {#if loaded && targets.length === 0}
      <div class="empty-state">
        <p class="note">
          일치하는 대상이 없어요. 처음이라면: ① 워크벤치에서 [Pack] ② RisuAI로 import ③ 아래 새로고침
        </p>
        <button type="button" onclick={() => void load()}>목록 새로고침 ⟳</button>
      </div>
    {/if}
  </div>
</section>
