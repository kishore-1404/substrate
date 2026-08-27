import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// All generated/source text renders through here — Gemini emits markdown
// (bold, lists, ...) and the real book excerpts are prose; neither should
// ever be shown as a raw string with literal `**`/`-` characters.
//
// `size="base"` is for actual reading surfaces (mental model, explanation,
// book excerpts) — noticeably larger and more generously spaced than the
// default `sm`, which stays for compact UI (chat bubbles, quiz prompts).
export function Markdown({
  children,
  className,
  size = "sm",
}: {
  children: string;
  className?: string;
  size?: "sm" | "base";
}) {
  const sizeClass = size === "base" ? "prose-base md:prose-lg" : "prose-sm";
  return (
    <div className={`prose ${sizeClass} max-w-none dark:prose-invert prose-p:leading-[1.7] ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
