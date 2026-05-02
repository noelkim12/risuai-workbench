/**
 * CBS Signature Help Engine
 * Provides function signature hints showing parameter information
 * This module is independent of VS Code API for standalone reusability
 */

import { cbsFunctions, CBSFunctionInfo, getFunctionInfo } from './cbsDatabase';

/**
 * Parameter information for a function
 */
export interface ParameterInfo {
    label: string;              // Parameter name: "name"
    documentation: string;      // Parameter description
}

/**
 * Signature information for a function call
 */
export interface SignatureInfo {
    label: string;              // Full signature: "getvar(name)"
    documentation: string;      // Function description
    parameters: ParameterInfo[];
    activeParameter: number;    // Current parameter index (0-based)
}

/**
 * Function call context extracted from text
 */
interface FunctionCallContext {
    functionName: string;       // Name of the function being called
    argumentText: string;       // Full argument text after ::
    cursorPositionInArgs: number; // Cursor position within arguments
    argumentCount: number;      // Number of arguments entered so far
}

/**
 * CBS Signature Help Engine
 * Analyzes function calls and provides parameter hints
 */
export class CBSSignatureEngine {
    /**
     * Get signature help for current cursor position
     *
     * @param text Full document text
     * @param position Cursor position (character offset)
     * @returns Signature information or null if not in a function call
     */
    public getSignatureHelp(text: string, position: number): SignatureInfo | null {
        const context = this.findFunctionCall(text, position);

        if (!context) {
            return null;
        }

        // Look up function information
        const functionInfo = getFunctionInfo(context.functionName);

        if (!functionInfo) {
            return null;
        }

        // Calculate which parameter is active
        const activeParam = this.calculateActiveParameter(context);

        // Build signature info
        return this.buildSignatureInfo(functionInfo, activeParam);
    }

    /**
     * Find the function call context at cursor position
     * Handles nested CBS expressions
     */
    private findFunctionCall(text: string, position: number): FunctionCallContext | null {
        const beforeCursor = text.substring(0, position);

        // Find the nearest {{ before cursor
        const lastOpenIndex = beforeCursor.lastIndexOf('{{');

        if (lastOpenIndex === -1) {
            return null;
        }

        // Check if we're still inside CBS (no closing }} after {{)
        const afterOpen = text.substring(lastOpenIndex, position);
        const hasClosing = afterOpen.includes('}}');

        if (hasClosing) {
            return null;
        }

        // Extract CBS content
        let cbsContent = afterOpen.substring(2); // Remove {{

        // Remove special prefixes (#, /, :)
        cbsContent = cbsContent.replace(/^[#/:]+/, '');

        // Handle nested function calls by finding the innermost one
        const nestedContext = this.findInnermostFunction(cbsContent, position - lastOpenIndex - 2);

        if (nestedContext) {
            return nestedContext;
        }

        // Parse the main function call
        return this.parseFunctionCall(cbsContent, position - lastOpenIndex - 2);
    }

    /**
     * Find the innermost function call when there are nested expressions
     * Example: {{replace::{{getvar::name}}::old::new}}
     *          If cursor is inside {{getvar::name}}, return that context
     */
    private findInnermostFunction(text: string, cursorPos: number): FunctionCallContext | null {
        let depth = 0;
        let lastOpenPos = -1;

        for (let i = 0; i < Math.min(text.length, cursorPos); i++) {
            if (i < text.length - 1 && text[i] === '{' && text[i + 1] === '{') {
                lastOpenPos = i;
                depth++;
                i++; // Skip next {
            } else if (i < text.length - 1 && text[i] === '}' && text[i + 1] === '}') {
                depth--;
                i++; // Skip next }
            }
        }

        // If we found a nested {{ before cursor
        if (lastOpenPos !== -1 && depth > 0) {
            const nestedContent = text.substring(lastOpenPos + 2);
            const nestedCursorPos = cursorPos - lastOpenPos - 2;

            // Remove special prefixes
            const cleanedContent = nestedContent.replace(/^[#/:]+/, '');
            const prefixLength = nestedContent.length - cleanedContent.length;

            return this.parseFunctionCall(cleanedContent, nestedCursorPos - prefixLength);
        }

        return null;
    }

    /**
     * Parse a function call to extract context
     */
    private parseFunctionCall(cbsContent: string, cursorPos: number): FunctionCallContext | null {
        // Find the first :: separator
        const firstSeparator = cbsContent.indexOf('::');

        if (firstSeparator === -1) {
            // No separator yet, might be typing function name
            return null;
        }

        // Cursor must be after the first ::
        if (cursorPos <= firstSeparator) {
            return null;
        }

        const functionName = cbsContent.substring(0, firstSeparator).trim();
        const argumentText = cbsContent.substring(firstSeparator + 2, cursorPos);
        const cursorPositionInArgs = cursorPos - firstSeparator - 2;

        // Count arguments by counting :: separators in argumentText
        const argumentCount = this.countArguments(argumentText);

        return {
            functionName,
            argumentText,
            cursorPositionInArgs,
            argumentCount
        };
    }

    /**
     * Count how many arguments have been entered
     * Each :: separator adds one argument
     */
    private countArguments(argumentText: string): number {
        if (argumentText.trim() === '') {
            return 0;
        }

        // Count :: separators, but ignore those inside nested {{}}
        let count = 0;
        let depth = 0;

        for (let i = 0; i < argumentText.length - 1; i++) {
            if (argumentText[i] === '{' && argumentText[i + 1] === '{') {
                depth++;
                i++; // Skip next {
            } else if (argumentText[i] === '}' && argumentText[i + 1] === '}') {
                depth--;
                i++; // Skip next }
            } else if (depth === 0 && argumentText[i] === ':' && argumentText[i + 1] === ':') {
                count++;
                i++; // Skip next :
            }
        }

        // We've entered at least one argument (the current one)
        return count;
    }

    /**
     * Calculate which parameter is currently active
     */
    private calculateActiveParameter(context: FunctionCallContext): number {
        // The argument count tells us which parameter we're on
        // Example: "name::value::" → argumentCount = 2 → activeParameter = 1 (0-based)
        return Math.max(0, context.argumentCount);
    }

    /**
     * Build signature information from function info
     */
    private buildSignatureInfo(
        functionInfo: CBSFunctionInfo,
        activeParameter: number
    ): SignatureInfo {
        const parameters: ParameterInfo[] = functionInfo.arguments.map(arg => ({
            label: arg,
            documentation: this.getParameterDocumentation(functionInfo.name, arg)
        }));

        // Build signature label: "functionName(param1, param2, param3)"
        const paramLabels = functionInfo.arguments.join(', ');
        const label = `${functionInfo.name}(${paramLabels})`;

        // Ensure activeParameter doesn't exceed parameter count
        const safeActiveParam = Math.min(activeParameter, parameters.length - 1);

        return {
            label,
            documentation: this.formatFunctionDocumentation(functionInfo),
            parameters,
            activeParameter: Math.max(0, safeActiveParam)
        };
    }

    /**
     * Get documentation for a specific parameter
     * This is a helper that provides context-specific parameter descriptions
     */
    private getParameterDocumentation(functionName: string, paramName: string): string {
        // Common parameter descriptions
        const commonDescriptions: Record<string, string> = {
            'name': '변수 또는 항목의 이름',
            'value': '설정할 값',
            'string': '문자열 값',
            'target': '찾을 대상 문자열',
            'replacement': '대체할 문자열',
            'array': '배열 또는 리스트',
            'index': '배열 인덱스 (0부터 시작)',
            'condition': '조건식 (1 또는 true가 참)',
            'expression': '수학 표현식',
            'format': '날짜/시간 형식 문자열',
            'timestamp': '유닉스 타임스탬프',
            'a': '첫 번째 값',
            'b': '두 번째 값',
            'delimiter': '구분자 문자열',
            'arg1': '첫 번째 인자',
            'arg2': '두 번째 인자',
            'arg3': '세 번째 인자',
            'number': '숫자 값',
            'min': '최소값',
            'max': '최대값',
            'start': '시작 위치',
            'end': '끝 위치',
            'key': '키 이름',
            'prefix': '접두사 문자열',
            'suffix': '접미사 문자열',
            'substring': '부분 문자열',
            'base': '밑수',
            'exponent': '지수',
            'decimals': '소수점 자리수',
            'NdM': '주사위 표기법 (예: 2d6)',
            'hex': '16진수 값',
            'code': '유니코드 코드',
            'size': '크기 값',
            'label': '레이블 텍스트',
            'action': '실행할 동작',
            'text': '텍스트 내용',
            'operator': '연산자 (and, or, is, not 등)',
            'namespace': '네임스페이스 또는 모듈 이름',
            'type': '타입 또는 종류',
            'dict': '딕셔너리/객체',
            'json': 'JSON 데이터',
            'key1': '첫 번째 키',
            'key2': '두 번째 키'
        };

        return commonDescriptions[paramName] || `${paramName} 인자`;
    }

    /**
     * Format function documentation for signature help
     */
    private formatFunctionDocumentation(info: CBSFunctionInfo): string {
        let doc = info.description;

        if (info.example) {
            doc += `\n\n**예제**: \`${info.example}\``;
        }

        return doc;
    }
}
