import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SentenceAnnotation } from '../../../types';
import { SentenceList } from './SentenceList';

describe('SentenceList Component', () => {
  const mockSentences = [
    {
      startTime_ms: 1500,
      endTime_ms: 3000,
      text: 'Good morning.',
      hTranslation: '좋은 아침입니다.',
    },
    {
      startTime_ms: 120000,
      endTime_ms: 125000,
      text: 'How are you?',
      hTranslation: '어떻게 지내세요?',
    },
  ];

  const defaultProps = {
    sentences: mockSentences,
    currentTab: 0,
    itemsPerPage: 50,
    activeIndex: null,
    isEnglishVisible: true,
    isAllVisible: false,
    visibleTranslations: new Set<number>(),
    visibleEnglishSentences: new Set<number>(),
    toggleEnglishSentence: vi.fn(),
    toggleTranslation: vi.fn(),
    handlePlaySentence: vi.fn(),
    sentenceRefs: { current: [] } as any,
    annotations: [] as SentenceAnnotation[],
    editingAnnotationId: null,
    onAddAnnotation: vi.fn(),
    onUpdateNote: vi.fn(),
    onRemoveAnnotation: vi.fn(),
    onEditAnnotation: vi.fn(),
  };

  const makeAnnotation = (
    overrides: Partial<SentenceAnnotation> = {}
  ): SentenceAnnotation => ({
    id: 'a1',
    kind: 'netflix',
    sourceId: 'v1',
    sentenceStartMs: 1500,
    contextText: 'Good morning.',
    start: 5,
    end: 12,
    quote: 'morning',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });

  const selectText = (node: Node, start: number, end: number) => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.getSelection()?.removeAllRanges();
  });

  it('renders sentences on current page with formatted timestamp', () => {
    render(<SentenceList {...defaultProps} />);

    expect(screen.getByText('Good morning.')).toBeInTheDocument();
    expect(screen.getByText('좋은 아침입니다.')).toBeInTheDocument();
    expect(screen.getByText('00:01')).toBeInTheDocument(); // 1500ms

    expect(screen.getByText('How are you?')).toBeInTheDocument();
    expect(screen.getByText('어떻게 지내세요?')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument(); // 120000ms
  });

  it('adds active class to activeIndex sentence', () => {
    const { container } = render(<SentenceList {...defaultProps} activeIndex={0} />);
    
    const sentenceElements = container.querySelectorAll('.sentence');
    expect(sentenceElements[0]).toHaveClass('active');
    expect(sentenceElements[1]).not.toHaveClass('active');
  });

  it('calls handlePlaySentence with correct time when clicking timestamp', () => {
    render(<SentenceList {...defaultProps} />);

    fireEvent.click(screen.getByText('00:01'));
    expect(defaultProps.handlePlaySentence).toHaveBeenCalledWith(1500);
  });

  it('calls toggleTranslation when clicking translation text', () => {
    render(<SentenceList {...defaultProps} />);

    fireEvent.click(screen.getByText('좋은 아침입니다.'));
    expect(defaultProps.toggleTranslation).toHaveBeenCalledWith(0);
  });

  it('shows a toolbar for a selection and creates a highlight from it', () => {
    const onAddAnnotation = vi.fn(() => makeAnnotation());
    const { container } = render(
      <SentenceList {...defaultProps} onAddAnnotation={onAddAnnotation} />
    );
    const textElement = container.querySelectorAll('.sentence-text')[0];

    // 앞 공백까지 골라도 공백은 빼고 저장한다.
    selectText(textElement.firstChild!, 4, 12);
    fireEvent.mouseUp(textElement);

    fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));
    expect(onAddAnnotation).toHaveBeenCalledWith({
      sentenceStartMs: 1500,
      sentenceText: 'Good morning.',
      start: 5,
      end: 12,
    });
    expect(defaultProps.onEditAnnotation).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '하이라이트' })).toBeNull();
  });

  it('opens the memo editor right after creating from the memo button', () => {
    const onAddAnnotation = vi.fn(() => makeAnnotation({ id: 'new' }));
    const { container } = render(
      <SentenceList {...defaultProps} onAddAnnotation={onAddAnnotation} />
    );
    const textElement = container.querySelectorAll('.sentence-text')[1];

    selectText(textElement.firstChild!, 0, 3);
    fireEvent.mouseUp(textElement);
    fireEvent.click(screen.getByRole('button', { name: '메모' }));

    expect(onAddAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ sentenceStartMs: 120000, start: 0, end: 3 })
    );
    expect(defaultProps.onEditAnnotation).toHaveBeenCalledWith('new');
  });

  it('opens the existing highlight instead of overlapping it', () => {
    const { container } = render(
      <SentenceList {...defaultProps} annotations={[makeAnnotation()]} />
    );
    const textElement = container.querySelectorAll('.sentence-text')[0];

    selectText(textElement.firstChild!, 0, 4);
    fireEvent.mouseUp(textElement);
    expect(screen.getByRole('button', { name: '하이라이트' })).toBeInTheDocument();

    const mark = container.querySelector('mark')!;
    selectText(mark.firstChild!, 0, 3);
    fireEvent.mouseUp(mark);
    expect(defaultProps.onEditAnnotation).toHaveBeenCalledWith('a1');
    expect(screen.queryByRole('button', { name: '하이라이트' })).toBeNull();
  });

  it('renders highlights, marks ones with a note, and opens them on click', () => {
    const { container } = render(
      <SentenceList
        {...defaultProps}
        annotations={[makeAnnotation({ note: 'greeting' })]}
      />
    );
    const mark = container.querySelector('mark')!;
    expect(mark).toHaveTextContent('morning');
    expect(mark).toHaveClass('has-note');
    expect(container.querySelectorAll('.sentence-text')[0]).toHaveTextContent(
      'Good morning.'
    );

    fireEvent.click(mark);
    expect(defaultProps.onEditAnnotation).toHaveBeenCalledWith('a1');
  });

  it('ignores highlights whose sentence text no longer matches', () => {
    const { container } = render(
      <SentenceList
        {...defaultProps}
        annotations={[makeAnnotation({ contextText: 'Good evening.' })]}
      />
    );
    expect(container.querySelector('mark')).toBeNull();
  });

  it('edits the memo in a multi-line editor without leaking keys to the page', () => {
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);
    render(
      <SentenceList
        {...defaultProps}
        annotations={[makeAnnotation({ note: 'line 1' })]}
        editingAnnotationId="a1"
      />
    );
    const textarea = screen.getByLabelText('메모') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.rows).toBeGreaterThanOrEqual(6);

    fireEvent.change(textarea, { target: { value: 'line 1\nline 2' } });
    expect(defaultProps.onUpdateNote).toHaveBeenCalledWith('a1', 'line 1\nline 2');

    fireEvent.keyDown(textarea, { key: ' ', code: 'Space' });
    expect(windowKeydown).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });
    expect(defaultProps.onEditAnnotation).toHaveBeenCalledWith(null);
    window.removeEventListener('keydown', windowKeydown);
  });

  it('asks before deleting a highlight that has a memo', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <SentenceList
        {...defaultProps}
        annotations={[makeAnnotation({ note: 'keep me' })]}
        editingAnnotationId="a1"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '하이라이트 지우기' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(defaultProps.onRemoveAnnotation).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '하이라이트 지우기' }));
    expect(defaultProps.onRemoveAnnotation).toHaveBeenCalledWith('a1');
    confirmSpy.mockRestore();
  });

  it('does not toggle hidden English when the click ends a text selection', () => {
    const { container } = render(
      <SentenceList
        {...defaultProps}
        isEnglishVisible={false}
        visibleEnglishSentences={new Set([0])}
      />
    );
    const textElement = container.querySelectorAll('.sentence-text')[0];
    selectText(textElement.firstChild!, 0, 4);
    fireEvent.click(textElement);
    expect(defaultProps.toggleEnglishSentence).not.toHaveBeenCalled();

    window.getSelection()!.removeAllRanges();
    fireEvent.click(textElement);
    expect(defaultProps.toggleEnglishSentence).toHaveBeenCalledWith(0);
  });
});
