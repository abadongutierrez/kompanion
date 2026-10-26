import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Agents answer in markdown — run transcripts and the comments they post.
// This renders it. Raw HTML in the source is shown as text, never parsed
// (react-markdown's default), so a model's output can't inject markup.
//
// No typography plugin: each element gets its own small set of Tailwind
// classes, sized relative to the surrounding text so the same component
// fits the xs transcript and a larger panel.
const components: Components = {
  p: ({ node: _node, ...props }) => <p className="my-1 first:mt-0 last:mb-0" {...props} />,
  h1: ({ node: _node, ...props }) => <h1 className="mt-2 mb-1 text-[1.25em] font-semibold first:mt-0" {...props} />,
  h2: ({ node: _node, ...props }) => <h2 className="mt-2 mb-1 text-[1.15em] font-semibold first:mt-0" {...props} />,
  h3: ({ node: _node, ...props }) => <h3 className="mt-2 mb-1 font-semibold first:mt-0" {...props} />,
  h4: ({ node: _node, ...props }) => <h4 className="mt-2 mb-1 font-semibold first:mt-0" {...props} />,
  h5: ({ node: _node, ...props }) => <h5 className="mt-2 mb-1 font-semibold first:mt-0" {...props} />,
  h6: ({ node: _node, ...props }) => <h6 className="mt-2 mb-1 font-semibold first:mt-0" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="my-1 list-disc pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-1 list-decimal pl-5" {...props} />,
  li: ({ node: _node, ...props }) => <li className="my-0.5" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      className="text-blue-600 underline hover:text-blue-800"
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="my-1 border-l-2 border-neutral-300 pl-2 text-neutral-600" {...props} />
  ),
  hr: () => <hr className="my-2 border-neutral-200" />,
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-1 overflow-x-auto rounded bg-neutral-100 p-2 font-mono [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
  code: ({ node: _node, ...props }) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.95em]" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-1 overflow-x-auto">
      <table className="border-collapse" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-left font-semibold" {...props} />
  ),
  td: ({ node: _node, ...props }) => <td className="border border-neutral-200 px-2 py-0.5 align-top" {...props} />,
  input: ({ node: _node, ...props }) => <input className="mr-1 align-middle" {...props} disabled />,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ? `break-words ${className}` : "break-words"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
