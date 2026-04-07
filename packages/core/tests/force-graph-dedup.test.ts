import { describe, expect, it } from 'vitest';
import { buildRelationshipNetworkPanel } from '@/cli/analyze/shared/force-graph-builders';
import type { LorebookGraphData } from '@/cli/analyze/shared/force-graph-builders';
import type { Locale } from '@/cli/analyze/shared/i18n';

describe('buildRelationshipNetworkPanel', () => {
  it('deduplicates emitted node ids while routing lorebook-regex flow through a variable node', () => {
    const data: LorebookGraphData = {
      lorebookStructure: {
        folders: [],
        entries: [
          {
            id: 'EntryA',
            name: 'EntryA',
            folderId: null,
            folder: null,
            keywords: [],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: false,
          },
          {
            id: 'EntryA',
            name: 'EntryA',
            folderId: null,
            folder: null,
            keywords: [],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: false,
          },
          {
            id: 'EntryB',
            name: 'EntryB',
            folderId: null,
            folder: null,
            keywords: [],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: false,
          },
        ],
        stats: {
          totalEntries: 3,
          totalFolders: 0,
          activationModes: {
            normal: 3,
            constant: 0,
            selective: 0,
          },
          enabledCount: 3,
          withCBS: 0,
        },
        keywords: {
          all: [],
          overlaps: {},
        },
      },
        lorebookRegexCorrelation: {
          sharedVars: [
            {
              varName: 'sharedVar',
              direction: 'lorebook->regex',
              lorebookEntries: ['EntryA'],
              regexScripts: ['EntryA'],
            },
        ],
        lorebookOnlyVars: [],
        regexOnlyVars: [],
        summary: {
          totalShared: 1,
          totalLBOnly: 0,
          totalRXOnly: 0,
        },
      },
      lorebookCBS: [{ elementType: 'lorebook', elementName: 'EntryA', reads: new Set(), writes: new Set(['sharedVar']) }],
      regexCBS: [{ elementType: 'regex', elementName: 'EntryA', reads: new Set(['sharedVar']), writes: new Set() }],
    };

    const panel = buildRelationshipNetworkPanel('panel', data, 'en' as Locale);

    expect(panel).not.toBeNull();
    const payload = panel?.payload as {
      nodes: Array<{ id: string; label: string; type: string }>;
      edges: Array<{ source: string; target: string; type: string; label?: string }>;
    };

    expect(payload.nodes.map((node) => node.id).sort()).toEqual(['lb:EntryA', 'lb:EntryB', 'rx:EntryA', 'var:sharedVar']);
    expect(payload.nodes.filter((node) => node.id === 'lb:EntryA')).toHaveLength(1);
    expect(payload.nodes.filter((node) => node.id === 'rx:EntryA')).toHaveLength(1);
    expect(payload.nodes.find((node) => node.id === 'var:sharedVar')).toMatchObject({
      label: 'sharedVar',
      type: 'variable',
    });
    expect(payload.edges).toEqual([
      {
        source: 'lb:EntryA',
        target: 'var:sharedVar',
        type: 'variable',
      },
      {
        source: 'var:sharedVar',
        target: 'rx:EntryA',
        type: 'variable',
      },
    ]);
  });

  it('keeps folder-nested lorebook entries distinct in graph nodes and variable edges', () => {
    const data: LorebookGraphData = {
      lorebookStructure: {
        folders: [
          { id: 'root-folder', name: 'Root Folder', path: 'Root Folder', parentId: null },
          { id: 'child-folder', name: 'Child Folder', path: 'Root Folder/Child Folder', parentId: 'root-folder' },
        ],
        entries: [
          {
            id: 'Root Folder/Child Folder/Shared Entry',
            name: 'Shared Entry',
            folderId: 'child-folder',
            folder: 'Root Folder/Child Folder',
            keywords: [],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: true,
          },
          {
            id: 'Shared Entry',
            name: 'Shared Entry',
            folderId: null,
            folder: null,
            keywords: [],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: true,
          },
        ],
        stats: {
          totalEntries: 2,
          totalFolders: 2,
          activationModes: { normal: 2, constant: 0, selective: 0 },
          enabledCount: 2,
          withCBS: 2,
        },
        keywords: { all: [], overlaps: {} },
      },
      lorebookRegexCorrelation: {
        sharedVars: [
          {
            varName: 'nestedVar',
            direction: 'lorebook->regex',
            lorebookEntries: ['Root Folder/Child Folder/Shared Entry'],
            regexScripts: ['nested-script'],
          },
        ],
        lorebookOnlyVars: [],
        regexOnlyVars: [],
        summary: { totalShared: 1, totalLBOnly: 0, totalRXOnly: 0 },
      },
      lorebookCBS: [
        {
          elementType: 'lorebook',
          elementName: 'Root Folder/Child Folder/Shared Entry',
          reads: new Set<string>(),
          writes: new Set<string>(['nestedVar']),
        },
      ],
      regexCBS: [{ elementName: 'nested-script', reads: new Set<string>(['nestedVar']), writes: new Set<string>() }],
    };

    const panel = buildRelationshipNetworkPanel('panel', data, 'en' as Locale);
    const payload = panel?.payload as {
      nodes: Array<{ id: string; label: string; type: string }>;
      edges: Array<{ source: string; target: string; type: string; label?: string }>;
    };

    expect(payload.nodes.map((node) => node.id).sort()).toEqual([
      'lb:Root Folder/Child Folder/Shared Entry',
      'lb:Shared Entry',
      'rx:nested-script',
      'var:nestedVar',
    ]);
    expect(payload.edges).toContainEqual({
      source: 'lb:Root Folder/Child Folder/Shared Entry',
      target: 'var:nestedVar',
      type: 'variable',
    });
    expect(payload.edges).toContainEqual({
      source: 'var:nestedVar',
      target: 'rx:nested-script',
      type: 'variable',
    });
  });

  it('keeps all variables visible as nodes even when they are not shared across lorebook and regex', () => {
    const data: LorebookGraphData = {
      lorebookStructure: {
        folders: [],
        entries: [
          {
            id: 'Writer',
            name: 'Writer',
            folderId: null,
            folder: null,
            keywords: ['signal'],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: true,
          },
          {
            id: 'Reader',
            name: 'Reader',
            folderId: null,
            folder: null,
            keywords: ['signal'],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: true,
          },
        ],
        stats: {
          totalEntries: 2,
          totalFolders: 0,
          activationModes: { normal: 2, constant: 0, selective: 0 },
          enabledCount: 2,
          withCBS: 2,
        },
        keywords: {
          all: ['signal'],
          overlaps: {
            signal: ['Writer', 'Reader'],
          },
        },
      },
      lorebookRegexCorrelation: {
        sharedVars: [],
        lorebookOnlyVars: ['writeOnly', 'readOnly'],
        regexOnlyVars: ['regexOnly'],
        summary: {
          totalShared: 0,
          totalLBOnly: 2,
          totalRXOnly: 1,
        },
      },
      lorebookCBS: [
        {
          elementType: 'lorebook',
          elementName: 'Writer',
          reads: new Set(['readOnly']),
          writes: new Set(['writeOnly']),
        },
        {
          elementType: 'lorebook',
          elementName: 'Reader',
          reads: new Set(['writeOnly']),
          writes: new Set(),
        },
      ],
      regexCBS: [
        {
          elementType: 'regex',
          elementName: 'regex-script',
          reads: new Set(),
          writes: new Set(['regexOnly']),
        },
      ],
      regexScriptInfos: [
        {
          name: 'regex-script',
          in: 'hello (.+)',
          out: '{{setvar::regexOnly::$1}}',
        },
      ],
    };

    const panel = buildRelationshipNetworkPanel('panel', data, 'en' as Locale);
    const payload = panel?.payload as {
      nodes: Array<{ id: string; label: string; type: string }>;
      edges: Array<{ source: string; target: string; type: string; label?: string }>;
    };

    expect(payload.nodes.map((node) => node.id).sort()).toEqual([
      'lb:Reader',
      'lb:Writer',
      'rx:regex-script',
      'trig:signal',
      'var:readOnly',
      'var:regexOnly',
      'var:writeOnly',
    ]);
    expect(payload.nodes.filter((node) => node.type === 'variable').map((node) => node.label).sort()).toEqual([
      'readOnly',
      'regexOnly',
      'writeOnly',
    ]);
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'lb:Writer',
        details: expect.objectContaining({
          Name: 'Writer',
          Keywords: 'signal',
          'Expected vars': 'readOnly, writeOnly',
        }),
      }),
    );
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'rx:regex-script',
        details: expect.objectContaining({
          Name: 'regex-script',
          In: 'hello (.+)',
          Out: '{{setvar::regexOnly::$1}}',
          'Expected vars': 'regexOnly',
        }),
      }),
    );
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'var:writeOnly',
        details: expect.objectContaining({
          Readers: 'Reader',
          Writers: 'Writer',
        }),
      }),
    );
    expect(payload.edges).toEqual(
      expect.arrayContaining([
        {
          source: 'lb:Writer',
          target: 'var:writeOnly',
          type: 'variable',
        },
        {
          source: 'var:writeOnly',
          target: 'lb:Reader',
          type: 'variable',
        },
        {
          source: 'var:readOnly',
          target: 'lb:Writer',
          type: 'variable',
        },
        {
          source: 'rx:regex-script',
          target: 'var:regexOnly',
          type: 'variable',
        },
        {
          source: 'lb:Writer',
          target: 'lb:Reader',
          type: 'keyword',
          label: 'signal',
        },
      ]),
    );
  });

  it('renders bidirectional shared vars as two-way edges around the variable node', () => {
    const data: LorebookGraphData = {
      lorebookStructure: {
        folders: [],
        entries: [
          {
            id: 'EntryA',
            name: 'EntryA',
            folderId: null,
            folder: null,
            keywords: [],
            enabled: true,
            constant: false,
            selective: false,
            hasCBS: false,
          },
        ],
        stats: {
          totalEntries: 1,
          totalFolders: 0,
          activationModes: { normal: 1, constant: 0, selective: 0 },
          enabledCount: 1,
          withCBS: 0,
        },
        keywords: { all: [], overlaps: {} },
      },
      lorebookRegexCorrelation: {
        sharedVars: [
          {
            varName: 'sharedVar',
            direction: 'bidirectional',
            lorebookEntries: ['EntryA'],
            regexScripts: ['regex-script'],
          },
        ],
        lorebookOnlyVars: [],
        regexOnlyVars: [],
        summary: {
          totalShared: 1,
          totalLBOnly: 0,
          totalRXOnly: 0,
        },
      },
      lorebookCBS: [],
      regexCBS: [],
      regexNodeNames: ['regex-script'],
    };

    const panel = buildRelationshipNetworkPanel('panel', data, 'en' as Locale);
    const payload = panel?.payload as {
      nodes: Array<{ id: string; label: string; type: string }>;
      edges: Array<{ source: string; target: string; type: string; label?: string }>;
    };

    expect(payload.nodes.map((node) => node.id).sort()).toEqual(['lb:EntryA', 'rx:regex-script', 'var:sharedVar']);
    expect(payload.edges).toEqual(
      expect.arrayContaining([
        { source: 'lb:EntryA', target: 'var:sharedVar', type: 'variable' },
        { source: 'var:sharedVar', target: 'lb:EntryA', type: 'variable' },
        { source: 'rx:regex-script', target: 'var:sharedVar', type: 'variable' },
        { source: 'var:sharedVar', target: 'rx:regex-script', type: 'variable' },
      ]),
    );
    expect(payload.edges).toHaveLength(4);
  });
});
