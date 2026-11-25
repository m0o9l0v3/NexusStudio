import { Toolbar } from '../shell/Toolbar'
import type { NavArea } from '../shell/navigation'
import { PageSheet } from '../ui/PageSheet'

/**
 * まだ実装していない領域の表示。App Shellの移動を確認できるようにするための仮の本文で、
 * 各領域の実装時に置き換える。データを取得しないため、0件や問題なしのようには見せない。
 */
export function PlaceholderPage({ area }: { area: NavArea }) {
  const Icon = area.icon
  return (
    <>
      <Toolbar title={area.label} subtitle={area.subtitle} />
      <PageSheet>
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <section className="flex max-w-[480px] flex-col items-center gap-2 text-center">
            <Icon aria-hidden size={28} strokeWidth={1.5} className="text-text-secondary" />
            <h2 className="text-[17px] leading-6 font-bold text-text-primary">{area.label}は準備中です</h2>
            <p className="text-[13px] leading-[21px] text-text-secondary">
              この画面は{area.plannedStep}で実装します。現在の公開状態やデータはまだ表示していません。
            </p>
          </section>
        </main>
      </PageSheet>
    </>
  )
}
