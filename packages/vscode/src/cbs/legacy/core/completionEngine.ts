/**
 * CBS Completion Engine
 * Provides auto-completion logic for CBS functions
 * This module is independent of VS Code API for standalone reusability
 */

import { cbsFunctions, CBSFunctionInfo } from './cbsDatabase';

/**
 * Generic completion item structure (VS Code API agnostic)
 */
export interface CompletionItem {
    label: string;              // Function name: "getvar"
    detail: string;             // Short description: "채팅 변수를 가져옵니다"
    documentation: string;      // Full documentation with examples
    insertText: string;         // Text to insert (with snippet placeholders)
    kind: CompletionKind;       // Function, Keyword, Variable, etc.
    sortText: string;           // Sort priority (lower = higher priority)
}

/**
 * Completion item kinds
 */
export enum CompletionKind {
    Function = 'Function',
    Keyword = 'Keyword',
    Variable = 'Variable',
    Constant = 'Constant'
}

/**
 * Context information for completion
 */
interface CompletionContext {
    isInsideCBS: boolean;       // Inside {{...}}?
    isBlockFunction: boolean;   // After {{#?
    isClosingTag: boolean;      // After {{/?
    isSpecialKeyword: boolean;  // After {{:?
    currentInput: string;       // User's current input
    functionName: string | null;// Current function being typed
}

/**
 * CBS Completion Engine
 * Generates completion suggestions based on cursor position and context
 */
export class CBSCompletionEngine {
    private readonly highPriorityFunctions = new Set([
        'char', 'user', 'getvar', 'setvar', 'random', 'if', 'when',
        'equal', 'greater', 'less', 'calc', 'time', 'date'
    ]);

    /**
     * Get completion suggestions for given text and cursor position
     *
     * @param text Full document text
     * @param position Cursor position (character offset)
     * @param trigger Optional trigger character ('{', '#', ':')
     * @returns Array of completion items
     */
    public getCompletions(
        text: string,
        position: number,
        trigger?: string
    ): CompletionItem[] {
        const context = this.analyzeContext(text, position, trigger);

        if (!context.isInsideCBS && trigger !== '{') {
            return [];
        }

        // Generate completions based on context
        let items: CompletionItem[] = [];

        if (context.isBlockFunction) {
            // Only block functions (#if, #when, #each, etc.)
            items = this.getBlockFunctionCompletions();
        } else if (context.isClosingTag) {
            // Closing tags (suggest matching opening tag)
            items = this.getClosingTagCompletions(text, position);
        } else if (context.isSpecialKeyword) {
            // Special keywords (:else, :each)
            items = this.getSpecialKeywordCompletions();
        } else {
            // All regular functions
            items = this.getAllFunctionCompletions();
        }

        // Filter by current input
        if (context.currentInput) {
            items = this.filterByInput(items, context.currentInput);
        }

        // Sort by priority
        items = this.sortByPriority(items);

        return items;
    }

    /**
     * Analyze context around cursor position
     */
    private analyzeContext(
        text: string,
        position: number,
        trigger?: string
    ): CompletionContext {
        const context: CompletionContext = {
            isInsideCBS: false,
            isBlockFunction: false,
            isClosingTag: false,
            isSpecialKeyword: false,
            currentInput: '',
            functionName: null
        };

        // Find the nearest {{ before cursor
        const beforeCursor = text.substring(0, position);
        const lastOpenIndex = beforeCursor.lastIndexOf('{{');

        if (lastOpenIndex === -1) {
            return context;
        }

        // Check if we're still inside CBS (no closing }} after {{)
        const afterOpen = text.substring(lastOpenIndex, position);
        const hasClosing = afterOpen.includes('}}');

        if (hasClosing) {
            return context;
        }

        context.isInsideCBS = true;

        // Extract content after {{
        const cbsContent = afterOpen.substring(2); // Remove {{
        context.currentInput = cbsContent;

        // Check for special prefixes
        if (cbsContent.startsWith('#')) {
            context.isBlockFunction = true;
            context.currentInput = cbsContent.substring(1);
        } else if (cbsContent.startsWith('/')) {
            context.isClosingTag = true;
            context.currentInput = cbsContent.substring(1);
        } else if (cbsContent.startsWith(':')) {
            context.isSpecialKeyword = true;
            context.currentInput = cbsContent.substring(1);
        }

        // Extract function name (before :: or space)
        const separatorIndex = cbsContent.indexOf('::');
        const spaceIndex = cbsContent.indexOf(' ');
        let nameEndIndex = cbsContent.length;

        if (separatorIndex !== -1 && (spaceIndex === -1 || separatorIndex < spaceIndex)) {
            nameEndIndex = separatorIndex;
        } else if (spaceIndex !== -1) {
            nameEndIndex = spaceIndex;
        }

        context.functionName = cbsContent.substring(0, nameEndIndex).replace(/^[#/:]+/, '').trim();

        return context;
    }

    /**
     * Get all regular function completions
     */
    private getAllFunctionCompletions(): CompletionItem[] {
        const items: CompletionItem[] = [];
        const processed = new Set<string>();

        for (const [key, info] of cbsFunctions) {
            // Skip duplicates (aliases point to same function)
            if (processed.has(info.name)) {
                continue;
            }
            processed.add(info.name);

            // Skip block functions (they start with #)
            if (info.name.startsWith('#') || info.name.startsWith(':')) {
                continue;
            }

            items.push(this.createCompletionItem(info));
        }

        return items;
    }

    /**
     * Get block function completions ({{#...}})
     */
    private getBlockFunctionCompletions(): CompletionItem[] {
        const blockFunctions = ['if', 'if_pure', 'when', 'each', 'pure', 'puredisplay'];
        const items: CompletionItem[] = [];

        for (const funcName of blockFunctions) {
            const info = cbsFunctions.get('#' + funcName);
            if (info) {
                items.push(this.createCompletionItem(info, true));
            }
        }

        return items;
    }

    /**
     * Get closing tag completions ({{/...}})
     */
    private getClosingTagCompletions(text: string, position: number): CompletionItem[] {
        // Find unclosed opening tags
        const openTags = this.findUnclosedTags(text, position);
        const items: CompletionItem[] = [];

        for (const tagName of openTags) {
            items.push({
                label: tagName,
                detail: `${tagName} 블록 닫기`,
                documentation: `{{#${tagName}}} 블록을 닫습니다`,
                insertText: tagName + '}}',
                kind: CompletionKind.Keyword,
                sortText: '0'
            });
        }

        return items;
    }

    /**
     * Find unclosed opening tags before cursor
     */
    private findUnclosedTags(text: string, position: number): string[] {
        const beforeCursor = text.substring(0, position);
        const stack: string[] = [];

        // Match all {{#functionName}} and {{/functionName}}
        const openRegex = /\{\{#(\w+)/g;
        const closeRegex = /\{\{\/(\w+)/g;

        let match: RegExpExecArray | null;

        // Find all opening tags
        while ((match = openRegex.exec(beforeCursor)) !== null) {
            stack.push(match[1]);
        }

        // Remove closing tags
        while ((match = closeRegex.exec(beforeCursor)) !== null) {
            const tagName = match[1];
            const lastIndex = stack.lastIndexOf(tagName);
            if (lastIndex !== -1) {
                stack.splice(lastIndex, 1);
            }
        }

        return stack.reverse(); // Most recent unclosed tag first
    }

    /**
     * Get special keyword completions ({{:...}})
     */
    private getSpecialKeywordCompletions(): CompletionItem[] {
        const keywords = ['else', 'each'];
        const items: CompletionItem[] = [];

        for (const keyword of keywords) {
            const info = cbsFunctions.get(keyword) || cbsFunctions.get(':' + keyword);
            if (info) {
                items.push({
                    label: keyword,
                    detail: info.description,
                    documentation: this.formatDocumentation(info),
                    insertText: keyword + '}}',
                    kind: CompletionKind.Keyword,
                    sortText: '0'
                });
            }
        }

        return items;
    }

    /**
     * Create completion item from function info
     */
    private createCompletionItem(info: CBSFunctionInfo, isBlock: boolean = false): CompletionItem {
        const label = info.name.replace(/^#/, '');
        const hasArgs = info.arguments.length > 0;

        // Generate snippet text with placeholders
        let insertText = label;

        if (hasArgs) {
            const placeholders = info.arguments.map((arg, idx) => `\${${idx + 1}:${arg}}`).join('::');
            insertText = `${label}::${placeholders}`;
        }

        if (isBlock) {
            // Block function: {{#when ${1:condition}}}${2:content}{{/when}}$0
            const contentPlaceholder = hasArgs ? info.arguments.length + 1 : 1;
            insertText = `${label}`;
            if (hasArgs) {
                insertText += ' ' + info.arguments.map((arg, idx) => `\${${idx + 1}:${arg}}`).join(' ');
            }
            insertText += `}}\n\${${contentPlaceholder}:content}\n{{/${label}}}\$0`;
        } else if (hasArgs) {
            insertText += '}}\$0';
        } else {
            insertText += '}}\$0';
        }

        return {
            label: label,
            detail: info.description,
            documentation: this.formatDocumentation(info),
            insertText: insertText,
            kind: isBlock ? CompletionKind.Keyword : CompletionKind.Function,
            sortText: this.getSortText(label)
        };
    }

    /**
     * Format function documentation with examples
     */
    private formatDocumentation(info: CBSFunctionInfo): string {
        let doc = info.description + '\n\n';

        if (info.arguments.length > 0) {
            doc += '**인자**:\n';
            info.arguments.forEach(arg => {
                doc += `- \`${arg}\`\n`;
            });
            doc += '\n';
        }

        if (info.example) {
            doc += `**예제**: \`${info.example}\`\n\n`;
        }

        if (info.aliases.length > 0) {
            doc += `**별칭**: ${info.aliases.join(', ')}`;
        }

        return doc;
    }

    /**
     * Get sort text for priority ordering
     */
    private getSortText(label: string): string {
        if (this.highPriorityFunctions.has(label.toLowerCase())) {
            return '0_' + label;
        }
        return '1_' + label;
    }

    /**
     * Filter completion items by user input
     */
    private filterByInput(items: CompletionItem[], input: string): CompletionItem[] {
        const lowerInput = input.toLowerCase().trim();

        if (!lowerInput) {
            return items;
        }

        return items.filter(item => {
            const label = item.label.toLowerCase();

            // Exact match or starts with
            if (label === lowerInput || label.startsWith(lowerInput)) {
                return true;
            }

            // Contains (for partial matching)
            if (label.includes(lowerInput)) {
                return true;
            }

            // Check aliases (from documentation)
            if (item.documentation.toLowerCase().includes(lowerInput)) {
                return true;
            }

            return false;
        });
    }

    /**
     * Sort items by priority
     */
    private sortByPriority(items: CompletionItem[]): CompletionItem[] {
        return items.sort((a, b) => {
            // Primary sort: by sortText
            if (a.sortText !== b.sortText) {
                return a.sortText.localeCompare(b.sortText);
            }

            // Secondary sort: alphabetically
            return a.label.localeCompare(b.label);
        });
    }
}
