import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VideoOverlaySubtitle } from './VideoOverlaySubtitle';

describe('VideoOverlaySubtitle Component Smoke Test', () => {
  const mockSentences = [
    {
      startTime_ms: 1000,
      endTime_ms: 2000,
      text: 'Hello World',
      hTranslation: '안녕 세상',
    },
  ];

  it('renders English and Korean subtitles when both are visible', () => {
    render(
      <VideoOverlaySubtitle
        sentences={mockSentences}
        activeIndex={0}
        isEnglishVisible={true}
        isKoreanVisible={true}
      />
    );

    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getByText('안녕 세상')).toBeInTheDocument();
  });
});
