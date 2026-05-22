import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJson, writeText } from '@/node/fs-helpers';
import { sanitizeFilename } from '../../utils/filenames';
import { argValue, getErrorMessage } from '../shared';
import { RISUMODULE_FILENAME, buildScaffoldRisumoduleManifest } from '../shared/risumodule';
import { parseRisuLuaMode, type RisuLuaMode } from '../shared/lua-bundler/risulua-mode';

// ── Help ────────────────────────────────────────────────────────────

const HELP_TEXT = `
  🐿️ risu-core scaffold

  Usage:  risu-core scaffold <type> [options]

  Types:
    charx       캐릭터 카드 프로젝트
    module      모듈 프로젝트
    preset      프리셋 프로젝트

  Options:
    --name <name>       프로젝트 이름 (필수)
    --out <dir>         출력 디렉토리 (기본: ./<sanitized_name>)
    --creator <name>    크리에이터 이름 (charx 전용, 선택)
    --namespace <ns>    모듈 namespace (.risumodule 전용, 선택)
    --risulua-mode <classic|modular>  RisuLua 개발 방식: classic=단일 파일 개발, modular=모듈식 개발 (기본: classic)
    -h, --help          도움말

  Examples:
    risu-core scaffold charx --name "My Character" --creator "Author"
    risu-core scaffold module --name "RPG Module" --namespace rpg
    risu-core scaffold preset --name "My Preset" --out ./presets/my-preset
`;

// ── Types ───────────────────────────────────────────────────────────

type ScaffoldType = 'charx' | 'module' | 'preset';

interface ScaffoldOptions {
  type: ScaffoldType;
  name: string;
  outDir: string;
  creator: string;
  namespace?: string;
  risuluaMode: RisuLuaMode;
}

const SCAFFOLD_TYPES = new Set<string>(['charx', 'module', 'preset']);

const CHARX_PROSE_PLACEHOLDERS: Array<[string, string]> = [
  ['character/description.risutext', '캐릭터 설명을 여기에 작성하세요.\n'],
  ['character/first_mes.risutext', '첫 번째 메시지를 여기에 작성하세요.\n'],
  ['character/system_prompt.risutext', ''],
  ['character/replace_global_note.risutext', ''],
  ['character/creator_notes.risutext', ''],
  ['character/additional_text.risutext', ''],
];

const RISULUA_SCAFFOLD_MODULES = [
  'common.local_helpers',
  'common.helpers',
  'host_globals.global_functions',
  'host_globals.duplicate_globals',
  'host_globals.async_actions',
  'button_actions.actions',
  'runtime.start',
  'runtime.input',
  'runtime.output',
  'runtime.button_click',
  'runtime.listen_edit',
  'runtime.listeners',
  'handler_helpers.output_helpers',
  'handler_helpers.input_helpers',
  'handler_helpers.start_helpers',
  'handler_helpers.button_click_helpers',
  'handler_helpers.listen_edit_helpers',
  'state.variable_store',
  'prompts.instruction_store',
  'domain.core',
  'schema.constants',
  'features.core',
] as const;

const RISULUA_SCAFFOLD_DOC_FILES: Array<[string, unknown]> = [
  [
    'docs/risulua-split-plan.json',
    {
      sourceProfile: 'scaffold-empty',
      entryPath: 'lua/main.risulua',
      distBuildStrategy: 'concat-build-time-require',
      files: [
        'lua/main.risulua',
        ...RISULUA_SCAFFOLD_MODULES.map((moduleId) => `lua/${moduleId.replace(/\./g, '/')}.risulua`),
      ],
    },
  ],
  [
    'docs/refactor-map.json',
    {
      symbols: [],
      note: 'Scaffold placeholder. Populate after extracting or designing domain modules.',
    },
  ],
  [
    'docs/domain-candidates.json',
    {
      candidates: [],
      note: 'Scaffold placeholder. Add domain candidates as the module grows.',
    },
  ],
  [
    'docs/risulua-export-manifest.json',
    {
      hostVisibleGlobals: [],
      duplicateGlobals: [],
      preservedReasons: [],
    },
  ],
  [
    'docs/risulua-button-action-index.json',
    {
      actions: [],
    },
  ],
];

// ── Entry Point ─────────────────────────────────────────────────────

export function runScaffoldWorkflow(argv: readonly string[]): number {
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    return 0;
  }

  try {
    const options = parseOptions(argv);
    runScaffold(options);
    return 0;
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }
}

// ── Option Parsing ──────────────────────────────────────────────────

function parseOptions(argv: readonly string[]): ScaffoldOptions {
  const { mode, strippedArgv } = parseRisuLuaMode(argv);
  const typeArg = strippedArgv[0];
  if (!typeArg || !SCAFFOLD_TYPES.has(typeArg)) {
    throw new Error(
      `지원하지 않는 스캐폴드 타입: ${typeArg ?? '(없음)'}\n  지원 타입: charx, module, preset`,
    );
  }

  const name = argValue(strippedArgv, '--name');
  if (!name) {
    throw new Error('--name 옵션이 필요합니다.');
  }

  const sanitizedName = sanitizeFilename(name);
  const outDir = argValue(strippedArgv, '--out') || `./${sanitizedName}`;
  const creator = argValue(strippedArgv, '--creator') || '';
  const namespace = typeArg === 'module' ? argValue(strippedArgv, '--namespace') : null;

  return {
    type: typeArg as ScaffoldType,
    name,
    outDir,
    creator,
    risuluaMode: mode ?? 'classic',
    ...(typeof namespace === 'string' ? { namespace } : {}),
  };
}

// ── Dispatcher ──────────────────────────────────────────────────────

function runScaffold(options: ScaffoldOptions): void {
  const root = path.resolve(options.outDir);

  if (fs.existsSync(root)) {
    throw new Error(`이미 존재하는 디렉토리입니다: ${root}`);
  }

  console.log('\n  🐿️ risu-core scaffold\n');
  console.log(`  타입: ${options.type}`);
  console.log(`  이름: ${options.name}`);
  console.log(`  출력: ${path.relative('.', root)}`);
  console.log(`  RisuLua: ${formatRisuLuaModeLabel(options.risuluaMode)}`);

  let fileCount: number;
  switch (options.type) {
    case 'charx':
      fileCount = scaffoldCharx(root, options);
      break;
    case 'module':
      fileCount = scaffoldModule(root, options);
      break;
    case 'preset':
      fileCount = scaffoldPreset(root, options);
      break;
  }

  console.log(`\n  ✅ 스캐폴딩 완료 → ${path.relative('.', root)}/`);
  console.log(`  📁 생성된 파일: ${fileCount}개`);

  printNextSteps(options.type, path.relative('.', root));
}

// ── Charx Scaffold ──────────────────────────────────────────────────

function scaffoldCharx(root: string, options: ScaffoldOptions): number {
  const sanitizedName = sanitizeFilename(options.name);
  const now = new Date().toISOString();
  let count = 0;

  // .risuchar
  writeJson(path.join(root, '.risuchar'), {
    $schema: 'https://risuai-workbench.dev/schemas/risuchar.schema.json',
    kind: 'risu.character',
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: options.name,
    creator: options.creator,
    characterVersion: '1.0',
    createdAt: now,
    modifiedAt: now,
    sourceFormat: 'scaffold',
    image: null,
    tags: [],
    flags: {
      utilityBot: false,
      lowLevelAccess: false,
    },
  });
  count++;

  // character prose files
  for (const [filePath, content] of CHARX_PROSE_PLACEHOLDERS) {
    writeText(path.join(root, filePath), content);
    count++;
  }

  // character/alternate_greetings/_order.json
  writeJson(path.join(root, 'character', 'alternate_greetings', '_order.json'), []);
  count++;

  // lorebooks/_order.json
  writeJson(path.join(root, 'lorebooks', '_order.json'), []);
  count++;

  // regex/_order.json
  writeJson(path.join(root, 'regex', '_order.json'), []);
  count++;

  // variables/<name>.risuvar
  writeText(path.join(root, 'variables', `${sanitizedName}.risuvar`), '');
  count++;

  count += scaffoldRisuLuaLayout(root, sanitizedName, options.risuluaMode);

  return count;
}

// ── Module Scaffold ─────────────────────────────────────────────────

function scaffoldModule(root: string, options: ScaffoldOptions): number {
  const sanitizedName = sanitizeFilename(options.name);
  const now = new Date().toISOString();
  let count = 0;

  // .risumodule
  const id = crypto.randomUUID();
  writeJson(
    path.join(root, RISUMODULE_FILENAME),
    buildScaffoldRisumoduleManifest({
      id,
      name: options.name,
      namespace: options.namespace,
      nowIso: now,
    }),
  );
  count++;

  // lorebooks/_order.json
  writeJson(path.join(root, 'lorebooks', '_order.json'), []);
  count++;

  // regex/_order.json
  writeJson(path.join(root, 'regex', '_order.json'), []);
  count++;

  // toggle/<name>.risutoggle
  writeText(path.join(root, 'toggle', `${sanitizedName}.risutoggle`), '');
  count++;

  count += scaffoldRisuLuaLayout(root, sanitizedName, options.risuluaMode);

  return count;
}

function scaffoldRisuLuaLayout(root: string, sanitizedName: string, mode: RisuLuaMode): number {
  if (mode === 'classic') {
    return 0;
  }

  let count = 0;

  writeText(path.join(root, 'lua', 'main.risulua'), renderRisuLuaScaffoldMain(sanitizedName));
  count++;

  for (const moduleId of RISULUA_SCAFFOLD_MODULES) {
    writeText(
      path.join(root, 'lua', ...moduleId.split('.')) + '.risulua',
      renderRisuLuaScaffoldModule(moduleId),
    );
    count++;
  }

  writeText(path.join(root, 'legacy', 'original.risulua'), '');
  count++;

  writeText(path.join(root, 'docs', 'risulua-split-report.md'), renderRisuLuaScaffoldReport(sanitizedName));
  count++;

  for (const [filePath, data] of RISULUA_SCAFFOLD_DOC_FILES) {
    writeJson(path.join(root, filePath), data);
    count++;
  }

  for (const dirName of ['sections', 'preload']) {
    fs.mkdirSync(path.join(root, 'lua', dirName), { recursive: true });
  }
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

  return count;
}

function renderRisuLuaScaffoldMain(sanitizedName: string): string {
  return [
    '-- RisuLua modular entrypoint',
    '-- 모듈식 개발: build/pack 단계에서 dist 파일이 생성됩니다.',
    '-- Generated to mirror risulua-split output so future edits have clear module boundaries.',
    '',
    ...RISULUA_SCAFFOLD_MODULES.map((moduleId) => `local ${moduleIdToLuaLocalName(moduleId)} = require("${moduleId}")`),
    '',
    'function onStart()',
    `  -- ${sanitizedName} starter`,
    '  if runtime_start.onStart then',
    '    return runtime_start.onStart()',
    '  end',
    'end',
    '',
    'function onInput(text)',
    '  if runtime_input.onInput then',
    '    return runtime_input.onInput(text)',
    '  end',
    '  return text',
    'end',
    '',
    'function onOutput(text)',
    '  if runtime_output.onOutput then',
    '    return runtime_output.onOutput(text)',
    '  end',
    '  return text',
    'end',
    '',
    'function onButtonClick(buttonId)',
    '  if runtime_button_click.onButtonClick then',
    '    return runtime_button_click.onButtonClick(buttonId, button_actions_actions)',
    '  end',
    'end',
    '',
  ].join('\n');
}

function renderRisuLuaScaffoldModule(moduleId: string): string {
  return [
    `-- ${moduleId}`,
    '-- Empty scaffold module. Add implementation here and export functions through M.',
    '',
    'local M = {}',
    '',
    'return M',
    '',
  ].join('\n');
}

function renderRisuLuaScaffoldReport(sanitizedName: string): string {
  return [
    '# RisuLua scaffold report',
    '',
    `- Target: ${sanitizedName}`,
    '- Source profile: scaffold-empty',
    '- Entry: `lua/main.risulua`',
    '- Build strategy: `concat-build-time-require`',
    '',
    'This scaffold intentionally creates empty modules for the risulua-split output structure.',
    'Use the `require("module.id")` bindings in `lua/main.risulua` as the composition root when adding code.',
    '',
  ].join('\n');
}

function moduleIdToLuaLocalName(moduleId: string): string {
  return moduleId.replace(/\./g, '_');
}

// ── Preset Scaffold ─────────────────────────────────────────────────

function scaffoldPreset(root: string, options: ScaffoldOptions): number {
  let count = 0;

  // metadata.json
  writeJson(path.join(root, 'metadata.json'), {
    name: options.name,
    preset_type: 'risuai',
    source_format: 'scaffold',
  });
  count++;

  // model.json
  writeJson(path.join(root, 'model.json'), {
    apiType: 'openai',
    aiModel: 'gpt-4o',
    subModel: 'gpt-4o',
  });
  count++;

  // parameters.json
  writeJson(path.join(root, 'parameters.json'), {
    temperature: 80,
    maxContext: 4000,
    maxResponse: 300,
    frequencyPenalty: 70,
    PresensePenalty: 70,
  });
  count++;

  // prompt_settings.json
  writeJson(path.join(root, 'prompt_settings.json'), {});
  count++;

  // instruct_settings.json
  writeJson(path.join(root, 'instruct_settings.json'), {
    useInstructPrompt: false,
  });
  count++;

  // schema_settings.json
  writeJson(path.join(root, 'schema_settings.json'), {});
  count++;

  // formatting_order.json
  writeJson(path.join(root, 'formatting_order.json'), [
    'main',
    'description',
    'personaPrompt',
    'chats',
    'lastChat',
    'jailbreak',
    'lorebook',
    'globalNote',
    'authorNote',
  ]);
  count++;

  // advanced.json
  writeJson(path.join(root, 'advanced.json'), {});
  count++;

  // prompt_template/_order.json
  writeJson(path.join(root, 'prompt_template', '_order.json'), ['main.risuprompt']);
  count++;

  // prompt_template/main.risuprompt
  writeText(
    path.join(root, 'prompt_template', 'main.risuprompt'),
    [
      '---',
      'type: plain',
      'type2: main',
      'role: system',
      'name: main',
      '---',
      '@@@ TEXT',
      'Write your main system prompt here.',
      '',
    ].join('\n'),
  );
  count++;

  // provider/ (empty directory)
  fs.mkdirSync(path.join(root, 'provider'), { recursive: true });

  return count;
}

// ── Next Steps ──────────────────────────────────────────────────────

function printNextSteps(type: ScaffoldType, relPath: string): void {
  console.log('\n  다음 단계:');

  switch (type) {
    case 'charx':
      console.log(`    1. ${relPath}/character/ 에서 캐릭터 정보를 편집하세요.`);
      console.log(`    2. risu-core pack --in ${relPath} 로 패킹하세요.`);
      break;
    case 'module':
      console.log(`    1. ${relPath}/.risumodule 에서 모듈 정보를 편집하세요.`);
      console.log(`    2. lorebooks/, regex/ 에 콘텐츠를 추가하세요.`);
      console.log(`    3. risu-core pack --in ${relPath} --format module 로 패킹하세요.`);
      break;
    case 'preset':
      console.log(`    1. ${relPath}/prompt_template/ 에서 프롬프트를 편집하세요.`);
      console.log(`    2. ${relPath}/parameters.json 에서 파라미터를 조정하세요.`);
      console.log(`    3. risu-core pack --in ${relPath} --format preset 로 패킹하세요.`);
      break;
  }

  console.log('');
}

function formatRisuLuaModeLabel(mode: RisuLuaMode): string {
  return mode === 'modular' ? '모듈식 개발' : '단일 파일 개발';
}
