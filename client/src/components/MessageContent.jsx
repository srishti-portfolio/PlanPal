import { Fragment } from 'react';

/**
 * Render the small subset of Markdown Gemini uses (headings, bullets, numbered lists, **bold**)
 * as React elements. No HTML is ever injected, so model output cannot cause XSS.
 */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function parseBlocks(text) {
  const blocks = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const last = blocks.at(-1);

    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)[1];
      if (last?.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
    } else if (heading) {
      blocks.push({ type: 'h', text: heading[1] });
    } else if (line.trim() === '') {
      blocks.push({ type: 'break' });
    } else if (last?.type === 'p') {
      last.lines.push(line);
    } else {
      blocks.push({ type: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => b.type !== 'break');
}

export function MessageContent({ text }) {
  return (
    <div className="message-content">
      {parseBlocks(text).map((block, i) => {
        if (block.type === 'h') return <p key={i} className="message-heading">{inline(block.text)}</p>;
        if (block.type === 'p') {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(line)}
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.type;
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
