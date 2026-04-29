<script lang="ts">
  export let label: string;
  export let tone: 'default' | 'warning' | 'flag' = 'default';
  export let title: string | undefined = undefined;
</script>

<span class={`tag-chip tag-chip--${tone}`} {title}>{label}</span>
