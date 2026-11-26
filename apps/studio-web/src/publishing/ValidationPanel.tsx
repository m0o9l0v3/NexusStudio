import { Link } from 'react-router'
import type { PublishAction, PublishPreview, TargetKind, ValidationFinding } from '../api/releases'
import { Button } from '../ui/Button'
import { StatusLabel } from '../ui/StatusLabel'
import { describePath, editorPath, kindNouns } from './publication'

type Props = {
  preview: PublishPreview | undefined
  loading: boolean
  failed: boolean
  kind: TargetKind
  action: PublishAction
  submitLabel: string
  onSubmit: () => void
  onBack: () => void
}

/** 対象全体に関わる所見（版の食い違いなど）。検証項目のまとまりには数えない。 */
const general = new Set(['stale_revision', 'no_changes', 'target_not_found', 'duplicate_target', 'invalid_entry', 'not_published'])

/** イベントの検証項目のまとまり（Figma R01 の「合格」行）。 */
const eventChecks: { label: string; detail: string; codes: (code: string) => boolean }[] = [
  {
    label: '必須情報・日時',
    detail: 'タイトル・説明・カテゴリ・開催回・各枠の日時と参加案内',
    codes: (code) => !general.has(code) && !code.startsWith('venue_') && !code.startsWith('slot_venue') && code !== 'slot_all_day_hours_missing',
  },
  { label: '会場参照', detail: '各日時の会場が公開中の地点であること', codes: (code) => code.startsWith('venue_') || code.startsWith('slot_venue') },
  { label: '終日の参照元', detail: '終日枠の開催日に一般公開時間があること', codes: (code) => code === 'slot_all_day_hours_missing' },
]

const severityLabels: Record<string, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  blocking: { label: '公開阻止', tone: 'danger' },
  warning: { label: '要確認', tone: 'warning' },
  info: { label: '情報', tone: 'neutral' },
}

/** 公開確認の右側（Figma R01「検証・関連する影響」）。 */
export function ValidationPanel({ preview, loading, failed, kind, action, submitLabel, onSubmit, onBack }: Props) {
  const validation = preview?.validation
  const findings = validation?.findings ?? []
  const validatorFailed = validation?.status === 'failed'
  const blocked = validatorFailed || (validation?.blockingCount ?? 0) > 0
  const canSubmit = Boolean(validation) && !blocked && !loading && !failed

  return (
    <aside aria-label="検証・関連する影響" className="flex w-full shrink-0 flex-col gap-4 border-t border-border-subtle bg-surface-subtle p-[18px] lg:w-[400px] lg:overflow-auto lg:border-t-0 lg:border-l">
      <h2 className="text-[16px] leading-6 font-bold text-text-primary">検証・関連する影響</h2>

      <div role="status" className="flex flex-col gap-2">
        {!validation || loading ? (
          <StatusLabel>{failed ? '検証結果を取得できませんでした' : '検証しています'}</StatusLabel>
        ) : validatorFailed ? (
          <>
            <StatusLabel tone="danger">検証を完了できませんでした</StatusLabel>
            <p className="text-[11px] leading-[19px] text-text-secondary">内容の不備ではなく検証処理の失敗です。合格とは扱わず、公開できません。再確認してください。</p>
          </>
        ) : (
          <>
            <StatusLabel tone={blocked ? 'danger' : 'success'}>{blocked ? '公開できない問題があります' : '公開できます'}</StatusLabel>
            <p className="flex gap-4 text-[12px] leading-5 font-medium">
              <span className="text-danger">公開阻止 {validation.blockingCount}</span>
              <span className="text-warning">警告 {validation.warningCount}</span>
            </p>
          </>
        )}
        <p className="text-[11px] leading-[19px] text-text-secondary">対象：保存済みの{kindNouns[kind]}＋現在の公開データ</p>
      </div>

      {validation && !validatorFailed && kind === 'event' && action === 'publish' && (
        <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
          {eventChecks.map((check) => {
            const count = findings.filter((f) => f.severity === 'blocking' && check.codes(f.code)).length
            return (
              <li key={check.label} className="flex items-start justify-between gap-3 py-3">
                <div className="flex flex-col">
                  <p className="text-[13px] leading-[21px] font-medium text-text-primary">{check.label}</p>
                  <p className="text-[11px] leading-[19px] text-text-secondary">{check.detail}</p>
                </div>
                <StatusLabel tone={count > 0 ? 'danger' : 'success'} className="mt-0.5">
                  {count > 0 ? `${count}件` : '合格'}
                </StatusLabel>
              </li>
            )
          })}
        </ul>
      )}

      {findings.length > 0 && (
        <div className={blocked ? "rounded-md border border-danger-border bg-danger-subtle p-3" : "rounded-md border border-border-subtle bg-canvas p-3"}><h3 className={blocked ? "text-[13px] font-bold text-danger" : "text-[13px] font-bold"}>{blocked ? `公開できない問題（${validation?.blockingCount ?? 0}件）` : `検証の所見（${findings.length}件）`}</h3><ul aria-label="検証の所見" className="flex flex-col gap-2">
          {findings.map((finding, position) => (
            <FindingRow key={position} finding={finding} />
          ))}
        </ul></div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-4">
        <StatusLabel className="self-start">公開対象外</StatusLabel>
        <p className="text-[13px] leading-[21px] font-bold text-text-primary">選んでいない下書き</p>
        <p className="text-[11px] leading-[19px] text-text-secondary">
          ほかのイベント・開催回・地点・地図の下書きは公開しません。それらの問題は、この{action === 'withdraw' ? '取り下げ' : '公開'}を止めません。
        </p>
      </div>
      <p className="text-[11px] leading-[19px] text-text-secondary">未公開地点など必要な関連変更は、自動で公開対象へ追加しません。</p>

      <div className="flex flex-col gap-2 lg:mt-auto">
      {blocked && <p className="text-[11px] text-text-secondary">公開できない問題を直して保存すると、公開できるようになります。</p>}
      <Button variant={action === 'withdraw' ? 'danger' : 'primary'} className="h-11 w-full" disabled={!canSubmit} onClick={onSubmit}>
        {submitLabel}
      </Button>
      <Button variant="secondary" className="h-10 w-full" onClick={onBack}>
        編集へ戻る
      </Button>
      </div>
    </aside>
  )
}

function FindingRow({ finding }: { finding: ValidationFinding }) {
  const severity = severityLabels[finding.severity] ?? severityLabels.info
  return (
    <li className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <StatusLabel tone={severity.tone}>{severity.label}</StatusLabel>
        <span className="truncate text-[11px] leading-[19px] text-text-secondary">{finding.targetLabel}</span>
      </div>
      <p className="text-[12px] leading-5 break-words text-text-primary">{finding.message}</p>
      {finding.severity !== 'info' && (
        <Link
          to={editorPath(finding.targetKind, finding.targetId)}
          className="self-start text-[11px] leading-[19px] font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
        >
          修正先を開く{finding.path ? `（${describePath(finding.path)}）` : ''} →
        </Link>
      )}
    </li>
  )
}
