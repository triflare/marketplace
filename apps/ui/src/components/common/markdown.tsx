import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

// Registry documents are markdown written by admins. react-markdown builds
// elements instead of injecting HTML, so a document cannot smuggle a script in.
export function Markdown({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-foreground prose-a:underline prose-pre:bg-muted/50 prose-pre:text-foreground",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => {
            const external = Boolean(href && /^https?:\/\//i.test(href))
            return (
              <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
              >
                {label}
              </a>
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
