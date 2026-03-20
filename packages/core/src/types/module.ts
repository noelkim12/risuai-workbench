// RisuModule type definitions — extracted from risuai-pork/src/ts/process/modules.ts

export interface MCPModule {
  url: string;
}

export interface RisuModule {
  name: string;
  description: string;
  id: string;
  lorebook?: any[];
  regex?: any[];
  trigger?: any[];
  assets?: [string, string, string][];
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  backgroundEmbedding?: string;
  namespace?: string;
  customModuleToggle?: string;
  mcp?: MCPModule;
  cjs?: string; // 미사용 필드이나 호환성 유지
}
