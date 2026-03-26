import { buildPlecoDefinitionUrl, isLikelyMobileDevice } from '../lib/pleco'

export default function PlecoLookupButton({ character, pinyin = '' }) {
  const normalizedCharacter = character?.trim()

  if (!normalizedCharacter) {
    return null
  }

  const isMobile = isLikelyMobileDevice()
  const plecoUrl = buildPlecoDefinitionUrl({
    character: normalizedCharacter,
    pinyin
  })

  return (
    <div className="pleco-link-row">
      {isMobile ? (
        <a className="btn btn-secondary btn-sm pleco-link" href={plecoUrl}>
          Open in Pleco
        </a>
      ) : (
        <>
          <button className="btn btn-secondary btn-sm pleco-link" type="button" disabled>
            Open in Pleco
          </button>
          <p className="pleco-link-hint">
            Pleco lookup works on your phone when Pleco is installed.
          </p>
        </>
      )}
    </div>
  )
}
