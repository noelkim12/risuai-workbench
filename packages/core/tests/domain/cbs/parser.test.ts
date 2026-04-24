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

  it('stops descending past the recursion depth limit and preserves the remaining literal text', () => {
    const document = parse(buildNestedGetVar(22));

    expect(snapshotDiagnostics(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBS007',
          severity: 'error',
        }),
      ]),
    );
    expect(collectPlainText(document.nodes)).toEqual(
      expect.arrayContaining([expect.stringContaining('{{getvar::')]),
    );
  });
});
