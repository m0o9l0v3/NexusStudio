import { Toolbar } from '../shell/Toolbar'
import type { NavArea } from '../shell/navigation'

/**
 * まだ実装していない領域の表示。App Shellの移動を確認できるようにするための仮の本文で、
 * 各領域の実装時に置き換える。データを取得しないため、0件や問題なしのようには見せない。
 */
export function PlaceholderPage({ area }: { area: NavArea }) {
  return (
    <>
      <Toolbar title={area.label} subtitle={area.subtitle} />
      <main className="min-h-0 flex-1 overflow-auto p-6">
        <section className="flex max-w-[720px] flex-col gap-2 rounded-[10px] border border-border bg-surface p-6">
          <h2 className="text-[18px] leading-[26px] font-bold text-text-primary">{area.label}は準備中です</h2>
          <p className="text-[13px] leading-[21px] text-text-secondary">
            この画面は{area.plannedStep}で実装します。現在の公開状態やデータはまだ表示していません。
          </p>
        </section>
      </main>
    </>
  )
}
