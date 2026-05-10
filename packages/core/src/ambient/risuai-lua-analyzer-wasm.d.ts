declare module '@risuai/lua-analyzer-wasm' {
  export function analyze_lua(source: string, optionsJson: string): string;
}
