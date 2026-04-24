/**
 * CBS Formatter - CBS 구문을 위한 핵심 포맷팅 로직
 * 웹 환경에서도 독립적으로 사용 가능
 */

import { CBSParser, CBSBlock } from './parser';

/**
 * 포맷터 옵션 인터페이스
 */
export interface FormatterOptions {
    /** 들여쓰기 크기 (스페이스 개수 또는 탭 개수) */
    indentSize: number;
    /** 들여쓰기 스타일: 'space'(공백) 또는 'tab'(탭) */
    indentStyle: 'space' | 'tab';
    /** 마크다운 구문 보존 여부 (예: # 헤더) */
    preserveMarkdown: boolean;
    /** 함수 인자 정렬 여부 (:: 주변 공백 추가) */
    alignArguments: boolean;
}

/**
 * 기본 포맷터 옵션
 */
export const defaultFormatterOptions: FormatterOptions = {
    indentSize: 4,
    indentStyle: 'space',
    preserveMarkdown: true,
    alignArguments: false
};

/**
 * CBS 포맷터 클래스
 * CBS 구문의 들여쓰기와 포맷팅을 처리합니다
 */
export class CBSFormatter {
    private options: FormatterOptions;

    /**
     * CBS 포맷터 생성자
     * @param options 포맷터 옵션 (일부만 제공해도 기본값과 병합됨)
     */
    constructor(options: Partial<FormatterOptions> = {}) {
        this.options = { ...defaultFormatterOptions, ...options };
    }

    /**
     * 텍스트를 포맷팅합니다
     * @param text 포맷팅할 CBS 코드
     * @returns 포맷팅된 텍스트
     */
    format(text: string): string {
        const parser = new CBSParser(text);
        const { blocks, errors } = parser.parse();

        if (errors.length > 0) {
            // 파싱 오류가 있으면 원본 텍스트를 반환하여 추가 손상 방지
            console.warn('CBS parsing errors detected:', errors);
            return text;
        }

        return this.formatText(text, blocks);
    }

    /**
     * 텍스트와 블록 정보를 사용하여 포맷팅을 수행합니다
     * @param text 원본 텍스트
     * @param blocks 파싱된 CBS 블록 배열
     * @returns 포맷팅된 텍스트
     */
    private formatText(text: string, blocks: CBSBlock[]): string {
        const lines = text.split('\n');
        const result: string[] = [];
        let currentIndent = 0;
        let i = 0;

        // 블록 마커가 있는 줄들을 추적
        const blockLines = this.mapBlocksToLines(text, blocks);

        for (const line of lines) {
            const trimmed = line.trim();

            // 빈 줄은 그대로 유지
            if (trimmed === '') {
                result.push('');
                i++;
                continue;
            }

            // 블록 닫기 태그가 있으면 들여쓰기 감소 ({{/if}}, {{/when}} 등)
            if (this.hasBlockClose(trimmed)) {
                currentIndent = Math.max(0, currentIndent - 1);
            }

            // 현재 들여쓰기 레벨에 맞게 줄 포맷팅
            const indent = this.getIndent(currentIndent);
            const formatted = this.formatLine(trimmed, indent);
            result.push(formatted);

            // 블록 열기 태그가 있으면 다음 줄부터 들여쓰기 증가 ({{#if}}, {{#when}} 등)
            if (this.hasBlockOpen(trimmed)) {
                currentIndent++;
            }

            i++;
        }

        return result.join('\n');
    }

    /**
     * 개별 줄을 포맷팅합니다
     * @param line 트림된 줄 텍스트
     * @param indent 적용할 들여쓰기 문자열
     * @returns 포맷팅된 줄
     */
    private formatLine(line: string, indent: string): string {
        // 마크다운 헤더는 수정하지 않음 (#으로 시작하는 줄)
        if (line.startsWith('#') && this.options.preserveMarkdown) {
            return indent + line;
        }

        // CBS 표현식 포맷팅
        let formatted = line;

        // :: 주변 공백 정규화 (alignArguments 옵션이 활성화된 경우)
        if (this.options.alignArguments) {
            formatted = formatted.replace(/::/g, ' :: ');
            // 추가 공백 제거하여 일관성 유지
            formatted = formatted.replace(/\s+::\s+/g, ' :: ');
        }

        // 중괄호 내부 공백 정규화
        // {{  function}} → {{function}}
        formatted = formatted.replace(/\{\{\s+/g, '{{');
        // {{function  }} → {{function}}
        formatted = formatted.replace(/\s+\}\}/g, '}}');

        return indent + formatted;
    }

    /**
     * 줄에 블록 열기 태그가 있는지 확인합니다
     * @param line 확인할 줄
     * @returns 블록 열기 태그 포함 여부 (예: {{#if}}, {{#when}})
     */
    private hasBlockOpen(line: string): boolean {
        return /\{\{#[a-zA-Z_][a-zA-Z0-9_]*/.test(line);
    }

    /**
     * 줄에 블록 닫기 태그가 있는지 확인합니다
     * @param line 확인할 줄
     * @returns 블록 닫기 태그 포함 여부 (예: {{/if}}, {{/when}}, {{/}})
     */
    private hasBlockClose(line: string): boolean {
        return /\{\{\/[a-zA-Z_0-9]*\}\}/.test(line);
    }

    /**
     * 들여쓰기 레벨에 맞는 들여쓰기 문자열을 생성합니다
     * @param level 들여쓰기 레벨 (0부터 시작)
     * @returns 들여쓰기 문자열 (탭 또는 공백)
     */
    private getIndent(level: number): string {
        if (this.options.indentStyle === 'tab') {
            return '\t'.repeat(level);
        } else {
            return ' '.repeat(level * this.options.indentSize);
        }
    }

    /**
     * CBS 블록들을 줄 번호에 매핑합니다
     * @param text 원본 텍스트
     * @param blocks CBS 블록 배열
     * @returns 줄 번호를 키로 하고 해당 줄의 블록 배열을 값으로 하는 Map
     */
    private mapBlocksToLines(text: string, blocks: CBSBlock[]): Map<number, CBSBlock[]> {
        const map = new Map<number, CBSBlock[]>();

        for (const block of blocks) {
            if (!map.has(block.line)) {
                map.set(block.line, []);
            }
            map.get(block.line)!.push(block);

            // 자식 블록들을 재귀적으로 처리
            this.addChildBlocks(map, block.children);
        }

        return map;
    }

    /**
     * 자식 블록들을 맵에 추가합니다 (재귀 처리)
     * @param map 줄 번호와 블록 배열을 매핑하는 Map
     * @param blocks 추가할 블록 배열
     */
    private addChildBlocks(map: Map<number, CBSBlock[]>, blocks: CBSBlock[]): void {
        for (const block of blocks) {
            if (!map.has(block.line)) {
                map.set(block.line, []);
            }
            map.get(block.line)!.push(block);

            // 중첩된 자식 블록이 있으면 재귀적으로 처리
            if (block.children.length > 0) {
                this.addChildBlocks(map, block.children);
            }
        }
    }
}