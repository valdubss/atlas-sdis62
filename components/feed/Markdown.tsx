import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Rendu Markdown sécurisé (pas de HTML brut : react-markdown l'ignore par défaut).
 * Styles : titres condensés marine, liens navy soulignés, images plein cadre.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-atlas">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("/") ? undefined : "_blank"}
              rel={href?.startsWith("/") ? undefined : "noopener noreferrer"}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element -- image d'article (Markdown)
            <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
