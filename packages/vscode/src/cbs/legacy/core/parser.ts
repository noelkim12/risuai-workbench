/**
 * CBS Parser - CBS 구문을 위한 핵심 파싱 로직
 * 웹 환경에서도 독립적으로 사용 가능
 */

/**
 * CBS 토큰 인터페이스
 * 파싱된 개별 CBS 표현식을 나타냅니다
 */
export interface CBSToken {
    /** 토큰 타입: 블록 열기/닫기, 함수 호출, 수학 표현식, 텍스트, 인자 구분자 */
    type: 'block-open' | 'block-close' | 'function' | 'math' | 'text' | 'argument-separator';
    /** 토큰 값 (함수명, 표현식 내용 등) */
    value: string;
    /** 텍스트 내 시작 위치 (문자 인덱스) */
    start: number;
    /** 텍스트 내 종료 위치 (문자 인덱스) */
    end: number;
    /** 줄 번호 (0부터 시작) */
    line: number;
    /** 줄 내 컬럼 위치 (0부터 시작) */
    column: number;
}

/**
 * CBS 블록 인터페이스
 * 블록 구조 ({{#if}}...{{/if}}) 를 나타냅니다
 */
export interface CBSBlock {
    /** 블록 타입 (if, when, each 등) */
    type: string;
    /** 블록 시작 위치 */
    start: number;
    /** 블록 종료 위치 */
    end: number;
    /** 블록이 시작하는 줄 번호 */
    line: number;
    /** 중첩된 자식 블록들 */
    children: CBSBlock[];
    /** 부모 블록 (최상위 블록은 undefined) */
    parent?: CBSBlock;
}

/**
 * CBS 파싱 오류 인터페이스
 */
export interface CBSParseError {
    /** 오류 메시지 */
    message: string;
    /** 오류 발생 시작 위치 */
    start: number;
    /** 오류 발생 종료 위치 */
    end: number;
    /** 오류 발생 줄 번호 */
    line: number;
    /** 오류 심각도: 'error' (오류) 또는 'warning' (경고) */
    severity: 'error' | 'warning';
}

/**
 * CBS 파서 클래스
 * CBS 구문을 토큰으로 분해하고 블록 트리를 구성합니다
 */
export class CBSParser {
    /** 파싱할 원본 텍스트 */
    private text: string;
    /** 현재 파싱 위치 (문자 인덱스) */
    private position: number;
    /** 현재 줄 번호 */
    private line: number;
    /** 현재 컬럼 위치 */
    private column: number;
    /** 파싱된 토큰 배열 */
    private tokens: CBSToken[];
    /** 파싱 중 발견된 오류 배열 */
    private errors: CBSParseError[];

    /**
     * CBS 파서 생성자
     * @param text 파싱할 CBS 코드
     */
    constructor(text: string) {
        this.text = text;
        this.position = 0;
        this.line = 0;
        this.column = 0;
        this.tokens = [];
        this.errors = [];
    }

    /**
     * 텍스트를 파싱하여 토큰, 오류, 블록 트리를 반환합니다
     * @returns 토큰 배열, 오류 배열, 블록 트리를 포함한 객체
     */
    parse(): { tokens: CBSToken[]; errors: CBSParseError[]; blocks: CBSBlock[] } {
        this.tokenize();
        const blocks = this.buildBlockTree();
        return {
            tokens: this.tokens,
            errors: this.errors,
            blocks
        };
    }

    /**
     * 텍스트를 토큰으로 분해합니다
     * 문자를 하나씩 읽으면서 CBS 표현식을 찾아 토큰을 생성합니다
     */
    private tokenize(): void {
        while (this.position < this.text.length) {
            const char = this.text[this.position];

            // 줄바꿈 처리
            if (char === '\n') {
                this.line++;
                this.column = 0;
                this.position++;
                continue;
            }

            // {{ 시작을 확인하여 CBS 표현식 파싱
            if (char === '{' && this.peek(1) === '{') {
                this.parseTemplate();
            } else {
                // 일반 텍스트는 건너뜀
                this.position++;
                this.column++;
            }
        }
    }

    /**
     * CBS 템플릿 표현식을 파싱합니다
     * {{로 시작하는 표현식의 타입을 판별하고 적절한 파서를 호출합니다
     */
    private parseTemplate(): void {
        const start = this.position;
        const startLine = this.line;
        const startColumn = this.column;

        this.position += 2; // {{ 건너뛰기
        this.column += 2;

        // 블록 열기 태그 확인: {{#if}}, {{#when}} 등
        if (this.current() === '#') {
            this.parseBlockOpen(start, startLine, startColumn);
            return;
        }

        // 블록 닫기 태그 확인: {{/if}}, {{/when}} 등
        if (this.current() === '/') {
            this.parseBlockClose(start, startLine, startColumn);
            return;
        }

        // 수학 표현식 확인: {{? 1 + 2}} 등
        if (this.current() === '?') {
            this.parseMathExpression(start, startLine, startColumn);
            return;
        }

        // 일반 함수 호출: {{getvar::x}}, {{user}} 등
        this.parseFunctionCall(start, startLine, startColumn);
    }

    /**
     * 블록 열기 태그를 파싱합니다 (예: {{#if}}, {{#when}})
     * @param start 표현식 시작 위치
     * @param startLine 표현식 시작 줄 번호
     * @param startColumn 표현식 시작 컬럼 위치
     */
    private parseBlockOpen(start: number, startLine: number, startColumn: number): void {
        this.position++; // # 건너뛰기
        this.column++;

        // 블록 이름 추출 (공백이나 }}를 만날 때까지)
        const nameStart = this.position;
        while (this.position < this.text.length &&
               this.current() !== '}' &&
               this.current() !== ' ' &&
               this.current() !== '\n') {
            this.position++;
            this.column++;
        }

        const blockName = this.text.substring(nameStart, this.position);

        // 닫는 }} 찾기
        const end = this.findClosingBraces();
        if (end === -1) {
            // }}를 찾지 못한 경우 오류 추가
            this.errors.push({
                message: `Unclosed block open tag: {{#${blockName}}}`,
                start,
                end: this.position,
                line: startLine,
                severity: 'error'
            });
        } else {
            this.position = end + 2;
            this.column += 2;
        }

        // 블록 열기 토큰 생성
        this.tokens.push({
            type: 'block-open',
            value: blockName,
            start,
            end: this.position,
            line: startLine,
            column: startColumn
        });
    }

    /**
     * 블록 닫기 태그를 파싱합니다 (예: {{/if}}, {{/when}}, {{/}})
     * @param start 표현식 시작 위치
     * @param startLine 표현식 시작 줄 번호
     * @param startColumn 표현식 시작 컬럼 위치
     */
    private parseBlockClose(start: number, startLine: number, startColumn: number): void {
        this.position++; // / 건너뛰기
        this.column++;

        // 블록 이름 추출 (}}를 만날 때까지)
        // 빈 문자열일 수 있음 ({{/}} 형태)
        const nameStart = this.position;
        while (this.position < this.text.length &&
               this.current() !== '}' &&
               this.current() !== '\n') {
            this.position++;
            this.column++;
        }

        const blockName = this.text.substring(nameStart, this.position).trim();

        // 닫는 }} 찾기
        const end = this.findClosingBraces();
        if (end === -1) {
            // }}를 찾지 못한 경우 오류 추가
            this.errors.push({
                message: `Unclosed block close tag: {{/${blockName}}}`,
                start,
                end: this.position,
                line: startLine,
                severity: 'error'
            });
        } else {
            this.position = end + 2;
            this.column += 2;
        }

        // 블록 닫기 토큰 생성
        this.tokens.push({
            type: 'block-close',
            value: blockName,
            start,
            end: this.position,
            line: startLine,
            column: startColumn
        });
    }

    /**
     * 수학 표현식을 파싱합니다 (예: {{? 1 + 2 * 3}})
     * @param start 표현식 시작 위치
     * @param startLine 표현식 시작 줄 번호
     * @param startColumn 표현식 시작 컬럼 위치
     */
    private parseMathExpression(start: number, startLine: number, startColumn: number): void {
        this.position++; // ? 건너뛰기
        this.column++;

        // 닫는 }} 찾기
        const end = this.findClosingBraces();
        if (end === -1) {
            // }}를 찾지 못한 경우 오류 추가
            this.errors.push({
                message: 'Unclosed math expression',
                start,
                end: this.position,
                line: startLine,
                severity: 'error'
            });
        } else {
            // 수학 표현식 내용 추출
            const expression = this.text.substring(this.position, end).trim();
            this.position = end + 2;
            this.column += 2;

            // 수학 표현식 토큰 생성
            this.tokens.push({
                type: 'math',
                value: expression,
                start,
                end: this.position,
                line: startLine,
                column: startColumn
            });
        }
    }

    /**
     * 일반 함수 호출을 파싱합니다 (예: {{getvar::x}}, {{user}})
     * @param start 표현식 시작 위치
     * @param startLine 표현식 시작 줄 번호
     * @param startColumn 표현식 시작 컬럼 위치
     */
    private parseFunctionCall(start: number, startLine: number, startColumn: number): void {
        // 닫는 }} 찾기
        const end = this.findClosingBraces();
        if (end === -1) {
            // }}를 찾지 못한 경우 오류 추가
            this.errors.push({
                message: 'Unclosed function call',
                start,
                end: this.position,
                line: startLine,
                severity: 'error'
            });
        } else {
            // 함수 호출 내용 추출 (함수명 + 인자)
            const content = this.text.substring(this.position, end);
            this.position = end + 2;
            this.column += 2;

            // 함수 호출 토큰 생성
            this.tokens.push({
                type: 'function',
                value: content,
                start,
                end: this.position,
                line: startLine,
                column: startColumn
            });
        }
    }

    /**
     * 중첩을 고려하여 닫는 }}의 위치를 찾습니다
     * @returns 닫는 }}의 시작 위치, 찾지 못하면 -1
     */
    private findClosingBraces(): number {
        let depth = 1; // 현재 중첩 깊이
        let pos = this.position;

        while (pos < this.text.length - 1) {
            if (this.text[pos] === '{' && this.text[pos + 1] === '{') {
                // 중첩된 {{ 발견
                depth++;
                pos += 2;
            } else if (this.text[pos] === '}' && this.text[pos + 1] === '}') {
                // }} 발견
                depth--;
                if (depth === 0) {
                    // 매칭되는 닫는 }} 찾음
                    return pos;
                }
                pos += 2;
            } else {
                pos++;
            }
        }

        // 매칭되는 }}를 찾지 못함
        return -1;
    }

    /**
     * 토큰들로부터 블록 트리를 구성합니다
     * 블록 열기/닫기 태그를 매칭하여 중첩 구조를 생성합니다
     * @returns 최상위 블록 배열
     */
    private buildBlockTree(): CBSBlock[] {
        const blocks: CBSBlock[] = [];
        const stack: CBSBlock[] = []; // 현재 열린 블록들을 추적하는 스택

        for (const token of this.tokens) {
            if (token.type === 'block-open') {
                // 새 블록 생성
                const block: CBSBlock = {
                    type: token.value,
                    start: token.start,
                    end: token.end,
                    line: token.line,
                    children: []
                };

                if (stack.length > 0) {
                    // 현재 열린 블록이 있으면 자식으로 추가
                    const parent = stack[stack.length - 1];
                    block.parent = parent;
                    parent.children.push(block);
                } else {
                    // 최상위 블록으로 추가
                    blocks.push(block);
                }

                // 스택에 푸시 (현재 블록을 열린 상태로 표시)
                stack.push(block);
            } else if (token.type === 'block-close') {
                if (stack.length === 0) {
                    // 매칭되는 열기 태그가 없는 닫기 태그
                    this.errors.push({
                        message: `Unexpected block close tag: {{/${token.value}}}`,
                        start: token.start,
                        end: token.end,
                        line: token.line,
                        severity: 'error'
                    });
                } else {
                    // 스택에서 블록 팝
                    const openBlock = stack.pop()!;
                    openBlock.end = token.end;

                    // 블록 이름 매칭 확인 (빈 닫기 태그 {{/}}는 허용)
                    if (token.value !== '' && token.value !== openBlock.type) {
                        this.errors.push({
                            message: `Block mismatch: expected {{/${openBlock.type}}} but got {{/${token.value}}}`,
                            start: token.start,
                            end: token.end,
                            line: token.line,
                            severity: 'error'
                        });
                    }
                }
            }
        }

        // 닫히지 않은 블록 확인
        for (const block of stack) {
            this.errors.push({
                message: `Unclosed block: {{#${block.type}}}`,
                start: block.start,
                end: block.end,
                line: block.line,
                severity: 'error'
            });
        }

        return blocks;
    }

    /**
     * 현재 위치의 문자를 반환합니다
     * @returns 현재 문자
     */
    private current(): string {
        return this.text[this.position];
    }

    /**
     * 현재 위치에서 offset만큼 떨어진 문자를 반환합니다
     * @param offset 현재 위치로부터의 오프셋
     * @returns offset 위치의 문자
     */
    private peek(offset: number): string {
        return this.text[this.position + offset];
    }
}