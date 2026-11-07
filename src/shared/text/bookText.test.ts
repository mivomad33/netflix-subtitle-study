import { describe, it, expect } from 'vitest';
import {
  toParagraphs,
  isChapterHeading,
  detectChapterStarts,
  splitIntoChapters,
} from './bookText';

// 모든 본문은 테스트용으로 직접 쓴 문장이다.

const clean = (raw: string) => toParagraphs(raw, { clean: true });

describe('toParagraphs (clean: true)', () => {
  it('\\r\\n 과 \\r 을 줄바꿈으로 보고 문단 안 줄을 공백 하나로 합친다', () => {
    expect(clean('The kettle sang\r\non the stove.\r\rA cat slept\rnearby.')).toEqual([
      'The kettle sang on the stove.',
      'A cat slept nearby.',
    ]);
  });

  it('빈 줄(공백만 있는 줄 포함)은 문단 경계이고, 여러 개여도 경계 하나다', () => {
    const raw = '\n\nFirst little line.\n   \n\t\n\n\nSecond little line.\n\n\n';
    expect(clean(raw)).toEqual(['First little line.', 'Second little line.']);
  });

  it('빈 문단을 만들지 않는다', () => {
    expect(clean('')).toEqual([]);
    expect(clean('  \n\t\n \r\n')).toEqual([]);
  });

  it('줄 끝 "글자-" 다음 줄이 소문자로 시작하면 하이픈을 지우고 붙인다', () => {
    expect(clean('This is an exam-\nple of a wrap.')).toEqual(['This is an example of a wrap.']);
  });

  it('줄 끝 하이픈 다음 줄이 대문자나 숫자로 시작하면 하이픈을 남기고 붙인다', () => {
    expect(clean('We met Jean-\nPaul at noon.')).toEqual(['We met Jean-Paul at noon.']);
    expect(clean('It was a pre-\n1900 house.')).toEqual(['It was a pre-1900 house.']);
  });

  it('줄 끝 하이픈 다음 줄이 The 로 시작해도 하이픈을 지우지 않는다', () => {
    expect(clean('She hummed a half-\nThe rest was lost.')).toEqual([
      'She hummed a half-The rest was lost.',
    ]);
  });

  it('하이픈 앞이 글자가 아니면(공백 뒤 하이픈) 보통 줄처럼 공백으로 합친다', () => {
    expect(clean('He paused -\nThe door opened.')).toEqual(['He paused - The door opened.']);
  });

  it('줄 중간의 하이픈은 그대로 둔다', () => {
    expect(clean('A well-known path\nled home.')).toEqual(['A well-known path led home.']);
  });

  it('줄 끝 대시(—, –)는 지우지 않고 다음 줄과 공백 없이 잇는다', () => {
    expect(clean('She waited—\nand waited.')).toEqual(['She waited—and waited.']);
    expect(clean('Pages 10–\n12 were torn.')).toEqual(['Pages 10–12 were torn.']);
  });

  it('연속 공백과 탭을 하나로 줄이고 문단 앞뒤 공백을 지운다', () => {
    expect(clean('   Too    many \t\t spaces  \n  here.   ')).toEqual(['Too many spaces here.']);
  });

  it('장 제목처럼 보이는 줄은 앞뒤 빈 줄이 없어도 혼자 한 문단이 된다', () => {
    const raw = [
      'The end of the first part',
      'came quietly.',
      'Chapter 2',
      'Morning arrived',
      'with rain.',
      'III',
      'Nobody spoke.',
    ].join('\n');
    expect(clean(raw)).toEqual([
      'The end of the first part came quietly.',
      'Chapter 2',
      'Morning arrived with rain.',
      'III',
      'Nobody spoke.',
    ]);
  });

  it('문장 안의 chapter 나 숫자가 든 줄은 문단에 합쳐진다', () => {
    const raw = 'In this chapter we look\nat boats.\nThere were 3 of them.\nAll were red.';
    expect(clean(raw)).toEqual([
      'In this chapter we look at boats. There were 3 of them. All were red.',
    ]);
  });
});

describe('toParagraphs (clean: false)', () => {
  it('비어 있지 않은 줄 하나가 문단 하나이고 앞뒤 공백만 지운다', () => {
    const raw = '  One  line \r\nan exam-\nple\n\n\n  last\t\tline  ';
    expect(toParagraphs(raw, { clean: false })).toEqual([
      'One  line',
      'an exam-',
      'ple',
      'last\t\tline',
    ]);
  });
});

describe('isChapterHeading', () => {
  it.each([
    'Chapter 1',
    'CHAPTER ONE',
    'Chapter I',
    'chapter xiv',
    'Chapter 12: The Storm',
    'Chapter Twenty-One',
    'Chapter 3.',
    'Part 2',
    'PART THREE',
    'Book 1',
    'Prologue',
    'EPILOGUE.',
    '1',
    '12',
    '1.',
    'IV',
    'xii',
    '  Chapter 7  ',
  ])('참: %s', (line) => {
    expect(isChapterHeading(line)).toBe(true);
  });

  it.each([
    'In this chapter we look at boats.',
    'There were 3 of them.',
    'Chapter one was long and dull.',
    'Part of me wanted to stay.',
    'Book lovers met on Sunday.',
    'The prologue was short.',
    '',
    '   ',
    '1 2',
    'Chapter',
    'Chapter 1\nThe Storm',
    `Chapter 1: ${'a'.repeat(80)}`,
    'IIII',
    'Hello.',
  ])('거짓: %j', (line) => {
    expect(isChapterHeading(line)).toBe(false);
  });
});

describe('detectChapterStarts', () => {
  it('장 제목 문단의 인덱스를 오름차순으로 돌려준다', () => {
    const paragraphs = [
      'A short opening note.',
      'Chapter 1',
      'The lamp was lit.',
      'In this chapter we look at boats.',
      'Chapter 2: Rain',
      'Wet streets.',
      'Epilogue',
    ];
    expect(detectChapterStarts(paragraphs)).toEqual([1, 4, 6]);
  });

  it('제목이 없으면 빈 배열', () => {
    expect(detectChapterStarts(['There were 3 of them.', 'Plain text.'])).toEqual([]);
  });
});

describe('splitIntoChapters', () => {
  const paragraphs = [
    'A short opening note.', // 0
    'Chapter 1', // 1
    'The lamp was lit.', // 2
    'The tea went cold.', // 3
    'Chapter 2: Rain', // 4
    'Wet streets.', // 5
  ];

  it('문단이 없으면 빈 배열', () => {
    expect(splitIntoChapters([], [0, 1])).toEqual([]);
  });

  it('starts 가 비면 "본문" 장 하나', () => {
    expect(splitIntoChapters(['One.', 'Two.'], [])).toEqual([
      { title: '본문', paragraphs: ['One.', 'Two.'] },
    ]);
  });

  it('제목 문단은 장 이름이 되고 본문에서 빠지며, 첫 시작 앞은 "앞부분"', () => {
    expect(splitIntoChapters(paragraphs, [1, 4])).toEqual([
      { title: '앞부분', paragraphs: ['A short opening note.'] },
      { title: 'Chapter 1', paragraphs: ['The lamp was lit.', 'The tea went cold.'] },
      { title: 'Chapter 2: Rain', paragraphs: ['Wet streets.'] },
    ]);
  });

  it('제목이 아닌 시작 문단은 "장 N" 이름을 받고 본문에 남는다', () => {
    expect(splitIntoChapters(paragraphs, [0, 3])).toEqual([
      { title: '장 1', paragraphs: ['A short opening note.', 'Chapter 1', 'The lamp was lit.'] },
      { title: '장 2', paragraphs: ['The tea went cold.', 'Chapter 2: Rain', 'Wet streets.'] },
    ]);
  });

  it('"장 N" 의 N 은 시작 순서를 따른다(제목 장과 섞여도)', () => {
    expect(splitIntoChapters(paragraphs, [1, 3]).map((c) => c.title)).toEqual([
      '앞부분',
      'Chapter 1',
      '장 2',
    ]);
  });

  it('중복·범위 밖·정렬 안 된 starts 를 정리한다', () => {
    expect(splitIntoChapters(paragraphs, [4, -1, 1, 99, 4, 1.5, 6])).toEqual([
      { title: '앞부분', paragraphs: ['A short opening note.'] },
      { title: 'Chapter 1', paragraphs: ['The lamp was lit.', 'The tea went cold.'] },
      { title: 'Chapter 2: Rain', paragraphs: ['Wet streets.'] },
    ]);
  });

  it('범위 안 starts 가 하나도 없으면 "본문" 장 하나', () => {
    expect(splitIntoChapters(['One.'], [5, -2])).toEqual([
      { title: '본문', paragraphs: ['One.'] },
    ]);
  });

  it('제목만 연달아 있으면 문단 0개인 장도 만든다', () => {
    expect(splitIntoChapters(['Part 1', 'Chapter 1', 'Text.'], [0, 1])).toEqual([
      { title: 'Part 1', paragraphs: [] },
      { title: 'Chapter 1', paragraphs: ['Text.'] },
    ]);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [...paragraphs];
    const starts = [4, 1];
    splitIntoChapters(input, starts);
    expect(input).toEqual(paragraphs);
    expect(starts).toEqual([4, 1]);
  });
});

describe('전체 흐름', () => {
  it('붙여 넣은 본문을 문단으로 정리하고 장으로 나눈다', () => {
    const raw = [
      'A note before the story.',
      '',
      'CHAPTER ONE',
      'The boat left the har-',
      'bour at dawn. Nobody',
      'waved.',
      '',
      'CHAPTER TWO',
      'By noon the wind had',
      'turned—',
      'and so had the crew.',
    ].join('\n');
    const paragraphs = clean(raw);
    const chapters = splitIntoChapters(paragraphs, detectChapterStarts(paragraphs));
    expect(chapters).toEqual([
      { title: '앞부분', paragraphs: ['A note before the story.'] },
      {
        title: 'CHAPTER ONE',
        paragraphs: ['The boat left the harbour at dawn. Nobody waved.'],
      },
      {
        title: 'CHAPTER TWO',
        paragraphs: ['By noon the wind had turned—and so had the crew.'],
      },
    ]);
  });

  it('200만 자 입력을 2초 안에 처리한다', () => {
    const block = [
      'Chapter 12',
      'The quiet harbour town woke slowly as gulls circled over the well-known pier and',
      'the fishermen checked their nets, count-',
      'ing knots and telling the same old stories—',
      'again and again.',
      '',
      '',
    ].join('\n');
    const raw = block.repeat(Math.ceil(2_000_000 / block.length));
    expect(raw.length).toBeGreaterThanOrEqual(2_000_000);

    const started = performance.now();
    const paragraphs = clean(raw);
    const starts = detectChapterStarts(paragraphs);
    const chapters = splitIntoChapters(paragraphs, starts);
    const elapsed = performance.now() - started;

    expect(chapters.length).toBe(starts.length);
    expect(chapters[0].paragraphs[0]).toContain('counting knots');
    expect(elapsed).toBeLessThan(2000);
  });
});
