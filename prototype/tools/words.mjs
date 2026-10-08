// How much there is to read (round seven, phase 11): the words in How to play, in the guide's lesson cards and in
// the tutorial's. How to play is counted as it renders for a new keep (the build's numbers, the open year). The
// cards are counted from their source, every branch of each: a card's text can read differently by keep, and
// this counts all it can say, so it is a little more than any one keep shows, the same way before and after.
//
//   node tools/words.mjs [--cards]   (--cards lists each card's words, most first)

import { readFileSync, readdirSync } from 'node:fs';
import { howTo } from '../src/slice/howto.js';
import { TUNING } from '../src/slice/data.js';

const words = (t) => (String(t).match(/[A-Za-z0-9’'×.,:%\-]+/g) || []).length;

// The text of every string and template literal in a piece of JS source, each template expression scanned for
// its own literals and standing in its template for one word (a number or a name, as it renders).
function literals(src, from = 0, stop = null) {
  const out = [];
  let i = from;
  const str = (q) => {
    let buf = '';
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') {
        buf += src[i + 1];
        i += 2;
      } else buf += src[i++];
    }
    i++;
    return buf;
  };
  const tmpl = () => {
    let buf = '';
    i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') {
        buf += src[i + 1];
        i += 2;
      } else if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        code('}');
        buf += ' X ';
      } else buf += src[i++];
    }
    i++;
    out.push(buf);
  };
  // Code up to the bracket that closes it (or, at the top, a comma or a closing brace at its own depth).
  const code = (close) => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'") out.push(str(c));
      else if (c === '`') tmpl();
      else if (c === '/' && src[i + 1] === '/') while (i < src.length && src[i] !== '\n') i++;
      else {
        if (depth === 0 && (c === close || (close === null && (c === ',' || c === '}' || c === ';')))) {
          if (close !== null) i++;
          return;
        }
        if (c === '(' || c === '[' || c === '{') depth++;
        if (c === ')' || c === ']' || c === '}') depth--;
        i++;
      }
    }
  };
  code(stop);
  return { out, end: i };
}

// The cards of an array in the page's modules (`const GUIDE = [` … `];`): each card's id and the words its text can say.
function cards(src, name) {
  const at = src.indexOf(`const ${name} = [`);
  const end = src.indexOf('\n];', at);
  const body = src.slice(at, end);
  const list = [];
  const re = /\n {4}id: ['`]([^'`]+)['`]/g;
  let m;
  const starts = [];
  while ((m = re.exec(body))) starts.push({ id: m[1], at: m.index });
  for (const [k, c] of starts.entries()) {
    const part = body.slice(c.at, k + 1 < starts.length ? starts[k + 1].at : body.length);
    // text: '…', text: () => …, or get text() { return …; }
    const plain = part.indexOf('\n    text:');
    const getter = part.indexOf('\n    get text() {');
    if (plain < 0 && getter < 0) continue;
    const t = plain >= 0 ? plain : part.indexOf('return', getter);
    const { out, end } = literals(part, t + (plain >= 0 ? '\n    text:'.length : 'return'.length), null);
    // A text made by a helper (`text: () => requestText()`) counts the helper's words.
    for (const [, fn] of part.slice(t, end).matchAll(/\b([a-z][A-Za-z]*Text)\(\)/g)) {
      const def = src.indexOf(`const ${fn} = `);
      if (def >= 0) out.push(...literals(src, def + `const ${fn} = `.length, null).out);
    }
    list.push({ id: c.id, words: out.reduce((a, s) => a + words(s), 0) });
  }
  return list;
}

// The page's modules (round seven, phase 19), together.
const ui = readdirSync(new URL('../src/page/', import.meta.url)).map((f) => readFileSync(new URL(`../src/page/${f}`, import.meta.url), 'utf8')).join('\n');
const guide = cards(ui, 'GUIDE');
const tut = cards(ui, 'TUT');
const how = howTo({ ...TUNING });
const howWords = how.reduce((a, sec) => a + words(sec.title) + (sec.items || []).reduce((b, it) => b + words(it), 0), 0);
const sum = (xs) => xs.reduce((a, c) => a + c.words, 0);
console.log(`How to play: ${how.length} sections, ${howWords} words`);
console.log(`The guide: ${guide.length} cards, ${sum(guide)} words`);
console.log(`The tutorial: ${tut.length} cards, ${sum(tut)} words`);
console.log(`All three: ${howWords + sum(guide) + sum(tut)} words`);
if (process.argv.includes('--cards')) {
  for (const [name, list] of [['guide', guide], ['tutorial', tut]]) {
    console.log(`\n${name}:`);
    for (const c of [...list].sort((a, b) => b.words - a.words)) console.log(`  ${String(c.words).padStart(4)}  ${c.id}`);
  }
  console.log('\nHow to play:');
  for (const sec of how) console.log(`  ${String(words(sec.title) + (sec.items || []).reduce((b, it) => b + words(it), 0)).padStart(4)}  ${sec.id}`);
}
