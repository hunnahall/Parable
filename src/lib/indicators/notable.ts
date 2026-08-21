const MIN_READINGS_FOR_SIGNAL = 5
const Z_SCORE_THRESHOLD = 2

// Flags a reading as a real outlier relative to its own recent history,
// rather than requiring the reader to eyeball every sparkline for
// something that's actually worth writing about. Needs a minimum sample
// size and non-zero variance to produce a meaningful signal — too few
// readings, or a perfectly flat series, just isn't flagged rather than
// risking a misleading true/false on noise.
export function isNotableMove(valuesOldestFirst: number[]): boolean {
  if (valuesOldestFirst.length < MIN_READINGS_FOR_SIGNAL) return false

  const latest = valuesOldestFirst.at(-1)!
  const history = valuesOldestFirst.slice(0, -1)

  const mean = history.reduce((sum, v) => sum + v, 0) / history.length
  const variance = history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length
  const stddev = Math.sqrt(variance)

  if (stddev === 0) return false

  const zScore = Math.abs(latest - mean) / stddev
  return zScore > Z_SCORE_THRESHOLD
}

// Same signal as isNotableMove, but for every point in the series instead
// of only the latest one — each index i is evaluated against the history
// before it, i.e. what isNotableMove would have said had that point been
// "latest" at the time. Early points (before MIN_READINGS_FOR_SIGNAL) are
// never flagged, same minimum-sample-size guard as isNotableMove.
export function outlierFlags(valuesOldestFirst: number[]): boolean[] {
  return valuesOldestFirst.map((_, i) => isNotableMove(valuesOldestFirst.slice(0, i + 1)))
}
