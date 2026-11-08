import { Fragment, type ReactNode } from 'react'

/**
 * 轻量 Markdown 渲染器。
 *
 * 只用于 AI 回复：不引入 HTML 注入面，所有内容都通过 React 文本节点渲染。
 * 支持标题、段落、粗体/斜体、行内代码、链接、列表、引用、代码块、表格和分割线。
 */

function safeHref(raw: string): string | null {
  const value = raw.trim()
  return /^https?:\/\//i.test(value) ? value : null
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={key} className="border border-border/70 bg-muted/60 px-1 py-0.5 font-mono text-[0.92em] text-foreground">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={key} className="text-muted-foreground">
          {token.slice(1, -1)}
        </em>
      )
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      const href = link ? safeHref(link[2]) : null
      if (link && href) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
          >
            {link[1]}
          </a>
        )
      } else {
        nodes.push(token)
      }
    }
    cursor = match.index + token.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function paragraph(lines: string[], key: string): React.JSX.Element {
  const content: ReactNode[] = []
  lines.forEach((line, index) => {
    if (index > 0) content.push(<br key={`${key}-br-${index}`} />)
    content.push(<Fragment key={`${key}-line-${index}`}>{inline(line, `${key}-${index}`)}</Fragment>)
  })
  return (
    <p key={key} className="my-1.5 text-[12.5px] leading-6 text-foreground/90 first:mt-0 last:mb-0">
      {content}
    </p>
  )
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*\s*$/.test(line) && line.includes('-')
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }): React.JSX.Element {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.trimStart().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <div key={`code-${index}`} className="my-2.5 border border-border bg-muted/40">
          <div className="flex items-center justify-between border-b border-border/70 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>{language || 'code'}</span>
            <span>READ ONLY</span>
          </div>
          <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-5 text-foreground">
            <code>{code.join('\n')}</code>
          </pre>
        </div>
      )
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const sizes = ['text-[15px]', 'text-[14px]', 'text-[13px]', 'text-[12.5px]']
      blocks.push(
        <div
          key={`heading-${index}`}
          className={`mb-1.5 mt-3 flex items-baseline gap-2 font-semibold text-foreground ${sizes[level - 1]} first:mt-0`}
        >
          <span className="font-mono text-[9px] text-brand/80">{level === 1 ? '01' : level === 2 ? '02' : level === 3 ? '03' : '04'}</span>
          <span>{inline(heading[2], `h-${index}`)}</span>
        </div>
      )
      index += 1
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} className="my-3 border-border/80" />)
      index += 1
      continue
    }

    if (line.trimStart().startsWith('>')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trimStart().startsWith('>')) {
        quote.push(lines[index].trimStart().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="my-2 border-l-2 border-brand/50 bg-brand/[0.04] px-3 py-1.5 text-[12px] leading-5 text-muted-foreground"
        >
          {quote.map((item, itemIndex) => (
            <Fragment key={`quote-line-${itemIndex}`}>
              {itemIndex > 0 && <br />}
              {inline(item, `quote-${index}-${itemIndex}`)}
            </Fragment>
          ))}
        </blockquote>
      )
      continue
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
    if (unordered || ordered) {
      const items: string[] = []
      const orderedList = Boolean(ordered)
      while (index < lines.length) {
        const current = lines[index]
        const match = orderedList ? current.match(/^\s*(\d+)[.)]\s+(.+)$/) : current.match(/^\s*[-*+]\s+(.+)$/)
        if (!match) break
        items.push(orderedList ? match[2] : match[1])
        index += 1
      }
      const listClass = 'my-1.5 space-y-1 pl-5 text-[12.5px] leading-5 text-foreground/90'
      blocks.push(
        orderedList ? (
          <ol key={`list-${index}`} className={`${listClass} list-decimal marker:font-mono marker:text-[10px] marker:text-brand`}>
            {items.map((item, itemIndex) => (
              <li key={`li-${itemIndex}`}>{inline(item, `li-${index}-${itemIndex}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={`list-${index}`} className={`${listClass} list-disc marker:text-brand`}>
            {items.map((item, itemIndex) => (
              <li key={`li-${itemIndex}`}>{inline(item, `li-${index}-${itemIndex}`)}</li>
            ))}
          </ul>
        )
      )
      continue
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(tableCells(lines[index]))
        index += 1
      }
      blocks.push(
        <div key={`table-${index}`} className="my-2.5 overflow-x-auto border border-border">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead className="bg-panel/70">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`th-${headerIndex}`} className="border-b border-border px-2.5 py-1.5 font-medium text-foreground">
                    {inline(header, `th-${index}-${headerIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`} className="border-b border-border/50 last:border-0">
                  {headers.map((_, cellIndex) => (
                    <td key={`td-${rowIndex}-${cellIndex}`} className="px-2.5 py-1.5 align-top text-foreground/85">
                      {inline(row[cellIndex] ?? '', `td-${index}-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index]
      if (
        !current.trim() ||
        current.trimStart().startsWith('```') ||
        /^(#{1,4})\s+/.test(current) ||
        /^\s*([-*_])\1{2,}\s*$/.test(current) ||
        current.trimStart().startsWith('>') ||
        /^\s*[-*+]\s+/.test(current) ||
        /^\s*\d+[.)]\s+/.test(current) ||
        (current.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1]))
      ) {
        break
      }
      paragraphLines.push(current)
      index += 1
    }
    if (paragraphLines.length === 0) {
      index += 1
      continue
    }
    blocks.push(paragraph(paragraphLines, `p-${index}`))
  }

  return (
    <div className="markdown-body">
      {blocks}
      {streaming && <span className="ml-0.5 inline-block h-3.5 w-[6px] translate-y-[2px] animate-pulse bg-brand" />}
    </div>
  )
}
