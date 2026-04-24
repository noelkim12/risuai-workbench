/** CBS builtin function metadata */
export interface CBSBuiltinFunction {
  name: string;
  aliases: string[];
  description: string;
  descriptionKo?: string;
  arguments: ArgumentDef[];
  isBlock: boolean;
  docOnly?: boolean;
  contextual?: boolean;
  deprecated?: { message: string; replacement?: string };
  internalOnly?: boolean;
  returnType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'void';
  category: FunctionCategory;
}

/** CBS builtin argument metadata */
export interface ArgumentDef {
  name: string;
  description: string;
  required: boolean;
  variadic: boolean;
}

/** CBS builtin category name */
export type FunctionCategory =
  | 'identity'
  | 'prompt'
  | 'history'
  | 'time'
  | 'variable'
  | 'comparison'
  | 'math'
  | 'string'
  | 'array'
  | 'random'
  | 'encoding'
  | 'display'
  | 'escape'
  | 'asset'
  | 'block'
  | 'utility';

interface RawBuiltinFunction {
  name: string;
  aliases: string[];
  description: string;
  docOnly?: boolean;
  contextual?: boolean;
  deprecated?: { message: string; replacement?: string };
  internalOnly?: boolean;
}

function createArgument(
  name: string,
  description: string,
  options: Partial<Pick<ArgumentDef, 'required' | 'variadic'>> = {},
): ArgumentDef {
  return {
    name,
    description,
    required: options.required ?? true,
    variadic: options.variadic ?? false,
  };
}

const RAW_UPSTREAM_BUILTINS: ReadonlyArray<RawBuiltinFunction> = [
  {
    name: 'char',
    aliases: ['bot'],
    description:
      'Returns the name or nickname of the current character/bot. In consistent character mode, returns "botname". For group chats, returns the group name.\n\nUsage:: {{char}}',
  },
  {
    name: 'user',
    aliases: [],
    description:
      'Returns the current user\'s name as set in user settings. In consistent character mode, returns "username".\n\nUsage:: {{user}}',
  },
  {
    name: 'trigger_id',
    aliases: ['triggerid'],
    description:
      'Returns the ID value from the risu-id attribute of the clicked element that triggered the manual trigger. Returns "null" if no ID was provided.\n\nUsage:: {{trigger_id}}',
  },
  {
    name: 'previouscharchat',
    aliases: ['previouscharchat', 'lastcharmessage'],
    description:
      'Returns the last message sent by the character in the current chat. Searches backwards from the current message position to find the most recent character message. If no character messages exist, returns the first message or selected alternate greeting.\n\nUsage:: {{previouscharchat}}',
  },
  {
    name: 'previoususerchat',
    aliases: ['previoususerchat', 'lastusermessage'],
    description:
      'Returns the last message sent by the user in the current chat. Searches backwards from the current message position to find the most recent user message. Only works when chatID is available (not -1). Returns empty string if no user messages found.\n\nUsage:: {{previoususerchat}}',
  },
  {
    name: 'personality',
    aliases: ['charpersona'],
    description:
      'Returns the personality field of the current character. The text is processed through the chat parser for variable substitution. Returns empty string for group chats.\n\nUsage:: {{personality}}',
  },
  {
    name: 'description',
    aliases: ['chardesc'],
    description:
      'Returns the description field of the current character. The text is processed through the chat parser for variable substitution. Returns empty string for group chats.\n\nUsage:: {{description}}',
  },
  {
    name: 'scenario',
    aliases: [],
    description:
      'Returns the scenario field of the current character. The text is processed through the chat parser for variable substitution. Returns empty string for group chats.\n\nUsage:: {{scenario}}',
  },
  {
    name: 'exampledialogue',
    aliases: ['examplemessage', 'example_dialogue'],
    description:
      'Returns the example dialogue/message field of the current character. The text is processed through the chat parser for variable substitution. Returns empty string for group chats.\n\nUsage:: {{exampledialogue}}',
  },
  {
    name: 'persona',
    aliases: ['userpersona'],
    description:
      "Returns the user persona prompt text. The text is processed through the chat parser for variable substitution. This contains the user's character description/personality.\n\nUsage:: {{persona}}",
  },
  {
    name: 'mainprompt',
    aliases: ['systemprompt', 'main_prompt'],
    description:
      'Returns the main system prompt that provides instructions to the AI model. The text is processed through the chat parser for variable substitution.\n\nUsage:: {{mainprompt}}',
  },
  {
    name: 'lorebook',
    aliases: ['worldinfo'],
    description:
      "Returns all active lorebook entries as a JSON array. Combines character lorebook, chat-specific lorebook, and module lorebooks. Each entry is JSON.stringify'd.\n\nUsage:: {{lorebook}}",
  },
  {
    name: 'userhistory',
    aliases: ['usermessages', 'user_history'],
    description:
      'Returns all user messages in the current chat as a JSON array. Each message object contains role, data, and other metadata. Data is processed through chat parser.\n\nUsage:: {{userhistory}}',
  },
  {
    name: 'charhistory',
    aliases: ['charmessages', 'char_history'],
    description:
      'Returns all character messages in the current chat as a JSON array. Each message object contains role, data, and other metadata. Data is processed through chat parser.\n\nUsage:: {{charhistory}}',
  },
  {
    name: 'jb',
    aliases: ['jailbreak'],
    description:
      'Returns the jailbreak prompt text used to modify AI behavior. The text is processed through the chat parser for variable substitution.\n\nUsage:: {{jb}}',
  },
  {
    name: 'globalnote',
    aliases: ['globalnote', 'systemnote', 'ujb'],
    description:
      'Returns the global note (also called system note) that is appended to prompts. The text is processed through the chat parser for variable substitution.\n\nUsage:: {{globalnote}}',
  },
  {
    name: 'authornote',
    aliases: ['author_note'],
    description:
      "Returns the author's note for the current chat. Falls back to the default author's note text from the prompt template if the chat doesn't have a custom one. The text is processed through the chat parser for variable substitution.\n\nUsage:: {{authornote}}",
  },
  {
    name: 'chatindex',
    aliases: ['chat_index'],
    description:
      'Returns the current message index in the chat as a string. -1 indicates no specific message context.\n\nUsage:: {{chatindex}}',
  },
  {
    name: 'firstmsgindex',
    aliases: ['firstmessageindex', 'first_msg_index'],
    description:
      'Returns the index of the selected first message/alternate greeting as a string. -1 indicates the default first message is used.\n\nUsage:: {{firstmsgindex}}',
  },
  {
    name: 'blank',
    aliases: ['none'],
    description:
      'Returns an empty string. Useful for clearing variables or creating conditional empty outputs.\n\nUsage:: {{blank}}',
  },
  {
    name: 'messagetime',
    aliases: ['message_time'],
    description:
      'Returns the time when the current message was sent in local time format (HH:MM:SS). Returns "00:00:00" in tokenization mode or error messages for old/invalid messages.\n\nUsage:: {{messagetime}}',
  },
  {
    name: 'messagedate',
    aliases: ['message_date'],
    description:
      'Returns the date when the current message was sent in local date format. Returns "00:00:00" in tokenization mode or error messages for old/invalid messages.\n\nUsage:: {{messagedate}}',
  },
  {
    name: 'messageunixtimearray',
    aliases: ['message_unixtime_array'],
    description:
      'Returns all message timestamps as a JSON array of unix timestamps (in milliseconds). Messages without timestamps show as 0.\n\nUsage:: {{messageunixtimearray}}',
  },
  {
    name: 'unixtime',
    aliases: [],
    description:
      'Returns the current unix timestamp in seconds as a string. Useful for time-based calculations and logging.\n\nUsage:: {{unixtime}}',
  },
  {
    name: 'time',
    aliases: [],
    description:
      'Returns the current local time in HH:MM:SS format. Updates in real-time when the function is called.\n\nUsage:: {{time}}',
  },
  {
    name: 'isotime',
    aliases: [],
    description:
      'Returns the current UTC time in HH:MM:SS format. Useful for timezone-independent time references.\n\nUsage:: {{isotime}}',
  },
  {
    name: 'isodate',
    aliases: [],
    description:
      'Returns the current UTC date in YYYY-MM-DD format (month not zero-padded). Useful for timezone-independent date references.\n\nUsage:: {{isodate}}',
  },
  {
    name: 'messageidleduration',
    aliases: ['message_idle_duration'],
    description:
      'Returns time duration between the current and previous user messages in HH:MM:SS format. Requires valid message times. Returns error messages if no messages found or timestamps missing.\n\nUsage:: {{messageidleduration}}',
  },
  {
    name: 'idleduration',
    aliases: ['idle_duration'],
    description:
      'Returns time duration since the last message in the chat in HH:MM:SS format. Calculates from current time to last message timestamp. Returns "00:00:00" in tokenization mode or error for missing timestamps.\n\nUsage:: {{idleduration}}',
  },
  {
    name: 'br',
    aliases: ['newline'],
    description:
      'Returns a literal newline character (\\n). Useful for formatting text with line breaks in templates.\n\nUsage:: {{br}}',
  },
  {
    name: 'model',
    aliases: [],
    description:
      'Returns the ID/name of the currently selected AI model (e.g., "gpt-4", "claude-3-opus").\n\nUsage:: {{model}}',
  },
  {
    name: 'axmodel',
    aliases: [],
    description:
      'Returns the currently selected sub/auxiliary model ID. Used for specialized tasks like embedding or secondary processing.\n\nUsage:: {{axmodel}}',
  },
  {
    name: 'role',
    aliases: [],
    description:
      'Returns the role of the current message ("user", "char", "system"). Uses chatRole from conditions if available, "char" for first messages, or actual message role.\n\nUsage:: {{role}}',
  },
  {
    name: 'isfirstmsg',
    aliases: ['isfirstmsg', 'isfirstmessage'],
    description:
      'Returns "1" if the current context is the first message/greeting, "0" otherwise. Checks the firstmsg condition flag.\n\nUsage:: {{isfirstmsg}}',
  },
  {
    name: 'jbtoggled',
    aliases: [],
    description:
      'Returns "1" if the jailbreak prompt is currently enabled/toggled on, "0" if disabled. Reflects the global jailbreak toggle state.\n\nUsage:: {{jbtoggled}}',
  },
  {
    name: 'maxcontext',
    aliases: [],
    description:
      'Returns the maximum context length setting as a string (e.g., "4096", "8192"). This is the token limit for the current model configuration.\n\nUsage:: {{maxcontext}}',
  },
  {
    name: 'lastmessage',
    aliases: [],
    description:
      'Returns the content/data of the last message in the current chat, regardless of role (user/char). Returns empty string if no character selected.\n\nUsage:: {{lastmessage}}',
  },
  {
    name: 'lastmessageid',
    aliases: ['lastmessageindex'],
    description:
      'Returns the index of the last message in the chat as a string (0-based indexing). Returns empty string if no character selected.\n\nUsage:: {{lastmessageid}}',
  },
  {
    name: 'tempvar',
    aliases: ['gettempvar'],
    description:
      "Gets the value of a temporary variable by name. Temporary variables only exist during the current script execution. Returns empty string if variable doesn't exist.\n\nUsage:: {{tempvar::variableName}}",
  },
  {
    name: 'settempvar',
    aliases: [],
    description:
      'Sets a temporary variable to the specified value. Temporary variables only exist during current script execution. Always returns empty string.\n\nUsage:: {{settempvar::variableName::value}}',
  },
  {
    name: 'return',
    aliases: [],
    description:
      'Sets the return value and immediately exits script execution. Used to return values from script functions. Sets internal __return__ and __force_return__ variables.\n\nUsage:: {{return::value}}',
  },
  {
    name: 'getvar',
    aliases: [],
    description:
      "Gets the value of a persistent chat variable by name. Chat variables are saved with the chat and persist between sessions. Returns empty string if variable doesn't exist.\n\nUsage:: {{getvar::variableName}}",
  },
  {
    name: 'calc',
    aliases: [],
    description:
      'Evaluates a mathematical expression and returns the result as a string. Supports basic arithmetic operations (+, -, *, /, parentheses).\n\nUsage:: {{calc::2+2*3}}',
  },
  {
    name: 'addvar',
    aliases: [],
    description:
      'Adds a numeric value to an existing chat variable. Treats the variable as a number, adds the specified amount, and saves the result. Only executes when runVar is true.\n\nUsage:: {{addvar::counter::5}}',
  },
  {
    name: 'setvar',
    aliases: [],
    description:
      'Sets a persistent chat variable to the specified value. Chat variables are saved with the chat and persist between sessions. Only executes when runVar is true.\n\nUsage:: {{setvar::variableName::value}}',
  },
  {
    name: 'setdefaultvar',
    aliases: [],
    description:
      "Sets a chat variable to the specified value only if the variable doesn't already exist or is empty. Used for setting default values. Only executes when runVar is true.\n\nUsage:: {{setdefaultvar::variableName::defaultValue}}",
  },
  {
    name: 'getglobalvar',
    aliases: [],
    description:
      "Gets the value of a global chat variable by name. Global variables are shared across all chats and characters. Returns empty string if variable doesn't exist.\n\nUsage:: {{getglobalvar::variableName}}",
  },
  {
    name: 'button',
    aliases: [],
    description:
      'Creates an HTML button element with specified text and trigger action. When clicked, executes the trigger command. Returns HTML button markup.\n\nUsage:: {{button::Click Me::trigger_command}}',
  },
  {
    name: 'risu',
    aliases: [],
    description:
      'Displays the Risuai logo image with specified size in pixels. Default size is 45px if no argument provided. Returns HTML img element.\n\nUsage:: {{risu}} or {{risu::60}}',
  },
  {
    name: 'equal',
    aliases: [],
    description:
      'Compares two values for exact equality. Returns "1" if values are identical (string comparison), "0" otherwise. Case-sensitive.\n\nUsage:: {{equal::value1::value2}}',
  },
  {
    name: 'notequal',
    aliases: ['not_equal'],
    description:
      'Compares two values for inequality. Returns "1" if values are different (string comparison), "0" if identical. Case-sensitive.\n\nUsage:: {{notequal::value1::value2}}',
  },
  {
    name: 'greater',
    aliases: [],
    description:
      'Compares two numeric values. Returns "1" if first number is greater than second, "0" otherwise. Converts arguments to numbers before comparison.\n\nUsage:: {{greater::10::5}}',
  },
  {
    name: 'less',
    aliases: [],
    description:
      'Compares two numeric values. Returns "1" if first number is less than second, "0" otherwise. Converts arguments to numbers before comparison.\n\nUsage:: {{less::5::10}}',
  },
  {
    name: 'greaterequal',
    aliases: ['greater_equal'],
    description:
      'Compares two numeric values. Returns "1" if first number is greater than or equal to second, "0" otherwise. Converts arguments to numbers before comparison.\n\nUsage:: {{greaterequal::10::10}}',
  },
  {
    name: 'lessequal',
    aliases: ['less_equal'],
    description:
      'Compares two numeric values. Returns "1" if first number is less than or equal to second, "0" otherwise. Converts arguments to numbers before comparison.\n\nUsage:: {{lessequal::5::5}}',
  },
  {
    name: 'and',
    aliases: [],
    description:
      'Performs logical AND on two boolean values. Returns "1" only if both arguments are "1", otherwise returns "0". Treats any value other than "1" as false.\n\nUsage:: {{and::1::1}}',
  },
  {
    name: 'or',
    aliases: [],
    description:
      'Performs logical OR on two boolean values. Returns "1" if either argument is "1", otherwise returns "0". Treats any value other than "1" as false.\n\nUsage:: {{or::1::0}}',
  },
  {
    name: 'not',
    aliases: [],
    description:
      'Performs logical NOT on a boolean value. Returns "0" if argument is "1", returns "1" for any other value. Inverts the boolean state.\n\nUsage:: {{not::1}}',
  },
  {
    name: 'file',
    aliases: [],
    description:
      'Handles file display or decoding. In display mode, shows filename in a formatted div. Otherwise, decodes base64 content to UTF-8 text.\n\nUsage:: {{file::filename::base64content}}',
  },
  {
    name: 'startswith',
    aliases: [],
    description:
      'Checks if a string starts with a specific substring. Returns "1" if the string begins with the substring, "0" otherwise. Case-sensitive.\n\nUsage:: {{startswith::Hello World::Hello}}',
  },
  {
    name: 'endswith',
    aliases: [],
    description:
      'Checks if a string ends with a specific substring. Returns "1" if the string ends with the substring, "0" otherwise. Case-sensitive.\n\nUsage:: {{endswith::Hello World::World}}',
  },
  {
    name: 'contains',
    aliases: [],
    description:
      'Checks if a string contains a specific substring anywhere within it. Returns "1" if found, "0" otherwise. Case-sensitive.\n\nUsage:: {{contains::Hello World::lo Wo}}',
  },
  {
    name: 'replace',
    aliases: [],
    description:
      'Replaces all occurrences of a substring with a new string. Global replacement - changes every instance found. Case-sensitive.\n\nUsage:: {{replace::Hello World::o::0}} → Hell0 W0rld',
  },
  {
    name: 'split',
    aliases: [],
    description:
      'Splits a string into an array using the specified delimiter. Returns a JSON array of string parts.\n\nUsage:: {{split::apple,banana,cherry::,}} → ["apple","banana","cherry"]',
  },
  {
    name: 'join',
    aliases: [],
    description:
      'Joins array elements into a single string using the specified separator. Takes a JSON array and delimiter.\n\nUsage:: {{join::["apple","banana"]::, }} → apple, banana',
  },
  {
    name: 'spread',
    aliases: [],
    description:
      'Joins array elements into a single string using "::" as separator. Specialized version of join for CBS array spreading.\n\nUsage:: {{spread::["a","b","c"]}} → a::b::c',
  },
  {
    name: 'trim',
    aliases: [],
    description:
      'Removes leading and trailing whitespace from a string. Does not affect whitespace in the middle of the string.\n\nUsage:: {{trim::  hello world  }} → hello world',
  },
  {
    name: 'length',
    aliases: [],
    description:
      'Returns the character length of a string as a number. Counts all characters including spaces and special characters.\n\nUsage:: {{length::Hello}} → 5',
  },
  {
    name: 'arraylength',
    aliases: ['arraylength'],
    description:
      'Returns the number of elements in a JSON array as a string. Parses the array and counts elements.\n\nUsage:: {{arraylength::["a","b","c"]}} → 3',
  },
  {
    name: 'lower',
    aliases: [],
    description:
      'Converts all characters in a string to lowercase using locale-aware conversion. Handles international characters properly.\n\nUsage:: {{lower::Hello WORLD}} → hello world',
  },
  {
    name: 'upper',
    aliases: [],
    description:
      'Converts all characters in a string to uppercase using locale-aware conversion. Handles international characters properly.\n\nUsage:: {{upper::Hello world}} → HELLO WORLD',
  },
  {
    name: 'capitalize',
    aliases: [],
    description:
      'Capitalizes only the first character of a string, leaving the rest unchanged. Useful for sentence-case formatting.\n\nUsage:: {{capitalize::hello world}} → Hello world',
  },
  {
    name: 'round',
    aliases: [],
    description:
      'Rounds a decimal number to the nearest integer using standard rounding rules (0.5 rounds up). Returns result as string.\n\nUsage:: {{round::3.7}} → 4',
  },
  {
    name: 'floor',
    aliases: [],
    description:
      'Rounds a decimal number down to the nearest integer (floor function). Always rounds towards negative infinity.\n\nUsage:: {{floor::3.9}} → 3',
  },
  {
    name: 'ceil',
    aliases: [],
    description:
      'Rounds a decimal number up to the nearest integer (ceiling function). Always rounds towards positive infinity.\n\nUsage:: {{ceil::3.1}} → 4',
  },
  {
    name: 'abs',
    aliases: [],
    description:
      'Returns the absolute value of a number (removes negative sign). Converts to positive value regardless of input sign.\n\nUsage:: {{abs::-5}} → 5',
  },
  {
    name: 'remaind',
    aliases: [],
    description:
      'Returns the remainder after dividing first number by second (modulo operation). Useful for cycles and ranges.\n\nUsage:: {{remaind::10::3}} → 1',
  },
  {
    name: 'previouschatlog',
    aliases: ['previous_chat_log'],
    description:
      'Retrieves the message content at the specified index in the chat history. Returns "Out of range" if index is invalid.\n\nUsage:: {{previouschatlog::5}}',
  },
  {
    name: 'tonumber',
    aliases: [],
    description:
      'Extracts only numeric characters (0-9) and decimal points from a string, removing all other characters.\n\nUsage:: {{tonumber::abc123.45def}} → 123.45',
  },
  {
    name: 'pow',
    aliases: [],
    description:
      'Calculates the power of a number (base raised to exponent). Performs mathematical exponentiation.\n\nUsage:: {{pow::2::3}} → 8 (2³)',
  },
  {
    name: 'arrayelement',
    aliases: ['arrayelement'],
    description:
      'Retrieves the element at the specified index from a JSON array. Uses 0-based indexing. Returns "null" if index is out of bounds.\n\nUsage:: {{arrayelement::["a","b","c"]::1}} → b',
  },
  {
    name: 'dictelement',
    aliases: ['dictelement', 'objectelement'],
    description:
      'Retrieves the value associated with a key from a JSON object/dictionary. Returns "null" if key doesn\'t exist.\n\nUsage:: {{dictelement::{"name":"John"}::name}} → John',
  },
  {
    name: 'objectassert',
    aliases: ['dictassert', 'object_assert'],
    description:
      'Sets a property in a JSON object only if the property doesn\'t already exist. Returns the modified object as JSON. Used for default values.\n\nUsage:: {{objectassert::{"a":1}::b::2}} → {"a":1,"b":2}',
  },
  {
    name: 'element',
    aliases: ['ele'],
    description:
      'Retrieves a deeply nested element from a JSON structure using multiple keys/indices. Traverses the object path step by step. Returns "null" if any step fails.\n\nUsage:: {{element::{"user":{"name":"John"}}::user::name}} → John',
  },
  {
    name: 'arrayshift',
    aliases: ['arrayshift'],
    description:
      'Removes and discards the first element from a JSON array. Returns the modified array without the first element.\n\nUsage:: {{arrayshift::["a","b","c"]}} → ["b","c"]',
  },
  {
    name: 'arraypop',
    aliases: ['arraypop'],
    description:
      'Removes and discards the last element from a JSON array. Returns the modified array without the last element.\n\nUsage:: {{arraypop::["a","b","c"]}} → ["a","b"]',
  },
  {
    name: 'arraypush',
    aliases: ['arraypush'],
    description:
      'Adds a new element to the end of a JSON array. Returns the modified array with the new element appended.\n\nUsage:: {{arraypush::["a","b"]::c}} → ["a","b","c"]',
  },
  {
    name: 'arraysplice',
    aliases: ['arraysplice'],
    description:
      'Modifies an array by removing elements and optionally inserting new ones at a specific index. Parameters: array, startIndex, deleteCount, newElement.\n\nUsage:: {{arraysplice::["a","b","c"]::1::1::x}} → ["a","x","c"]',
  },
  {
    name: 'arrayassert',
    aliases: ['arrayassert'],
    description:
      'Sets an array element at the specified index only if the index is currently out of bounds (extends array). Fills gaps with undefined.\n\nUsage:: {{arrayassert::["a"]::5::b}} → array with element "b" at index 5',
  },
  {
    name: 'makearray',
    aliases: ['array', 'a', 'makearray'],
    description:
      'Creates a JSON array from the provided arguments. Each argument becomes an array element. Variable number of arguments supported.\n\nUsage:: {{makearray::a::b::c}} → ["a","b","c"]',
  },
  {
    name: 'makedict',
    aliases: ['dict', 'd', 'makedict', 'makeobject', 'object', 'o'],
    description:
      'Creates a JSON object from key=value pair arguments. Each argument should be in "key=value" format. Invalid pairs are ignored.\n\nUsage:: {{makedict::name=John::age=25}} → {"name":"John","age":"25"}',
  },
  {
    name: 'emotionlist',
    aliases: [],
    description:
      'Returns a JSON array of emotion image names available for the current character. Only includes the names, not the actual image data. Returns empty string if no character or no emotions.\n\nUsage:: {{emotionlist}}',
  },
  {
    name: 'assetlist',
    aliases: [],
    description:
      'Returns a JSON array of additional asset names for the current character. These are extra images/files beyond the main avatar. Returns empty string for groups or characters without assets.\n\nUsage:: {{assetlist}}',
  },
  {
    name: 'prefillsupported',
    aliases: ['prefill_supported', 'prefill'],
    description:
      'Returns "1" if the current AI model supports prefill functionality (like Claude models), "0" otherwise. Prefill allows pre-filling the assistant\'s response start.\n\nUsage:: {{prefillsupported}}',
  },
  {
    name: 'screenwidth',
    aliases: ['screen_width'],
    description:
      'Returns the current screen/viewport width in pixels as a string. Updates dynamically with window resizing. Useful for responsive layouts.\n\nUsage:: {{screenwidth}}',
  },
  {
    name: 'screenheight',
    aliases: ['screen_height'],
    description:
      'Returns the current screen/viewport height in pixels as a string. Updates dynamically with window resizing. Useful for responsive layouts.\n\nUsage:: {{screenheight}}',
  },
  {
    name: 'cbr',
    aliases: ['cnl', 'cnewline'],
    description:
      'Returns an escaped newline character (\\\\n). With optional numeric argument, repeats the character that many times (minimum 1).\n\nUsage:: {{cbr}} or {{cbr::3}}',
  },
  {
    name: 'decbo',
    aliases: ['displayescapedcurlybracketopen'],
    description:
      "Returns a special Unicode character that displays as an opening curly bracket { but won't be parsed as CBS syntax. Used to display literal braces in output.\n\nUsage:: {{decbo}}",
  },
  {
    name: 'decbc',
    aliases: ['displayescapedcurlybracketclose'],
    description:
      "Returns a special Unicode character that displays as a closing curly bracket } but won't be parsed as CBS syntax. Used to display literal braces in output.\n\nUsage:: {{decbc}}",
  },
  {
    name: 'bo',
    aliases: ['ddecbo', 'doubledisplayescapedcurlybracketopen'],
    description:
      "Returns two special Unicode characters that display as opening double curly brackets {{ but won't be parsed as CBS syntax. Used to display literal CBS syntax.\n\nUsage:: {{bo}}",
  },
  {
    name: 'bc',
    aliases: ['ddecbc', 'doubledisplayescapedcurlybracketclose'],
    description:
      "Returns two special Unicode characters that display as closing double curly brackets }} but won't be parsed as CBS syntax. Used to display literal CBS syntax.\n\nUsage:: {{bc}}",
  },
  {
    name: 'displayescapedbracketopen',
    aliases: ['debo', '('],
    description:
      "Returns a special Unicode character that displays as an opening parenthesis ( but won't interfere with parsing. Used for literal parentheses in output.\n\nUsage:: {{displayescapedbracketopen}}",
  },
  {
    name: 'displayescapedbracketclose',
    aliases: ['debc', ')'],
    description:
      "Returns a special Unicode character that displays as a closing parenthesis ) but won't interfere with parsing. Used for literal parentheses in output.\n\nUsage:: {{displayescapedbracketclose}}",
  },
  {
    name: 'displayescapedanglebracketopen',
    aliases: ['deabo', '<'],
    description:
      "Returns a special Unicode character that displays as an opening angle bracket < but won't interfere with HTML parsing. Used for literal angle brackets.\n\nUsage:: {{displayescapedanglebracketopen}}",
  },
  {
    name: 'displayescapedanglebracketclose',
    aliases: ['deabc', '>'],
    description:
      "Returns a special Unicode character that displays as a closing angle bracket > but won't interfere with HTML parsing. Used for literal angle brackets.\n\nUsage:: {{displayescapedanglebracketclose}}",
  },
  {
    name: 'displayescapedcolon',
    aliases: ['dec', ':'],
    description:
      "Returns a special Unicode character that displays as a colon : but won't be parsed as CBS argument separator. Used for literal colons in output.\n\nUsage:: {{displayescapedcolon}}",
  },
  {
    name: 'displayescapedsemicolon',
    aliases: [';'],
    description:
      "Returns a special Unicode character that displays as a semicolon ; but won't interfere with parsing. Used for literal semicolons in output.\n\nUsage:: {{displayescapedsemicolon}}",
  },
  {
    name: 'chardisplayasset',
    aliases: [],
    description:
      'Returns a JSON array of character display asset names, filtered by prebuilt asset exclusion settings. Only includes assets not in the exclude list.\n\nUsage:: {{chardisplayasset}}',
  },
  {
    name: 'history',
    aliases: ['messages'],
    description:
      'Returns chat history as a JSON array. With no arguments, returns full message objects. With "role" argument, prefixes each message with "role: ". Includes first message/greeting.\n\nUsage:: {{history}} or {{history::role}}',
  },
  {
    name: 'range',
    aliases: [],
    description:
      'Creates a JSON array of sequential numbers. Single argument: 0 to N-1. Two arguments: start to end-1. Three arguments: start to end-1 with step.\n\nUsage:: {{range::[5]}} → [0,1,2,3,4] or {{range::[2,8,2]}} → [2,4,6]',
  },
  {
    name: 'date',
    aliases: ['datetimeformat'],
    description:
      'Formats date/time using custom format string. No arguments returns YYYY-M-D. First argument is format string, optional second argument is unix timestamp.\n\nUsage:: {{date::YYYY-MM-DD}} or {{date::HH:mm:ss::1640995200000}}',
  },
  {
    name: 'time',
    aliases: [],
    description:
      'Formats date/time using custom format string. No arguments returns h:m:s. First argument is format string, optional second argument is unix timestamp.\n\nUsage:: {{date::YYYY-MM-DD}} or {{date::HH:mm:ss::1640995200000}}',
  },
  {
    name: 'moduleenabled',
    aliases: ['module_enabled'],
    description:
      'Checks if a module with the specified namespace is currently enabled/loaded. Returns "1" if found, "0" otherwise.\n\nUsage:: {{moduleenabled::mymodule}}',
  },
  {
    name: 'moduleassetlist',
    aliases: ['module_assetlist'],
    description:
      'Returns a JSON array of asset names for the specified module namespace. Returns empty string if module not found.\n\nUsage:: {{moduleassetlist::mymodule}}',
  },
  {
    name: 'filter',
    aliases: [],
    description:
      'Filters a JSON array based on the specified filter type. "all": removes empty and duplicates, "nonempty": removes empty only, "unique": removes duplicates only.\n\nUsage:: {{filter::["a","","a"]::unique}} → ["a",""]',
  },
  {
    name: 'all',
    aliases: [],
    description:
      'Returns "1" only if all provided values are "1", otherwise returns "0". Can take array as first argument or multiple arguments. Logical AND of all values.\n\nUsage:: {{all::1::1::1}} → 1',
  },
  {
    name: 'any',
    aliases: [],
    description:
      'Returns "1" if any provided value is "1", otherwise returns "0". Can take array as first argument or multiple arguments. Logical OR of all values.\n\nUsage:: {{any::0::1::0}} → 1',
  },
  {
    name: 'min',
    aliases: [],
    description:
      'Returns the smallest numeric value from the provided values. Can take array as first argument or multiple arguments. Non-numeric values treated as 0.\n\nUsage:: {{min::5::2::8}} → 2',
  },
  {
    name: 'max',
    aliases: [],
    description:
      'Returns the largest numeric value from the provided values. Can take array as first argument or multiple arguments. Non-numeric values treated as 0.\n\nUsage:: {{max::5::2::8}} → 8',
  },
  {
    name: 'sum',
    aliases: [],
    description:
      'Returns the sum of all numeric values provided. Can take array as first argument or multiple arguments. Non-numeric values treated as 0.\n\nUsage:: {{sum::1::2::3}} → 6',
  },
  {
    name: 'average',
    aliases: [],
    description:
      'Returns the arithmetic mean of all numeric values provided. Can take array as first argument or multiple arguments. Non-numeric values treated as 0.\n\nUsage:: {{average::2::4::6}} → 4',
  },
  {
    name: 'fixnum',
    aliases: ['fixnum', 'fixnumber'],
    description:
      'Rounds a number to the specified number of decimal places. Uses toFixed() method for consistent formatting.\n\nUsage:: {{fixnum::3.14159::2}} → 3.14',
  },
  {
    name: 'unicodeencode',
    aliases: ['unicode_encode'],
    description:
      'Returns the Unicode code point of a character at the specified index (default 0) in the string. Returns numeric code as string.\n\nUsage:: {{unicodeencode::A}} → 65',
  },
  {
    name: 'unicodedecode',
    aliases: ['unicode_decode'],
    description:
      'Converts a Unicode code point number back to its corresponding character. Inverse of unicodeencode.\n\nUsage:: {{unicodedecode::65}} → A',
  },
  {
    name: 'u',
    aliases: ['unicodedecodefromhex'],
    description:
      'Converts a hexadecimal Unicode code to its corresponding character. Useful for special characters and symbols.\n\nUsage:: {{u::41}} → A',
  },
  {
    name: 'ue',
    aliases: ['unicodeencodefromhex'],
    description:
      'Converts a hexadecimal Unicode code to its corresponding character. Alias for {{u}}.\n\nUsage:: {{ue::41}} → A',
  },
  {
    name: 'hash',
    aliases: [],
    description:
      'Generates a deterministic 7-digit number based on the input string hash. Same input always produces the same output. Useful for consistent randomization.\n\nUsage:: {{hash::hello}} → 1234567',
  },
  {
    name: 'randint',
    aliases: [],
    description:
      'Generates a random integer between min and max values (inclusive). Returns "NaN" if arguments are not valid numbers.\n\nUsage:: {{randint::1::10}} → random number 1-10',
  },
  {
    name: 'dice',
    aliases: [],
    description:
      'Simulates dice rolling using standard RPG notation (XdY = X dice with Y sides each). Returns sum of all dice rolls.\n\nUsage:: {{dice::2d6}} → random number 2-12',
  },
  {
    name: 'fromhex',
    aliases: [],
    description:
      'Converts a hexadecimal string to its decimal number equivalent. Parses base-16 input to base-10 output.\n\nUsage:: {{fromhex::FF}} → 255',
  },
  {
    name: 'tohex',
    aliases: [],
    description:
      'Converts a decimal number to its hexadecimal string representation. Parses base-10 input to base-16 output.\n\nUsage:: {{tohex::255}} → ff',
  },
  {
    name: 'metadata',
    aliases: [],
    description:
      'Returns various system and application metadata. Supported keys: mobile, local, node, version, language, modelname, etc. Returns error message for invalid keys.\n\nUsage:: {{metadata::version}}',
  },
  {
    name: 'iserror',
    aliases: [],
    description:
      'Checks if a string starts with "error:" (case-insensitive). Returns "1" if it\'s an error message, "0" otherwise. Useful for error handling.\n\nUsage:: {{iserror::Error: failed}} → 1',
  },
  {
    name: 'xor',
    aliases: ['xorencrypt', 'xorencode', 'xore'],
    description:
      'Encrypts a string using XOR cipher with 0xFF key and encodes result as base64. Simple obfuscation method. Reversible with xordecrypt.\n\nUsage:: {{xor::hello}}',
  },
  {
    name: 'xordecrypt',
    aliases: ['xordecode', 'xord'],
    description:
      'Decrypts a base64-encoded XOR-encrypted string back to original text. Reverses the xor function using same 0xFF key.\n\nUsage:: {{xordecrypt::base64string}}',
  },
  {
    name: 'crypt',
    aliases: ['crypto', 'caesar', 'encrypt', 'decrypt'],
    description:
      'Applies Caesar cipher encryption/decryption with custom shift value (default 32768). Shifts Unicode character codes within 16-bit range. By using default shift, it can be used for both encryption and decryption.\n\nUsage:: {{crypt::hello}} or {{crypt::hello::1000}}',
  },
  {
    name: 'random',
    aliases: [],
    description:
      'Returns a random number between 0 and 1 if no arguments. With one argument, returns a random element from the provided array or string split by commas/colons. With multiple arguments, returns a random argument.\n\nUsage:: {{random}} or {{random::a,b,c}} → "b"',
  },
  {
    name: 'pick',
    aliases: [],
    description:
      'Returns a random number between 0 and 1 if no arguments. With one argument, returns a random element from the provided array or string split by commas/colons. With multiple arguments, returns a random argument. unlike {{random}}, uses a hash-based randomization based on chat ID and character ID for consistent results across messages.\n\nUsage:: {{pick}} or {{pick::a,b,c}} → "b"',
  },
  {
    name: 'roll',
    aliases: [],
    description:
      'Simulates rolling dice using standard RPG notation (XdY = X dice with Y sides each). Returns sum of all dice rolls. If no arguments, defaults to 1d6.\n\nUsage:: {{roll::2d6}} → random number 2-12, {{roll::20}} → random number 1-20',
  },
  {
    name: 'rollp',
    aliases: ['rollpick'],
    description:
      'Simulates rolling dice using standard RPG notation (XdY = X dice with Y sides each). Returns sum of all dice rolls. If no arguments, defaults to 1d6. Unlike {{roll}}, uses a hash-based randomization based on chat ID and character ID for consistent results across messages.\n\nUsage:: {{rollp::2d6}} → random number 2-12, {{rollp::20}} → random number 1-20',
  },
  {
    name: 'hiddenkey',
    aliases: [],
    description:
      'Works as a key for activation of lores, while not being included in the model request.\n\nUsage:: {{hidden_key::some_value}}',
  },
  {
    name: 'reverse',
    aliases: [],
    description: 'Reverses the input string.\n\nUsage:: {{reverse::some_value}}',
  },
  {
    name: 'comment',
    aliases: [],
    description:
      'A comment CBS for commenting out code. unlike {{//}}, this one is displayed in the chat.\n\nUsage:: {{comment::this is a comment}}',
  },
  {
    name: 'tex',
    aliases: ['latex', 'katex'],
    description:
      'Renders LaTeX math expressions. Wraps the input in double dollar signs for display.\n\nUsage:: {{tex::E=mc^2}}',
  },
  {
    name: 'ruby',
    aliases: ['furigana'],
    description:
      'Renders ruby text (furigana) for East Asian typography. Wraps base text and ruby text in appropriate HTML tags.\n\nUsage:: {{ruby::漢字::かんじ}}',
  },
  {
    name: 'codeblock',
    aliases: [],
    description:
      'Formats text as a code block using HTML pre and code tags.\n\nUsage:: {{codeblock::some code here}}, or {{codeblock::language::some code here}} for syntax highlighting.',
  },
  {
    name: 'bkspc',
    aliases: [],
    description:
      'Performs a backspace operation, removing the last word from the current output. Useful for correcting or modifying generated text dynamically.\n\nUsage:: hello world {{bkspc}} user → hello user',
  },
  {
    name: 'erase',
    aliases: [],
    description:
      "performs a backspace operation, removing the last sentence from the current output. Useful for correcting or modifying generated text dynamically.\n\nUsage:: hello world. what's in {{erase}} what's up → hello world. what's up",
  },
  {
    name: 'declare',
    aliases: [],
    description:
      "Declares a data which can be used to change parser's behavior. Usage:: {{declare::declaration_name}}",
  },
  {
    name: '//',
    aliases: [],
    description: 'A comment CBS for commenting out code.\n\nUsage:: {{// this is a comment}}',
  },
  {
    name: '?',
    aliases: [],
    description:
      'Runs math operations on numbers. Supports +, -, *, /, %, ^ (exponentiation), % (modulo), < (less than), > (greater than), <= (less than or equal), >= (greater than or equal), == (equal), != (not equal), and brackets for grouping.\n\nUsage:: {{? 1+2}} → 3, {{? (2*3)+4}} → 10',
  },
  {
    name: '__',
    aliases: [],
    description: '**INTERNAL FUNCTION - DO NOT USE**',
    internalOnly: true,
  },
  {
    name: 'asset',
    aliases: [],
    description:
      'Displays additional asset A as appropriate element type.\n\nUsage:: {{asset::assetName}}',
  },
  {
    name: 'emotion',
    aliases: [],
    description: 'Displays emotion image A as image element.\n\nUsage:: {{emotion::emotionName}}',
  },
  {
    name: 'audio',
    aliases: [],
    description: 'Displays audio asset A as audio element.\n\nUsage:: {{audio::audioName}}',
  },
  {
    name: 'bg',
    aliases: [],
    description:
      'Displays background image A as background image element.\n\nUsage:: {{bg::backgroundName}}',
  },
  {
    name: 'bgm',
    aliases: [],
    description: 'Inserts background music control element.\n\nUsage:: {{bgm::musicName}}',
  },
  {
    name: 'video',
    aliases: [],
    description: 'Displays video asset A as video element.\n\nUsage:: {{video::videoName}}',
  },
  {
    name: 'video-img',
    aliases: [],
    description:
      'Displays video asset A as image-like element.\n\nUsage:: {{video-img::videoName}}',
  },
  {
    name: 'image',
    aliases: [],
    description: 'Displays image asset A as image element.\n\nUsage:: {{image::imageName}}',
  },
  {
    name: 'img',
    aliases: [],
    description: 'Displays A as unstyled image element.\n\nUsage:: {{img::imageName}}',
  },
  {
    name: 'path',
    aliases: ['raw'],
    description: "Returns additional asset A's path data.\n\nUsage:: {{path::assetName}}",
  },
  {
    name: 'inlay',
    aliases: [],
    description:
      "Displays unstyled inlay asset A, which doesn't inserts at model request.\n\nUsage:: {{inlay::inlayName}}",
  },
  {
    name: 'inlayed',
    aliases: [],
    description:
      "Displays styled inlay asset A, which doesn't inserts at model request.\n\nUsage:: {{inlayed::inlayName}}",
  },
  {
    name: 'inlayeddata',
    aliases: [],
    description:
      'Displays styled inlay asset A, which inserts at model request.\n\nUsage:: {{inlayeddata::inlayName}}',
  },
  {
    name: 'source',
    aliases: [],
    description:
      'Returns the source URL of user or character\'s profile. argument must be "user" or "char".\n\nUsage:: {{source::user}} or {{source::char}}',
  },
  {
    name: '#if',
    aliases: [],
    description:
      'Conditional statement for CBS. 1 and "true" are truty, and otherwise false.\n\nUsage:: {{#if condition}}...{{/if}}.',
    deprecated: {
      message:
        'Due to limitations of adding operators, #if is deprecated and replaced with #when. Use #when instead.',
      replacement: '#when',
    },
  },
  {
    name: '#if_pure',
    aliases: [],
    description:
      'Conditional statement for CBS, which has keep whitespace handling. 1 and "true" are truty, and otherwise false.\n\nUsage:: {{#if_pure condition}}...{{/if_pure}}',
    deprecated: {
      message:
        'Due to limitations of adding operators, #if_pure is deprecated and replaced with #when with keep operator. Use #when::keep::condition instead.',
      replacement: '#when',
    },
  },
  {
    name: '#when',
    aliases: [],
    docOnly: true,
    description:
      'Conditional statement for CBS. 1 and "true" are truty, and otherwise false.\n\nIt can add operators to condition:\n\nBasic operators:\n{{#when::A::and::B}}...{{/when}} - checks if both conditions are true.\n{{#when::A::or::B}}...{{/when}} - checks if at least one condition is true.\n{{#when::A::is::B}}...{{/when}} - checks if A is equal to B.\n{{#when::A::isnot::B}}...{{/when}} - checks if A is not equal to B.\n{{#when::A::>::B}}...{{/when}} - checks if A is greater than B.\n{{#when::A::<::B}}...{{/when}} - checks if A is less than B.\n{{#when::A::>=::B}}...{{/when}} - checks if A is greater than or equal to B.\n{{#when::A::<=::B}}...{{/when}} - checks if A is less than or equal to B.\n{{#when::not::A}}...{{/when}} - negates condition, so it will be true if A is false.\n\nAdvanced operators:\n{{#when::keep::A}}...{{/when}} - keeps whitespace inside the block without trimming.\n{{#when::legacy::A}}...{{/when}} - legacy whitespace handling, so it will handle like deprecated #if.\n{{#when::var::A}}...{{/when}} - checks if variable A is truthy.\n{{#when::A::vis::B}}...{{/when}} - checks if variable A is equal to literal B.\n{{#when::A::visnot::B}}...{{/when}} - checks if variable A is not equal to literal B.\n{{#when::toggle::togglename}}...{{/when}} - checks if toggle is enabled.\n{{#when::A::tis::B}}...{{/when}} - checks if toggle A is equal to literal B.\n{{#when::A::tisnot::B}}...{{/when}} - checks if toggle A is not equal to literal B.\n\noperators can be combined like:\n{{#when::keep::not::condition}}...{{/when}}\n{{#when::keep::condition1::and::condition2}}...{{/when}}\n\nYou can use whitespace instead of "::" if there is no operators, like:\n{{#when condition}}...{{/when}}\n\nUsage:: {{#when condition}}...{{/when}} or {{#when::not::condition}}...{{/when}}\n',
  },
  {
    name: ':else',
    aliases: [],
    docOnly: true,
    description:
      "Else statement for CBS. Must be used inside {{#when}}. if {{#when}} is multiline, :else must be on line without additional string. if {{#when}} is used with operator 'legacy', it will not work.\n\nUsage:: {{#when condition}}...{{:else}}...{{/when}} or {{#when::not::condition}}...{{:else}}...{{/when}}",
  },
  {
    name: '#pure',
    aliases: [],
    docOnly: true,
    description:
      'displays content without any CBS processing. Useful for displaying raw HTML or other content without parsing.\n\nUsage:: {{#puredisplay}}...{{/puredisplay}}',
    deprecated: {
      message:
        'Due to reparsing issue, #pure is deprecated and replaced with #puredisplay. Use #puredisplay instead.',
      replacement: '#puredisplay',
    },
  },
  {
    name: '#puredisplay',
    aliases: [],
    docOnly: true,
    description:
      'displays content without any CBS processing. Useful for displaying raw HTML or other content without parsing.\n\nUsage:: {{#puredisplay}}...{{/puredisplay}}',
  },
  {
    name: '#escape',
    aliases: [],
    docOnly: true,
    description:
      'Escapes curly braces and parentheses, treating content as literal text. Useful for displaying CBS syntax without evaluation.\n\nOperators:\n{{#escape::keep}} - keeps whitespace inside the block without trimming.\n\nUsage:: {{#escape}}...{{/escape}}',
  },
  {
    name: '#each',
    aliases: [':each'],
    docOnly: true,
    description:
      'Iterates over an array.\n\nOperators:\n{{#each::keep A as V}} - keeps whitespace inside the block without trimming.\n\nUsage:: {{#each A as V}} ... {{slot::V}} ... {{/each}}',
  },
  {
    name: 'slot',
    aliases: [],
    docOnly: true,
    contextual: true,
    description:
      'Used in various CBS functions to access specific slots or properties.\n\nUsage:: {{slot::propertyName}} or {{slot}}, depending on context.',
  },
  {
    name: 'position',
    aliases: [],
    contextual: true,
    description:
      'Defines the position which can be used in various features such as @@position decorator.\n\nUsage:: {{position::positionName}}',
  },
];

const EXPLICIT_ARGUMENTS_BY_NAME = new Map<string, readonly ArgumentDef[]>([
  [
    'tempvar',
    [
      createArgument(
        'variableName',
        'Temporary variable name to read during the current script run',
      ),
    ],
  ],
  [
    'settempvar',
    [
      createArgument(
        'variableName',
        'Temporary variable name to write during the current script run',
      ),
      createArgument('value', 'Value to store in the temporary variable'),
    ],
  ],
  ['return', [createArgument('value', 'Value to return from the current script')]],
  ['getvar', [createArgument('variableName', 'Persistent chat variable name to read')]],
  [
    'addvar',
    [
      createArgument('variableName', 'Persistent chat variable name to increment'),
      createArgument('amount', 'Numeric amount to add to the variable'),
    ],
  ],
  [
    'setvar',
    [
      createArgument('variableName', 'Persistent chat variable name to write'),
      createArgument('value', 'Value to store in the persistent chat variable'),
    ],
  ],
  [
    'setdefaultvar',
    [
      createArgument('variableName', 'Persistent chat variable name to initialize'),
      createArgument('defaultValue', 'Fallback value to store when the variable is empty'),
    ],
  ],
  ['getglobalvar', [createArgument('variableName', 'Global chat variable name to read')]],
  ['source', [createArgument('target', 'Profile source target, usually `user` or `char`')]],
  [
    'slot',
    [
      createArgument(
        'propertyName',
        'Slot or property name to access in the current block context',
        {
          required: false,
        },
      ),
    ],
  ],
  [
    'position',
    [createArgument('positionName', 'Position identifier to expose to decorators or layouts')],
  ],
  [
    '#if',
    [
      createArgument('condition', 'Condition expression evaluated by the deprecated #if block', {
        variadic: true,
      }),
    ],
  ],
  [
    '#ifpure',
    [
      createArgument(
        'condition',
        'Condition expression evaluated by the deprecated #if_pure block',
        {
          variadic: true,
        },
      ),
    ],
  ],
  [
    '#when',
    [
      createArgument(
        'conditionSegments',
        'Condition text and optional operators supplied after #when',
        {
          variadic: true,
        },
      ),
    ],
  ],
  [
    '#escape',
    [
      createArgument('operator', 'Optional block operator such as `keep`', {
        required: false,
        variadic: true,
      }),
    ],
  ],
  [
    '#each',
    [
      createArgument(
        'iteratorExpression',
        'Array source, optional operators, and `as` binding expression',
        {
          variadic: true,
        },
      ),
    ],
  ],
]);

const CATEGORIZED_NAMES: Record<FunctionCategory, readonly string[]> = {
  identity: [
    'char',
    'user',
    'trigger_id',
    'personality',
    'description',
    'scenario',
    'exampledialogue',
    'persona',
    'role',
    'isfirstmsg',
    'blank',
  ],
  prompt: [
    'mainprompt',
    'lorebook',
    'jb',
    'globalnote',
    'authornote',
    'model',
    'axmodel',
    'jbtoggled',
    'maxcontext',
    'prefillsupported',
  ],
  history: [
    'previouscharchat',
    'previoususerchat',
    'userhistory',
    'charhistory',
    'chatindex',
    'firstmsgindex',
    'lastmessage',
    'lastmessageid',
    'previouschatlog',
    'history',
  ],
  time: [
    'messagetime',
    'messagedate',
    'messageunixtimearray',
    'unixtime',
    'time',
    'isotime',
    'isodate',
    'messageidleduration',
    'idleduration',
    'date',
  ],
  variable: [
    'tempvar',
    'settempvar',
    'return',
    'getvar',
    'addvar',
    'setvar',
    'setdefaultvar',
    'getglobalvar',
    'declare',
  ],
  comparison: [
    'equal',
    'notequal',
    'greater',
    'less',
    'greaterequal',
    'lessequal',
    'and',
    'or',
    'not',
    'startswith',
    'endswith',
    'contains',
    'all',
    'any',
    'iserror',
  ],
  math: [
    'calc',
    'round',
    'floor',
    'ceil',
    'abs',
    'remaind',
    'tonumber',
    'pow',
    'range',
    'min',
    'max',
    'sum',
    'average',
    'fixnum',
    'randint',
    'dice',
    'roll',
    'rollp',
    '?',
    'hash',
  ],
  string: [
    'replace',
    'split',
    'join',
    'spread',
    'trim',
    'length',
    'lower',
    'upper',
    'capitalize',
    'reverse',
  ],
  array: [
    'arraylength',
    'arrayelement',
    'dictelement',
    'objectassert',
    'element',
    'arrayshift',
    'arraypop',
    'arraypush',
    'arraysplice',
    'arrayassert',
    'makearray',
    'makedict',
    'filter',
  ],
  random: ['random', 'pick'],
  encoding: [
    'unicodeencode',
    'unicodedecode',
    'u',
    'ue',
    'fromhex',
    'tohex',
    'xor',
    'xordecrypt',
    'crypt',
  ],
  display: [
    'br',
    'button',
    'risu',
    'file',
    'comment',
    'tex',
    'ruby',
    'codeblock',
    'bkspc',
    'erase',
    'cbr',
  ],
  escape: [
    'decbo',
    'decbc',
    'bo',
    'bc',
    'displayescapedbracketopen',
    'displayescapedbracketclose',
    'displayescapedanglebracketopen',
    'displayescapedanglebracketclose',
    'displayescapedcolon',
    'displayescapedsemicolon',
  ],
  asset: [
    'emotionlist',
    'assetlist',
    'chardisplayasset',
    'moduleassetlist',
    'asset',
    'emotion',
    'audio',
    'bg',
    'bgm',
    'video',
    'video-img',
    'image',
    'img',
    'path',
    'inlay',
    'inlayed',
    'inlayeddata',
    'source',
  ],
  block: [
    '#if',
    '#if_pure',
    '#when',
    ':else',
    '#pure',
    '#puredisplay',
    '#escape',
    '#each',
    'slot',
    'position',
  ],
  utility: ['moduleenabled', 'metadata', 'hiddenkey', '__', '//', 'screenwidth', 'screenheight'],
};

const ARRAY_RETURN_NAMES = new Set([
  'lorebook',
  'userhistory',
  'charhistory',
  'messageunixtimearray',
  'split',
  'arrayshift',
  'arraypop',
  'arraypush',
  'arraysplice',
  'arrayassert',
  'makearray',
  'emotionlist',
  'assetlist',
  'chardisplayasset',
  'history',
  'range',
  'moduleassetlist',
  'filter',
]);

const OBJECT_RETURN_NAMES = new Set(['makedict', 'objectassert']);

const BOOLEAN_RETURN_NAMES = new Set([
  'equal',
  'notequal',
  'greater',
  'less',
  'greaterequal',
  'lessequal',
  'and',
  'or',
  'not',
  'startswith',
  'endswith',
  'contains',
  'all',
  'any',
  'iserror',
  'moduleenabled',
  'jbtoggled',
  'isfirstmsg',
  'prefillsupported',
]);

const NUMBER_RETURN_NAMES = new Set([
  'calc',
  'arraylength',
  'length',
  'round',
  'floor',
  'ceil',
  'abs',
  'remaind',
  'tonumber',
  'pow',
  'min',
  'max',
  'sum',
  'average',
  'fixnum',
  'unicodeencode',
  'hash',
  'randint',
  'dice',
  'roll',
  'rollp',
  'fromhex',
  'tohex',
  '?',
]);

function normalizeLookupKey(name: string): string {
  return name.toLocaleLowerCase().replace(/[\s_-]/g, '');
}

function normalizeAliases(name: string, aliases: readonly string[]): string[] {
  const normalizedName = normalizeLookupKey(name);
  const uniqueAliases = new Set<string>();

  for (const alias of aliases) {
    const normalizedAlias = normalizeLookupKey(alias);
    if (normalizedAlias === normalizedName) {
      continue;
    }

    uniqueAliases.add(normalizedAlias);
  }

  return Array.from(uniqueAliases);
}

function buildCategoryByName(): Map<string, FunctionCategory> {
  const categoryByName = new Map<string, FunctionCategory>();
  const upstreamNames = new Set(
    RAW_UPSTREAM_BUILTINS.map((builtin) => normalizeLookupKey(builtin.name)),
  );

  for (const [category, names] of Object.entries(CATEGORIZED_NAMES) as [
    FunctionCategory,
    readonly string[],
  ][]) {
    for (const name of names) {
      const normalizedName = normalizeLookupKey(name);
      if (categoryByName.has(normalizedName)) {
        throw new Error(`Duplicate builtin category mapping for ${name}`);
      }

      categoryByName.set(normalizedName, category);
    }
  }

  for (const name of categoryByName.keys()) {
    if (!upstreamNames.has(name)) {
      throw new Error(`Unknown categorized builtin ${name}`);
    }
  }

  for (const name of upstreamNames) {
    if (!categoryByName.has(name)) {
      throw new Error(`Missing builtin category mapping for ${name}`);
    }
  }

  return categoryByName;
}

const CATEGORY_BY_NAME = buildCategoryByName();

function resolveCategory(name: string): FunctionCategory {
  const category = CATEGORY_BY_NAME.get(normalizeLookupKey(name));
  if (!category) {
    throw new Error(`Missing builtin category for ${name}`);
  }

  return category;
}

function resolveReturnType(name: string): CBSBuiltinFunction['returnType'] {
  const normalizedName = normalizeLookupKey(name);

  if (ARRAY_RETURN_NAMES.has(normalizedName)) {
    return 'array';
  }

  if (OBJECT_RETURN_NAMES.has(normalizedName)) {
    return 'object';
  }

  if (BOOLEAN_RETURN_NAMES.has(normalizedName)) {
    return 'boolean';
  }

  if (NUMBER_RETURN_NAMES.has(normalizedName)) {
    return 'number';
  }

  return normalizedName === 'return' ? 'void' : 'string';
}

function resolveDeprecated(
  name: string,
  deprecated?: RawBuiltinFunction['deprecated'],
): CBSBuiltinFunction['deprecated'] | undefined {
  if (!deprecated) {
    return undefined;
  }

  switch (normalizeLookupKey(name)) {
    case '#if':
      return { ...deprecated, replacement: '#when' };
    case '#ifpure':
      return {
        ...deprecated,
        message:
          'Due to limitations of adding operators, #if_pure is deprecated and replaced with #when::keep. Use #when::keep instead.',
        replacement: '#when::keep',
      };
    case '#pure':
      return { ...deprecated, replacement: '#puredisplay' };
    default:
      return deprecated;
  }
}

function cloneArguments(args: readonly ArgumentDef[]): ArgumentDef[] {
  return args.map((arg) => ({ ...arg }));
}

function inferUsageArgumentName(segment: string, index: number): string {
  const trimmed = segment.trim();

  if (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) &&
    (trimmed.length > 2 || /name|value|text|data|path|item|key|arg|id$/i.test(trimmed))
  ) {
    return trimmed;
  }

  return `arg${index + 1}`;
}

function inferArgumentsFromUsage(name: string, description: string): ArgumentDef[] {
  const usageIndex = description.indexOf('Usage::');
  if (usageIndex === -1) {
    return [];
  }

  const usage = description.slice(usageIndex);
  const usageMacros = usage.match(/\{\{[^{}]+\}\}/g) ?? [];

  for (const usageMacro of usageMacros) {
    const content = usageMacro.slice(2, -2).trim();
    if (!content.startsWith(name)) {
      continue;
    }

    const remainder = content.slice(name.length);
    if (!remainder.startsWith('::')) {
      return [];
    }

    return remainder
      .slice(2)
      .split('::')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .map((segment, index) =>
        createArgument(
          inferUsageArgumentName(segment, index),
          `Usage-derived argument ${index + 1} for ${name}`,
        ),
      );
  }

  return [];
}

function resolveArguments(rawBuiltin: RawBuiltinFunction): ArgumentDef[] {
  const explicit = EXPLICIT_ARGUMENTS_BY_NAME.get(normalizeLookupKey(rawBuiltin.name));
  if (explicit) {
    return cloneArguments(explicit);
  }

  return inferArgumentsFromUsage(rawBuiltin.name, rawBuiltin.description);
}

function toBuiltinFunction(rawBuiltin: RawBuiltinFunction): CBSBuiltinFunction {
  return {
    name: rawBuiltin.name,
    aliases: normalizeAliases(rawBuiltin.name, rawBuiltin.aliases),
    description: rawBuiltin.description,
    arguments: resolveArguments(rawBuiltin),
    isBlock: rawBuiltin.name.startsWith('#'),
    docOnly: rawBuiltin.docOnly,
    contextual: rawBuiltin.contextual,
    deprecated: resolveDeprecated(rawBuiltin.name, rawBuiltin.deprecated),
    internalOnly: rawBuiltin.internalOnly,
    returnType: resolveReturnType(rawBuiltin.name),
    category: resolveCategory(rawBuiltin.name),
  };
}

/**
 * isDocOnlyBuiltin 함수.
 * completion/hover에는 노출할 수 있지만 일반 runtime callback builtin은 아닌 항목인지 판별함.
 *
 * @param builtin - 분류할 builtin metadata
 * @returns docOnly source-of-truth 메타가 설정된 항목인지 여부
 */
export function isDocOnlyBuiltin(
  builtin: CBSBuiltinFunction | null | undefined,
): builtin is CBSBuiltinFunction & { docOnly: true } {
  return builtin?.docOnly === true;
}

/**
 * isContextualBuiltin 함수.
 * 특정 문맥에서만 의미를 가지는 contextual builtin인지 판별함.
 *
 * @param builtin - 분류할 builtin metadata
 * @returns contextual source-of-truth 메타가 설정된 항목인지 여부
 */
export function isContextualBuiltin(
  builtin: CBSBuiltinFunction | null | undefined,
): builtin is CBSBuiltinFunction & { contextual: true } {
  return builtin?.contextual === true;
}

/** CBS builtin registry with normalized canonical and alias lookup */
export class CBSBuiltinRegistry {
  private functions = new Map<string, CBSBuiltinFunction>();
  private aliasMap = new Map<string, string>();

  constructor() {
    this.registerAll();
  }

  get(name: string): CBSBuiltinFunction | undefined {
    const normalizedName = normalizeLookupKey(name);
    const canonical = this.aliasMap.get(normalizedName) ?? normalizedName;
    return this.functions.get(canonical);
  }

  getAll(): CBSBuiltinFunction[] {
    return Array.from(this.functions.values());
  }

  getByCategory(category: FunctionCategory): CBSBuiltinFunction[] {
    return this.getAll().filter((builtin) => builtin.category === category);
  }

  /**
   * getDocOnly 함수.
   * 문서용으로만 노출되는 CBS 구문 항목을 source-of-truth 기준으로 반환함.
   *
   * @returns docOnly builtin 목록
   */
  getDocOnly(): CBSBuiltinFunction[] {
    return this.getAll().filter((builtin) => isDocOnlyBuiltin(builtin));
  }

  /**
   * getContextual 함수.
   * 특정 문맥에서만 의미를 가지는 contextual builtin 항목을 source-of-truth 기준으로 반환함.
   *
   * @returns contextual builtin 목록
   */
  getContextual(): CBSBuiltinFunction[] {
    return this.getAll().filter((builtin) => isContextualBuiltin(builtin));
  }

  has(name: string): boolean {
    const normalizedName = normalizeLookupKey(name);
    return this.functions.has(normalizedName) || this.aliasMap.has(normalizedName);
  }

  /**
   * isDocOnly 함수.
   * 이름이나 alias lookup 결과가 문서용 항목인지 빠르게 확인함.
   *
   * @param name - canonical name 또는 alias
   * @returns lookup 결과가 docOnly builtin인지 여부
   */
  isDocOnly(name: string): boolean {
    return isDocOnlyBuiltin(this.get(name));
  }

  /**
   * isContextual 함수.
   * 이름이나 alias lookup 결과가 contextual 항목인지 빠르게 확인함.
   *
   * @param name - canonical name 또는 alias
   * @returns lookup 결과가 contextual builtin인지 여부
   */
  isContextual(name: string): boolean {
    return isContextualBuiltin(this.get(name));
  }

  getSuggestions(partial: string): CBSBuiltinFunction[] {
    const normalizedPartial = normalizeLookupKey(partial);
    return this.getAll().filter(
      (builtin) =>
        normalizeLookupKey(builtin.name).startsWith(normalizedPartial) ||
        builtin.aliases.some((alias) => alias.startsWith(normalizedPartial)),
    );
  }

  private register(fn: CBSBuiltinFunction): void {
    const normalizedName = normalizeLookupKey(fn.name);
    const aliases = normalizeAliases(fn.name, fn.aliases);

    this.functions.set(normalizedName, {
      ...fn,
      aliases,
    });

    for (const alias of aliases) {
      this.aliasMap.set(alias, normalizedName);
    }
  }

  private registerAll(): void {
    // Source note:
    // - Canonical builtin data mirrors registerCBS() in risu-pork/src/ts/cbs.ts
    // - Category and deprecated replacement normalization follows CBS_LSP_PLAN.md:210-260
    for (const builtin of RAW_UPSTREAM_BUILTINS) {
      this.register(toBuiltinFunction(builtin));
    }
  }
}
