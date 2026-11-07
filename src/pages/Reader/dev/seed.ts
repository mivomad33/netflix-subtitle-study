import { Memo } from '../../../shared/memo/types';
import { StorageArea } from '../../../shared/storage/storageArea';
import { KEY } from '../../../shared/storage/keys';
import { saveBook, setPosition } from '../../../shared/storage/repo';

// 개발 화면용 테스트 데이터. 글은 모두 직접 쓴 문장이다(실제 원서·자막·메모를 넣지 않는다, 4.9-1).

const STORY = [
  [
    'The lighthouse keeper woke before the gulls. He climbed the iron stairs with a lantern in one hand and a cup of bitter tea in the other.',
    'From the gallery he could see the whole bay, grey and still, and the small boats waiting for the tide.',
    'He wrote the weather in his logbook: calm sea, thin fog, wind from the north-east. Then he wiped the great lens until it shone.',
  ],
  [
    'In the afternoon a girl rowed out from the village with a basket of bread and a letter that had arrived by the morning coach.',
    '"It is from your brother," she said, and waited on the rocks while he read it twice.',
    'The letter was short. His brother was coming home after eleven years at sea, and he would arrive before the first snow.',
    'The keeper folded the paper carefully and put it inside his coat, close to the place where he kept his watch.',
  ],
  [
    'Snow came early that year. It fell all night, softly, and by dawn the path to the landing was buried to the knee.',
    'He lit the lamp at four, though it was not yet dark, because he wanted the light to be the first thing his brother saw.',
    'Long after midnight a single lantern moved across the water, swinging, slow, and very sure of where it was going.',
  ],
];

const WORDS = (
  'river stone quiet window morning letter garden harbor lantern meadow winter summer candle orchard silver kitchen whisper journey promise shadow ' +
  'patient gentle bright narrow ancient careful hollow distant golden simple walked carried waited listened opened noticed remembered followed ' +
  'the a and of to in on with under over before after because while although'
).split(' ');

function syntheticParagraph(seed: number, length: number): string {
  const out: string[] = [];
  let x = seed;
  let total = 0;
  let sentence: string[] = [];
  while (total < length) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const word = WORDS[x % WORDS.length];
    sentence.push(sentence.length === 0 ? word[0].toUpperCase() + word.slice(1) : word);
    total += word.length + 1;
    if (sentence.length > 8 + (x % 9)) {
      out.push(`${sentence.join(' ')}.`);
      sentence = [];
    }
  }
  if (sentence.length) out.push(`${sentence.join(' ')}.`);
  return out.join(' ');
}

// 성능 측정용 원본 글: 장 제목 줄과 빈 줄로 나뉜, 줄 끝 줄바꿈이 있는 OCR 모양의 글.
export function syntheticRawBook(totalChars: number, chapters: number): string {
  const perChapter = Math.floor(totalChars / chapters);
  const parts: string[] = [];
  for (let c = 0; c < chapters; c++) {
    parts.push(`Chapter ${c + 1}`, '');
    let used = 0;
    let p = 0;
    while (used < perChapter) {
      const text = syntheticParagraph(c * 10000 + p, 600);
      // 70자마다 줄을 바꿔 OCR 결과처럼 만든다.
      parts.push(text.replace(/(.{1,70})(\s|$)/g, '$1\n').trim(), '');
      used += text.length + 2;
      p++;
    }
  }
  return parts.join('\n');
}

function memo(partial: Partial<Memo> & Pick<Memo, 'id' | 'kind' | 'sourceId' | 'contextText' | 'quote'>): Memo {
  const start = partial.contextText.indexOf(partial.quote);
  return {
    start,
    end: start + partial.quote.length,
    note: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  } as Memo;
}

export async function seedDemo(area: StorageArea) {
  const now = Date.now();
  await saveBook(
    area,
    { id: 'demo-lighthouse', title: 'The Lighthouse Keeper', author: 'Test Author', createdAt: now, updatedAt: now },
    STORY.map((paragraphs, i) => ({ id: `ch${i + 1}`, title: `Chapter ${i + 1}`, paragraphs }))
  );
  await saveBook(
    area,
    { id: 'demo-empty', title: 'Short Notes', author: '', createdAt: now - 1000, updatedAt: now - 1000 },
    [{ id: 'ch1', title: '본문', paragraphs: ['A small book with a single paragraph and no memos yet.'] }]
  );
  await setPosition(area, { bookId: 'demo-lighthouse', chapterId: 'ch2', paragraphIndex: 1, updatedAt: now });
  const memos: Memo[] = [
    memo({
      id: 'demo-m1', kind: 'book', sourceId: 'demo-lighthouse', chapterId: 'ch1', paragraphIndex: 0,
      contextText: STORY[0][0], quote: 'bitter tea', note: 'bitter: 쓴\n차를 진하게 우렸을 때', updatedAt: now - 5000,
    }),
    memo({
      id: 'demo-m2', kind: 'book', sourceId: 'demo-lighthouse', chapterId: 'ch2', paragraphIndex: 2,
      contextText: STORY[1][2], quote: 'before the first snow', note: '첫눈 오기 전에', updatedAt: now - 3000,
    }),
    memo({
      id: 'demo-m3', kind: 'book', sourceId: 'demo-lighthouse', chapterId: 'ch3', paragraphIndex: 0,
      contextText: 'This paragraph was edited after the memo was made.', quote: 'edited', note: '위치를 찾지 못하는 메모 예시', updatedAt: now - 2000,
    }),
    memo({
      id: 'demo-n1', kind: 'netflix', sourceId: '80000001', sentenceStartMs: 754000,
      contextText: 'I will be there before you know it.', quote: 'before you know it', note: '눈 깜짝할 사이에',
      videoTitle: 'Test Series', seasonSeq: 1, episodeSeq: 3, episodeTitle: 'The Harbor', updatedAt: now - 1000,
    }),
    memo({
      id: 'demo-n2', kind: 'netflix', sourceId: '80000002', sentenceStartMs: 61000,
      contextText: 'Keep your voice down.', quote: 'Keep your voice down', updatedAt: now - 4000,
    }),
  ];
  await area.set(Object.fromEntries(memos.map((m) => [KEY.memo(m.id), m])));
}

// 성능 측정용: 책 20권(그중 한 권 200만 자), 메모 5,000개(4.10-3).
export async function seedPerf(area: StorageArea) {
  const now = Date.now();
  for (let b = 0; b < 20; b++) {
    const big = b === 0;
    const chapterCount = big ? 10 : 5;
    const charsPerChapter = big ? 200_000 : 20_000;
    const chapters = Array.from({ length: chapterCount }, (_, c) => {
      const paragraphs: string[] = [];
      let used = 0;
      while (used < charsPerChapter) {
        const text = syntheticParagraph(b * 1_000_000 + c * 10_000 + paragraphs.length, 600);
        paragraphs.push(text);
        used += text.length;
      }
      return { id: `ch${c + 1}`, title: `Chapter ${c + 1}`, paragraphs };
    });
    await saveBook(
      area,
      { id: `perf-${b}`, title: big ? 'Perf Big Book' : `Perf Book ${b}`, author: '', createdAt: now - b, updatedAt: now - b },
      chapters
    );
  }
  const items: Record<string, Memo> = {};
  for (let i = 0; i < 5000; i++) {
    const netflix = i % 2 === 0;
    const contextText = syntheticParagraph(i, netflix ? 60 : 300);
    const quote = contextText.split(' ').slice(1, 3).join(' ');
    const m = memo({
      id: `perf-m${i}`,
      kind: netflix ? 'netflix' : 'book',
      sourceId: netflix ? `8100${i % 40}` : `perf-${i % 20}`,
      contextText,
      quote,
      note: i % 3 === 0 ? `note ${i} ${WORDS[i % WORDS.length]}` : '',
      updatedAt: now - i * 1000,
      ...(netflix
        ? { sentenceStartMs: (i % 3000) * 1000, videoTitle: `Perf Video ${i % 40}` }
        : { chapterId: `ch${(i % 5) + 1}`, paragraphIndex: i % 30 }),
    });
    items[KEY.memo(m.id)] = m;
  }
  await area.set(items);
}
