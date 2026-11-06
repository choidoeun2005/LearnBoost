function tokenizeLatex(effects, ok, nok) {
  let closingCode;
  let mathToken;
  return start;

  function start(code) {
    mathToken = effects.enter('latexMath');
    effects.enter('latexMathMarker');
    effects.consume(code);
    return opening;
  }

  function opening(code) {
    if (code !== 40 && code !== 91) return nok(code);
    closingCode = code === 40 ? 41 : 93;
    mathToken.displayMath = code === 91;
    effects.consume(code);
    effects.exit('latexMathMarker');
    return between;
  }

  function between(code) {
    if (code === null) return nok(code);
    if (code === -5 || code === -4 || code === -3) {
      effects.enter('lineEnding');
      effects.consume(code);
      effects.exit('lineEnding');
      return between;
    }
    if (code === 92) return effects.check({ tokenize: checkClosing }, finishValue, escape)(code);
    effects.enter('latexMathValue');
    return inside(code);
  }

  function inside(code) {
    if (code === null || code === 92 || code === -5 || code === -4 || code === -3) {
      effects.exit('latexMathValue');
      return between(code);
    }
    effects.consume(code);
    return inside;
  }

  function escape(code) {
    effects.enter('latexMathValue');
    effects.consume(code);
    return escaped;
  }

  function escaped(code) {
    if (code === null) return nok(code);
    if (code === -5 || code === -4 || code === -3) return inside(code);
    effects.consume(code);
    return inside;
  }

  function checkClosing(checkEffects, success, failure) {
    return backslash;
    function backslash(code) {
      checkEffects.enter('latexMathClosing');
      checkEffects.consume(code);
      return delimiter;
    }
    function delimiter(code) {
      if (code !== closingCode) return failure(code);
      checkEffects.consume(code);
      checkEffects.exit('latexMathClosing');
      return success;
    }
  }

  function finishValue(code) {
    effects.enter('latexMathMarker');
    effects.consume(code);
    return finish;
  }

  function finish(code) {
    effects.consume(code);
    effects.exit('latexMathMarker');
    effects.exit('latexMath');
    return ok;
  }
}

export default function remarkLatexMath() {
  const data = this.data();
  (data.micromarkExtensions ||= []).push({ text: { 92: { name: 'latexMath', tokenize: tokenizeLatex } } });
  (data.fromMarkdownExtensions ||= []).push({
    enter: {
      latexMath(token) {
        this.enter({
          type: 'inlineMath',
          value: '',
          data: {
            hName: 'code',
            hProperties: { className: ['language-math', token.displayMath ? 'math-display' : 'math-inline'] },
            hChildren: [],
          },
        }, token);
        this.buffer();
      },
    },
    exit: {
      latexMathValue(token) {
        this.config.enter.data.call(this, token);
        this.config.exit.data.call(this, token);
      },
      latexMath(token) {
        const value = this.resume();
        const node = this.stack.at(-1);
        node.value = value.trim();
        node.data.hChildren.push({ type: 'text', value: node.value });
        this.exit(token);
      },
    },
  });
}
