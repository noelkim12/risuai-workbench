/**
 * CBS Function Database
 * Contains metadata for all CBS built-in functions with Korean descriptions
 */

export interface CBSFunctionInfo {
    name: string;
    description: string;
    aliases: string[];
    arguments: string[];
    example: string;
}

/**
 * CBS Function Database
 * All functions with Korean descriptions
 */
export const cbsFunctions: Map<string, CBSFunctionInfo> = new Map();

// Helper function to add function with all its aliases
function addFunction(info: CBSFunctionInfo): void {
    // Add main function name
    cbsFunctions.set(info.name, info);

    // Add all aliases
    for (const alias of info.aliases) {
        cbsFunctions.set(alias, info);
    }
}

// Data Access Functions (데이터 접근 함수)
addFunction({
    name: 'previous_char_chat',
    description: '이전 캐릭터 메시지를 반환합니다',
    aliases: ['previouscharchat', 'lastcharmessage'],
    arguments: [],
    example: '{{previous_char_chat}}'
});

addFunction({
    name: 'previous_user_chat',
    description: '이전 사용자 메시지를 반환합니다',
    aliases: ['previoususerchat', 'lastusermessage'],
    arguments: [],
    example: '{{previous_user_chat}}'
});

addFunction({
    name: 'char',
    description: '캐릭터의 이름 또는 별명을 반환합니다',
    aliases: ['bot'],
    arguments: [],
    example: '{{char}}'
});

addFunction({
    name: 'user',
    description: '사용자의 이름을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{user}}'
});

addFunction({
    name: 'personality',
    description: '캐릭터의 페르소나를 반환합니다',
    aliases: ['char_persona', 'charpersona'],
    arguments: [],
    example: '{{personality}}'
});

addFunction({
    name: 'description',
    description: '캐릭터의 설명을 반환합니다',
    aliases: ['char_desc', 'chardesc'],
    arguments: [],
    example: '{{description}}'
});

addFunction({
    name: 'scenario',
    description: '캐릭터의 시나리오를 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{scenario}}'
});

addFunction({
    name: 'example_dialogue',
    description: '캐릭터의 예시 대화를 반환합니다',
    aliases: ['example_message', 'exampledialogue', 'examplemessage'],
    arguments: [],
    example: '{{example_dialogue}}'
});

addFunction({
    name: 'persona',
    description: '사용자의 페르소나를 반환합니다',
    aliases: ['user_persona', 'userpersona'],
    arguments: [],
    example: '{{persona}}'
});

addFunction({
    name: 'main_prompt',
    description: '메인/시스템 프롬프트를 반환합니다',
    aliases: ['system_prompt', 'systemprompt', 'mainprompt'],
    arguments: [],
    example: '{{main_prompt}}'
});

addFunction({
    name: 'lorebook',
    description: '로어북/세계관 정보를 반환합니다',
    aliases: ['world_info', 'worldinfo'],
    arguments: [],
    example: '{{lorebook}}'
});

addFunction({
    name: 'history',
    description: '전체 채팅 기록을 반환합니다',
    aliases: ['messages'],
    arguments: [],
    example: '{{history}}'
});

addFunction({
    name: 'user_history',
    description: '사용자의 메시지 기록을 반환합니다',
    aliases: ['user_messages', 'userhistory', 'usermessages'],
    arguments: [],
    example: '{{user_history}}'
});

addFunction({
    name: 'char_history',
    description: '캐릭터의 메시지 기록을 반환합니다',
    aliases: ['char_messages', 'charhistory', 'charmessages'],
    arguments: [],
    example: '{{char_history}}'
});

addFunction({
    name: 'ujb',
    description: '전역/시스템 노트를 반환합니다',
    aliases: ['global_note', 'system_note', 'globalnote', 'systemnote'],
    arguments: [],
    example: '{{ujb}}'
});

addFunction({
    name: 'chat_index',
    description: '현재 채팅 인덱스를 반환합니다',
    aliases: ['chatindex'],
    arguments: [],
    example: '{{chat_index}}'
});

addFunction({
    name: 'first_msg_index',
    description: '첫 번째 메시지 인덱스를 반환합니다',
    aliases: ['firstmessageindex', 'firstmsgindex'],
    arguments: [],
    example: '{{first_msg_index}}'
});

addFunction({
    name: 'role',
    description: '메시지 역할을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{role}}'
});

addFunction({
    name: 'lastmessage',
    description: '마지막 메시지 데이터를 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{lastmessage}}'
});

addFunction({
    name: 'lastmessageid',
    description: '마지막 메시지 인덱스를 반환합니다',
    aliases: ['lastmessageindex'],
    arguments: [],
    example: '{{lastmessageid}}'
});

// Variable Functions (변수 함수)
addFunction({
    name: 'tempvar',
    description: '임시 변수를 가져옵니다',
    aliases: ['gettempvar'],
    arguments: ['name'],
    example: '{{tempvar::myvar}}'
});

addFunction({
    name: 'settempvar',
    description: '임시 변수를 설정합니다',
    aliases: [],
    arguments: ['name', 'value'],
    example: '{{settempvar::myvar::42}}'
});

addFunction({
    name: 'return',
    description: '반환 값을 설정하고 강제 반환합니다',
    aliases: [],
    arguments: ['value'],
    example: '{{return::done}}'
});

addFunction({
    name: 'getvar',
    description: '채팅 변수를 가져옵니다',
    aliases: [],
    arguments: ['name'],
    example: '{{getvar::score}}'
});

addFunction({
    name: 'setvar',
    description: '채팅 변수를 설정합니다',
    aliases: [],
    arguments: ['name', 'value'],
    example: '{{setvar::score::10}}'
});

addFunction({
    name: 'addvar',
    description: '채팅 변수에 값을 더합니다',
    aliases: [],
    arguments: ['name', 'value'],
    example: '{{addvar::score::1}}'
});

addFunction({
    name: 'setdefaultvar',
    description: '변수가 설정되지 않은 경우 기본값을 설정합니다',
    aliases: [],
    arguments: ['name', 'value'],
    example: '{{setdefaultvar::score::5}}'
});

addFunction({
    name: 'getglobalvar',
    description: '전역 채팅 변수를 가져옵니다',
    aliases: [],
    arguments: ['name'],
    example: '{{getglobalvar::total}}'
});

// Logic Functions (논리 함수)
addFunction({
    name: 'equal',
    description: '두 값이 같은지 확인합니다',
    aliases: [],
    arguments: ['a', 'b'],
    example: '{{equal::1::1}} 또는 {{equal::{{user}}::Alice}}'
});

addFunction({
    name: 'not_equal',
    description: '두 값이 다른지 확인합니다',
    aliases: ['notequal'],
    arguments: ['a', 'b'],
    example: '{{not_equal::1::2}}'
});

addFunction({
    name: 'greater',
    description: 'a가 b보다 큰지 확인합니다',
    aliases: [],
    arguments: ['a', 'b'],
    example: '{{greater::5::3}}'
});

addFunction({
    name: 'less',
    description: 'a가 b보다 작은지 확인합니다',
    aliases: [],
    arguments: ['a', 'b'],
    example: '{{less::2::3}}'
});

addFunction({
    name: 'greater_equal',
    description: 'a가 b보다 크거나 같은지 확인합니다',
    aliases: ['greaterequal'],
    arguments: ['a', 'b'],
    example: '{{greater_equal::3::3}}'
});

addFunction({
    name: 'less_equal',
    description: 'a가 b보다 작거나 같은지 확인합니다',
    aliases: ['lessequal'],
    arguments: ['a', 'b'],
    example: '{{less_equal::2::3}}'
});

addFunction({
    name: 'and',
    description: '두 값의 논리 AND 연산을 수행합니다',
    aliases: [],
    arguments: ['a', 'b'],
    example: '{{and::1::1}} 또는 {{and::{{equal::{{user}}::Alice}}::{{greater::{{getvar::score}}::10}}}}'
});

addFunction({
    name: 'or',
    description: '두 값의 논리 OR 연산을 수행합니다',
    aliases: [],
    arguments: ['a', 'b'],
    example: '{{or::1::0}} 또는 {{or::{{equal::{{char}}::Bob}}::{{equal::{{char}}::Alice}}}}'
});

addFunction({
    name: 'not',
    description: '값의 논리 NOT 연산을 수행합니다',
    aliases: [],
    arguments: ['a'],
    example: '{{not::1}} 또는 {{not::{{equal::{{getvar::flag}}::0}}}}'
});

addFunction({
    name: 'all',
    description: '모든 값이 1인지 확인합니다',
    aliases: [],
    arguments: ['array', '...'],
    example: '{{all::1::1::1}} 또는 {{all::{{equal::{{user}}::Alice}}::{{greater::{{getvar::level}}::5}}}}'
});

addFunction({
    name: 'any',
    description: '하나 이상의 값이 1인지 확인합니다',
    aliases: [],
    arguments: ['array', '...'],
    example: '{{any::0::1::0}} 또는 {{any::{{equal::{{user}}::Alice}}::{{equal::{{user}}::Bob}}}}'
});

addFunction({
    name: 'iserror',
    description: '문자열이 오류인지 확인합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{iserror::Error: Something}}'
});

// String Functions (문자열 함수)
addFunction({
    name: 'startswith',
    description: '문자열이 특정 문자열로 시작하는지 확인합니다',
    aliases: [],
    arguments: ['string', 'prefix'],
    example: '{{startswith::hello::he}}'
});

addFunction({
    name: 'endswith',
    description: '문자열이 특정 문자열로 끝나는지 확인합니다',
    aliases: [],
    arguments: ['string', 'suffix'],
    example: '{{endswith::hello::lo}}'
});

addFunction({
    name: 'contains',
    description: '문자열이 특정 문자열을 포함하는지 확인합니다',
    aliases: [],
    arguments: ['string', 'substring'],
    example: '{{contains::hello::el}}'
});

addFunction({
    name: 'replace',
    description: '문자열에서 모든 일치하는 항목을 대체합니다',
    aliases: [],
    arguments: ['string', 'target', 'replacement'],
    example: '{{replace::hello::l::r}} 또는 {{replace::{{user}}\'s sword::sword::shield}}'
});

addFunction({
    name: 'split',
    description: '문자열을 배열로 분할합니다',
    aliases: [],
    arguments: ['string', 'delimiter'],
    example: '{{split::a,b,c::,}} 또는 {{split::Alice|Bob|Charlie::|}}}'
});

addFunction({
    name: 'join',
    description: '배열을 문자열로 결합합니다',
    aliases: [],
    arguments: ['array', 'delimiter'],
    example: '{{join::[a,b,c]::,}}'
});

addFunction({
    name: 'spread',
    description: '배열을 :: 구분자로 펼칩니다',
    aliases: [],
    arguments: ['array'],
    example: '{{spread::[a,b,c]}}'
});

addFunction({
    name: 'trim',
    description: '문자열의 공백을 제거합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{trim:: hello }} 또는 {{upper::{{trim:: {{user}} }}}}'
});

addFunction({
    name: 'length',
    description: '문자열의 길이를 반환합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{length::hello}}'
});

addFunction({
    name: 'lower',
    description: '문자열을 소문자로 변환합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{lower::HELLO}}'
});

addFunction({
    name: 'upper',
    description: '문자열을 대문자로 변환합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{upper::hello}}'
});

addFunction({
    name: 'capitalize',
    description: '첫 글자를 대문자로 변환합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{capitalize::hello}}'
});

addFunction({
    name: 'tonumber',
    description: '문자열에서 숫자를 추출합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{tonumber::a1b2c3}}'
});

// Array Functions (배열 함수)
addFunction({
    name: 'arraylength',
    description: '배열의 길이를 반환합니다',
    aliases: ['array_length'],
    arguments: ['array'],
    example: '{{arrayelement::["a","b","c"]::1}} → b'
});

addFunction({
    name: 'arrayelement',
    description: '인덱스로 배열 요소를 가져옵니다',
    aliases: ['array_element'],
    arguments: ['array', 'index'],
    example: '{{arrayelement::[a,b,c]::1}}'
});

addFunction({
    name: 'arrayshift',
    description: '배열에서 첫 번째 요소를 제거합니다',
    aliases: ['array_shift'],
    arguments: ['array'],
    example: '{{arrayshift::[a,b,c]}}'
});

addFunction({
    name: 'arraypop',
    description: '배열에서 마지막 요소를 제거합니다',
    aliases: ['array_pop'],
    arguments: ['array'],
    example: '{{arraypop::[a,b,c]}}'
});

addFunction({
    name: 'arraypush',
    description: '배열에 값을 추가합니다',
    aliases: ['array_push'],
    arguments: ['array', 'value'],
    example: '{{arraypush::[a,b]::c}}'
});

addFunction({
    name: 'arraysplice',
    description: '배열을 분할합니다',
    aliases: ['array_splice'],
    arguments: ['array', 'start', 'deleteCount', 'item'],
    example: '{{arraysplice::[a,b,c]::1::1::x}} 또는 {{arraysplice::[1,2,3,4]::2::2}}'
});

addFunction({
    name: 'arrayassert',
    description: '배열의 인덱스에 값이 있는지 확인합니다',
    aliases: ['array_assert'],
    arguments: ['array', 'index', 'value'],
    example: '{{arrayassert::[a]::2::b}}'
});

addFunction({
    name: 'makearray',
    description: '인자들로 배열을 생성합니다',
    aliases: ['array', 'a', 'make_array'],
    arguments: ['item1', 'item2', '...'],
    example: '{{makearray::a::b::c}} 또는 {{makearray::{{user}}::{{char}}::{{getvar::npc}}}}'
});

addFunction({
    name: 'filter',
    description: '배열을 필터링합니다 (unique: 중복 제거, nonempty: 빈 값 제거, all: 모두)',
    aliases: [],
    arguments: ['array', 'type'],
    example: '{{filter::[a,,b,a]::unique}} 또는 {{filter::[a,,b,,c]::nonempty}} 또는 {{filter::[x,,y,x,z]::all}}'
});

addFunction({
    name: 'range',
    description: '범위 배열을 생성합니다',
    aliases: [],
    arguments: ['start', 'end', 'step'],
    example: '{{range::0::5::1}}'
});

// Object/Dictionary Functions (객체/딕셔너리 함수)
addFunction({
    name: 'dictelement',
    description: '키로 딕셔너리/객체 요소를 가져옵니다',
    aliases: ['dict_element', 'objectelement', 'object_element'],
    arguments: ['dict', 'key'],
    example: '{{dictelement::{"name":"John"}::name}} → John'
});

addFunction({
    name: 'object_assert',
    description: '객체에 키가 있는지 확인합니다',
    aliases: ['dict_assert', 'dictassert', 'objectassert'],
    arguments: ['dict', 'key', 'value'],
    example: '{{object_assert::{}::a::1}}'
});

addFunction({
    name: 'element',
    description: 'JSON에서 중첩된 요소를 가져옵니다',
    aliases: ['ele'],
    arguments: ['json', 'key1', 'key2', '...'],
    example: '{{element::{"user":{"name":"John"}}::user::name}} → John'
});

addFunction({
    name: 'makedict',
    description: 'key=value 쌍으로 딕셔너리/객체를 생성합니다',
    aliases: ['dict', 'd', 'make_dict', 'makeobject', 'object', 'o', 'make_object'],
    arguments: ['key1=value1', 'key2=value2', '...'],
    example: '{{makedict::a=1::b=2}}'
});

// Math Functions (수학 함수)
addFunction({
    name: 'calc',
    description: '문자열 표현식을 계산합니다',
    aliases: [],
    arguments: ['expression'],
    example: '{{calc::2+2}} 또는 {{calc::{{getvar::hp}} - 10}} 또는 {{calc::(5 + 3) * 2}}'
});

addFunction({
    name: 'round',
    description: '숫자를 반올림합니다',
    aliases: [],
    arguments: ['number'],
    example: '{{round::3.6}}'
});

addFunction({
    name: 'floor',
    description: '숫자를 내림합니다',
    aliases: [],
    arguments: ['number'],
    example: '{{floor::3.6}}'
});

addFunction({
    name: 'ceil',
    description: '숫자를 올림합니다',
    aliases: [],
    arguments: ['number'],
    example: '{{ceil::3.1}}'
});

addFunction({
    name: 'abs',
    description: '절대값을 반환합니다',
    aliases: [],
    arguments: ['number'],
    example: '{{abs::-5}}'
});

addFunction({
    name: 'remaind',
    description: '나머지 연산을 수행합니다',
    aliases: [],
    arguments: ['a', 'b'],
    example: '{{remaind::5::2}} 또는 {{remaind::{{chat_index}}::3}}'
});

addFunction({
    name: 'pow',
    description: '거듭제곱 연산을 수행합니다',
    aliases: [],
    arguments: ['base', 'exponent'],
    example: '{{pow::2::3}} 또는 {{calc::{{pow::{{getvar::level}}::2}} * 10}}'
});

addFunction({
    name: 'min',
    description: '최소값을 반환합니다',
    aliases: [],
    arguments: ['array', '...'],
    example: '{{min::1::2::3}}'
});

addFunction({
    name: 'max',
    description: '최대값을 반환합니다',
    aliases: [],
    arguments: ['array', '...'],
    example: '{{max::1::2::3}}'
});

addFunction({
    name: 'sum',
    description: '값들의 합계를 반환합니다',
    aliases: [],
    arguments: ['array', '...'],
    example: '{{sum::1::2::3}}'
});

addFunction({
    name: 'average',
    description: '값들의 평균을 반환합니다',
    aliases: [],
    arguments: ['array', '...'],
    example: '{{average::1::2::3}}'
});

addFunction({
    name: 'fixnum',
    description: '숫자를 소수점 자리수로 고정합니다',
    aliases: ['fix_num', 'fixnumber', 'fix_number'],
    arguments: ['number', 'decimals'],
    example: '{{fixnum::3.14159::2}}'
});

addFunction({
    name: 'randint',
    description: '범위 내의 랜덤 정수를 생성합니다',
    aliases: [],
    arguments: ['min', 'max'],
    example: '{{randint::1::10}}'
});

addFunction({
    name: 'dice',
    description: 'NdM 표기법으로 주사위를 굴립니다',
    aliases: [],
    arguments: ['NdM'],
    example: '{{dice::2d6}}'
});

addFunction({
    name: 'fromhex',
    description: '16진수를 10진수로 변환합니다',
    aliases: [],
    arguments: ['hex'],
    example: '{{fromhex::1a}}'
});

addFunction({
    name: 'tohex',
    description: '10진수를 16진수로 변환합니다',
    aliases: [],
    arguments: ['number'],
    example: '{{tohex::26}}'
});

// Time/Date Functions (시간/날짜 함수)
addFunction({
    name: 'message_time',
    description: '메시지의 시간을 반환합니다',
    aliases: ['messagetime'],
    arguments: [],
    example: '{{message_time}}'
});

addFunction({
    name: 'message_date',
    description: '메시지의 날짜를 반환합니다',
    aliases: ['messagedate'],
    arguments: [],
    example: '{{message_date}}'
});

addFunction({
    name: 'message_unixtime_array',
    description: '메시지 유닉스 시간 배열을 반환합니다',
    aliases: ['messageunixtimearray'],
    arguments: [],
    example: '{{message_unixtime_array}}'
});

addFunction({
    name: 'unixtime',
    description: '현재 유닉스 시간을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{unixtime}}'
});

addFunction({
    name: 'time',
    description: '현재 시간을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{time}}'
});

addFunction({
    name: 'date',
    description: '날짜/시간을 형식화합니다 (Moment.js 형식)',
    aliases: ['datetimeformat', 'date_time_format'],
    arguments: ['format', 'timestamp'],
    example: '{{date::YYYY-MM-DD::1620000000000}} 또는 {{date::HH:mm:ss::{{unixtime}}}} 또는 {{date::MMMM Do YYYY, h:mm a::{{unixtime}}}}'
});

addFunction({
    name: 'isotime',
    description: '현재 UTC 시간을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{isotime}}'
});

addFunction({
    name: 'isodate',
    description: '현재 UTC 날짜를 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{isodate}}'
});

addFunction({
    name: 'message_idle_duration',
    description: '마지막 두 사용자 메시지 사이의 유휴 시간을 반환합니다',
    aliases: ['messageidleduration'],
    arguments: [],
    example: '{{message_idle_duration}}'
});

addFunction({
    name: 'idle_duration',
    description: '마지막 메시지 이후의 유휴 시간을 반환합니다',
    aliases: ['idleduration'],
    arguments: [],
    example: '{{idle_duration}}'
});

// Media Functions (미디어 함수)
addFunction({
    name: 'asset',
    description: '이름으로 에셋 이미지를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{asset::image.png}}'
});

addFunction({
    name: 'emotion',
    description: '이름으로 감정 이미지를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{emotion::happy}}'
});

addFunction({
    name: 'audio',
    description: '이름으로 오디오를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{audio::sound.mp3}}'
});

addFunction({
    name: 'bg',
    description: '100% 너비와 높이로 이미지를 반환합니다 (배경용)',
    aliases: [],
    arguments: ['name'],
    example: '{{bg::image.png}}'
});

addFunction({
    name: 'video',
    description: '이름으로 비디오를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{video::video.mp4}}'
});

addFunction({
    name: 'video-img',
    description: '이미지처럼 스타일이 지정된 비디오를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{video-img::video.mp4}}'
});

addFunction({
    name: 'path',
    description: '파일 경로 문자열을 반환합니다',
    aliases: ['raw'],
    arguments: ['name'],
    example: '{{path::image.png}}'
});

addFunction({
    name: 'image',
    description: '이름으로 이미지를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{image::image.png}}'
});

addFunction({
    name: 'img',
    description: '스타일 없이 이미지를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{img::image.png}}'
});

addFunction({
    name: 'bgm',
    description: '숨겨진 오디오를 반환합니다 (배경음악용)',
    aliases: [],
    arguments: ['name'],
    example: '{{bgm::sound.mp3}}'
});

addFunction({
    name: 'inlay',
    description: '인레이 데이터에서 이미지를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{inlay::image.png}}'
});

addFunction({
    name: 'inlayed',
    description: '스타일이 지정된 인레이 데이터에서 이미지를 반환합니다',
    aliases: [],
    arguments: ['name'],
    example: '{{inlayed::image.png}}'
});

addFunction({
    name: 'inlayeddata',
    description: '스타일과 데이터가 포함된 인레이 이미지를 반환합니다 (AI에 전송됨)',
    aliases: [],
    arguments: ['name'],
    example: '{{inlayeddata::image.png}}'
});

addFunction({
    name: 'emotionlist',
    description: '감정 이름 목록을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{emotionlist}}'
});

addFunction({
    name: 'assetlist',
    description: '에셋 이름 목록을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{assetlist}}'
});

// Random Functions (랜덤 함수)
addFunction({
    name: 'random',
    description: '인자 중 하나를 랜덤하게 선택합니다',
    aliases: [],
    arguments: ['arg1', 'arg2', 'arg3', '...'],
    example: '{{random::a::b::c}}'
});

addFunction({
    name: 'pick',
    description: 'random과 같지만 메시지 인덱스로 시드가 고정되어 일관된 출력을 제공합니다',
    aliases: [],
    arguments: ['arg1', 'arg2', 'arg3', '...'],
    example: '{{pick::a::b::c}}'
});

addFunction({
    name: 'roll',
    description: '1부터 지정된 숫자까지 랜덤 정수를 반환합니다',
    aliases: [],
    arguments: ['number'],
    example: '{{roll::6}}'
});

addFunction({
    name: 'rollp',
    description: 'roll과 같지만 메시지 인덱스로 시드가 고정되어 일관된 출력을 제공합니다',
    aliases: [],
    arguments: ['number'],
    example: '{{rollp::6}}'
});

addFunction({
    name: 'hash',
    description: '문자열을 해시합니다',
    aliases: [],
    arguments: ['string'],
    example: '{{hash::hello}}'
});

// System Functions (시스템 함수)
addFunction({
    name: 'blank',
    description: '빈 문자열을 반환합니다',
    aliases: ['none'],
    arguments: [],
    example: '{{blank}}'
});

addFunction({
    name: 'br',
    description: '개행(줄바꿈) 문자를 반환합니다',
    aliases: ['newline'],
    arguments: [],
    example: '{{br}}'
});

addFunction({
    name: 'cbr',
    description: '리터럴 개행 문자열을 반환합니다',
    aliases: ['cnl', 'cnewline'],
    arguments: [],
    example: '{{cbr}}'
});

addFunction({
    name: 'decbo',
    description: '특수 여는 중괄호 문자를 반환합니다',
    aliases: ['displayescapedcurlybracketopen'],
    arguments: [],
    example: '{{decbo}}'
});

addFunction({
    name: 'decbc',
    description: '특수 닫는 중괄호 문자를 반환합니다',
    aliases: ['displayescapedcurlybracketclose'],
    arguments: [],
    example: '{{decbc}}'
});

addFunction({
    name: 'bo',
    description: '이중 여는 중괄호 문자를 반환합니다',
    aliases: ['ddecbo', 'doubledisplayescapedcurlybracketopen'],
    arguments: [],
    example: '{{bo}}'
});

addFunction({
    name: 'bc',
    description: '이중 닫는 중괄호 문자를 반환합니다',
    aliases: ['ddecbc', 'doubledisplayescapedcurlybracketclose'],
    arguments: [],
    example: '{{bc}}'
});

addFunction({
    name: 'model',
    description: '현재 AI 모델을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{model}}'
});

addFunction({
    name: 'axmodel',
    description: '서브모델을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{axmodel}}'
});

addFunction({
    name: 'isfirstmsg',
    description: '첫 번째 메시지이면 1, 아니면 0을 반환합니다',
    aliases: ['is_first_msg', 'is_first_message', 'isfirstmessage'],
    arguments: [],
    example: '{{isfirstmsg}}'
});

addFunction({
    name: 'maxcontext',
    description: '최대 컨텍스트 값을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{maxcontext}}'
});

addFunction({
    name: 'prefill_supported',
    description: '프리필이 지원되면 1을 반환합니다',
    aliases: ['prefillsupported', 'prefill'],
    arguments: [],
    example: '{{prefill_supported}}'
});

addFunction({
    name: 'screen_width',
    description: '화면 너비를 반환합니다',
    aliases: ['screenwidth'],
    arguments: [],
    example: '{{screen_width}}'
});

addFunction({
    name: 'screen_height',
    description: '화면 높이를 반환합니다',
    aliases: ['screenheight'],
    arguments: [],
    example: '{{screen_height}}'
});

addFunction({
    name: 'button',
    description: '버튼을 생성합니다',
    aliases: [],
    arguments: ['label', 'action'],
    example: '{{button::Click Me::trigger_command}}'
});

addFunction({
    name: 'risu',
    description: 'Risu 로고 이미지를 삽입합니다',
    aliases: [],
    arguments: ['size'],
    example: '{{risu::60}}'
});

addFunction({
    name: 'file',
    description: '파일을 표시하거나 base64를 디코드합니다',
    aliases: [],
    arguments: ['name', 'base64data'],
    example: '{{file::filename.txt::YmFzZTY0}}'
});

addFunction({
    name: 'previous_chat_log',
    description: '인덱스로 이전 채팅 로그를 가져옵니다',
    aliases: [],
    arguments: ['index'],
    example: '{{previous_chat_log::2}}'
});

addFunction({
    name: 'unicode_encode',
    description: '문자의 유니코드 코드를 가져옵니다',
    aliases: ['unicodeencode'],
    arguments: ['string', 'index'],
    example: '{{unicode_encode::A}}'
});

addFunction({
    name: 'unicode_decode',
    description: '유니코드 코드를 문자로 디코드합니다',
    aliases: ['unicodedecode'],
    arguments: ['code'],
    example: '{{unicode_decode::65}}'
});

addFunction({
    name: 'u',
    description: '16진수에서 유니코드를 디코드합니다',
    aliases: ['unicodedecodefromhex'],
    arguments: ['hex'],
    example: '{{u::41}}'
});

addFunction({
    name: 'ue',
    description: '16진수에서 유니코드를 인코드합니다',
    aliases: ['unicodeencodefromhex'],
    arguments: ['hex'],
    example: '{{ue::41}}'
});

addFunction({
    name: 'metadata',
    description: '메타데이터 값을 가져옵니다 (mobile, local, node, version, lang 등)',
    aliases: [],
    arguments: ['key'],
    example: '{{metadata::version}}'
});

addFunction({
    name: 'module_enabled',
    description: '모듈이 활성화되었는지 확인합니다',
    aliases: ['moduleenabled'],
    arguments: ['namespace'],
    example: '{{module_enabled::modulename}}'
});

addFunction({
    name: 'module_assetlist',
    description: '모듈에서 에셋 목록을 가져옵니다',
    aliases: ['moduleassetlist'],
    arguments: ['namespace'],
    example: '{{module_assetlist::modulename}}'
});

addFunction({
    name: '?',
    description: '수학 연산을 수행합니다 (+ - * / ^ % < > <= >= || && == != ! 지원)',
    aliases: [],
    arguments: ['expression'],
    example: '{{? 1 + 2 * 6}}'
});

addFunction({
    name: 'slot',
    description: '반복 중인 현재 요소를 반환합니다. 인자 없이 사용하면 컨텍스트에 따라 다른 값을 반환하고, 이름을 지정하면 해당 이름의 슬롯 값을 반환합니다',
    aliases: [],
    arguments: ['name?'],
    example: '{{slot}} 또는 {{slot::name}}'
});

// Encryption/Obfuscation Functions (암호화/난독화 함수)
addFunction({
    name: 'xor',
    description: 'XOR 암호를 사용하여 문자열을 암호화하고 base64로 인코딩합니다 (0xFF 키 사용)',
    aliases: ['xorencrypt', 'xorencode', 'xore'],
    arguments: ['string'],
    example: '{{xor::hello}} 또는 {{xor::{{getvar::secret}}}}'
});

addFunction({
    name: 'xordecrypt',
    description: 'base64로 인코딩된 XOR 암호화 문자열을 원본 텍스트로 복호화합니다',
    aliases: ['xordecode', 'xord'],
    arguments: ['base64string'],
    example: '{{xordecrypt::aGVsbG8=}} 또는 {{xordecrypt::{{getvar::encrypted}}}}'
});

addFunction({
    name: 'crypt',
    description: '사용자 정의 시프트 값으로 카이사르 암호 암호화/복호화를 적용합니다 (기본값: 32768). 기본 시프트를 사용하면 암호화와 복호화 모두에 사용할 수 있습니다',
    aliases: ['crypto', 'caesar', 'encrypt', 'decrypt'],
    arguments: ['string', 'shift?'],
    example: '{{crypt::hello}} 또는 {{crypt::hello::1000}} 또는 {{crypt::{{crypt::message}}}} (암호화 후 복호화)'
});

// Utility Functions (유틸리티 함수)
addFunction({
    name: 'reverse',
    description: '입력 문자열을 거꾸로 뒤집습니다',
    aliases: [],
    arguments: ['string'],
    example: '{{reverse::hello}} 또는 {{reverse::{{user}}}}'
});

addFunction({
    name: 'comment',
    description: '코드 주석을 위한 CBS 함수입니다. 채팅에 표시되지만 처리되지 않습니다',
    aliases: [],
    arguments: ['text'],
    example: '{{comment::이것은 주석입니다}} 또는 {{comment::TODO: 나중에 수정}}'
});

// Display Escape Functions (표시 이스케이프 함수)
addFunction({
    name: 'displayescapedbracketopen',
    description: '여는 괄호 (를 표시하지만 파싱에 영향을 주지 않는 특수 유니코드 문자를 반환합니다',
    aliases: ['debo', '('],
    arguments: [],
    example: '{{displayescapedbracketopen}}'
});

addFunction({
    name: 'displayescapedbracketclose',
    description: '닫는 괄호 )를 표시하지만 파싱에 영향을 주지 않는 특수 유니코드 문자를 반환합니다',
    aliases: ['debc', ')'],
    arguments: [],
    example: '{{displayescapedbracketclose}}'
});

addFunction({
    name: 'displayescapedanglebracketopen',
    description: '여는 꺾쇠괄호 <를 표시하지만 HTML 파싱에 영향을 주지 않는 특수 유니코드 문자를 반환합니다',
    aliases: ['deabo', '<'],
    arguments: [],
    example: '{{displayescapedanglebracketopen}}'
});

addFunction({
    name: 'displayescapedanglebracketclose',
    description: '닫는 꺾쇠괄호 >를 표시하지만 HTML 파싱에 영향을 주지 않는 특수 유니코드 문자를 반환합니다',
    aliases: ['deabc', '>'],
    arguments: [],
    example: '{{displayescapedanglebracketclose}}'
});

addFunction({
    name: 'displayescapedcolon',
    description: '콜론 :을 표시하지만 CBS 인자 구분자로 파싱되지 않는 특수 유니코드 문자를 반환합니다',
    aliases: ['dec', ':'],
    arguments: [],
    example: '{{displayescapedcolon}}'
});

addFunction({
    name: 'displayescapedsemicolon',
    description: '세미콜론 ;을 표시하지만 파싱에 영향을 주지 않는 특수 유니코드 문자를 반환합니다',
    aliases: [';'],
    arguments: [],
    example: '{{displayescapedsemicolon}}'
});

addFunction({
    name: 'chardisplayasset',
    description: '미리 빌드된 에셋 제외 설정으로 필터링된 캐릭터 표시 에셋 이름의 JSON 배열을 반환합니다',
    aliases: [],
    arguments: [],
    example: '{{chardisplayasset}}'
});

addFunction({
    name: 'source',
    description: '사용자 또는 캐릭터의 프로필 이미지 소스 URL을 반환합니다. 인자는 "user" 또는 "char"이어야 합니다',
    aliases: [],
    arguments: ['type'],
    example: '{{source::user}} 또는 {{source::char}}'
});

addFunction({
    name: 'position',
    description: '@@position <positionName> 데코레이터와 같은 다양한 기능에서 사용할 수 있는 위치를 정의합니다',
    aliases: [],
    arguments: ['positionName'],
    example: '{{position::positionName}}'
});

// Block/Control Flow Functions (블록/제어 흐름 함수)
addFunction({
    name: '#if',
    description: 'CBS의 조건문입니다. 1과 "true"는 참이고, 그 외는 거짓입니다. (더 이상 사용되지 않음: #when 사용 권장)',
    aliases: [],
    arguments: ['condition'],
    example: '{{#if condition}}...{{/if}} (더 이상 사용되지 않음: {{#when condition}}...{{/when}} 사용 권장)'
});

addFunction({
    name: '#if_pure',
    description: '공백 처리를 유지하는 CBS 조건문입니다. 1과 "true"는 참이고, 그 외는 거짓입니다. (더 이상 사용되지 않음: #when::keep 사용 권장)',
    aliases: [],
    arguments: ['condition'],
    example: '{{#if_pure condition}}...{{/if_pure}} (더 이상 사용되지 않음: {{#when::keep::condition}}...{{/when}} 사용 권장)'
});

addFunction({
    name: '#when',
    description: 'CBS의 조건문입니다. 1과 "true"는 참이고, 그 외는 거짓입니다. 다양한 연산자를 지원합니다 (and, or, is, isnot, >, <, >=, <=, not, keep, legacy, var, vis, vnotis, toggle, tis, tnotis)',
    aliases: [],
    arguments: ['condition', 'operator?', '...'],
    example: '{{#when condition}}...{{/when}} 또는 {{#when::A::and::B}}...{{/when}} 또는 {{#when::keep::not::condition}}...{{/when}}'
});

addFunction({
    name: ':else',
    description: 'CBS의 else 문입니다. {{#when}} 내부에서 사용되어야 합니다. {{#when}}이 여러 줄인 경우 :else는 추가 문자열 없이 별도 줄에 있어야 합니다',
    aliases: [],
    arguments: [],
    example: '{{#when condition}}...{{:else}}...{{/when}}'
});

addFunction({
    name: '#pure',
    description: 'CBS 처리 없이 내용을 표시합니다. 원시 HTML이나 다른 콘텐츠를 파싱 없이 표시할 때 유용합니다. (더 이상 사용되지 않음: #puredisplay 사용 권장)',
    aliases: [],
    arguments: [],
    example: '{{#pure}}...{{/pure}} (더 이상 사용되지 않음: {{#puredisplay}}...{{/puredisplay}} 사용 권장)'
});

addFunction({
    name: '#puredisplay',
    description: 'CBS 처리 없이 내용을 표시합니다. 원시 HTML이나 다른 콘텐츠를 파싱 없이 표시할 때 유용합니다',
    aliases: [],
    arguments: [],
    example: '{{#puredisplay}}...{{/puredisplay}}'
});

addFunction({
    name: '#each',
    description: '배열이나 객체를 반복합니다. 객체의 경우 "as key" 구문으로 키에 접근할 수 있습니다',
    aliases: [':each'],
    arguments: ['array_or_object', 'as?', 'key?'],
    example: '{{#each array}}...{{/each}} 또는 {{#each object as key}}{{slot::key}}...{{/each}}'
});

addFunction({
    name: '//',
    description: '코드를 주석 처리하는 CBS 주석입니다. 출력에 표시되지 않습니다',
    aliases: [],
    arguments: ['comment'],
    example: '{{// 이것은 주석입니다}}'
});

addFunction({
    name: 'hiddenkey',
    description: '로어북 활성화를 위한 키로 작동하지만, 모델 요청에는 포함되지 않습니다',
    aliases: [],
    arguments: ['value'],
    example: '{{hiddenkey::some_value}}'
});

addFunction({
    name: 'trigger_id',
    description: '수동 트리거를 발생시킨 클릭된 요소의 risu-id 속성에서 ID 값을 반환합니다. ID가 제공되지 않은 경우 "null"을 반환합니다',
    aliases: ['triggerid'],
    arguments: [],
    example: '{{trigger_id}}'
});

addFunction({
    name: 'jb',
    description: 'AI 동작을 수정하는 데 사용되는 탈옥(jailbreak) 프롬프트 텍스트를 반환합니다. 텍스트는 변수 치환을 위해 채팅 파서를 통해 처리됩니다',
    aliases: ['jailbreak'],
    arguments: [],
    example: '{{jb}}'
});

addFunction({
    name: 'jbtoggled',
    description: '탈옥 프롬프트가 현재 활성화/켜져 있으면 "1"을 반환하고, 비활성화되어 있으면 "0"을 반환합니다. 전역 탈옥 토글 상태를 반영합니다',
    aliases: [],
    arguments: [],
    example: '{{jbtoggled}}'
});

/**
 * Get function information by name or alias
 */
export function getFunctionInfo(name: string): CBSFunctionInfo | undefined {
    return cbsFunctions.get(name.toLowerCase());
}