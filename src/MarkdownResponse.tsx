import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const mdComponents: Components = {
  a: ({ node: _node, children, className, href, title }) => (
    <a
      href={href ?? undefined}
      title={title ?? undefined}
      className={['md-a', className].filter(Boolean).join(' ')}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
}

type Props = {
  text: string
}

export function MarkdownResponse({ text }: Props) {
  return (
    <div className="md-scroll">
      <div className="md-root">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  )
}
