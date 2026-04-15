import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, MessageCircle, Minimize2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { apiClient } from '../App';

const SOPHIE_AVATAR = 'https://images.unsplash.com/photo-1732020858816-93c130ab8f49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwxfHxmdXR1cmlzdGljJTIwYWklMjBmZW1hbGUlMjBhdmF0YXIlMjBwb3J0cmFpdCUyMGFic3RyYWN0JTIwZGlnaXRhbHxlbnwwfHx8fDE3NzMzNDgzNDV8MA&ixlib=rb-4.1.0&q=85&w=100&h=100';

export default function SophieFloating() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm Sophie, your IT expert assistant. I can help with:\n\n• Server & workstation troubleshooting\n• Active Directory & networking\n• PowerShell scripts & automation\n• Security best practices\n• And much more!\n\nHow can I assist you today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setHasUnread(false);
    }
  }, [isOpen]);

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
      if (!isOpen) setHasUnread(true);
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

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center ${
          isOpen ? 'bg-gray-700 hover:bg-gray-600' : 'bg-cyan-500 hover:bg-cyan-600 hover:scale-110'
        }`}
        data-testid="sophie-floating-btn"
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6 text-white" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
            )}
          </>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div 
          className="fixed bottom-24 right-6 z-50 w-96 h-[500px] bg-card border border-border rounded-lg shadow-2xl flex flex-col animate-in slide-in-from-bottom-5"
          data-testid="sophie-chat"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border bg-gradient-to-r from-cyan-900/50 to-transparent rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img 
                  src={SOPHIE_AVATAR} 
                  alt="Sophie"
                  className="w-10 h-10 rounded-full object-cover border-2 border-cyan-400"
                />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-cyan-400 rounded-full border-2 border-card animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-white" style={{ fontFamily: 'Barlow Condensed' }}>SOPHIE</h3>
                <p className="text-xs text-cyan-300">IT Assistant • Online</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/10"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <img 
                      src={SOPHIE_AVATAR} 
                      alt="Sophie"
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    />
                  )}
                  <div
                    className={`max-w-[85%] p-2.5 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-cyan-500 text-white'
                        : 'bg-muted border-l-2 border-cyan-500'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex gap-2">
                  <img 
                    src={SOPHIE_AVATAR} 
                    alt="Sophie"
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <div className="bg-muted p-2.5 rounded-lg border-l-2 border-cyan-500">
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
          <form onSubmit={sendMessage} className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Sophie anything..."
                className="flex-1 bg-background text-sm"
                disabled={loading}
                data-testid="sophie-input"
              />
              <Button 
                type="submit" 
                size="sm"
                disabled={loading || !input.trim()}
                className="bg-cyan-500 hover:bg-cyan-600"
                data-testid="sophie-send"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
