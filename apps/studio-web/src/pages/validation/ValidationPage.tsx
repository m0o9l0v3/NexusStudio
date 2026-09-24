import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import type { ValidationFinding } from '../../api/releases'
import { getLatestDiagnosis, runDiagnosis, type DraftDiagnosis } from '../../api/validation'
import { describePath, editorPath } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { FilterChip } from '../../ui/FilterChip'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusBadge } from '../../ui/StatusBadge'

const dateTime = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

/** 領域（11 VA-03）。Map Data は技術検証の後に加える。 */
const areas: { kind: string; label: string }[] = [
  { kind: 'event', label: 'Events' },
  { kind: 'occurrence', label: 'Open Campus' },
  { kind: 'categories', label: 'カテゴリ' },
  { kind: 'spot', label: 'Spots' },
]

const severities: Record<string, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  blocking: { label: '公開阻止', tone: 'danger' },
  warning: { label: '要確認', tone: 'warning' },
  info: { label: '情報', tone: 'neutral' },
}

/**
 * Validation（11 VA-01〜VA-10）。全下書きの診断。Figma に無く、2026-09-24 に承認された構成案で作る（28 S4-10）。
 * ここでの問題は無関係な公開を止めない（RA-01）。公開中のデータが壊れていると誤解させない（12 UA-06）。
 */
export function ValidationPage() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const area = params.get('area') ?? ''
  const severity = params.get('severity') ?? ''

  const latest = useQuery({ queryKey: ['diagnosis'], queryFn: getLatestDiagnosis })
  const run = useMutation({
    mutationFn: runDiagnosis,
    onSuccess: (result) => queryClient.setQueryData(['diagnosis'], result),
  })

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const diagnosis = latest.data ?? null

  return (
    <>
      <Toolbar title="Validation" subtitle="下書き全体の診断" />
      <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
        <div className="flex w-[1020px] max-w-full flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[22px] leading-[30px] font-bold text-text-primary">下書き全体の診断</h2>
              <p className="text-[12px] leading-5 text-text-secondary">公開中と違う下書きを1件ずつ、今の公開データと組み合わせたときに公開できるかを調べます。</p>
            </div>
            <Button onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? '診断しています…' : diagnosis ? '診断をやり直す' : '診断を実行'}
            </Button>
          </div>
          <NoticeBanner>ここで見つかった問題は、ほかの公開を止めません。公開の可否は、それぞれの公開確認で判定します。公開中のデータの不具合を示すものではありません。</NoticeBanner>

          {run.isError && (
            <NoticeBanner tone="blocking">
              診断を実行できませんでした。接続を確認して、もう一度実行してください。前回の結果は下に残しています。
            </NoticeBanner>
          )}

          {latest.isPending ? (
            <p role="status" className="text-[12px] leading-5 text-text-secondary">
              前回の診断結果を読み込んでいます
            </p>
          ) : latest.isError ? (
            <NoticeBanner tone="blocking">
              前回の診断結果を取得できませんでした。
              <Button variant="secondary" className="ml-3" onClick={() => void latest.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          ) : diagnosis === null ? (
            <div className="flex items-center gap-2">
              <StatusBadge>未検証</StatusBadge>
              <p className="text-[12px] leading-5 text-text-secondary">まだ診断していません。［診断を実行］で最新の下書きを診断します。</p>
            </div>
          ) : (
            <Result diagnosis={diagnosis} area={area} severity={severity} onFilter={update} onRetry={() => run.mutate()} retrying={run.isPending} />
          )}
        </div>
      </main>
    </>
  )
}

function Result({
  diagnosis,
  area,
  severity,
  onFilter,
  onRetry,
  retrying,
}: {
  diagnosis: DraftDiagnosis
  area: string
  severity: string
  onFilter: (key: string, value: string) => void
  onRetry: () => void
  retrying: boolean
}) {
  const failed = diagnosis.status === 'failed'
  const findings = diagnosis.findings.filter((f) => (!area || f.targetKind === area) && (!severity || f.severity === severity))
  const total = diagnosis.areas.reduce((sum, a) => sum + a.targetCount, 0)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] leading-5 text-text-secondary">
          最終実行：{dateTime.format(new Date(diagnosis.createdAt))}・{diagnosis.createdBy.displayName}・診断した下書き {total}件
        </p>
        {diagnosis.stale && <StatusBadge tone="warning">診断の後に変更あり：結果が古い可能性があります</StatusBadge>}
      </div>

      {failed ? (
        <NoticeBanner tone="blocking">
          診断を完了できませんでした。内容の不備ではなく処理の失敗です。問題なしとは扱いません。
          <Button variant="secondary" className="ml-3" disabled={retrying} onClick={onRetry}>
            再試行
          </Button>
        </NoticeBanner>
      ) : (
        <>
          <ul className="grid grid-cols-5 gap-3" aria-label="領域ごとの結果">
            {areas.map(({ kind, label }) => {
              const summary = diagnosis.areas.find((a) => a.targetKind === kind)
              const selected = area === kind
              return (
                <li key={kind}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onFilter('area', selected ? '' : kind)}
                    className={cn(
                      'flex h-full w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
                      selected ? 'border-brand bg-brand-subtle' : 'border-border bg-surface hover:bg-surface-subtle',
                    )}
                  >
                    <span className="text-[14px] leading-[22px] font-bold text-text-primary">{label}</span>
                    <span className="text-[11px] leading-[19px] text-text-secondary">診断した下書き {summary?.targetCount ?? 0}件</span>
                    <span className="flex flex-wrap gap-x-2 text-[11px] leading-[19px] font-medium">
                      <span className={(summary?.blockingCount ?? 0) > 0 ? 'text-danger' : 'text-text-secondary'}>公開阻止 {summary?.blockingCount ?? 0}</span>
                      <span className={(summary?.warningCount ?? 0) > 0 ? 'text-warning' : 'text-text-secondary'}>要確認 {summary?.warningCount ?? 0}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            <li className="flex flex-col gap-1 rounded-lg border border-dashed border-border px-3 py-3">
              <span className="text-[14px] leading-[22px] font-bold text-text-secondary">Map Data</span>
              <span className="text-[11px] leading-[19px] text-text-secondary">地図の診断は Map Data の技術検証の後に加えます</span>
            </li>
          </ul>

          <div className="flex flex-wrap gap-2">
            <FilterChip label="領域" value={area} onChange={(value) => onFilter('area', value)}>
              <option value="">領域：すべて</option>
              {areas.map(({ kind, label }) => (
                <option key={kind} value={kind}>
                  領域：{label}
                </option>
              ))}
            </FilterChip>
            <FilterChip label="重要度" value={severity} onChange={(value) => onFilter('severity', value)}>
              <option value="">重要度：すべて</option>
              <option value="blocking">重要度：公開阻止</option>
              <option value="warning">重要度：要確認</option>
              <option value="info">重要度：情報</option>
            </FilterChip>
          </div>

          {diagnosis.findings.length === 0 ? (
            <NoticeBanner>診断した下書き{total}件に、問題は見つかりませんでした。</NoticeBanner>
          ) : findings.length === 0 ? (
            <NoticeBanner>条件に一致する所見はありません。</NoticeBanner>
          ) : (
            <ul aria-label="診断の所見" className="flex flex-col gap-2">
              {findings.map((finding, position) => (
                <FindingRow key={position} finding={finding} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

function FindingRow({ finding }: { finding: ValidationFinding }) {
  const severity = severities[finding.severity] ?? severities.info
  const areaLabel = areas.find((a) => a.kind === finding.targetKind)?.label ?? finding.targetKind
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
      <StatusBadge tone={severity.tone} className="mt-0.5">
        {severity.label}
      </StatusBadge>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[11px] leading-[19px] text-text-secondary">
          {areaLabel}：{finding.targetLabel}
          {finding.path ? `（${describePath(finding.path)}）` : ''}
        </p>
        <p className="text-[13px] leading-[21px] break-words text-text-primary">{finding.message}</p>
      </div>
      <Link
        to={editorPath(finding.targetKind, finding.targetId)}
        className="flex h-9 shrink-0 items-center rounded-lg border border-border bg-surface px-3 text-[13px] leading-[21px] font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        修正する
      </Link>
    </li>
  )
}
