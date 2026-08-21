// Custom recharts <Line dot={...}> renderer — draws nothing for ordinary
// points, and a small amber ring for ones flagged `notable`. Amber matches
// the notable-move badge/dot used everywhere else in the app (WatchlistWidget,
// IndicatorsWidget), so it reads as one consistent "outlier" signal rather
// than a second, unrelated color.
export default function OutlierDot(props: {
  cx?: number
  cy?: number
  payload?: { notable?: boolean }
}) {
  const { cx, cy, payload } = props
  if (!payload?.notable || cx == null || cy == null) return <></>
  return <circle cx={cx} cy={cy} r={3} fill="#d97706" stroke="var(--background)" strokeWidth={1} />
}
