import { describe, expect, test } from 'bun:test'
import { decideRoute, openQuestions, parseAnswers, renderQuestions } from '../scripts/questions.mjs'

const spec = {
  questions: [
    {
      text: 'Where does the reminder queue live?',
      options: [
        { letter: 'a', text: 'A Postgres table' },
        { letter: 'b', text: 'A Redis list', recommended: true, reason: 'Redis is already a dependency' },
      ],
    },
  ],
}

describe('renderQuestions', () => {
  test('marker, heading, numbered question, lettered options, reply line, all inside <questions>', () => {
    const out = renderQuestions(spec, { rev: 1 })
    expect(out.startsWith('<!-- vsk:v1 type=questions rev=1 -->\n## Questions (v1)\n')).toBe(true)
    expect(out).toContain('<questions>')
    expect(out).toContain('**Q1.** Where does the reminder queue live?')
    expect(out).toContain('- a) A Postgres table')
    expect(out).toContain('- b) A Redis list (recommended — Redis is already a dependency)')
    expect(out).toContain('Reply with `1: a` per question, or `all recommended`.')
    expect(out.trimEnd().endsWith('</questions>')).toBe(true)
  })

  test('rev drives the marker and the heading together', () => {
    expect(renderQuestions(spec, { rev: 2 })).toContain('<!-- vsk:v1 type=questions rev=2 -->')
    expect(renderQuestions(spec, { rev: 2 })).toContain('## Questions (v2)')
  })

  test('a question with no recommended option is refused', () => {
    const bad = { questions: [{ text: 'X?', options: [{ letter: 'a', text: 'one' }, { letter: 'b', text: 'two' }] }] }
    expect(() => renderQuestions(bad, { rev: 1 })).toThrow('question 1 has no recommended option')
  })

  test('two recommended options in one question are refused', () => {
    const bad = {
      questions: [{
        text: 'X?',
        options: [
          { letter: 'a', text: 'one', recommended: true, reason: 'r' },
          { letter: 'b', text: 'two', recommended: true, reason: 'r' },
        ],
      }],
    }
    expect(() => renderQuestions(bad, { rev: 1 })).toThrow('question 1 has 2 recommended options')
  })

  test('a single-option question is refused', () => {
    const bad = { questions: [{ text: 'X?', options: [{ letter: 'a', text: 'one', recommended: true, reason: 'r' }] }] }
    expect(() => renderQuestions(bad, { rev: 1 })).toThrow('question 1 has fewer than two options')
  })

  test('an empty round, a duplicated letter, a letter past h and a reasonless recommendation are each refused', () => {
    expect(() => renderQuestions({ questions: [] }, { rev: 1 })).toThrow('a round needs at least one question')
    const dup = {
      questions: [{
        text: 'X?',
        options: [{ letter: 'a', text: 'one', recommended: true, reason: 'r' }, { letter: 'a', text: 'two' }],
      }],
    }
    expect(() => renderQuestions(dup, { rev: 1 })).toThrow('question 1 repeats the letter "a"')
    const late = {
      questions: [{
        text: 'X?',
        options: [{ letter: 'a', text: 'one', recommended: true, reason: 'r' }, { letter: 'z', text: 'two' }],
      }],
    }
    expect(() => renderQuestions(late, { rev: 1 })).toThrow('question 1 uses the letter "z" — options run a through h')
    const noReason = {
      questions: [{
        text: 'X?',
        options: [{ letter: 'a', text: 'one', recommended: true }, { letter: 'b', text: 'two' }],
      }],
    }
    expect(() => renderQuestions(noReason, { rev: 1 })).toThrow('question 1 recommends "a" without a reason')
  })
})

const twoQ = {
  questions: [
    { text: 'Q one', options: [{ letter: 'a', text: 'one' }, { letter: 'b', text: 'two', recommended: true, reason: 'r' }] },
    { text: 'Q two', options: [{ letter: 'a', text: 'one', recommended: true, reason: 'r' }, { letter: 'b', text: 'two' }] },
  ],
}

describe('parseAnswers', () => {
  test('letters map to their questions and trailing prose is kept', () => {
    const r = parseAnswers('1: b\n2: a — the cron already runs\n', twoQ)
    expect(r.answers[1]).toEqual({ option: 'b', text: null })
    expect(r.answers[2]).toEqual({ option: 'a', text: 'the cron already runs' })
    expect(r.missing).toEqual([])
    expect(r.malformed).toEqual([])
  })

  test('all recommended fills every question', () => {
    const r = parseAnswers('all recommended', twoQ)
    expect(r.answers[1].option).toBe('b')
    expect(r.answers[2].option).toBe('a')
    expect(r.missing).toEqual([])
  })

  test('an explicit line beats all recommended', () => {
    const r = parseAnswers('all recommended\n2: b', twoQ)
    expect(r.answers[1].option).toBe('b')
    expect(r.answers[2].option).toBe('b')
  })

  test('a partial reply reports the open question', () => {
    expect(parseAnswers('1: a', twoQ).missing).toEqual([2])
  })

  test('other keeps its text', () => {
    const r = parseAnswers('1: other — a third way\n2: a', twoQ)
    expect(r.answers[1]).toEqual({ option: 'other', text: 'a third way' })
  })

  test('an unknown letter, an unknown number and a repeat are each malformed', () => {
    const r = parseAnswers('1: z\n9: a\n2: a\n2: b', twoQ)
    const joined = r.malformed.join(' | ')
    expect(joined).toContain('question 1: "z" is not an option')
    expect(joined).toContain('question 9 is not in this round')
    expect(joined).toContain('question 2 answered twice')
    expect(r.answers[2].option).toBe('a')
  })

  test('surrounding prose is ignored, not treated as an answer', () => {
    const r = parseAnswers('thanks for laying these out\n1: a\n2: b\nship it', twoQ)
    expect(r.malformed).toEqual([])
    expect(r.missing).toEqual([])
  })

  test('a reply with no answer line at all is malformed, not silently empty', () => {
    const r = parseAnswers('sounds good, go ahead', twoQ)
    expect(r.missing).toEqual([1, 2])
    expect(r.malformed).toEqual(['no answer line found — expected "<number>: <letter>" per question, or "all recommended"'])
  })

  test('a bulleted line, a dot separator and mixed case are all accepted', () => {
    const r = parseAnswers('- 1. B\n* 2: A — because', twoQ)
    expect(r.answers[1].option).toBe('b')
    expect(r.answers[2]).toEqual({ option: 'a', text: 'because' })
    expect(r.malformed).toEqual([])
  })
})

const opt = (letter: string, text: string, rec?: boolean) => (rec ? { letter, text, recommended: true, reason: 'r' } : { letter, text })
const threeQ = {
  questions: [
    { text: 'Q one', options: [opt('a', 'one'), opt('b', 'two', true)] },
    { text: 'Q two', options: [opt('a', 'one', true), opt('b', 'two')] },
    { text: 'Q three', options: [opt('a', 'one', true), opt('b', 'two')] },
  ],
}

describe('openQuestions', () => {
  test('keeps the original numbers and drops what was answered', () => {
    const open = openQuestions(threeQ, parseAnswers('2: a', threeQ))
    expect(open.questions.map((q) => q.n)).toEqual([1, 3])
    const out = renderQuestions(open, { rev: 2 })
    expect(out).toContain('<!-- vsk:v1 type=questions rev=2 -->')
    expect(out).toContain('**Q1.** Q one')
    expect(out).toContain('**Q3.** Q three')
    expect(out).not.toContain('Q two')
  })

  test('a malformed answer keeps its question open', () => {
    const open = openQuestions(threeQ, parseAnswers('1: z\n2: a\n3: a', threeQ))
    expect(open.questions.map((q) => q.n)).toEqual([1])
  })

  test('a fully answered round leaves nothing open', () => {
    expect(openQuestions(threeQ, parseAnswers('all recommended', threeQ)).questions).toEqual([])
  })
})

describe('decideRoute', () => {
  test('VSK_ASK_ROUTE=issue wins over an available tool and a matching operator', () => {
    const r = decideRoute({ env: { VSK_ASK_ROUTE: 'issue' }, tool: 'AskUserQuestion', asker: 'kmanojkumar', operator: 'kmanojkumar' })
    expect(r).toEqual({ route: 'issue', reason: 'VSK_ASK_ROUTE=issue' })
  })

  test('VSK_ASK_ROUTE=tool wins the other way', () => {
    expect(decideRoute({ env: { VSK_ASK_ROUTE: 'tool' }, tool: 'none', asker: 'a', operator: 'b' }).route).toBe('tool')
  })

  test('no question tool routes to the issue', () => {
    const r = decideRoute({ env: {}, tool: 'none', asker: 'kmanojkumar', operator: 'kmanojkumar' })
    expect(r).toEqual({ route: 'issue', reason: 'no question tool in this harness or run' })
  })

  test('an asker who is not the issue operator routes to the issue', () => {
    const r = decideRoute({ env: {}, tool: 'AskUserQuestion', asker: 'someone', operator: 'kmanojkumar' })
    expect(r).toEqual({ route: 'issue', reason: 'asker someone is not the issue operator kmanojkumar' })
  })

  test('tool present and asker is the operator uses the tool', () => {
    expect(decideRoute({ env: {}, tool: 'request_user_input', asker: 'kmanojkumar', operator: 'kmanojkumar' }).route).toBe('tool')
  })

  test('an unrecognised VSK_ASK_ROUTE value is refused rather than guessed', () => {
    expect(() => decideRoute({ env: { VSK_ASK_ROUTE: 'maybe' }, tool: 'none', asker: 'a', operator: 'a' }))
      .toThrow('VSK_ASK_ROUTE must be issue or tool')
  })

  test('an empty VSK_ASK_ROUTE is treated as unset', () => {
    expect(decideRoute({ env: { VSK_ASK_ROUTE: '' }, tool: 'none', asker: 'a', operator: 'a' }).route).toBe('issue')
  })

  test('an unknown operator routes to the issue rather than assuming the asker owns it', () => {
    const r = decideRoute({ env: {}, tool: 'AskUserQuestion', asker: 'kmanojkumar', operator: '' })
    expect(r.route).toBe('issue')
    expect(r.reason).toContain('operator')
  })
})
