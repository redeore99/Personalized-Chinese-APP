import PlecoLookupButton from './PlecoLookupButton'
import SpeakButton from './SpeakButton'
import { convertNumberedPinyin } from '../lib/pinyin'

// Shared tap-a-word panel used by Article Mode and the book reader:
// pinyin, definitions, audio, Pleco hand-off, and one-tap card creation.
export default function WordPopup({
  word,
  entries = [],
  decks = [],
  targetDeckId = '',
  onDeckChange,
  onAdd,
  onClose,
  inLibrary = false,
  contextSentence = ''
}) {
  if (!word) return null

  return (
    <div className="article-panel slide-up">
      <div className="article-panel-head">
        <span className="char-display" style={{ fontSize: 28 }}>{word}</span>
        <SpeakButton text={word} />
        <PlecoLookupButton character={word} />
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
          Close
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: 13 }}>
          Not in the offline dictionary — try Pleco for this one.
        </p>
      ) : (
        <div className="article-panel-defs">
          {entries.slice(0, 3).map((entry, index) => (
            <div key={index} className="article-panel-def">
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {convertNumberedPinyin(entry.pinyin)}
              </span>
              <span className="text-secondary"> — {entry.defs}</span>
            </div>
          ))}
        </div>
      )}

      {contextSentence && (
        <p className="reader-context" lang="zh">
          {contextSentence}
        </p>
      )}

      <div className="article-panel-actions">
        <select
          className="input"
          value={targetDeckId}
          onChange={event => onDeckChange?.(event.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        >
          <option value="">Standalone card</option>
          {decks.map(deck => (
            <option key={deck.id} value={deck.id}>{deck.name}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={inLibrary}>
          {inLibrary ? 'In library ✓' : '+ Add card'}
        </button>
      </div>
    </div>
  )
}
