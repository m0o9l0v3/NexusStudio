import { Button } from '../ui/Button'

export type CompareRow = { label: string; mine: string; latest: string }

type CompareRowsProps = {
  rows: CompareRow[]
  latestBy: string
  resolved: boolean
  onLoadLatest: () => void
  onClose: () => void
}

/**
 * 保存競合の比較（Figma E30 `90:1497` の表現）。上書き保存の操作は出さず、
 * ［最新の内容を読み込む］で最新版を基準に編集を再開する（docs/UI補完記録.md）。
 */
export function CompareRows({ rows, latestBy, resolved, onLoadLatest, onClose }: CompareRowsProps) {
  const changed = rows.filter((row) => row.mine !== row.latest)
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[16px] leading-6 font-bold text-text-primary">最新の保存内容と比較</h2>
      <p className="text-[11px] leading-[19px] text-warning">
        {resolved ? '最新の内容を読み込みました。あなたの入力はこの欄にだけ残っています。' : `別の画面で先に保存されました（保存者：${latestBy}）。あなたの入力は保持しています。`}
      </p>
      {changed.length === 0 ? (
        <p className="text-[12px] leading-5 text-text-secondary">内容の違いはありません。</p>
      ) : (
        changed.map((row) => (
          <section key={row.label} className="flex flex-col gap-2">
            <h3 className="text-[12px] leading-5 font-medium text-text-primary">{row.label}</h3>
            <div className="rounded-lg bg-surface-subtle p-3">
              <p className="text-[12px] leading-5 font-bold text-text-primary">あなたの入力</p>
              <p className="text-[11px] leading-[19px] break-words whitespace-pre-line text-text-secondary">{row.mine}</p>
            </div>
            <div className="rounded-lg bg-surface-subtle p-3">
              <p className="text-[12px] leading-5 font-bold text-text-primary">最新の保存内容</p>
              <p className="text-[11px] leading-[19px] break-words whitespace-pre-line text-text-secondary">{row.latest}</p>
            </div>
          </section>
        ))
      )}
      <p className="text-[11px] leading-[19px] text-text-secondary">差分を確認し、必要な変更を編集欄へ手動で反映してください。上書き保存の操作はありません。</p>
      {resolved ? (
        <Button variant="secondary" className="self-start" onClick={onClose}>
          比較を閉じる
        </Button>
      ) : (
        <Button className="self-start" onClick={onLoadLatest}>
          最新の内容を読み込む
        </Button>
      )}
    </div>
  )
}
