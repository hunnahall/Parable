// The spec's page-load indicator: a 4px indeterminate bar in the signature
// color along the top of the content area (under the 56px top bar below
// 1000px). Hidden for the first 300ms so fast loads never flash it; with
// reduced motion it holds still as a partial bar (globals.css). The sticky
// wrapper is separate because .cw-progress sets its own position.
export default function TopLoadingBar() {
  return (
    <div className="top-loading-bar sticky top-0 z-[var(--z-sticky)] max-[999px]:top-14">
      <div role="progressbar" aria-label="Loading" className="cw-progress cw-progress--indeterminate">
        <span />
      </div>
    </div>
  )
}
