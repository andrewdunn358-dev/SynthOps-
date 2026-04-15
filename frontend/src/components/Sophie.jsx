import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { apiClient } from '../App';

const SOPHIE_AVATAR = 'https://images.unsplash.com/photo-1732020858816-93c130ab8f49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwxfHxmdXR1cmlzdGljJTIwYWklMjBmZW1hbGUlMjBhdmF0YXIlMjBwb3J0cmFpdCUyMGFic3RyYWN0JTIwZGlnaXRhbHxlbnwwfHx8fDE3NzMzNDgzNDV8MA&ixlib=rb-4.1.0&q=85&w=100&h=100';

export default function Sophie({ open, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm Sophie, your IT assistant. I can help with troubleshooting, best practices, and answer questions about your documentation. How can I assist you today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await apiClient.post('/sophie/chat', {
        message: userMessage,
        session_id: sessionId
      });
      
      setSessionId(response.data.session_id);
      setMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
    } catch (error) {
      console.error('Sophie error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Chat window */}
      <div className="relative w-full max-w-lg h-[600px] bg-card border border-border rounded-sm shadow-2xl flex flex-col animate-in" data-testid="sophie-chat">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src={SOPHIE_AVATAR} 
                alt="Sophie"
                className="w-10 h-10 rounded-full object-cover"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-cyan-400 rounded-full border-2 border-card animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold" style={{ fontFamily: 'Barlow Condensed' }}>SOPHIE</h3>
              <p className="text-xs text-muted-foreground">IT Assistant</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="sophie-close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 chat-message ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <img 
                    src={SOPHIE_AVATAR} 
                    alt="Sophie"
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                )}
                <div
                  className={`max-w-[80%] p-3 rounded-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary border-l-2 border-cyan-500'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-3">
                <img 
                  src={SOPHIE_AVATAR} 
                  alt="Sophie"
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div className="bg-secondary p-3 rounded-sm border-l-2 border-cyan-500">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sophie anything..."
              className="flex-1 bg-background"
              disabled={loading}
              data-testid="sophie-input"
            />
            <Button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="bg-cyan-500 hover:bg-cyan-600"
              data-testid="sophie-send"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
