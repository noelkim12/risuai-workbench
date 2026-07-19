declare module '@risuai-workbench/lua-analyzer-wasm' {
  export function analyze_lua(source: string, optionsJson: string): string;
}
