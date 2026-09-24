import { Link } from 'react-router'
import type { PublishAction, PublishPreview, TargetKind, ValidationFinding } from '../api/releases'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/StatusBadge'
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
  { label: '会場参照', detail: '各枠の会場が公開中のSpotであること', codes: (code) => code.startsWith('venue_') || code.startsWith('slot_venue') },
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
    <aside aria-label="検証・関連する影響" className="flex w-[400px] shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-surface p-[18px]">
      <h2 className="text-[16px] leading-6 font-bold text-text-primary">検証・関連する影響</h2>

      <div role="status" className="flex flex-col gap-2 rounded-lg bg-surface-subtle px-3.5 py-3.5">
        {!validation || loading ? (
          <p className="text-[14px] leading-[22px] font-bold text-text-secondary">{failed ? '検証結果を取得できませんでした' : '検証しています'}</p>
        ) : validatorFailed ? (
          <>
            <p className="text-[15px] leading-[23px] font-bold text-danger">検証を完了できませんでした</p>
            <p className="text-[11px] leading-[19px] text-text-secondary">内容の不備ではなく検証処理の失敗です。合格とは扱わず、公開できません。再確認してください。</p>
          </>
        ) : (
          <>
            <p className={blocked ? 'text-[15px] leading-[23px] font-bold text-danger' : 'text-[15px] leading-[23px] font-bold text-success'}>
              {blocked ? `${action === 'withdraw' ? '取り下げ' : '公開'}できない問題があります` : `公開候補は${action === 'withdraw' ? '取り下げ' : '公開'}可能です`}
            </p>
            <p className="flex gap-4 text-[12px] leading-5 font-medium">
              <span className="text-danger">公開阻止 {validation.blockingCount}</span>
              <span className="text-warning">警告 {validation.warningCount}</span>
            </p>
          </>
        )}
        <p className="text-[11px] leading-[19px] text-text-secondary">対象：保存済みの{kindNouns[kind]}＋現在の公開データ</p>
      </div>

      {validation && !validatorFailed && kind === 'event' && action === 'publish' && (
        <ul className="flex flex-col gap-3">
          {eventChecks.map((check) => {
            const count = findings.filter((f) => f.severity === 'blocking' && check.codes(f.code)).length
            return (
              <li key={check.label} className="flex items-start gap-3">
                <StatusBadge tone={count > 0 ? 'danger' : 'success'} className="mt-0.5">
                  {count > 0 ? `${count}件` : '合格'}
                </StatusBadge>
                <div className="flex flex-col">
                  <p className="text-[13px] leading-[21px] font-medium text-text-primary">{check.label}</p>
                  <p className="text-[11px] leading-[19px] text-text-secondary">{check.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {findings.length > 0 && (
        <ul aria-label="検証の所見" className="flex flex-col gap-2">
          {findings.map((finding, position) => (
            <FindingRow key={position} finding={finding} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5 rounded-lg border border-warning px-3 py-3">
        <StatusBadge className="self-start">公開対象外</StatusBadge>
        <p className="text-[13px] leading-[21px] font-bold text-text-primary">選んでいない下書き</p>
        <p className="text-[11px] leading-[19px] text-text-secondary">
          ほかのイベント・開催回・Spot・Map Data の下書きは公開しません。それらの問題は、この{action === 'withdraw' ? '取り下げ' : '公開'}を止めません。
        </p>
      </div>
      <p className="text-[11px] leading-[19px] text-text-secondary">未公開Spotなど必要な関連変更は、自動で公開対象へ追加しません。</p>

      <Button variant={action === 'withdraw' ? 'danger' : 'primary'} className="h-11 w-full" disabled={!canSubmit} onClick={onSubmit}>
        {submitLabel}
      </Button>
      <Button variant="secondary" className="h-10 w-full" onClick={onBack}>
        編集へ戻る
      </Button>
    </aside>
  )
}

function FindingRow({ finding }: { finding: ValidationFinding }) {
  const severity = severityLabels[finding.severity] ?? severityLabels.info
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <StatusBadge tone={severity.tone}>{severity.label}</StatusBadge>
        <span className="truncate text-[11px] leading-[19px] text-text-secondary">{finding.targetLabel}</span>
      </div>
      <p className="text-[12px] leading-5 break-words text-text-primary">{finding.message}</p>
      {finding.severity !== 'info' && (
        <Link
          to={editorPath(finding.targetKind, finding.targetId)}
          className="self-start text-[11px] leading-[19px] font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
        >
          修正先を開く{finding.path ? `（${describePath(finding.path)}）` : ''}
        </Link>
      )}
    </li>
  )
}
