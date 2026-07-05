import { db, getMetaValue, setMetaValue } from './db'

export const DEFAULT_DAILY_GOAL = 20
export const SESSION_NEW_CARD_COUNT = 5

function toLocalDateKey(isoString) {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayKey() {
  return toLocalDateKey(new Date().toISOString())
}

function previousDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() - 1)
  return toLocalDateKey(date.toISOString())
}

export async function getDailyGoal() {
  const stored = await getMetaValue('dailyGoal')
  const parsed = Number(stored)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_GOAL
}

export async function setDailyGoal(goal) {
  const parsed = Number(goal)
  if (!Number.isFinite(parsed) || parsed < 1) return
  await setMetaValue('dailyGoal', Math.min(200, Math.round(parsed)))
}

// Set of local date keys (YYYY-MM-DD) with at least one review or writing rep.
export async function getStudyDates() {
  const [reviewLog, writingLog] = await Promise.all([
    db.reviewLog.toArray(),
    db.writingLog.toArray()
  ])

  const dates = new Set()
  for (const entry of reviewLog) {
    const key = toLocalDateKey(entry.reviewedAt)
    if (key) dates.add(key)
  }
  for (const entry of writingLog) {
    const key = toLocalDateKey(entry.practicedAt)
    if (key) dates.add(key)
  }

  return dates
}

// Streak counts consecutive study days ending today, or ending yesterday if
// today has no activity yet (so the streak is "alive" until midnight).
export function computeStreak(studyDates, today = todayKey()) {
  const studiedToday = studyDates.has(today)
  let cursor = studiedToday ? today : previousDateKey(today)
  let streak = 0

  while (studyDates.has(cursor)) {
    streak += 1
    cursor = previousDateKey(cursor)
  }

  return { streak, studiedToday }
}

export async function markWatchedToday() {
  await setMetaValue('lastWatchedDate', todayKey())
}

export async function getWatchedToday() {
  const stored = await getMetaValue('lastWatchedDate')
  return stored === todayKey()
}

export async function getHabitSummary({ todayReviews = 0, todayWriting = 0 } = {}) {
  const [studyDates, goal, watchedToday] = await Promise.all([
    getStudyDates(),
    getDailyGoal(),
    getWatchedToday()
  ])

  const { streak, studiedToday } = computeStreak(studyDates)
  const reviewsRemaining = Math.max(0, goal - todayReviews)

  return {
    streak,
    studiedToday,
    goal,
    reviewsRemaining,
    goalReached: todayReviews >= goal,
    wroteToday: todayWriting > 0,
    watchedToday,
    // Last 7 days activity for the mini calendar (oldest first)
    week: buildWeek(studyDates)
  }
}

function buildWeek(studyDates) {
  const days = []
  const now = new Date()

  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(now)
    date.setDate(now.getDate() - offset)
    const key = toLocalDateKey(date.toISOString())
    days.push({
      key,
      label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()],
      studied: studyDates.has(key),
      isToday: offset === 0
    })
  }

  return days
}
