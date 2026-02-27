import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/message';

vi.mock('@/lib/chat-context', () => ({
  useChat: () => ({
    model: 'openai',
  }),
}));

describe('ChatMessage component', () => {
  it('renders a system error badge', () => {
    render(
      <ChatMessage
        message={{ id: 'sys-1', role: 'system', content: 'Something failed', isError: true }}
      />,
    );

    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('renders user messages with role label', () => {
    render(<ChatMessage message={{ id: 'user-1', role: 'user', content: 'Hello there' }} />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('renders assistant messages with role label', () => {
    render(
      <ChatMessage
        message={{ id: 'assistant-1', role: 'assistant', content: 'Hi!', model: 'openai' }}
      />,
    );

    expect(screen.getByText('Assistant')).toBeInTheDocument();
    expect(screen.getByText('Hi!')).toBeInTheDocument();
  });
});
