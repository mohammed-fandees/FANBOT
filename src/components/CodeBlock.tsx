import React from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
  onCopy?: () => void;
}

const copyToClipboard = (text: string, onCopy?: () => void) => {
  navigator.clipboard.writeText(text).then(() => {
    if (onCopy) onCopy();
  });
};

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = "", onCopy }) => {
  const handleCopy = () => {
    copyToClipboard(code, () => {
      if (onCopy) onCopy();
      if (window && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('code-copied'));
      }
    });
  };

  return (
    <div className="llm-code-block">
      <SyntaxHighlighter
        language={language || undefined}
        style={vscDarkPlus}
        customStyle={{ margin: 0, background: 'none', fontSize: '1em' }}
        showLineNumbers={false}
        wrapLongLines={true}
      >
        {code}
      </SyntaxHighlighter>
      <button
        className="copy-btn"
        title="Copy code"
        onClick={handleCopy}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>
    </div>
  );
};

export default CodeBlock;