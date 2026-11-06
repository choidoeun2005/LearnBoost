import { createElement } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkLatexMath from './remark-latex-math.js';

const remarkPlugins = [remarkGfm, remarkMath, remarkLatexMath];
const rehypePlugins = [[rehypeKatex, { trust: false, strict: 'ignore', maxSize: 20, maxExpand: 1000 }]];

export function AssistantMarkdown({ children }) {
  return createElement(Markdown, { remarkPlugins, rehypePlugins }, children);
}
