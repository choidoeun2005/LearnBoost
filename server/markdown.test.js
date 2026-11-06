import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantMarkdown } from '../src/markdown.js';

const render = content => renderToStaticMarkup(createElement(AssistantMarkdown, { children: content }));
const countMath = html => [...html.matchAll(/class="katex"/g)].length;

test('renders the Korean convexity answer with inline and display LaTeX delimiters', () => {
  const html = render([
    '함수 \\(f\\)의 두 점 \\(x_1\\), \\(x_2\\)와 \\(0 \\leq \\lambda \\leq 1\\)에 대해',
    '\\[ f(\\lambda x_1 + (1-\\lambda)x_2) \\leq \\lambda f(x_1) + (1-\\lambda)f(x_2) \\]',
    '반대 방향은 오목 함수입니다.',
    '\\[ f(\\lambda x_1 + (1-\\lambda)x_2) \\geq \\lambda f(x_1) + (1-\\lambda)f(x_2) \\]',
  ].join('\n\n'));
  assert.equal(countMath(html), 6);
  assert.equal([...html.matchAll(/class="katex-display"/g)].length, 2);
  assert.match(html, /<math /);
  assert.match(html, /함수/);
  assert.doesNotMatch(html, /katex-error/);
});

test('supports dollar math, GFM tables, and multiline equations without changing delimiters', () => {
  const html = render([
    '**미분**: $x_1^2$',
    '$$\n\\frac{d}{dx}x^2 = 2x\n$$',
    '| 개념 | 수식 |\n| --- | --- |\n| 제곱 | $x^2$ |',
    '\\[\n\\begin{aligned} a &= b + c \\\\ d &= e \\end{aligned}\n\\]',
  ].join('\n\n'));
  assert.equal(countMath(html), 4);
  assert.match(html, /<table>/);
  assert.match(html, /<strong>미분<\/strong>/);
  assert.doesNotMatch(html, /katex-error/);
});

test('keeps code samples, escaped delimiters, currency, links, and ordinary brackets intact', () => {
  const html = render([
    '`\\(x\\)` and `\\[y\\]` and `$z$`',
    '```js\nconst example = "\\(x\\)";\nconst price = "$5";\n```',
    '    \\[x^2\\]',
    '\\\\(literal\\\\) and [1] and (plain text) and \\$10 + \\$20',
    '[자료](https://example.com/reference)',
  ].join('\n\n'));
  assert.equal(countMath(html), 0);
  assert.match(html, /<code>\\\(x\\\)<\/code>/);
  assert.match(html, /class="language-js"/);
  assert.match(html, /\$10 \+ \$20/);
  assert.match(html, /href="https:\/\/example.com\/reference"/);
});

test('invalid or incomplete formulas preserve a readable answer without enabling HTML', () => {
  const html = render('앞부분 \\(\\frac{1}{\\) 뒷부분\n\n<script>alert(1)</script>\n\n\\(\\includegraphics{https://example.com/image.png}\\)');
  assert.match(html, /katex-error/);
  assert.match(html, /앞부분/);
  assert.match(html, /뒷부분/);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.equal(countMath(render('수식 시작 \\(x + 1')), 0);
});

test('handles formulas nested in Markdown lists and block quotes', () => {
  const html = render('> 정의:\n> \\[\n> x_1 \\leq x_2\n> \\]\n\n- 식: \\(x^2\\)\n- 일반 항목');
  assert.equal(countMath(html), 2);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<ul>/);
  assert.doesNotMatch(html, /katex-error/);
});
