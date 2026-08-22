const MIN_DIFFS_FOR_SIGNAL = 5
const Z_SCORE_THRESHOLD = 3

// Flags a reading as a real outlier — an unusually large jump from the
// prior reading, relative to how much this series typically moves
// day-to-day — rather than requiring the reader to eyeball every
// sparkline for something that's actually worth writing about.
//
// This scores the day-over-day CHANGE, not the raw level. Scoring the
// level (z-score of the value itself against the mean of its history)
// looks correct for a series that oscillates around a stable mean (VIX,
// crude oil), but breaks down for a smoothly TRENDING series — e.g. a
// rolling-average rate like SOFR that drifts steadily upward for weeks.
// On a trending series, the latest point is almost always the most
// extreme point so far relative to the historical mean, so a level-based
// z-score flags nearly every reading as "notable" even though each day's
// move is unremarkable. Differencing removes the trend and asks the right
// question instead: is *this* move bigger than usual, not "is the level
// higher than average."
export function isNotableMove(valuesOldestFirst: number[]): boolean {
  if (valuesOldestFirst.length < MIN_DIFFS_FOR_SIGNAL + 2) return false

  const diffs: number[] = []
  for (let i = 1; i < valuesOldestFirst.length; i++) {
    diffs.push(valuesOldestFirst[i] - valuesOldestFirst[i - 1])
  }

  const latestDiff = diffs.at(-1)!
  const history = diffs.slice(0, -1)

  const mean = history.reduce((sum, d) => sum + d, 0) / history.length
  const variance = history.reduce((sum, d) => sum + (d - mean) ** 2, 0) / history.length
  const stddev = Math.sqrt(variance)

  if (stddev === 0) return false

  const zScore = Math.abs(latestDiff - mean) / stddev
  return zScore > Z_SCORE_THRESHOLD
}

// Same signal as isNotableMove, but for every point in the series instead
// of only the latest one — each index i is evaluated against the history
// before it, i.e. what isNotableMove would have said had that point been
// "latest" at the time. Early points (before enough diffs exist) are
// never flagged, same minimum-sample-size guard as isNotableMove.
export function outlierFlags(valuesOldestFirst: number[]): boolean[] {
  return valuesOldestFirst.map((_, i) => isNotableMove(valuesOldestFirst.slice(0, i + 1)))
}
