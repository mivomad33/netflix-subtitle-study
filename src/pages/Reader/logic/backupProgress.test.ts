import { describe, it, expect } from 'vitest';
import { createMemoryArea, StorageArea } from '../../../shared/storage/storageArea';
import { KEY } from '../../../shared/storage/keys';
import { listCompletions, saveBook } from '../../../shared/storage/repo';
import { BACKUP_FORMAT, exportBackup, mergeBackup, parseBackup } from './backup';

// 학습 완료 기록과 읽기 설정의 백업(4.5-1). 글은 직접 쓴 문장이다.
const done = (bookId: string, chapterId: string, value: boolean, updatedAt: number) => ({
  bookId,
  chapterId,
  done: value,
  updatedAt,
});

const file = (data: Record<string, unknown>) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-11-08T00:00:00.000Z', data });

const snapshot = async (area: StorageArea) => {
  const keys = (await area.getKeys()).sort();
  return JSON.stringify([keys, await area.get(keys)]);
};

const settings = { fontSize: 16, voiceURI: 'Daniel', rate: 1.25, allowOnlineVoices: true, repeat: true, autoPause: false };

describe('backup of study progress', () => {
  it('4.5-1 exports completion records and reading settings', async () => {
    const area = createMemoryArea({ [KEY.readerSettings]: settings });
    await saveBook(area, { id: 'bk1', title: 'T', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'One', paragraphs: ['A short line.'] },
    ]);
    await area.set({ [KEY.completion('bk1', 'c1')]: done('bk1', 'c1', true, 5) });
    const data = JSON.parse((await exportBackup(area)).json).data;
    expect(data[KEY.completion('bk1', 'c1')]).toEqual(done('bk1', 'c1', true, 5));
    expect(data[KEY.readerSettings]).toEqual(settings);
    expect(parseBackup(JSON.stringify(JSON.parse((await exportBackup(area)).json))).ok).toBe(true);
  });

  it('4.5-1 merges per chapter: the later change wins and file-only records are added', async () => {
    const area = createMemoryArea({
      [KEY.completion('bk1', 'c1')]: done('bk1', 'c1', true, 10), // 지금 쪽이 최근
      [KEY.completion('bk1', 'c2')]: done('bk1', 'c2', true, 10), // 파일 쪽이 최근(끔)
      [KEY.completion('bk1', 'c3')]: done('bk1', 'c3', false, 10), // 파일 쪽이 최근(켬)
      [KEY.completion('bk1', 'c4')]: done('bk1', 'c4', true, 10), // 지금에만
    });
    const parsed = parseBackup(
      file({
        [KEY.completion('bk1', 'c1')]: done('bk1', 'c1', false, 5),
        [KEY.completion('bk1', 'c2')]: done('bk1', 'c2', false, 20),
        [KEY.completion('bk1', 'c3')]: done('bk1', 'c3', true, 20),
        [KEY.completion('bk1', 'c5')]: done('bk1', 'c5', true, 1), // 파일에만
      })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    await mergeBackup(area, parsed.backup);
    const byChapter = Object.fromEntries((await listCompletions(area, 'bk1')).map((c) => [c.chapterId, c.done]));
    expect(byChapter).toEqual({ c1: true, c2: false, c3: true, c4: true, c5: true });
  });

  it('4.5-1 imports an old backup without errors and keeps current completion and settings', async () => {
    const area = createMemoryArea({
      [KEY.completion('bk1', 'c1')]: done('bk1', 'c1', true, 10),
      [KEY.readerSettings]: settings,
    });
    // 이 기능 전의 백업: 완료 기록과 읽기 설정(글자 크기 밖의 항목)이 없다.
    const parsed = parseBackup(
      file({
        [KEY.book('bk1')]: {
          id: 'bk1',
          title: 'Old',
          author: '',
          chapters: [{ id: 'c1', title: 'One', paragraphCount: 1 }],
          createdAt: 1,
          updatedAt: 1,
        },
        [KEY.chapter('bk1', 'c1')]: ['An old paragraph.'],
        [KEY.readerSettings]: { fontSize: 12 },
      })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    await mergeBackup(area, parsed.backup);
    const got = await area.get([KEY.completion('bk1', 'c1'), KEY.readerSettings]);
    expect(got[KEY.completion('bk1', 'c1')]).toEqual(done('bk1', 'c1', true, 10));
    expect(got[KEY.readerSettings]).toEqual(settings);
  });

  it.each([
    ['done is not a boolean', { [KEY.completion('bk1', 'c1')]: { ...done('bk1', 'c1', true, 1), done: 'yes' } }],
    ['key does not match the record', { [KEY.completion('bk1', 'c1')]: done('bk1', 'c2', true, 1) }],
    ['updatedAt is missing', { [KEY.completion('bk1', 'c1')]: { bookId: 'bk1', chapterId: 'c1', done: true } }],
    ['rate out of range', { [KEY.readerSettings]: { fontSize: 14, rate: 5 } }],
  ])('4.5-1 rejects a file whose %s and changes nothing', async (_name, data) => {
    const area = createMemoryArea({ [KEY.completion('bk1', 'c1')]: done('bk1', 'c1', true, 10) });
    const before = await snapshot(area);
    const result = parseBackup(file({ [KEY.completion('bk9', 'c1')]: done('bk9', 'c1', true, 1), ...data }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/(학습 완료|설정).*(니다|세요)\.$/);
    expect(await snapshot(area)).toBe(before);
  });
});
