import { describe, expect, test } from 'bun:test'
import { renderQuestions } from '../scripts/questions.mjs'

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
