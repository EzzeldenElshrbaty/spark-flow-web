import { REACTIONS } from '@/lib/reactions'

/** One emoji as the picker shows it: the character, its name, and the `:aliases:` people type. */
export type EmojiInfo = { char: string; name: string; aliases: string[] }

// A curated set for the picker (spec 6.6): the emoji teams use, by category. Each line is "emoji|name|alias,alias".
const DATA: { id: string; label: string; lines: string }[] = [
  {
    id: 'people',
    label: 'Smileys & people',
    lines: `😀|grinning face|grinning
😃|grinning face with big eyes|smiley
😄|grinning face with smiling eyes|smile
😁|beaming face|grin
😆|grinning squinting face|laughing,satisfied
😅|grinning face with sweat|sweat_smile
🤣|rolling on the floor laughing|rofl
😂|face with tears of joy|joy
🙂|slightly smiling face|slightly_smiling_face
🙃|upside-down face|upside_down_face
😉|winking face|wink
😊|smiling face with smiling eyes|blush
😇|smiling face with halo|innocent
🥰|smiling face with hearts|smiling_face_with_three_hearts
😍|smiling face with heart-eyes|heart_eyes
🤩|star-struck|star_struck
😘|face blowing a kiss|kissing_heart
😋|face savoring food|yum
😜|winking face with tongue|stuck_out_tongue_winking_eye
🤪|zany face|zany_face
🤔|thinking face|thinking
🤨|face with raised eyebrow|raised_eyebrow
😐|neutral face|neutral_face
😑|expressionless face|expressionless
😶|face without mouth|no_mouth
🙄|face with rolling eyes|roll_eyes
😏|smirking face|smirk
😬|grimacing face|grimacing
😌|relieved face|relieved
😔|pensive face|pensive
😴|sleeping face|sleeping
🤒|face with thermometer|face_with_thermometer
🤯|exploding head|exploding_head
🥳|partying face|partying_face
😎|smiling face with sunglasses|sunglasses
🤓|nerd face|nerd_face
🧐|face with monocle|monocle_face
😕|confused face|confused
😟|worried face|worried
😮|face with open mouth|open_mouth
😲|astonished face|astonished
🥺|pleading face|pleading_face
😢|crying face|cry
😭|loudly crying face|sob
😱|face screaming in fear|scream
😤|face with steam from nose|triumph
😡|enraged face|rage
🤬|face with symbols on mouth|cursing_face
💀|skull|skull
💩|pile of poo|poop,hankey
🤡|clown face|clown_face
👻|ghost|ghost
🤖|robot|robot
👋|waving hand|wave
🤚|raised back of hand|raised_back_of_hand
✋|raised hand|hand,raised_hand
👌|OK hand|ok_hand
🤌|pinched fingers|pinched_fingers
✌️|victory hand|v
🤞|crossed fingers|crossed_fingers
🤟|love-you gesture|love_you_gesture
🤘|sign of the horns|metal
👈|backhand index pointing left|point_left
👉|backhand index pointing right|point_right
👆|backhand index pointing up|point_up_2
👇|backhand index pointing down|point_down
👍|thumbs up|thumbsup,+1
👎|thumbs down|thumbsdown,-1
✊|raised fist|fist
👏|clapping hands|clap
🙌|raising hands|raised_hands
👐|open hands|open_hands
🤝|handshake|handshake
🙏|folded hands|pray
💪|flexed biceps|muscle
👀|eyes|eyes
🧠|brain|brain
🫡|saluting face|saluting_face`,
  },
  {
    id: 'nature',
    label: 'Nature',
    lines: `🐶|dog face|dog
🐱|cat face|cat
🐭|mouse face|mouse
🦊|fox|fox_face
🐻|bear|bear
🐼|panda|panda_face
🐨|koala|koala
🐯|tiger face|tiger
🦁|lion|lion
🐮|cow face|cow
🐸|frog|frog
🐵|monkey face|monkey_face
🙈|see-no-evil monkey|see_no_evil
🐔|chicken|chicken
🐧|penguin|penguin
🐦|bird|bird
🦅|eagle|eagle
🦉|owl|owl
🐝|honeybee|bee
🐛|bug|bug
🦋|butterfly|butterfly
🐢|turtle|turtle
🐍|snake|snake
🐙|octopus|octopus
🐳|spouting whale|whale
🐬|dolphin|dolphin
🐫|two-hump camel|camel
🦄|unicorn|unicorn
🌵|cactus|cactus
🌴|palm tree|palm_tree
🌱|seedling|seedling
🌿|herb|herb
🍀|four leaf clover|four_leaf_clover
🌸|cherry blossom|cherry_blossom
🌹|rose|rose
🌻|sunflower|sunflower
🌞|sun with face|sun_with_face
🌙|crescent moon|crescent_moon
⭐|star|star
🌟|glowing star|star2
🔥|fire|fire
🌈|rainbow|rainbow
☀️|sun|sunny
⛅|sun behind cloud|partly_sunny
🌧️|cloud with rain|cloud_with_rain
⚡|high voltage|zap
❄️|snowflake|snowflake
💧|droplet|droplet
🌊|water wave|ocean`,
  },
  {
    id: 'food',
    label: 'Food',
    lines: `🍏|green apple|green_apple
🍎|red apple|apple
🍊|tangerine|tangerine,orange
🍋|lemon|lemon
🍌|banana|banana
🍉|watermelon|watermelon
🍇|grapes|grapes
🍓|strawberry|strawberry
🍑|peach|peach
🥭|mango|mango
🥑|avocado|avocado
🌶️|hot pepper|hot_pepper
🥕|carrot|carrot
🍞|bread|bread
🧀|cheese wedge|cheese
🍳|cooking|fried_egg
🍔|hamburger|hamburger
🍟|french fries|fries
🍕|pizza|pizza
🌮|taco|taco
🥙|stuffed flatbread|stuffed_flatbread,falafel
🍣|sushi|sushi
🍜|steaming bowl|ramen
🍪|cookie|cookie
🎂|birthday cake|birthday
🍰|shortcake|cake
🍩|doughnut|doughnut
🍫|chocolate bar|chocolate_bar
☕|hot beverage|coffee
🍵|teacup without handle|tea
🧃|beverage box|beverage_box
🥤|cup with straw|cup_with_straw
🍺|beer mug|beer
🥂|clinking glasses|clinking_glasses`,
  },
  {
    id: 'activities',
    label: 'Activities',
    lines: `⚽|soccer ball|soccer
🏀|basketball|basketball
🏈|american football|football
🎾|tennis|tennis
🏐|volleyball|volleyball
🏓|ping pong|ping_pong
🏸|badminton|badminton
🥅|goal net|goal_net
⛳|flag in hole|golf
🏆|trophy|trophy
🥇|1st place medal|first_place_medal
🥈|2nd place medal|second_place_medal
🥉|3rd place medal|third_place_medal
🏅|sports medal|medal_sports
🎯|bullseye|dart
🎮|video game|video_game
🕹️|joystick|joystick
🎲|game die|game_die
♟️|chess pawn|chess_pawn
🧩|puzzle piece|jigsaw
🎨|artist palette|art
🎬|clapper board|clapper
🎤|microphone|microphone
🎧|headphone|headphones
🎸|guitar|guitar
🎉|party popper|tada
🎊|confetti ball|confetti_ball
🎈|balloon|balloon
🎁|wrapped gift|gift
🏃|person running|runner,running
🧘|person in lotus position|lotus_position
🚴|person biking|bicyclist`,
  },
  {
    id: 'travel',
    label: 'Travel',
    lines: `🚗|automobile|car,red_car
🚕|taxi|taxi
🚌|bus|bus
🚑|ambulance|ambulance
🚒|fire engine|fire_engine
🚚|delivery truck|truck
🚲|bicycle|bike
🛵|motor scooter|motor_scooter
🚂|locomotive|steam_locomotive
🚇|metro|metro
✈️|airplane|airplane
🛫|airplane departure|flight_departure
🛬|airplane arrival|flight_arrival
🚀|rocket|rocket
🛸|flying saucer|flying_saucer
🚢|ship|ship
⛵|sailboat|boat,sailboat
⚓|anchor|anchor
🚦|vertical traffic light|vertical_traffic_light
🚧|construction|construction
🗺️|world map|world_map
🧭|compass|compass
🏔️|snow-capped mountain|mountain_snow
🏖️|beach with umbrella|beach_umbrella
🏜️|desert|desert
🏝️|desert island|desert_island
🏠|house|house
🏢|office building|office
🏥|hospital|hospital
🏫|school|school
🕌|mosque|mosque
🗼|Tokyo tower|tokyo_tower
🌍|globe showing Europe-Africa|earth_africa
🌐|globe with meridians|globe_with_meridians`,
  },
  {
    id: 'objects',
    label: 'Objects',
    lines: `⌚|watch|watch
📱|mobile phone|iphone
💻|laptop|computer
⌨️|keyboard|keyboard
🖥️|desktop computer|desktop_computer
🖨️|printer|printer
🖱️|computer mouse|computer_mouse
💾|floppy disk|floppy_disk
💿|optical disk|cd
📷|camera|camera
🎥|movie camera|movie_camera
📞|telephone receiver|telephone_receiver
📺|television|tv
⏰|alarm clock|alarm_clock
⏳|hourglass not done|hourglass_flowing_sand
🔋|battery|battery
🔌|electric plug|electric_plug
💡|light bulb|bulb
🔦|flashlight|flashlight
💸|money with wings|money_with_wings
💰|money bag|moneybag
💳|credit card|credit_card
🧾|receipt|receipt
✉️|envelope|email,envelope
📦|package|package
📝|memo|memo,pencil
✏️|pencil|pencil2
📌|pushpin|pushpin
📎|paperclip|paperclip
📅|calendar|date
📈|chart increasing|chart_with_upwards_trend
📉|chart decreasing|chart_with_downwards_trend
📊|bar chart|bar_chart
📋|clipboard|clipboard
📁|file folder|file_folder
🗂️|card index dividers|card_index_dividers
🔒|locked|lock
🔑|key|key
🔨|hammer|hammer
🛠️|hammer and wrench|hammer_and_wrench
⚙️|gear|gear
🧪|test tube|test_tube
🔬|microscope|microscope
💊|pill|pill
🧯|fire extinguisher|fire_extinguisher
🛒|shopping cart|shopping_cart
📣|megaphone|mega
🔔|bell|bell
🔍|magnifying glass tilted left|mag
🏷️|label|label`,
  },
  {
    id: 'symbols',
    label: 'Symbols',
    lines: `❤️|red heart|heart
🧡|orange heart|orange_heart
💛|yellow heart|yellow_heart
💚|green heart|green_heart
💙|blue heart|blue_heart
💜|purple heart|purple_heart
🖤|black heart|black_heart
🤍|white heart|white_heart
💔|broken heart|broken_heart
💯|hundred points|100
✅|check mark button|white_check_mark
☑️|check box with check|ballot_box_with_check
✔️|check mark|heavy_check_mark
❌|cross mark|x
❎|cross mark button|negative_squared_cross_mark
➕|plus|heavy_plus_sign
➖|minus|heavy_minus_sign
❓|red question mark|question
❗|red exclamation mark|exclamation
⚠️|warning|warning
🚫|prohibited|no_entry_sign
⛔|no entry|no_entry
🔴|red circle|red_circle
🟠|orange circle|orange_circle
🟡|yellow circle|yellow_circle
🟢|green circle|green_circle
🔵|blue circle|large_blue_circle
⚪|white circle|white_circle
⚫|black circle|black_circle
🔺|red triangle pointed up|small_red_triangle
⬆️|up arrow|arrow_up
⬇️|down arrow|arrow_down
➡️|right arrow|arrow_right
⬅️|left arrow|arrow_left
🔄|counterclockwise arrows button|arrows_counterclockwise
🔁|repeat button|repeat
🆕|NEW button|new
🆗|OK button|ok
🆘|SOS button|sos
💬|speech balloon|speech_balloon
💭|thought balloon|thought_balloon
🕐|one o’clock|clock1
♻️|recycling symbol|recycle
✨|sparkles|sparkles
💤|zzz|zzz`,
  },
  {
    id: 'flags',
    label: 'Flags',
    lines: `🏁|chequered flag|checkered_flag
🚩|triangular flag|triangular_flag_on_post
🏳️|white flag|white_flag
🏴|black flag|black_flag
🇪🇬|flag: Egypt|egypt,eg
🇸🇦|flag: Saudi Arabia|saudi_arabia,sa
🇦🇪|flag: United Arab Emirates|united_arab_emirates,ae
🇶🇦|flag: Qatar|qatar,qa
🇰🇼|flag: Kuwait|kuwait,kw
🇯🇴|flag: Jordan|jordan,jo
🇲🇦|flag: Morocco|morocco,ma
🇬🇧|flag: United Kingdom|uk,gb
🇺🇸|flag: United States|us,usa
🇩🇪|flag: Germany|de,germany
🇫🇷|flag: France|fr,france
🇮🇳|flag: India|in,india
🇯🇵|flag: Japan|jp,japan
🇧🇷|flag: Brazil|brazil,br`,
  },
]

export const EMOJI_CATEGORIES: { id: string; label: string; emoji: EmojiInfo[] }[] = DATA.map(({ id, label, lines }) => ({
  id,
  label,
  emoji: lines.split('\n').map((line) => {
    const [char, name, aliases] = line.split('|')
    return { char, name, aliases: aliases.split(',') }
  }),
}))

const ALL = EMOJI_CATEGORIES.flatMap((c) => c.emoji)
const BY_CHAR = new Map(ALL.map((e) => [e.char, e]))

/** The name and aliases of an emoji in the set. */
export const emojiInfo = (char: string): EmojiInfo | undefined => BY_CHAR.get(char)

/**
 * Emoji whose name or alias matches the query: an exact alias first, then names and aliases that start with it, then
 * those that contain it.
 */
export function searchEmoji(query: string): EmojiInfo[] {
  const q = query.trim().toLowerCase().replace(/^:|:$/g, '')
  if (!q) return []
  const rank = (e: EmojiInfo) => {
    const words = [...e.aliases, ...e.name.toLowerCase().split(/[\s:-]+/)]
    if (e.aliases.includes(q)) return 0
    if (words.some((w) => w.startsWith(q))) return 1
    if (e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.includes(q))) return 2
    return 3
  }
  return ALL.map((e) => ({ e, r: rank(e) }))
    .filter(({ r }) => r < 3)
    .sort((a, b) => a.r - b.r)
    .map(({ e }) => e)
}

const RECENT_KEY = 'spark-flow.emoji.recent'
const RECENT_MAX = 18

/** What I react with most recently, newest first, in this browser (a convenience); the quick reactions to start. */
export function recentEmoji(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null') as unknown
    const list = Array.isArray(stored) ? stored.filter((e): e is string => typeof e === 'string') : []
    return [...new Set([...list, ...REACTIONS])].slice(0, RECENT_MAX)
  } catch {
    return [...REACTIONS]
  }
}

/** Puts an emoji first in Frequently used. */
export function rememberEmoji(char: string) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    const prior = Array.isArray(list) ? list.filter((e): e is string => typeof e === 'string' && e !== char) : []
    localStorage.setItem(RECENT_KEY, JSON.stringify([char, ...prior].slice(0, RECENT_MAX)))
  } catch {
    // Storage blocked (a private window): the list just doesn't remember.
  }
}
