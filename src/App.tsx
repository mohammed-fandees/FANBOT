import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import './App.css'

import CodeBlock from './components/CodeBlock';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  date: Date;
  isThinking?: boolean;
}

interface ChatMessage {
  role: string;
  content: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  lastActivity: Date;
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
}

function App() {
  // Available models from OpenRouter
  const modelOptions: ModelOption[] = useMemo(() => [
    {
      id: 'openai/gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: 'Fast and cost-effective general purpose model'
    },
    {
      id: 'anthropic/claude-instant-v1',
      name: 'Claude Instant',
      description: 'Fast and affordable assistant from Anthropic'
    },
    {
      id: 'meta-llama/llama-2-13b-chat',
      name: 'Llama 2 (13B)',
      description: 'Open source model from Meta AI'
    }
  ], []);

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingDots, setThinkingDots] = useState('');
  // Removed typedContent and typingIdx - using SSE streaming instead
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    localStorage.getItem('theme') as 'dark' | 'light' || 'dark'
  );
  const [modelSelection, setModelSelection] = useState(
    localStorage.getItem('model_selection') || 'openai/gpt-3.5-turbo'
  );
  const [modelDisplayName, setModelDisplayName] = useState('GPT-3.5 Turbo');
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('openrouter_api_key'));
  const [showSettings, setShowSettings] = useState(false);
  const [systemMessage, setSystemMessage] = useState(
    localStorage.getItem('system_message') || 'You are a helpful, accurate, and friendly AI assistant.'
  );
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Get current chat
  const currentChat = useMemo(() => chats.find(chat => chat.id === currentChatId), [chats, currentChatId]);
  const messages = currentChat?.messages || [];
  
  // Helper to parse markdown and code blocks in messages (with real-time support)
  function renderMessageContent(content: string, isStreaming: boolean = false) {
    // For streaming messages, detect incomplete code blocks
    if (isStreaming) {
      const incompleteCodeBlockRegex = /```([a-zA-Z0-9]*)\n?([\s\S]*)$/;
      const match = content.match(incompleteCodeBlockRegex);
      
      if (match) {
        // We have an incomplete code block at the end
        const beforeCodeBlock = content.substring(0, match.index);
        const language = match[1] || "";
        const code = match[2] || "";
        
        return (
          <>
            {renderCompleteContent(beforeCodeBlock)}
            <CodeBlock code={code} language={language} />
          </>
        );
      }
    }
    
    return renderCompleteContent(content);
  }
  
  // Helper to render complete content (with complete code blocks)
  function renderCompleteContent(content: string): React.ReactNode {
    // Parse code blocks first
    const codeBlockRegex = /```([a-zA-Z0-9]*)\n?([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let idx = 0;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        // Parse markdown in the text before the code block
        parts.push(
          <React.Fragment key={"text-" + idx}>
            {parseMarkdown(content.slice(lastIndex, match.index))}
          </React.Fragment>
        );
        idx++;
      }
      const language = match[1] || "";
      const code = match[2];
      parts.push(
        <CodeBlock key={"code-" + idx} code={code} language={language} />
      );
      idx++;
      lastIndex = codeBlockRegex.lastIndex;
    }
    
    if (lastIndex < content.length) {
      // Parse markdown in the remaining text
      parts.push(
        <React.Fragment key={"text-" + idx}>
          {parseMarkdown(content.slice(lastIndex))}
        </React.Fragment>
      );
    }
    
    return parts.length > 0 ? parts : parseMarkdown(content);
  }

  // Parse inline markdown with proper React elements
  function parseMarkdown(text: string): React.ReactNode {
    if (!text) return null;
    
    // Split by line breaks to handle them properly
    const lines = text.split('\n');
    
    return lines.map((line, lineIdx) => {
      const elements: React.ReactNode[] = [];
      let remaining = line;
      let elementIdx = 0;
      
      // Patterns for markdown elements
      const patterns = [
        { 
          regex: /`([^`]+)`/, 
          element: (match: string[]) => (
            <code key={`code-${lineIdx}-${elementIdx++}`} className="inline-code">
              {match[1]}
            </code>
          )
        },
        { 
          regex: /\*\*([^*]+)\*\*/, 
          element: (match: string[]) => (
            <strong key={`strong-${lineIdx}-${elementIdx++}`}>
              {match[1]}
            </strong>
          )
        },
        { 
          regex: /\*([^*]+)\*/, 
          element: (match: string[]) => (
            <em key={`em-${lineIdx}-${elementIdx++}`}>
              {match[1]}
            </em>
          )
        },
        { 
          regex: /__([^_]+)__/, 
          element: (match: string[]) => (
            <strong key={`strong2-${lineIdx}-${elementIdx++}`}>
              {match[1]}
            </strong>
          )
        },
        { 
          regex: /_([^_]+)_/, 
          element: (match: string[]) => (
            <em key={`em2-${lineIdx}-${elementIdx++}`}>
              {match[1]}
            </em>
          )
        },
        { 
          regex: /\[([^\]]+)\]\(([^)]+)\)/, 
          element: (match: string[]) => (
            <a 
              key={`link-${lineIdx}-${elementIdx++}`} 
              href={match[2]} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="markdown-link"
            >
              {match[1]}
            </a>
          )
        },
      ];
      
      while (remaining) {
        let matched = false;
        
        for (const pattern of patterns) {
          const match = remaining.match(pattern.regex);
          if (match && match.index !== undefined) {
            // Add text before the match
            if (match.index > 0) {
              elements.push(
                <span key={`text-${lineIdx}-${elementIdx++}`}>
                  {remaining.slice(0, match.index)}
                </span>
              );
            }
            
            // Add the matched element
            elements.push(pattern.element(match));
            
            // Update remaining text
            remaining = remaining.slice(match.index + match[0].length);
            matched = true;
            break;
          }
        }
        
        if (!matched) {
          // No patterns matched, add the remaining text
          elements.push(
            <span key={`text-${lineIdx}-${elementIdx++}`}>
              {remaining}
            </span>
          );
          break;
        }
      }
      
      // Return line with line break
      return (
        <React.Fragment key={`line-${lineIdx}`}>
          {elements}
          {lineIdx < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  }

  // Create new chat
  const createNewChat = useCallback(() => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [
        {
          id: 'system',
          role: 'system',
          content: systemMessage,
          date: new Date()
        },
        {
          id: 'greeting',
          role: 'assistant',
          content: 'Hello! I\'m your AI assistant. How can I help you today?',
          date: new Date()
        }
      ],
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    setChats(prevChats => [...prevChats, newChat]);
    setCurrentChatId(newChat.id);
    setSuggestions([
      "Tell me about the latest AI developments",
      "Help me write a professional email",
      "Explain quantum computing simply"
    ]);
    setShowSuggestions(true);
    
    // Save to localStorage
    const updatedChats = [...chats, newChat];
    localStorage.setItem('chats', JSON.stringify(updatedChats));
    
    // On mobile, close sidebar after creating new chat
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [chats, systemMessage]);

  // Generate chat title based on first user message using SSE
  const generateChatTitle = async (chatId: string, firstMessage: string) => {
    let title = '';
    
    // Only try API generation if we have an API key
    if (apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'AI Chat App'
          },
          body: JSON.stringify({
            model: modelSelection,
            messages: [
              {
                role: 'system',
                content: 'Generate a short, descriptive title (3-5 words) for a conversation that starts with the following message. Only respond with the title, nothing else.'
              },
              {
                role: 'user',
                content: firstMessage
              }
            ],
            temperature: 0.7,
            max_tokens: 20,
            stream: true // Enable streaming for title generation
          })
        });

        if (response.ok) {
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          if (reader) {
            let titleContent = '';
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') break;
                  
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0]?.delta?.content || '';
                    titleContent += content;
                  } catch (e) {
                    console.error('Error parsing SSE data for title:', e);
                  }
                }
              }
            }
            
            title = titleContent.trim().replace(/['"]/g, '');
          }
        }
      } catch (error) {
        console.error('Title generation error:', error);
      }
    }
    
    // If no title was generated, use fallback
    if (!title) {
      title = firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
    }
    
    // Update the chat title
    setChats(prevChats => prevChats.map(chat => 
      chat.id === chatId ? { ...chat, title } : chat
    ));
  };

  // Load chats from localStorage
  useEffect(() => {
    const savedChats = localStorage.getItem('chats');
    if (savedChats) {
      try {
        const parsedChats: Chat[] = JSON.parse(savedChats).map((chat: any) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
          lastActivity: new Date(chat.lastActivity),
          messages: chat.messages.map((msg: any) => ({
            ...msg,
            date: new Date(msg.date)
          }))
        }));
        
        setChats(parsedChats);
        if (parsedChats.length > 0) {
          setCurrentChatId(parsedChats[parsedChats.length - 1].id);
        }
      } catch (e) {
        console.error('Error loading chats:', e);
        createNewChat();
      }
    } else {
      createNewChat();
    }
    
    // Set theme from localStorage
    if (localStorage.getItem('theme')) {
      const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    // Handle window resize
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('chats', JSON.stringify(chats));
    }
  }, [chats]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingDots]);

  // Animation for thinking dots
  useEffect(() => {
    if (!loading) {
      setThinkingDots('');
      return;
    }
    
    const interval = setInterval(() => {
      setThinkingDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 400);
    
    return () => clearInterval(interval);
  }, [loading]);

  // Auto-resize input field
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = '40px';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Removed typewriter effect - using SSE streaming instead

  // Listen for code-copied event and show notification
  useEffect(() => {
    const handler = () => {
      showNotification('Code copied to clipboard');
    };
    window.addEventListener('code-copied', handler);
    return () => window.removeEventListener('code-copied', handler);
  }, []);

  // Format date for display
  const formatDate = (date: Date) => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    if (date.toDateString() === now.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleString([], { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  // Show toast notification
  const showNotification = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  // Generate suggestions based on context
  const generateSuggestions = (lastMessage: string) => {
    const suggestions: string[] = [];
    
    if (lastMessage.toLowerCase().includes('ai') || lastMessage.toLowerCase().includes('model')) {
      suggestions.push("How does this compare to other AI models?");
    }
    
    if (lastMessage.toLowerCase().includes('code') || lastMessage.toLowerCase().includes('programming')) {
      suggestions.push("Can you write a function to sort an array?");
    }
    
    if (lastMessage.toLowerCase().includes('help') || lastMessage.toLowerCase().includes('explain')) {
      suggestions.push("I'd like to learn more about this topic");
    }
    
    if (suggestions.length < 3) {
      suggestions.push("Tell me something interesting");
      suggestions.push("What else can you help me with?");
    }
    
    setSuggestions(suggestions.slice(0, 3));
  };

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Save settings
  const saveSettings = (key: string, systemMsg: string, model: string) => {
    setApiKey(key);
    localStorage.setItem('openrouter_api_key', key);
    
    setSystemMessage(systemMsg);
    localStorage.setItem('system_message', systemMsg);
    
    setModelSelection(model);
    localStorage.setItem('model_selection', model);
    
    const modelOption = modelOptions.find(m => m.id === model);
    setModelDisplayName(modelOption?.name || 'GPT-3.5 Turbo');
    
    showNotification('Settings saved successfully');
    setShowSettings(false);
  };

  // Copy message content to clipboard
  const copyMessageToClipboard = (content: string) => {
    navigator.clipboard.writeText(content)
      .then(() => {
        showNotification('Copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy message: ', err);
        showNotification('Failed to copy to clipboard');
      });
  };

  // Send message to OpenRouter API using SSE
  const sendMessage = async () => {
    if (!input.trim() || !currentChat) return;
    
    const messageId = Date.now().toString();
    
    const userMsg: Message = {
      id: messageId,
      role: 'user',
      content: input.trim(),
      date: new Date()
    };
    
    // Update chat with new message
    setChats(prevChats => prevChats.map(chat => 
      chat.id === currentChatId 
        ? { 
            ...chat, 
            messages: [...chat.messages, userMsg], 
            lastActivity: new Date() 
          } 
        : chat
    ));
    
    // Generate title if this is the first user message
    const previousUserMessages = currentChat.messages.filter(m => m.role === 'user');
    if (previousUserMessages.length === 0 && currentChat.title === 'New Chat') {
      generateChatTitle(currentChatId!, input.trim());
    }
    
    setInput('');
    setLoading(true);
    setShowSuggestions(false);
    
    const thinkingMsg: Message = {
      id: `thinking-${messageId}`,
      role: 'assistant',
      content: 'Thinking...',
      date: new Date(),
      isThinking: true
    };
    
    setChats(prevChats => prevChats.map(chat => 
      chat.id === currentChatId 
        ? { 
            ...chat, 
            messages: [...chat.messages, thinkingMsg] 
          } 
        : chat
    ));
    
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    
    try {
      const chatMessages: ChatMessage[] = [];
      
      // Find system message
      const systemMsg = currentChat.messages.find(m => m.role === 'system');
      if (systemMsg) {
        chatMessages.push({
          role: 'system',
          content: systemMsg.content
        });
      }
      
      // Add conversation history for current chat
      const conversationMsgs = currentChat.messages
        .filter(m => m.role !== 'system' && !m.isThinking)
        .map(m => ({
          role: m.role,
          content: m.content
        }));
      
      chatMessages.push(...conversationMsgs);
      
      // Add the latest user message
      chatMessages.push({
        role: 'user',
        content: userMsg.content
      });
      
      let response = '';
      
      // Check if API key exists
      if (!apiKey) {
        throw new Error('No API key configured');
      }
      
      try {
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'AI Chat App'
          },
          body: JSON.stringify({
            model: modelSelection,
            messages: chatMessages,
            temperature: 0.7,
            stream: true // Enable streaming
          })
        });
        
        if (!openRouterResponse.ok) {
          const errorData = await openRouterResponse.json();
          throw new Error(errorData.error?.message || 'Failed to connect to OpenRouter API');
        }
        
        // Remove thinking message
        setChats(prevChats => prevChats.map(chat => 
          chat.id === currentChatId 
            ? {
                ...chat,
                messages: chat.messages.filter(m => m.id !== `thinking-${messageId}`)
              }
            : chat
        ));
        
        // Add empty response message
        const responseMsg: Message = {
          id: `response-${messageId}`,
          role: 'assistant',
          content: '',
          date: new Date()
        };
        
        setChats(prevChats => prevChats.map(chat => 
          chat.id === currentChatId 
            ? {
                ...chat,
                messages: [...chat.messages, responseMsg]
              }
            : chat
        ));
        
        // Process streaming response
        const reader = openRouterResponse.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) throw new Error('Response body is empty');
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                response += content;
                
                  // Update message content in real-time
                setChats(prevChats => prevChats.map(chat => 
                  chat.id === currentChatId 
                    ? {
                        ...chat,
                        messages: chat.messages.map(msg => 
                          msg.id === `response-${messageId}` 
                            ? { ...msg, content: response }
                            : msg
                        )
                      }
                    : chat
                ));
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
        
      } catch (error) {
        console.error('OpenRouter API error:', error);
        
        // Fallback to simulated response with SSE-like behavior
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const responses = [
          `It looks like you haven't set up your API key yet. To get started, please:

1. Click the Settings button in the sidebar
2. Enter your OpenRouter API key
3. Save your settings

You can get an API key at openrouter.ai/keys. Once you've added your key, I'll be able to help you with: "${input.slice(0, 30)}${input.length > 30 ? '...' : ''}"`,
          `To help you with "${input.slice(0, 30)}${input.length > 30 ? '...' : ''}", I'll need you to configure your API key first. Click the Settings button and enter your OpenRouter API key. You can get one at openrouter.ai/keys`,
          `Before I can answer your question about "${input.slice(0, 30)}${input.length > 30 ? '...' : ''}", please set up your API key in Settings. Visit openrouter.ai/keys to get your key, then enter it in the Settings panel.`
        ];
        response = responses[Math.floor(Math.random() * responses.length)];
        
        // Remove thinking message
        setChats(prevChats => prevChats.map(chat => 
          chat.id === currentChatId 
            ? {
                ...chat,
                messages: chat.messages.filter(m => m.id !== `thinking-${messageId}`)
              }
            : chat
        ));
        
        // Add empty response message
        const responseMsg: Message = {
          id: `response-${messageId}`,
          role: 'assistant',
          content: '',
          date: new Date()
        };
        
        setChats(prevChats => prevChats.map(chat => 
          chat.id === currentChatId 
            ? {
                ...chat,
                messages: [...chat.messages, responseMsg]
              }
            : chat
        ));
        
        // Simulate SSE streaming for fallback response
        let i = 0;
        const streamInterval = setInterval(() => {
          i += 5;
          const currentContent = response.slice(0, i);
          
          setChats(prevChats => prevChats.map(chat => 
            chat.id === currentChatId 
              ? {
                  ...chat,
                  messages: chat.messages.map(msg => 
                    msg.id === `response-${messageId}` 
                      ? { ...msg, content: currentContent }
                      : msg
                  )
                }
              : chat
          ));
          
          if (i >= response.length) {
            clearInterval(streamInterval);
          }
        }, 30);
      }
      
      // Generate title if it's still "New Chat"
      setChats(prevChats => {
        const chat = prevChats.find(c => c.id === currentChatId);
        if (chat && chat.title === 'New Chat') {
          const userMessages = chat.messages.filter(m => m.role === 'user');
          if (userMessages.length > 0) {
            generateChatTitle(currentChatId!, userMessages[0].content);
          }
        }
        return prevChats;
      });
      
      // Generate suggestions after receiving the full response
      const updatedChat = chats.find(chat => chat.id === currentChatId);
      if (updatedChat) {
        const lastMessage = updatedChat.messages[updatedChat.messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          generateSuggestions(lastMessage.content);
        }
      }
      
    } catch (error) {
      console.error('Error:', error);
      
      setChats(prevChats => prevChats.map(chat => 
        chat.id === currentChatId 
          ? {
              ...chat,
              messages: [
                ...chat.messages.filter(m => m.id !== `thinking-${messageId}`),
                {
                  id: `error-${messageId}`,
                  role: 'assistant',
                  content: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again or check your API settings.`,
                  date: new Date()
                }
              ]
            }
          : chat
      ));
    }
    
    setLoading(false);
  };

  // Handle key press in input field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Use a suggestion as input
  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  // Clear current chat
  const clearCurrentChat = () => {
    if (!currentChat) return;
    
    const clearedChat: Chat = {
      ...currentChat,
      messages: [
        {
          id: 'system',
          role: 'system',
          content: systemMessage,
          date: new Date()
        },
        {
          id: 'greeting-new',
          role: 'assistant',
          content: 'Chat cleared. How else can I help you?',
          date: new Date()
        }
      ],
      lastActivity: new Date()
    };
    
    setChats(prevChats => prevChats.map(chat => 
      chat.id === currentChatId ? clearedChat : chat
    ));
    
    setInput('');
    setShowSuggestions(true);
    setSuggestions([
      "Tell me about the latest AI developments",
      "Help me write a professional email",
      "Explain quantum computing simply"
    ]);
    
    showNotification('Chat history cleared');
  };

  // Delete a chat
  const deleteChat = (chatId: string) => {
    const updatedChats = chats.filter(chat => chat.id !== chatId);
    setChats(updatedChats);
    
    if (chatId === currentChatId) {
      if (updatedChats.length > 0) {
        setCurrentChatId(updatedChats[updatedChats.length - 1].id);
      } else {
        createNewChat();
      }
    }
    
    localStorage.setItem('chats', JSON.stringify(updatedChats));
    showNotification('Chat deleted');
    setShowDeleteConfirm(false);
    setChatToDelete(null);
  };

  // Show delete confirmation
  const confirmDelete = (chatId: string) => {
    setChatToDelete(chatId);
    setShowDeleteConfirm(true);
  };

  return (
    <div className={`app-container ${theme}`}>
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && window.innerWidth < 768 && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 14C8 14 9.5 16 12 16C14.5 16 16 14 16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 10H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 10H15.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <button 
            className="new-chat-btn"
            onClick={createNewChat}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Chat
          </button>
        </div>
        
        <div className="chat-list">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              className={`chat-item ${chat.id === currentChatId ? 'active' : ''}`}
              onClick={() => setCurrentChatId(chat.id)}
            >
              <div className="chat-item-content">
                <span className="chat-item-title">{chat.title}</span>
                <span className="chat-item-date">{formatDate(chat.lastActivity)}</span>
              </div>
              <button 
                className="chat-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(chat.id);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          ))}
        </div>
        
        <div className="sidebar-footer">
          <button 
            className="sidebar-control-btn" 
            onClick={() => setShowSettings(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
          </button>
          
          <button 
            className="sidebar-control-btn" 
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </aside>
      
      {/* Main chat area */}
      <main className="chat-container">
        {/* Header */}
        <header className="chat-header">
          <div className="header-left">
            <button 
              className="menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <h1 className="chat-title">{currentChat?.title || 'New Chat'}</h1>
          </div>
          
          <div className="header-center">
            <div className="model-badge">
              {modelDisplayName}
            </div>
          </div>
        </header>
        
        {/* Chat Messages */}
        <div className="chat-window">
          {messages.filter(msg => msg.role !== 'system').map((msg, idx) => {
            const isLastMessage = idx === messages.filter(m => m.role !== 'system').length - 1;
            const isStreaming = loading && isLastMessage && msg.role === 'assistant' && !msg.isThinking;
            
            return (
              <div 
                key={msg.id} 
                className={`chat-message ${msg.role} ${msg.isThinking ? 'thinking' : ''}`}
              >
                <div className="message-avatar">
                  {msg.role === 'user' ? (
                    <div className="user-avatar">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                    </div>
                  ) : (
                    <div className="ai-avatar">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 16v-4"></path>
                        <path d="M12 8h.01"></path>
                      </svg>
                    </div>
                  )}
                </div>
                
                <div className="message-content">
                  <div className="message-header">
                    <span className="role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
                    <span className="msg-date">{formatDate(msg.date)}</span>
                  </div>
                  
                  <div className="content">
                    {msg.isThinking ? (
                      <div className="thinking-indicator">
                        Thinking<span className="dots">{thinkingDots}</span>
                      </div>
                    ) : (
                      renderMessageContent(msg.content, isStreaming)
                    )}
                  </div>
                  
                  {msg.role === 'assistant' && !msg.isThinking && (
                    <div className="message-actions">
                      <button 
                        className="action-btn" 
                        title="Copy to clipboard"
                        onClick={() => copyMessageToClipboard(msg.content)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((suggestion, idx) => (
              <button 
                key={idx} 
                className="suggestion-btn" 
                onClick={() => handleSuggestion(suggestion)}
                disabled={loading}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        
        {/* Input Area */}
        <footer className="chat-footer">
          <div className="chat-input-container">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Type a message..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
            />
            
            <button 
              className={`chat-send ${loading || !input.trim() ? 'disabled' : ''}`} 
              onClick={sendMessage} 
              disabled={loading || !input.trim()}
            >
              {loading ? (
                <div className="loading-spinner"></div>
              ) : (
<svg xmlns="http://www.w3.org/2000/svg" width="800px" height="800px" viewBox="-0.5 0 25 25" fill="none">
  <path d="M2.33045 8.38999C0.250452 11.82 9.42048 14.9 9.42048 14.9C9.42048 14.9 12.5005 24.07 15.9305 21.99C19.5705 19.77 23.9305 6.13 21.0505 3.27C18.1705 0.409998 4.55045 4.74999 2.33045 8.38999Z"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15.1999 9.12L9.41992 14.9"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

              )}
            </button>
          </div>
          
          <div className="footer-info">
            <p className="powered-by">Powered by OpenRouter</p>
            <p className="model-info">{modelDisplayName}</p>
          </div>
        </footer>
      </main>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="settings-modal">
            <h2>Settings</h2>
            
            <div className="setting-group">
              <label htmlFor="api-key">OpenRouter API Key</label>
              <div className="api-key-input">
                <input 
                  type="password" 
                  id="api-key" 
                  placeholder="Enter your OpenRouter API key" 
                  defaultValue={apiKey || ''}
                />
                <small className="api-help">
                  Get your API key at{' '}
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                    openrouter.ai/keys
                  </a>
                </small>
              </div>
            </div>
            
            <div className="setting-group">
              <label htmlFor="system-message">System Message</label>
              <div className="system-message-input">
                <textarea 
                  id="system-message" 
                  placeholder="Enter system instructions for the AI" 
                  defaultValue={systemMessage}
                  rows={3}
                />
              </div>
            </div>
            
            <div className="setting-group">
              <label>Model Selection</label>
              <div className="model-selector">
                {modelOptions.map(model => (
                  <button 
                    key={model.id}
                    className={`model-option ${modelSelection === model.id ? 'selected' : ''}`}
                    onClick={() => setModelSelection(model.id)}
                  >
                    {model.name}
                    <span className="model-desc">{model.description}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="modal-actions">
              <button 
                className="secondary-btn" 
                onClick={() => setShowSettings(false)}
              >
                Cancel
              </button>
              <button 
                className="primary-btn" 
                onClick={() => {
                  const inputEl = document.getElementById('api-key') as HTMLInputElement;
                  const systemEl = document.getElementById('system-message') as HTMLTextAreaElement;
                  saveSettings(inputEl.value, systemEl.value, modelSelection);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <h3>Delete Chat</h3>
            <p>Are you sure you want to delete this chat? This action cannot be undone.</p>
            <div className="modal-actions">
              <button 
                className="secondary-btn" 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setChatToDelete(null);
                }}
              >
                Cancel
              </button>
              <button 
                className="danger-btn" 
                onClick={() => {
                  if (chatToDelete) {
                    deleteChat(chatToDelete);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast Notification */}
      {showToast && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;