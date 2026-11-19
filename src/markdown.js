import { createElement } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkLatexMath from './remark-latex-math.js';

const remarkPlugins = [remarkGfm, remarkMath, remarkLatexMath, remarkStudyDetails];
const rehypePlugins = [[rehypeKatex, { trust: false, strict: 'ignore', maxSize: 20, maxExpand: 1000 }]];

function remarkStudyDetails() {
  function walk(node) {
    if (node.type === 'blockquote') {
      const [heading, ...body] = node.children;
      const [strong, ...rest] = heading?.type === 'paragraph' ? heading.children : [];
      const marker = strong?.type === 'strong' && strong.children.length === 1 && strong.children[0].type === 'text' && strong.children[0].value.match(/^더 자세히\s*[:：]\s*(.+)$/);
      if (marker && (body.length || rest.length)) {
        const detail = [...(rest.length ? [{ ...heading, children: rest }] : []), ...body];
        node.data = { hName: 'details', hProperties: { className: ['study-detail'] } };
        node.children = [
          { type: 'paragraph', data: { hName: 'summary' }, children: [{ type: 'text', value: marker[1] }] },
          { type: 'blockquote', data: { hName: 'div' }, children: detail },
        ];
      }
    }
    node.children?.forEach(walk);
  }
  return walk;
}

function remarkCitations(count) {
  function visit(node) {
    if (!node.children || ['link', 'linkReference'].includes(node.type)) return;
    node.children = node.children.flatMap(child => {
      if (child.type !== 'text') {
        visit(child);
        return [child];
      }
      const parts = [];
      let cursor = 0;
      for (const match of child.value.matchAll(/\[(\d{1,2})\]/g)) {
        const number = Number(match[1]);
        if (number < 1 || number > count) continue;
        if (match.index > cursor) parts.push({ type: 'text', value: child.value.slice(cursor, match.index) });
        parts.push({ type: 'link', url: `#learnboost-source-${number}`, children: [{ type: 'text', value: match[0] }] });
        cursor = match.index + match[0].length;
      }
      if (cursor < child.value.length) parts.push({ type: 'text', value: child.value.slice(cursor) });
      return parts.length ? parts : [child];
    });
  }
  return visit;
}

export function AssistantMarkdown({ children, sources, onSource }) {
  if (!sources?.length || !onSource) return createElement(Markdown, { remarkPlugins, rehypePlugins }, children);
  const components = {
    a({ node, href, children: label, ...props }) {
      const number = Number(href?.match(/^#learnboost-source-(\d+)$/)?.[1]);
      const source = sources[number - 1];
      if (!source) return createElement('a', { href, ...props }, label);
      return createElement('button', { type: 'button', className: 'inline-citation', title: `${source.name}, ${source.page}쪽`, onClick: () => onSource(source) }, label);
    },
  };
  return createElement(Markdown, { remarkPlugins: [...remarkPlugins, [remarkCitations, sources.length]], rehypePlugins, components }, children);
}
