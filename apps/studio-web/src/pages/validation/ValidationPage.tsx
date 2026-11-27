import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import type { ValidationFinding } from '../../api/releases'
import { getLatestDiagnosis, runDiagnosis, type DraftDiagnosis } from '../../api/validation'
import { describePath, editorPath, formatFindingMessage } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { SelectField } from '../../ui/Field'
import { StaleListNotice } from '../../ui/StaleListNotice'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusLabel } from '../../ui/StatusLabel'

const dateTime = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

/** 領域（11 VA-03）。Map Data は取り込んだ最新の地図の版の公開判定（29 M1-D5）。 */
const areas: { kind: string; label: string }[] = [
  { kind: 'event', label: 'イベント' },
  { kind: 'occurrence', label: 'オープンキャンパス' },
  { kind: 'categories', label: 'カテゴリ' },
  { kind: 'spot', label: '地点' },
  { kind: 'map', label: '地図' },
]

const severities: Record<string, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  blocking: { label: '公開できない問題', tone: 'danger' },
  warning: { label: '要確認', tone: 'warning' },
  info: { label: '情報', tone: 'neutral' },
}

/**
 * Validation（11 VA-01〜VA-10）。全下書きの診断（Figma VA01）。
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
    if (key === 'clear') { next.delete('area'); next.delete('severity'); setParams(next, { replace: true }); return }
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const diagnosis = latest.data ?? null

  return (
    <>
      <Toolbar title="公開前チェック" subtitle="下書き全体の診断" className="flex-wrap gap-y-2 px-4 sm:px-6" headingClassName="basis-[170px] sm:flex-row sm:items-baseline sm:gap-2">
        <Button className="ml-auto" onClick={() => run.mutate()} disabled={run.isPending}>
          <RefreshCw aria-hidden size={16} />
          {run.isPending ? '診断しています…' : diagnosis ? '診断をやり直す' : '診断を実行'}
        </Button>
      </Toolbar>
      <main className="relative min-h-0 flex-1 overflow-auto bg-canvas px-4 pt-[22px] pb-10 sm:px-6">
        <div className="flex w-full max-w-[1020px] flex-col gap-4">
          <p className="text-[12px] leading-5 text-text-secondary">公開中と違う下書きを1件ずつ、今の公開データと組み合わせたときに公開できるかを調べます。</p>
          <NoticeBanner tone="neutral"><span className="text-text-secondary">ここで見つかった問題は、ほかの公開を止めません。公開の可否は、それぞれの公開確認で判定します。公開中のデータの不具合を示すものではありません。</span></NoticeBanner>

          {run.isError && (
            <NoticeBanner tone="blocking">
              診断を実行できませんでした。接続を確認して、もう一度実行してください。
              {diagnosis !== null && '前回の結果は下に残しています。'}
            </NoticeBanner>
          )}

          {latest.isError && latest.data && <StaleListNotice listName="診断結果" updatedAt={latest.dataUpdatedAt} onRetry={() => void latest.refetch()} />}
          {latest.isPending ? (
            <p role="status" className="text-[12px] leading-5 text-text-secondary">
              前回の診断結果を読み込んでいます
            </p>
          ) : latest.isError && !latest.data ? (
            <NoticeBanner tone="blocking">
              前回の診断結果を取得できませんでした。
              <Button variant="secondary" className="ml-3" onClick={() => void latest.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          ) : diagnosis === null ? (
            <div className="flex items-center gap-2">
              <StatusLabel>未検証</StatusLabel>
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
  const blocking = findings.filter((finding) => finding.severity === 'blocking').length
  const warning = findings.filter((finding) => finding.severity === 'warning').length
  const info = findings.filter((finding) => finding.severity === 'info').length

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] leading-5 text-text-secondary tabular-nums">
          最終実行：{dateTime.format(new Date(diagnosis.createdAt))}・{diagnosis.createdBy.displayName}・診断した下書き {total}件
        </p>
        {diagnosis.stale && <StatusLabel tone="warning" className="min-w-0 shrink whitespace-normal">診断の後に変更あり：結果が古い可能性があります</StatusLabel>}
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
          <h2 className="sr-only">領域ごとの結果</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5" aria-label="領域ごとの結果">
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
                      selected ? 'border-brand bg-brand-subtle' : 'border-border bg-canvas hover:bg-surface-subtle',
                    )}
                  >
                    <span className="text-[14px] leading-[22px] font-bold text-text-primary">{label}</span>
                    <span className="text-[11px] leading-[19px] text-text-secondary tabular-nums">診断した下書き {summary?.targetCount ?? 0}件</span>
                    <span className="flex flex-wrap gap-x-2 text-[11px] leading-[19px] font-bold tabular-nums">
                      <span className={(summary?.blockingCount ?? 0) > 0 ? 'text-danger' : 'text-text-secondary'}>公開できない問題 {summary?.blockingCount ?? 0}</span>
                      <span className={(summary?.warningCount ?? 0) > 0 ? 'text-warning' : 'text-text-secondary'}>要確認 {summary?.warningCount ?? 0}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <h2 className="sr-only">診断の所見</h2>
          <div className="flex flex-wrap gap-2">
            <SelectField className="min-w-0 sm:w-[180px] [&>label]:sr-only [&_select]:text-[12px]" label="領域" value={area} controlSize="sm" onChange={(event) => onFilter('area', event.target.value)}>
              <option value="">領域：すべて</option>
              {areas.map(({ kind, label }) => (
                <option key={kind} value={kind}>
                  領域：{label}
                </option>
              ))}
            </SelectField>
            <SelectField className="min-w-0 sm:w-[180px] [&>label]:sr-only [&_select]:text-[12px]" label="重要度" value={severity} controlSize="sm" onChange={(event) => onFilter('severity', event.target.value)}>
              <option value="">重要度：すべて</option>
              <option value="blocking">重要度：公開できない問題</option>
              <option value="warning">重要度：要確認</option>
              <option value="info">重要度：情報</option>
            </SelectField>
            {(area || severity) && <Button variant="secondary" size="sm" onClick={() => { onFilter('clear', '') }}>絞り込みを解除</Button>}
            <span className="self-center text-[12px] text-text-secondary tabular-nums sm:ml-auto">
              所見 {findings.length}件{findings.length > 0 && `（公開できない問題 ${blocking}・要確認 ${warning}${info > 0 ? `・情報 ${info}` : ''}）`}
            </span>
          </div>

          {diagnosis.findings.length === 0 ? (
            <NoticeBanner>診断した下書き{total}件に、問題は見つかりませんでした。</NoticeBanner>
          ) : findings.length === 0 ? (
            <NoticeBanner>条件に一致する所見はありません。 <Button variant="secondary" size="sm" onClick={() => onFilter('clear', '')}>絞り込みを解除</Button></NoticeBanner>
          ) : (
            <ul aria-label="診断の所見" className="divide-y divide-border-subtle border-y border-border-subtle">
              {findings.map((finding, position) => (
                <FindingRow key={position} finding={finding} />
              ))}
            </ul>
          )}
          {findings.length > 0 && <p className="text-[12px] leading-[19px] text-text-secondary">「修正する」で、問題のある項目の編集画面を開きます。直して保存した後に［診断をやり直す］で結果を更新します。</p>}
        </>
      )}
    </>
  )
}

function FindingRow({ finding }: { finding: ValidationFinding }) {
  const severity = severities[finding.severity] ?? severities.info
  const areaLabel = areas.find((a) => a.kind === finding.targetKind)?.label ?? finding.targetKind
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <StatusLabel tone={severity.tone} className="basis-full sm:basis-[136px]">
        {severity.label}
      </StatusLabel>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="wrap-anywhere text-[11px] leading-[19px] text-text-secondary">
          {areaLabel}：{finding.targetLabel}
          {finding.path ? `（${describePath(finding.path)}）` : ''}
        </p>
        <p className="text-[13px] leading-[21px] wrap-anywhere text-text-primary">{formatFindingMessage(finding)}</p>
      </div>
      <Link
        to={editorPath(finding.targetKind, finding.targetId)}
        className="flex h-[30px] shrink-0 items-center rounded-md border border-border bg-canvas px-3 text-[12px] font-normal text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        修正する
      </Link>
    </li>
  )
}
