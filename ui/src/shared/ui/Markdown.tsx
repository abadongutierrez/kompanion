import { useId } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// Agents answer in markdown — run transcripts and the comments they post.
// This renders it. Raw HTML in the source is shown as text, never parsed
// (react-markdown's default), so a model's output can't inject markup.
//
// No typography plugin: each element gets its own small set of Tailwind
// classes, sized relative to the surrounding text so the same component
// fits the xs transcript and a larger panel.

// Some elements arrive with a class of their own (GFM task lists get
// `contains-task-list`, fenced code gets `language-*`): keep it next to ours.
const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

const components: Components = {
  p: ({ node: _node, className, ...props }) => <p className={cx("my-1 first:mt-0 last:mb-0", className)} {...props} />,
  h1: ({ node: _node, className, ...props }) => (
    <h1 className={cx("mt-2 mb-1 text-[1.25em] font-semibold first:mt-0", className)} {...props} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2 className={cx("mt-2 mb-1 text-[1.15em] font-semibold first:mt-0", className)} {...props} />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3 className={cx("mt-2 mb-1 font-semibold first:mt-0", className)} {...props} />
  ),
  h4: ({ node: _node, className, ...props }) => (
    <h4 className={cx("mt-2 mb-1 font-semibold first:mt-0", className)} {...props} />
  ),
  h5: ({ node: _node, className, ...props }) => (
    <h5 className={cx("mt-2 mb-1 font-semibold first:mt-0", className)} {...props} />
  ),
  h6: ({ node: _node, className, ...props }) => (
    <h6 className={cx("mt-2 mb-1 font-semibold first:mt-0", className)} {...props} />
  ),
  ul: ({ node: _node, className, ...props }) => <ul className={cx("my-1 list-disc pl-5", className)} {...props} />,
  ol: ({ node: _node, className, ...props }) => <ol className={cx("my-1 list-decimal pl-5", className)} {...props} />,
  li: ({ node: _node, className, ...props }) => <li className={cx("my-0.5", className)} {...props} />,
  // Footnote refs and back-refs are in-page fragments: keep those in this tab.
  a: ({ node: _node, className, href, ...props }) => (
    <a
      className={cx("text-blue-600 underline hover:text-blue-800", className)}
      href={href}
      {...(href?.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer noopener" })}
      {...props}
    />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote className={cx("my-1 border-l-2 border-neutral-300 pl-2 text-neutral-600", className)} {...props} />
  ),
  hr: () => <hr className="my-2 border-neutral-200" />,
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cx(
        "my-1 overflow-x-auto rounded bg-neutral-100 p-2 font-mono [&>code]:bg-transparent [&>code]:p-0",
        className,
      )}
      {...props}
    />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code className={cx("rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.95em]", className)} {...props} />
  ),
  table: ({ node: _node, className, ...props }) => (
    <div className="my-1 overflow-x-auto">
      <table className={cx("border-collapse", className)} {...props} />
    </div>
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      className={cx("border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-left font-semibold", className)}
      {...props}
    />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cx("border border-neutral-200 px-2 py-0.5 align-top", className)} {...props} />
  ),
  input: ({ node: _node, className, ...props }) => (
    <input className={cx("mr-1 align-middle", className)} {...props} disabled />
  ),
};

// remark-breaks keeps single newlines as line breaks: comments are typed in
// a textarea, and agents often wrap lines without a blank line between.
const remarkPlugins = [remarkGfm, remarkBreaks];

// `streaming` shows a blinking cursor right after the last block's text,
// rather than on a line of its own below the markdown.
export function Markdown({
  children,
  className,
  streaming = false,
}: {
  children: string;
  className?: string;
  streaming?: boolean;
}) {
  // Footnote ids get a per-instance prefix, so `[^1]` in one comment can't
  // jump to another comment's note on the same page.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className={cx("break-words", streaming && "markdown-streaming", className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        remarkRehypeOptions={{ clobberPrefix: `md-${id}-` }}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
