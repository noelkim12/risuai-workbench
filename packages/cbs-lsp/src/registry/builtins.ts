export interface CBSBuiltinFunction {
  name: string
  aliases: string[]
  description: string
  descriptionKo?: string
  arguments: ArgumentDef[]
  isBlock: boolean
  deprecated?: { message: string; replacement?: string }
  internalOnly?: boolean
  returnType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'void'
  category: FunctionCategory
}

export interface ArgumentDef {
  name: string
  description: string
  required: boolean
  variadic: boolean
}

export type FunctionCategory =
  | 'identity' // char, user, personality, etc.
  | 'prompt' // mainprompt, jb, globalnote, etc.
  | 'history' // previouscharchat, lastmessage, etc.
  | 'time' // date, time, unixtime, etc.
  | 'variable' // getvar, setvar, tempvar, etc.
  | 'comparison' // equal, greater, and, or, etc.
  | 'math' // calc, round, floor, ?, etc.
  | 'string' // replace, split, join, trim, etc.
  | 'array' // arraypush, makearray, element, etc.
  | 'random' // random, pick, randint, dice, etc.
  | 'encoding' // xor, crypt, unicode, hex, etc.
  | 'display' // br, button, tex, ruby, etc.
  | 'escape' // bo, bc, decbo, decbc, etc.
  | 'asset' // asset, emotion, audio, bg, etc.
  | 'block' // #when, #each, #escape, etc.
  | 'utility' // metadata, module_enabled, hash, etc.

export class CBSBuiltinRegistry {
  private functions = new Map<string, CBSBuiltinFunction>()
  private aliasMap = new Map<string, string>() // alias → canonical name

  constructor() {
    this.registerAll()
  }

  get(name: string): CBSBuiltinFunction | undefined {
    const canonical = this.aliasMap.get(name) ?? name
    return this.functions.get(canonical)
  }

  getAll(): CBSBuiltinFunction[] {
    return Array.from(this.functions.values())
  }

  getByCategory(category: FunctionCategory): CBSBuiltinFunction[] {
    return this.getAll().filter((f) => f.category === category)
  }

  has(name: string): boolean {
    return this.functions.has(name) || this.aliasMap.has(name)
  }

  getSuggestions(partial: string): CBSBuiltinFunction[] {
    const lower = partial.toLowerCase()
    return this.getAll().filter(
      (f) =>
        f.name.toLowerCase().startsWith(lower) ||
        f.aliases.some((a) => a.toLowerCase().startsWith(lower))
    )
  }

  private register(fn: CBSBuiltinFunction): void {
    this.functions.set(fn.name, fn)
    for (const alias of fn.aliases) {
      this.aliasMap.set(alias, fn.name)
    }
  }

  private registerAll(): void {
    // TODO: Register all 107+ functions extracted from cbs.ts
    // See docs/cbs_lsp/extracted_functions.md for full list
    //
    // This data will be populated from the extracted function registry.
    // Each function should have accurate argument counts, descriptions,
    // and deprecation status matching the original cbs.ts implementation.
  }
}
