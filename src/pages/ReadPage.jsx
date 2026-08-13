import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SpeakButton from '../components/SpeakButton'
import WordPopup from '../components/WordPopup'
import {
  BOOKS,
  downloadWholeBook,
  getBook,
  getBookCacheStatus,
  loadBookIndex,
  loadBookLexicon,
  loadChapter,
  pruneStaleChapters
} from '../lib/books'
import {
  addCard,
  getAllCards,
  getDeckOptions,
  getMetaValue,
  getReadingProgress,
  markChapterFinished,
  saveReadingProgress,
  setMetaValue
} from '../lib/db'
import { buildDictMap, getDictStatus, lookupWord, segmentText } from '../lib/dict'
import { convertNumberedPinyin } from '../lib/pinyin'

const DEFAULT_SETTINGS = { script: 's', ruby: false, fontSize: 19 }
const SETTINGS_KEY = 'reader:settings'

// Sentence boundaries used for the context line under a tapped word.
const SENTENCE_BREAK = /[。！？；\n]/

function sentenceAround(text, index) {
  let start = index
  let end = index

  while (start > 0 && !SENTENCE_BREAK.test(text[start - 1])) start -= 1
  while (end < text.length && !SENTENCE_BREAK.test(text[end])) end += 1

  return text.slice(start, Math.min(end + 1, text.length)).trim()
}

export default function ReadPage({ onRefresh }) {
  const navigate = useNavigate()
  const params = useParams()

  const slug = params.slug || BOOKS[0].slug
  const book = getBook(slug)

  const [index, setIndex] = useState(null)
  const [chapter, setChapter] = useState(null)
  const [chapterNumber, setChapterNumber] = useState(Number(params.chapter) || null)
  const [progress, setProgress] = useState(null)
  const [dictReady, setDictReady] = useState(null)
  const [knownWords, setKnownWords] = useState(new Set())
  const [dictMap, setDictMap] = useState(null)
  const [lexicon, setLexicon] = useState(null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [selected, setSelected] = useState(null)
  const [decks, setDecks] = useState([])
  const [targetDeckId, setTargetDeckId] = useState('')
  const [cacheStatus, setCacheStatus] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadNote, setDownloadNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const paragraphRefs = useRef([])
  const restoreTo = useRef(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      loadBookIndex(slug),
      getReadingProgress(slug),
      getDictStatus(),
      getDeckOptions(),
      getMetaValue(SETTINGS_KEY),
      // Chapters cached from an earlier build hold superseded text, so they are
      // dropped before the offline count is reported.
      pruneStaleChapters(slug).then(() => getBookCacheStatus(slug)),
      loadBookLexicon(slug)
    ])
      .then(([bookIndex, saved, dict, deckOptions, savedSettings, cache, bookLexicon]) => {
        if (cancelled) return
        setIndex(bookIndex)
        setProgress(saved)
        setDictReady(Boolean(dict?.loaded))
        setDecks(deckOptions)
        setCacheStatus(cache)
        setLexicon(bookLexicon)
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
      })
      .catch(err => !cancelled && setError(err.message))

    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!dictReady) return
    let cancelled = false

    Promise.all([buildDictMap(), getAllCards()]).then(([map, cards]) => {
      if (cancelled) return
      setDictMap(map)
      setKnownWords(new Set(cards.map(card => card.character.trim()).filter(Boolean)))
    })

    return () => {
      cancelled = true
    }
  }, [dictReady])

  const openChapter = useCallback(
    async (n, { paragraph = 0 } = {}) => {
      setLoading(true)
      setError(null)
      setSelected(null)

      try {
        const data = await loadChapter(slug, n)
        paragraphRefs.current = []
        setChapter(data)
        setChapterNumber(n)
        restoreTo.current = paragraph
        setCacheStatus(await getBookCacheStatus(slug))
        await saveReadingProgress(slug, { chapter: n, paragraph })
        setProgress(await getReadingProgress(slug))
      } catch (err) {
        setError(err.message)
      }

      setLoading(false)
    },
    [slug]
  )

  // Deep link (/read/:slug/:chapter) wins over saved progress.
  useEffect(() => {
    const requested = Number(params.chapter)
    if (Number.isFinite(requested) && requested >= 1 && requested !== chapter?.n) {
      openChapter(requested)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.chapter, slug])

  // Remember roughly where the reader stopped, without writing on every frame.
  useEffect(() => {
    if (!chapter) return

    let timer = null
    const onScroll = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const tops = paragraphRefs.current
        let current = 0
        for (let i = 0; i < tops.length; i++) {
          const node = tops[i]
          if (node && node.getBoundingClientRect().top <= 120) current = i
        }
        saveReadingProgress(slug, { chapter: chapter.n, paragraph: current }).catch(() => {})
      }, 1200)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (timer) clearTimeout(timer)
    }
  }, [chapter, slug])

  const updateSettings = patch => {
    const next = { ...settings, ...patch }
    setSettings(next)
    setMetaValue(SETTINGS_KEY, next).catch(() => {})
  }

  // The book's curated proper nouns join the dictionary so the segmenter can
  // keep them whole and the popup has something to show for them.
  const readerDict = useMemo(() => {
    const names = lexicon?.names
    if (!dictMap || !names || !Object.keys(names).length) return dictMap

    const merged = new Map(dictMap)
    for (const [word, info] of Object.entries(names)) {
      if (!merged.has(word)) merged.set(word, [{ pinyin: info.p, defs: info.d }])
    }
    return merged
  }, [dictMap, lexicon])

  // Segmentation always runs on the simplified text, because the dictionary is
  // keyed on simplified headwords and the user's cards are simplified. In
  // traditional mode the same token boundaries are reused to slice the
  // traditional string, which is safe: prepare-book.mjs converts character by
  // character, so both scripts have identical length for every paragraph.
  // Segmenting the traditional text directly instead would leave 31% of taps
  // with no definition and halve multi-character recognition.
  const paragraphs = useMemo(() => {
    if (!chapter || !readerDict) return []

    const traditional = settings.script === 't'
    const options = lexicon?.counts ? { counts: lexicon.counts } : {}

    return chapter.paragraphs.map(paragraph => {
      const source = paragraph.s
      const tokens = segmentText(source, readerDict, knownWords, options)

      if (!traditional || !paragraph.t || paragraph.t.length !== source.length) {
        return { verse: Boolean(paragraph.v), text: source, display: source, tokens }
      }

      const displayChars = Array.from(paragraph.t)
      let cursor = 0
      const mapped = tokens.map(token => {
        const width = Array.from(token.text).length
        const shown = displayChars.slice(cursor, cursor + width).join('')
        cursor += width
        return { ...token, shown }
      })

      return {
        verse: Boolean(paragraph.v),
        text: source,
        display: paragraph.t,
        tokens: mapped
      }
    })
  }, [chapter, readerDict, lexicon, settings.script, knownWords])

  // Must stay below the `paragraphs` memo: a dependency array is evaluated
  // during render, so referencing paragraphs.length above its own declaration
  // throws a temporal-dead-zone ReferenceError and blanks the whole page.
  // Paragraphs only exist once the dictionary has loaded, which can happen
  // after the chapter, so the saved position is restored on the render that
  // actually has nodes to scroll to.
  useEffect(() => {
    if (!chapter || restoreTo.current === null || !paragraphs.length) return

    const index = restoreTo.current
    restoreTo.current = null

    if (index <= 0) {
      window.scrollTo(0, 0)
      return
    }

    paragraphRefs.current[index]?.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, paragraphs.length])

  const stats = useMemo(() => {
    if (!paragraphs.length) return null

    const words = paragraphs.flatMap(p => p.tokens.filter(token => token.type === 'word'))
    const unique = new Set(words.map(token => token.text))
    const known = [...unique].filter(word => knownWords.has(word)).length

    return {
      total: unique.size,
      known,
      newCount: unique.size - known,
      coverage: unique.size ? Math.round((known / unique.size) * 100) : 0
    }
  }, [paragraphs, knownWords])

  const handleTokenTap = async (token, paragraphIndex, charIndex) => {
    if (token.type !== 'word') return
    // Lookup always uses the simplified form; the context line is shown in
    // whichever script the reader is currently reading.
    const curated = lexicon?.names?.[token.text]
    const entries = curated
      ? [{ pinyin: curated.p, defs: curated.d }]
      : await lookupWord(token.text)
    const source = paragraphs[paragraphIndex]?.display || paragraphs[paragraphIndex]?.text || ''
    setSelected({
      text: token.shown || token.text,
      lookupText: token.text,
      entries,
      context: sentenceAround(source, charIndex)
    })
  }

  const handleAddCard = async () => {
    if (!selected) return

    const best = selected.entries[0] || null
    // Cards are always stored simplified, even when reading in traditional.
    const word = selected.lookupText || selected.text
    await addCard({
      character: word,
      pinyin: best ? convertNumberedPinyin(best.pinyin).toLowerCase() : '',
      meaning: best ? best.defs : '',
      tags: ['reader', slug],
      deckId: targetDeckId && Number.isFinite(Number(targetDeckId)) ? Number(targetDeckId) : null
    })

    setKnownWords(prev => new Set(prev).add(word))
    onRefresh?.()
  }

  const handleFinishChapter = async () => {
    if (!chapter) return
    await markChapterFinished(slug, chapter.n)
    setProgress(await getReadingProgress(slug))

    const next = chapter.n + 1
    if (index && next <= index.chapterCount) openChapter(next)
    else setChapter(null)
  }

  const handleDownloadAll = async () => {
    setDownloading(true)
    setError(null)

    try {
      await downloadWholeBook(slug, note => setDownloadNote(note))
      setCacheStatus(await getBookCacheStatus(slug))
    } catch (err) {
      setError(err.message)
    }

    setDownloading(false)
    setDownloadNote('')
  }

  const finished = useMemo(
    () => new Set(progress?.finishedChapters || []),
    [progress]
  )

  if (!book) {
    return (
      <div className="page">
        <p className="text-secondary">Unknown book.</p>
      </div>
    )
  }

  if (dictReady === false) {
    return (
      <div className="page">
        <div className="page-header-row" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Read</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Home</button>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Offline dictionary needed</h3>
          <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            The reader looks every word up locally. Download the CC-CEDICT dictionary once
            from Settings and it works offline from then on.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/settings')}>
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  // --- Chapter list -------------------------------------------------------
  if (!chapter) {
    return (
      <div className="page">
        <div className="page-header-row" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }} lang="zh">{book.title}</h2>
            <p className="text-secondary" style={{ fontSize: 13 }}>
              {book.latinTitle} · {book.author}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Home</button>
        </div>

        {error && <div className="card-message card-message-warning" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="card" style={{ marginBottom: 16 }}>
          <p className="text-secondary" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
            {book.blurb}
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openChapter(progress?.chapter || 1, { paragraph: progress?.paragraph || 0 })}
              disabled={loading}
            >
              {progress ? `Continue — chapter ${progress.chapter}` : 'Start reading'}
            </button>
            {!cacheStatus?.complete && (
              <button className="btn btn-ghost btn-sm" onClick={handleDownloadAll} disabled={downloading}>
                {downloading ? (downloadNote || 'Downloading...') : 'Save all chapters offline'}
              </button>
            )}
          </div>

          {cacheStatus && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
              {cacheStatus.cachedChapters} of {cacheStatus.totalChapters} chapters stored on this device
              {finished.size > 0 && ` · ${finished.size} finished`}
            </p>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Chapters</h3>
          <div className="reader-chapter-list">
            {(index?.chapters || []).map(entry => (
              <button
                key={entry.n}
                className={`reader-chapter ${finished.has(entry.n) ? 'reader-chapter-done' : ''}`}
                onClick={() => openChapter(entry.n)}
                lang="zh"
              >
                <span className="reader-chapter-n">{entry.n}</span>
                <span className="reader-chapter-title">{entry.title[settings.script] || entry.title.s}</span>
                {finished.has(entry.n) && <span className="reader-chapter-tick">✓</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // --- Reader -------------------------------------------------------------
  return (
    <div className="page" style={{ paddingBottom: selected ? 260 : 90 }}>
      <div className="reader-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => setChapter(null)}>← Chapters</button>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {chapter.n} / {index?.chapterCount || book.chapterCount}
        </span>
        <div className="reader-bar-actions">
          <button
            className={`btn btn-ghost btn-sm ${settings.ruby ? 'reader-toggle-on' : ''}`}
            onClick={() => updateSettings({ ruby: !settings.ruby })}
            title="Show pinyin above each word"
          >
            pīn
          </button>
          <button
            className={`btn btn-ghost btn-sm ${settings.script === 't' ? 'reader-toggle-on' : ''}`}
            onClick={() => updateSettings({ script: settings.script === 's' ? 't' : 's' })}
            title="Switch between simplified and traditional"
          >
            {settings.script === 's' ? '简' : '繁'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => updateSettings({ fontSize: Math.max(15, settings.fontSize - 2) })}
          >
            A−
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => updateSettings({ fontSize: Math.min(30, settings.fontSize + 2) })}
          >
            A+
          </button>
        </div>
      </div>

      {error && <div className="card-message card-message-warning" style={{ marginBottom: 12 }}>{error}</div>}

      <h2 className="reader-title" lang="zh">
        {chapter.title[settings.script] || chapter.title.s}
      </h2>

      {stats && (
        <div className="reader-stats">
          <span><strong>{stats.total}</strong> unique</span>
          <span style={{ color: 'var(--success)' }}><strong>{stats.known}</strong> known</span>
          <span style={{ color: 'var(--accent)' }}><strong>{stats.newCount}</strong> new</span>
          <span><strong>{stats.coverage}%</strong> coverage</span>
        </div>
      )}

      <div className="reader-body" style={{ fontSize: settings.fontSize }} lang="zh">
        {paragraphs.map((paragraph, paragraphIndex) => {
          let cursor = 0

          return (
            <p
              key={paragraphIndex}
              ref={node => { paragraphRefs.current[paragraphIndex] = node }}
              className={paragraph.verse ? 'reader-p reader-verse' : 'reader-p'}
            >
              {paragraph.tokens.map((token, tokenIndex) => {
                const at = cursor
                cursor += token.text.length

                if (token.type === 'plain') {
                  return <span key={tokenIndex}>{token.shown || token.text}</span>
                }

                const isKnown = knownWords.has(token.text)
                const classes = [
                  'reader-token',
                  isKnown ? 'reader-token-known' : token.inDict ? 'reader-token-new' : 'reader-token-unknown',
                  (selected?.lookupText || selected?.text) === token.text ? 'reader-token-selected' : ''
                ].join(' ')

                const entry = settings.ruby ? readerDict?.get(token.text)?.[0] : null

                return (
                  <span
                    key={tokenIndex}
                    className={classes}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleTokenTap(token, paragraphIndex, at)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleTokenTap(token, paragraphIndex, at)
                      }
                    }}
                  >
                    {entry ? (
                      <ruby>
                        {token.shown || token.text}
                        <rt>{convertNumberedPinyin(entry.pinyin).toLowerCase()}</rt>
                      </ruby>
                    ) : (
                      token.shown || token.text
                    )}
                  </span>
                )
              })}
              <SpeakButton text={paragraph.text} />
            </p>
          )
        })}
      </div>

      <div className="reader-foot">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => openChapter(chapter.n - 1)}
          disabled={chapter.n <= 1 || loading}
        >
          ← Previous
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleFinishChapter} disabled={loading}>
          {finished.has(chapter.n) ? 'Next chapter →' : 'Mark read & continue →'}
        </button>
      </div>

      {selected && (
        <WordPopup
          word={selected.text}
          entries={selected.entries}
          decks={decks}
          targetDeckId={targetDeckId}
          onDeckChange={setTargetDeckId}
          onAdd={handleAddCard}
          onClose={() => setSelected(null)}
          inLibrary={knownWords.has(selected.lookupText || selected.text)}
          contextSentence={selected.context}
        />
      )}
    </div>
  )
}
