/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Ratings:
 *   0 = Again (complete failure, reset)
 *   1 = Hard  (correct but with difficulty)
 *   2 = Good  (correct with some effort)
 *   3 = Easy  (effortless recall)
 *
 * This maps the 4-button UI (Again/Hard/Good/Easy) to SM-2 quality scores.
 */

// Map our 4-button rating to SM-2 quality (0-5)
function ratingToQuality(rating) {
  switch (rating) {
    case 0: return 1  // Again → quality 1 (reset)
    case 1: return 3  // Hard → quality 3
    case 2: return 4  // Good → quality 4
    case 3: return 5  // Easy → quality 5
    default: return 4
  }
}

/**
 * Calculate the next review schedule based on SM-2.
 *
 * @param {Object} card - Current card SRS state
 * @param {number} card.interval - Current interval in days
 * @param {number} card.repetitions - Consecutive correct reps
 * @param {number} card.easeFactor - Current ease factor
 * @param {number} rating - User rating (0=Again, 1=Hard, 2=Good, 3=Easy)
 * @param {number|null} writingScore - Writing accuracy (0-1) or null if not practiced
 * @returns {Object} Updated SRS fields
 */
export function calculateNextReview(card, rating, writingScore = null) {
  const quality = ratingToQuality(rating)

  let { interval, repetitions, easeFactor } = card

  // If writing score is poor, make the card harder
  let writingPenalty = 0
  if (writingScore !== null && writingScore < 0.5) {
    writingPenalty = 0.15 // reduce ease factor more
  }

  if (quality < 3) {
    // Failed: reset repetitions, short interval
    repetitions = 0
    interval = 0 // show again this session (in 1 minute effectively)
  } else {
    // Passed
    if (repetitions === 0) {
      interval = 1  // first correct: 1 day
    } else if (repetitions === 1) {
      interval = 6  // second correct: 6 days
    } else {
      interval = Math.round(interval * easeFactor)
    }
    repetitions += 1
  }

  // Update ease factor (SM-2 formula)
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  easeFactor = Math.max(1.3, easeFactor - writingPenalty)

  // For "Hard" (quality 3), apply a multiplier to shorten interval
  if (quality === 3 && interval > 1) {
    interval = Math.max(1, Math.round(interval * 0.8))
  }

  // For "Easy" (quality 5), bonus interval
  if (quality === 5 && interval > 0) {
    interval = Math.round(interval * 1.3)
  }

  // Calculate next review date
  const nextReview = new Date()
  if (interval === 0) {
    // Due again in 1 minute (for "Again" cards within a session)
    nextReview.setMinutes(nextReview.getMinutes() + 1)
  } else {
    nextReview.setDate(nextReview.getDate() + interval)
    nextReview.setHours(4, 0, 0, 0) // Due at 4 AM next day
  }

  return {
    interval,
    repetitions,
    easeFactor: Math.round(easeFactor * 100) / 100,
    nextReview: nextReview.toISOString(),
    lastReview: new Date().toISOString()
  }
}

/**
 * Get human-readable interval text
 */
export function formatInterval(days) {
  if (days === 0) return '< 1 min'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  if (days < 365) return `${Math.round(days / 30)} months`
  return `${(days / 365).toFixed(1)} years`
}

/**
 * Preview what intervals each rating would give
 */
export function previewIntervals(card) {
  return {
    again: calculateNextReview(card, 0).interval,
    hard: calculateNextReview(card, 1).interval,
    good: calculateNextReview(card, 2).interval,
    easy: calculateNextReview(card, 3).interval
  }
}
