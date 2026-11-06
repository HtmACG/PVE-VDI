import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { ApiError } from '@shared/types'
import { Button } from '@renderer/components/ui/button'

/**
 * 新模块（存储/备份/防火墙/HA/访问控制）在 PVE 版本不支持或权限不足时统一展示的占位面板。
 * 保留具体错误码与详情，方便直接判断是 403、501 还是网络问题。
 */
export function PveUnavailable({
  error,
  onRetry
}: {
  error: ApiError
  onRetry?: () => void
}): React.JSX.Element {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-start gap-3 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground">无法读取该模块</div>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{error.message}</p>
          {(error.code || error.detail) && (
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              {error.code}
              {error.status ? ` · HTTP ${error.status}` : ''}
              {error.detail ? ` · ${error.detail}` : ''}
            </div>
          )}
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3 w-3" />
            重试
          </Button>
        )}
      </div>
    </div>
  )
}
