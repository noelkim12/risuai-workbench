/** Root-package compatibility DTO for MCP module references. */
export interface MCPModule {
  url: string;
}

/** Root-package compatibility DTO for upstream module-shaped data. */
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
  cjs?: string;
}
