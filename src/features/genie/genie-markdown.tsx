"use client";

import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type GenieMarkdownProps = {
  content: string;
  className?: string;
};

export function isAllowedGenieLink(href: string | undefined): href is string {
  if (!href) {
    return false;
  }
  if (href.startsWith("#")) {
    return true;
  }
  if (href.startsWith("/")) {
    return !/^(?:\/|\\|%2f|%5c)/i.test(href.slice(1));
  }
  return /^https?:\/\//i.test(href);
}

function SafeLink({ href, children, title }: ComponentPropsWithoutRef<"a">) {
  if (!isAllowedGenieLink(href)) {
    return (
      <span title={title} className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-2">
        {children}
      </span>
    );
  }

  const isExternal = /^https?:\/\//i.test(href);

  return (
    <a
      href={href}
      title={title}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer noopener" : undefined}
      className="font-semibold text-brand-ink underline decoration-brand decoration-2 underline-offset-2 transition-colors"
    >
      {children}
    </a>
  );
}

function InertImage({ alt }: ComponentPropsWithoutRef<"img">) {
  return (
    <span className="inline-flex rounded-md border border-line bg-canvas px-2 py-0.5 text-sm font-medium text-muted">
      [Image : {alt?.trim() || "sans description"}]
    </span>
  );
}

export function GenieMarkdown({ content, className = "" }: GenieMarkdownProps) {
  return (
    <div className={`min-w-0 text-[0.95rem] font-light leading-7 text-ink ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: SafeLink,
          img: InertImage,
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          h1: ({ children }) => <h3 className="mb-3 mt-6 text-xl font-bold tracking-[-0.025em] first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-3 mt-6 text-lg font-bold tracking-[-0.02em] first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-2 mt-5 text-base font-bold first:mt-0">{children}</h4>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 marker:text-brand">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 marker:font-semibold marker:text-muted">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-brand bg-accent-soft px-4 py-2 text-muted">{children}</blockquote>
          ),
          hr: () => <hr className="my-5 border-line" />,
          table: ({ children }) => (
            <div className="my-4 max-w-full overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[30rem] border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-canvas text-xs font-semibold uppercase tracking-[0.06em] text-muted">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-line">{children}</tbody>,
          th: ({ children }) => <th className="px-3 py-2.5 font-semibold">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2.5 align-top text-muted">{children}</td>,
          pre: ({ children }) => (
            <pre className="my-4 max-w-full overflow-x-auto rounded-xl bg-ink p-4 text-sm leading-6 text-canvas shadow-inner">{children}</pre>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = Boolean(codeClassName) || String(children).includes("\n");
            return (
              <code
                {...props}
                className={
                  isBlock
                    ? `font-mono text-[0.82rem] ${codeClassName ?? ""}`
                    : "rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[0.82em] font-medium text-ink"
                }
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
