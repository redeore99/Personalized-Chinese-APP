// Watch tab content. Channels are verified (channel IDs resolved from YouTube).
// The `videos` list is refreshed periodically by the weekly content task using
// each channel's RSS feed: https://www.youtube.com/feeds/videos.xml?channel_id=<ID>
// Topics: songs · stories · reading · characters · grammar · economy · listening · course

export const WATCH_CONTENT_VERSION = '2026-07-05'

export const WATCH_CHANNELS = [
  {
    id: 'UCUjFsQAUUS1IFM7oyUXeB1g',
    name: 'SyS Mandarin',
    handle: '@sysmandarin',
    description: 'Stories, news, movies and songs with vocabulary + grammar breakdowns. Great for learning Chinese through songs.',
    topics: ['songs', 'stories', 'listening', 'reading'],
    level: 'Intermediate+',
    url: 'https://www.youtube.com/@sysmandarin/videos'
  },
  {
    id: 'UCQ3IlLg5VGeydxtswBoyt6A',
    name: 'Chinese Zero to Hero',
    handle: '@ChineseZeroToHero',
    description: 'The team behind your HSK courses — grammar deep-dives and HSK-level lessons.',
    topics: ['course', 'grammar', 'reading'],
    level: 'All HSK levels',
    url: 'https://www.youtube.com/@chinesezerotohero/videos'
  },
  {
    id: 'UCC_fdR7zZ_5SU--xuOrEdKw',
    name: 'Grace Mandarin Chinese',
    handle: '@GraceMandarinChinese',
    description: 'Linguistics-flavoured lessons: pronunciation, characters and natural usage.',
    topics: ['characters', 'grammar', 'listening'],
    level: 'Intermediate',
    url: 'https://www.youtube.com/@GraceMandarinChinese/videos'
  },
  {
    id: 'UC_Aiv9xguPQxZ6msnNoz3HQ',
    name: 'ShuoshuoChinese 说说中文',
    handle: '@ShuoshuoChinese',
    description: 'Natural Chinese, character know-how and listening practice with subtitles.',
    topics: ['characters', 'listening', 'grammar'],
    level: 'Intermediate',
    url: 'https://www.youtube.com/@ShuoShuoChinese/videos'
  }
]

// Hand-picked searches that open the right slice of a channel instantly.
// These are stable URLs (channel search), so they never go stale.
export const WATCH_PICKS = [
  {
    id: 'sys-songs',
    title: 'Learn Chinese through songs',
    channel: 'SyS Mandarin',
    note: 'Song clips explained line by line — your favourite format.',
    topics: ['songs'],
    url: 'https://www.youtube.com/@sysmandarin/search?query=song'
  },
  {
    id: 'sys-stories',
    title: 'Chinese stories (intermediate)',
    channel: 'SyS Mandarin',
    note: 'Narrated stories with pinyin and vocabulary support.',
    topics: ['stories', 'reading'],
    url: 'https://www.youtube.com/@sysmandarin/search?query=story'
  },
  {
    id: 'sys-news',
    title: 'News in slow Chinese',
    channel: 'SyS Mandarin',
    note: 'Current events — the fastest bridge to economics vocabulary.',
    topics: ['economy', 'listening'],
    url: 'https://www.youtube.com/@sysmandarin/search?query=news'
  },
  {
    id: 'czth-hsk5',
    title: 'HSK 5 lessons',
    channel: 'Chinese Zero to Hero',
    note: 'Matches your HSK 5 deck — watch the lesson, then review the deck.',
    topics: ['course', 'grammar'],
    url: 'https://www.youtube.com/@chinesezerotohero/search?query=HSK%205'
  },
  {
    id: 'grace-characters',
    title: 'Character & radical logic',
    channel: 'Grace Mandarin Chinese',
    note: 'How characters are built — pairs perfectly with the Radicals deck.',
    topics: ['characters'],
    url: 'https://www.youtube.com/@GraceMandarinChinese/search?query=characters'
  },
  {
    id: 'shuo-listening',
    title: 'Real-life listening practice',
    channel: 'ShuoshuoChinese 说说中文',
    note: 'Natural-speed Chinese with subtitles.',
    topics: ['listening'],
    url: 'https://www.youtube.com/@ShuoShuoChinese/search?query=listening'
  }
]

// Specific fresh videos land here via the weekly content task (id = YouTube video id).
// Shape: { id, title, channel, topics, minutes, url }
export const WATCH_VIDEOS = []

export const WATCH_TOPICS = ['songs', 'stories', 'reading', 'characters', 'grammar', 'economy', 'listening', 'course']

// Deterministic "today's pick" so the home screen suggests one thing per day.
export function getTodaysPick(dateString = new Date().toISOString().slice(0, 10)) {
  const pool = [...WATCH_VIDEOS, ...WATCH_PICKS]
  if (!pool.length) return null

  let hash = 0
  for (const ch of dateString) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  }

  return pool[hash % pool.length]
}
