import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown is rendered as React elements; raw model-authored HTML stays inert. */
export function MessageContent({ content }: { content: string }) {
  return <div className="message-markdown text-text text-[15px] leading-relaxed break-words">
    <Markdown remarkPlugins={[remarkGfm]} components={{
      a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer" className="text-accent underline">{children}</a>,
      pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-surface p-3 text-xs">{children}</pre>,
      table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
    }}>{content}</Markdown>
  </div>;
}
