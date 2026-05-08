import { describe, expect, it } from 'vitest';

import { CBSParser, type CBSDocument, type CBSNode } from '../../../src/domain';

type NodeSnapshot =
  | { type: 'PlainText'; value: string }
  | { type: 'MacroCall'; name: string; arguments: NodeSnapshot[][] }
  | {
      type: 'Block';
      kind: string;
      operators: string[];
      condition: NodeSnapshot[];
      body: NodeSnapshot[];
      elseBody?: NodeSnapshot[];
      hasClose: boolean;
    }
  | { type: 'Comment'; value: string }
  | { type: 'MathExpr'; expression: string; children: NodeSnapshot[] };

type DiagnosticSnapshot = {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
};

function parse(input: string): CBSDocument {
  return new CBSParser().parse(input);
}

function snapshotNodes(nodes: CBSNode[]): NodeSnapshot[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'PlainText':
        return {
          type: 'PlainText',
          value: node.value,
        };
      case 'MacroCall':
        return {
          type: 'MacroCall',
          name: node.name,
          arguments: node.arguments.map((argument) => snapshotNodes(argument)),
        };
      case 'Block':
        return {
          type: 'Block',
          kind: node.kind,
          operators: node.operators,
          condition: snapshotNodes(node.condition),
          body: snapshotNodes(node.body),
          elseBody: node.elseBody ? snapshotNodes(node.elseBody) : undefined,
          hasClose: node.closeRange !== undefined,
        };
      case 'Comment':
        return {
          type: 'Comment',
          value: node.value,
        };
      case 'MathExpr':
        return {
          type: 'MathExpr',
          expression: node.expression,
          children: snapshotNodes(node.children),
        };
      default:
        throw new Error(`Unexpected node type: ${(node as { type: string }).type}`);
    }
  });
}

function snapshotDiagnostics(document: CBSDocument): DiagnosticSnapshot[] {
  return document.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
  }));
}

function collectPlainText(nodes: CBSNode[]): string[] {
  const values: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'PlainText':
        values.push(node.value);
        break;
      case 'MacroCall':
        for (const argument of node.arguments) {
          values.push(...collectPlainText(argument));
        }
        break;
      case 'Block':
        values.push(...collectPlainText(node.condition));
        values.push(...collectPlainText(node.body));
        if (node.elseBody) {
          values.push(...collectPlainText(node.elseBody));
        }
        break;
      case 'Comment':
      case 'MathExpr':
        break;
    }
  }

  return values;
}

function buildNestedGetVar(depth: number): string {
  let source = 'name';

  for (let index = 0; index < depth; index += 1) {
    source = `{{getvar::${source}}}`;
  }

  return source;
}

describe('CBSParser', () => {
  it('preserves document node order for plain text and macro calls', () => {
    const document = parse('before {{getvar::name}} after');

    expect(snapshotNodes(document.nodes)).toEqual([
      { type: 'PlainText', value: 'before ' },
      {
        type: 'MacroCall',
        name: 'getvar',
        arguments: [[{ type: 'PlainText', value: 'name' }]],
      },
      { type: 'PlainText', value: ' after' },
    ]);
    expect(snapshotDiagnostics(document)).toEqual([]);
  });

  it('parses nested macro arguments recursively', () => {
    const document = parse('{{random::{{setvar::x::1}}::done}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'MacroCall',
        name: 'random',
        arguments: [
          [
            {
              type: 'MacroCall',
              name: 'setvar',
              arguments: [[{ type: 'PlainText', value: 'x' }], [{ type: 'PlainText', value: '1' }]],
            },
          ],
          [{ type: 'PlainText', value: 'done' }],
        ],
      },
    ]);
  });

  it('parses #when blocks with :else and shorthand close tags', () => {
    const document = parse('{{#when::1}}yes{{:else}}no{{/}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'when',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [{ type: 'PlainText', value: 'yes' }],
        elseBody: [{ type: 'PlainText', value: 'no' }],
        hasClose: true,
      },
    ]);
  });

  it('accepts numbered close blocks as legacy shorthand closes', () => {
    const document = parse('{{#if 1}}A{{#if 1}}B{{/2}}{{/1}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'if',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [
          { type: 'PlainText', value: 'A' },
          {
            type: 'Block',
            kind: 'if',
            operators: [],
            condition: [{ type: 'PlainText', value: '1' }],
            body: [{ type: 'PlainText', value: 'B' }],
            elseBody: undefined,
            hasClose: true,
          },
        ],
        elseBody: undefined,
        hasClose: true,
      },
    ]);
    expect(snapshotDiagnostics(document)).toEqual([]);
  });

  it('diagnoses arbitrary slash close blocks instead of treating them as legacy shorthand closes', () => {
    const document = parse('{{#if 1}}A{{/whatever}}Z');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'if',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [{ type: 'PlainText', value: 'A' }],
        elseBody: undefined,
        hasClose: true,
      },
      { type: 'PlainText', value: 'Z' },
    ]);
    expect(snapshotDiagnostics(document)).toEqual([
      {
        code: 'CBS006',
        message: 'Cross-nested block close detected',
        severity: 'error',
      },
    ]);
  });

  it('parses nested CBS macros inside inline math expressions', () => {
    const document = parse('{{? {{getvar::ct_Language}} == 1}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'MathExpr',
        expression: '{{getvar::ct_Language}} == 1',
        children: [
          {
            type: 'MacroCall',
            name: 'getvar',
            arguments: [[{ type: 'PlainText', value: 'ct_Language' }]],
          },
          { type: 'PlainText', value: ' == 1' },
        ],
      },
    ]);
    expect(snapshotDiagnostics(document)).toEqual([]);
  });

  it('parses nested math expressions inside #if block headers', () => {
    const document = parse('{{#if {{? {{getvar::ct_Deck_Level}} <= 2}}}}ok{{/if}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'if',
        operators: [],
        condition: [
          {
            type: 'MathExpr',
            expression: '{{getvar::ct_Deck_Level}} <= 2',
            children: [
              {
                type: 'MacroCall',
                name: 'getvar',
                arguments: [[{ type: 'PlainText', value: 'ct_Deck_Level' }]],
              },
              { type: 'PlainText', value: ' <= 2' },
            ],
          },
        ],
        body: [{ type: 'PlainText', value: 'ok' }],
        elseBody: undefined,
        hasClose: true,
      },
    ]);
    expect(snapshotDiagnostics(document)).toEqual([]);
  });

  it('retains deprecated block spellings in the AST instead of remapping them', () => {
    const document = parse('{{#if 1}}legacy{{/if}}{{#if_pure 1}}pure{{/if_pure}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'if',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [{ type: 'PlainText', value: 'legacy' }],
        elseBody: undefined,
        hasClose: true,
      },
      {
        type: 'Block',
        kind: 'if_pure',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [{ type: 'PlainText', value: 'pure' }],
        elseBody: undefined,
        hasClose: true,
      },
    ]);
  });

  it('accepts legacy #if close tags for #if_pure blocks', () => {
    const document = parse('{{#if_pure 1}}pure{{/if}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'if_pure',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [{ type: 'PlainText', value: 'pure' }],
        elseBody: undefined,
        hasClose: true,
      },
    ]);
    expect(snapshotDiagnostics(document)).toEqual([]);
  });

  it.each([
    [
      '#each items as item',
      '/each',
      'each',
      [],
      'items as item',
      'before {{slot::item}} {{getvar::name}}',
    ],
    [
      '#each items',
      '/each',
      'each',
      [],
      'items',
      'before {{slot}} {{getvar::name}}',
    ],
    ['#escape', '/', 'escape', [], '', 'before {{getvar::name}}'],
    ['#pure', '/', 'pure', [], '', 'before {{getvar::name}}'],
    ['#puredisplay', '/', 'puredisplay', [], '', 'before {{getvar::name}}'],
    ['#func greet user', '/func', 'func', [], 'greet user', 'before {{getvar::name}}'],
  ])(
    'captures %s bodies literally in pure mode',
    (open, close, kind, operators, condition, body) => {
      const document = parse(`{{${open}}}${body}{{${close}}}`);

      expect(snapshotNodes(document.nodes)).toEqual([
        {
          type: 'Block',
          kind,
          operators,
          condition: condition.length === 0 ? [] : [{ type: 'PlainText', value: condition }],
          body: [{ type: 'PlainText', value: body }],
          elseBody: undefined,
          hasClose: true,
        },
      ]);
    },
  );

  it('captures pure bodies literally until numbered close tokens', () => {
    const document = parse('{{#pure}}before {{getvar::name}}{{/1}} after');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'pure',
        operators: [],
        condition: [],
        body: [{ type: 'PlainText', value: 'before {{getvar::name}}' }],
        elseBody: undefined,
        hasClose: true,
      },
      { type: 'PlainText', value: ' after' },
    ]);
    expect(snapshotDiagnostics(document)).toEqual([]);
  });

  it('falls back unknown block starters to macro calls with diagnostics', () => {
    const document = parse('{{#mystery::{{user}}::tail}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'MacroCall',
        name: 'mystery',
        arguments: [
          [{ type: 'MacroCall', name: 'user', arguments: [] }],
          [{ type: 'PlainText', value: 'tail' }],
        ],
      },
    ]);
    expect(snapshotDiagnostics(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS003',
          severity: 'error',
        }),
      ]),
    );
  });

  it('carries tokenizer diagnostics forward', () => {
    const document = parse('before {{oops');

    expect(snapshotNodes(document.nodes)).toEqual([
      { type: 'PlainText', value: 'before ' },
      { type: 'PlainText', value: '{{oops' },
    ]);
    expect(snapshotDiagnostics(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS001',
          severity: 'error',
        }),
      ]),
    );
  });

  it('records else diagnostics and keeps stray else literal text', () => {
    const document = parse('before {{:else}} after');

    expect(snapshotNodes(document.nodes)).toEqual([
      { type: 'PlainText', value: 'before ' },
      { type: 'PlainText', value: '{{:else}}' },
      { type: 'PlainText', value: ' after' },
    ]);
    expect(snapshotDiagnostics(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS006',
          severity: 'error',
        }),
      ]),
    );
  });

  it('records else diagnostics and keeps a second else literal inside conditional else bodies', () => {
    const document = parse('{{#when::1}}yes{{:else}}no{{:else}}later{{/}}');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'when',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [{ type: 'PlainText', value: 'yes' }],
        elseBody: [
          { type: 'PlainText', value: 'no' },
          { type: 'PlainText', value: '{{:else}}' },
          { type: 'PlainText', value: 'later' },
        ],
        hasClose: true,
      },
    ]);
    expect(snapshotDiagnostics(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS006',
          severity: 'error',
        }),
      ]),
    );
  });

  it('records cross nesting diagnostics without crashing', () => {
    const document = parse('{{#when::1}}{{#each items as item}}body{{/when}}{{/each}}');

    expect(snapshotDiagnostics(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS006',
          severity: 'error',
        }),
      ]),
    );
    expect(snapshotNodes(document.nodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Block',
          kind: 'when',
        }),
      ]),
    );
  });

  it('records unclosed block diagnostics and leaves closeRange undefined', () => {
    const document = parse('{{#when::1}}body');

    expect(snapshotNodes(document.nodes)).toEqual([
      {
        type: 'Block',
        kind: 'when',
        operators: [],
        condition: [{ type: 'PlainText', value: '1' }],
        body: [{ type: 'PlainText', value: 'body' }],
        elseBody: undefined,
        hasClose: false,
      },
    ]);
    expect(snapshotDiagnostics(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS002',
          severity: 'error',
        }),
      ]),
    );
  });

  it('accepts nesting up to the 64-depth cap and rejects beyond it', () => {
    // Depth 57 is within the 64 cap (observed in real prompt templates)
    const accepted57 = parse(buildNestedGetVar(57));
    expect(snapshotDiagnostics(accepted57)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CBS007' })]),
    );

    // Depth 64 should be accepted (at the cap)
    const accepted64 = parse(buildNestedGetVar(64));
    expect(snapshotDiagnostics(accepted64)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CBS007' })]),
    );

    // Depth 65 should also be accepted (threshold is 66 due to depth counting)
    const accepted65 = parse(buildNestedGetVar(65));
    expect(snapshotDiagnostics(accepted65)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CBS007' })]),
    );

    // Depth 66 exceeds the cap and should trigger CBS007
    const rejected = parse(buildNestedGetVar(66));
    expect(snapshotDiagnostics(rejected)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS007',
          severity: 'error',
        }),
      ]),
    );
    expect(collectPlainText(rejected.nodes)).toEqual(
      expect.arrayContaining([expect.stringContaining('{{getvar::')]),
    );
  });
});
