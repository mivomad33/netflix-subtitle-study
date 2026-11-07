import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMemo, putMemo } from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { ReaderEnvProvider } from '../env';
import { exportBackup } from '../logic/backup';
import { BackupControls } from './BackupControls';

const snapshot = async (area: StorageArea) => {
  const keys = (await area.getKeys()).sort();
  return { keys, values: await area.get(keys) };
};

const renderControls = (area: StorageArea, onImported = vi.fn()) =>
  render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
      <BackupControls onImported={onImported} />
    </ReaderEnvProvider>
  );

const chooseFile = (content: string) =>
  fireEvent.change(screen.getByLabelText('백업 파일 고르기'), {
    target: { files: [new File([content], 'backup.json', { type: 'application/json' })] },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BackupControls', () => {
  // 4.6-3
  it.each([
    ['JSON이 아닌 파일', 'this is not json'],
    ['형식 버전이 없는 파일', JSON.stringify({ format: 'nf-study-backup', data: {} })],
    ['필드가 빠진 메모가 든 파일', JSON.stringify({ format: 'nf-study-backup', version: 1, exportedAt: '', data: { 'memo:x': { id: 'x' } } })],
  ])('4.6-3 %s을 가져오면 오류 안내가 보이고 저장소는 그대로다', async (_label, content) => {
    const area = createMemoryArea();
    await putMemo(area, netflixMemo());
    const before = await snapshot(area);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onImported = vi.fn();
    renderControls(area, onImported);

    chooseFile(content);
    expect(await screen.findByRole('alert')).toHaveTextContent('가져오지 못했습니다');
    expect(screen.getByRole('alert')).toHaveTextContent('데이터는 바뀌지 않았습니다');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
    expect(await snapshot(area)).toEqual(before);
  });

  // 4.6-3 (정상 파일은 통과), 4.6-2 (가져오기 전 확인)
  it('4.6-3 정상 백업 파일은 책·메모 개수를 담은 확인을 받고 지금 데이터와 합친다', async () => {
    const source = createMemoryArea();
    await putMemo(source, bookMemo({ id: 'from-file' }));
    const { json } = await exportBackup(source);

    const area = createMemoryArea();
    await putMemo(area, netflixMemo({ id: 'already-here' }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onImported = vi.fn();
    renderControls(area, onImported);

    chooseFile(json);
    expect(await screen.findByText(/책 0권, 메모 1개를 합쳤습니다/)).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('책 0권, 메모 1개');
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(await getMemo(area, 'from-file')).not.toBeNull();
    expect(await getMemo(area, 'already-here')).not.toBeNull();
  });

  // 4.6-2
  it('4.6-2 가져오기 확인에서 취소하면 저장소가 그대로다', async () => {
    const source = createMemoryArea();
    await putMemo(source, bookMemo({ id: 'from-file' }));
    const { json } = await exportBackup(source);
    const area = createMemoryArea();
    await putMemo(area, netflixMemo());
    const before = await snapshot(area);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onImported = vi.fn();
    renderControls(area, onImported);
    // 합치기가 시작되면 확인 직후 곧바로 저장소를 읽는다.
    const get = vi.spyOn(area, 'get');
    const set = vi.spyOn(area, 'set');

    chooseFile(json);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
    expect(await snapshot(area)).toEqual(before);
  });
});
