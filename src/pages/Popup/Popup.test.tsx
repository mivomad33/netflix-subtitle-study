import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Popup from './Popup';

describe('Popup', () => {
  const create = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    create.mockReset();
    close.mockReset();
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
      },
      tabs: { create },
    });
    vi.spyOn(window, 'close').mockImplementation(close);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the reader in a new tab and closes', () => {
    render(<Popup />);
    fireEvent.click(screen.getByRole('button', { name: '원서 리더' }));
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://test-id/reader.html#/',
    });
    expect(close).toHaveBeenCalled();
  });

  it('opens the memo list in a new tab and closes', () => {
    render(<Popup />);
    fireEvent.click(screen.getByRole('button', { name: '메모 모아 보기' }));
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://test-id/reader.html#/memos',
    });
    expect(close).toHaveBeenCalled();
  });

  it('no longer shows the boilerplate', () => {
    const { container } = render(<Popup />);
    expect(screen.queryByText(/Learn React/i)).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
