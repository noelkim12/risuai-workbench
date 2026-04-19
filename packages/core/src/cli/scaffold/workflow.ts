import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJson, writeText } from '@/node/fs-helpers';
import { sanitizeFilename } from '../../utils/filenames';

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
    -h, --help          도움말

  Examples:
    risu-core scaffold charx --name "My Character" --creator "Author"
    risu-core scaffold module --name "RPG Module"
    risu-core scaffold preset --name "My Preset" --out ./presets/my-preset
`;

// ── Types ───────────────────────────────────────────────────────────

type ScaffoldType = 'charx' | 'module' | 'preset';

interface ScaffoldOptions {
  type: ScaffoldType;
  name: string;
  outDir: string;
  creator: string;
}

const SCAFFOLD_TYPES = new Set<string>(['charx', 'module', 'preset']);

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
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }
}

// ── Option Parsing ──────────────────────────────────────────────────

function parseOptions(argv: readonly string[]): ScaffoldOptions {
  const typeArg = argv[0];
  if (!typeArg || !SCAFFOLD_TYPES.has(typeArg)) {
    throw new Error(
      `지원하지 않는 스캐폴드 타입: ${typeArg ?? '(없음)'}\n  지원 타입: charx, module, preset`,
    );
  }

  const name = argValue(argv, '--name');
  if (!name) {
    throw new Error('--name 옵션이 필요합니다.');
  }

  const sanitizedName = sanitizeFilename(name);
  const outDir = argValue(argv, '--out') || `./${sanitizedName}`;
  const creator = argValue(argv, '--creator') || '';

  return {
    type: typeArg as ScaffoldType,
    name,
    outDir,
    creator,
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
  let count = 0;

  // character/metadata.json
  writeJson(path.join(root, 'character', 'metadata.json'), {
    name: options.name,
    creator: options.creator,
    character_version: '1.0',
    creation_date: Date.now(),
    modification_date: null,
    utilityBot: false,
    lowLevelAccess: false,
  });
  count++;

  // character text files
  const textFiles: Array<[string, string]> = [
    ['character/description.txt', '캐릭터 설명을 여기에 작성하세요.\n'],
    ['character/first_mes.txt', '첫 번째 메시지를 여기에 작성하세요.\n'],
    ['character/system_prompt.txt', ''],
    ['character/post_history_instructions.txt', ''],
    ['character/creator_notes.txt', ''],
    ['character/additional_text.txt', ''],
  ];

  for (const [filePath, content] of textFiles) {
    writeText(path.join(root, filePath), content);
    count++;
  }

  // character/alternate_greetings.json
  writeJson(path.join(root, 'character', 'alternate_greetings.json'), []);
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

  return count;
}

// ── Module Scaffold ─────────────────────────────────────────────────

function scaffoldModule(root: string, options: ScaffoldOptions): number {
  const sanitizedName = sanitizeFilename(options.name);
  let count = 0;

  // metadata.json
  writeJson(path.join(root, 'metadata.json'), {
    name: options.name,
    description: '',
    id: crypto.randomUUID(),
    lowLevelAccess: false,
    hideIcon: false,
  });
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

  return count;
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
  writeJson(path.join(root, 'prompt_template', '_order.json'), [
    'main.risuprompt',
  ]);
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
      console.log(`    1. ${relPath}/metadata.json 에서 모듈 정보를 편집하세요.`);
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

// ── Utility ─────────────────────────────────────────────────────────

function argValue(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}
