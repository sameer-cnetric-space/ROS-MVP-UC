'use client';

import { useEffect, useRef, useState } from 'react';

import { Loader2, Send } from 'lucide-react';
import { Bot, User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { cn } from '@kit/ui/utils';

// import { useToast } from '@kit/ui/use-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface DealFormData {
  companyName?: string;
  industry?: string;
  valueAmount?: string;
  valueCurrency?: string;
  contactName?: string;
  contactEmail?: string;
  companySummary?: string;
}

interface NewDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDealCreated: (deal: any) => Promise<void>;
}

export default function NewDealModal({
  isOpen,
  onClose,
  onDealCreated,
}: NewDealModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dealData, setDealData] = useState<DealFormData>({});
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [messageIdCounter, setMessageIdCounter] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // const { toast } = useToast();

  // Generate unique message ID
  const generateMessageId = () => {
    const newCounter = messageIdCounter + 1;
    setMessageIdCounter(newCounter);
    return `msg-${Date.now()}-${newCounter}-${Math.random().toString(36).substr(2, 5)}`;
  };

  // Auto-scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && !isProcessing) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isProcessing]);

  // Initialize conversation when modal opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const initialMessage = {
        id: generateMessageId(),
        role: 'assistant' as const,
        content:
          "I'll help you create a new deal quickly! I just need 5 pieces of information:\n\n• Company Name\n• Industry\n• Deal Value (in USD)\n• Contact Name\n• Contact Email\n\nLet's start - what's the company name?",
        timestamp: new Date(),
      };
      setMessages([initialMessage]);
      setCurrentQuestion('companyName');
      setDealData({});
    }
  }, [isOpen, messages.length, generateMessageId]);

  const getNextQuestion = (
    data: DealFormData,
  ): { question: string; field: string } | null => {
    if (!data.companyName) {
      return { question: "What's the company name?", field: 'companyName' };
    }
    if (!data.industry) {
      return {
        question:
          'What industry are they in? (e.g., Technology, Healthcare, Finance, etc.)',
        field: 'industry',
      };
    }
    if (!data.valueAmount) {
      return {
        question:
          "What's the deal value amount in USD? (just the number, e.g., 50000)",
        field: 'valueAmount',
      };
    }
    if (!data.contactName) {
      return {
        question: "What's the main contact person's name?",
        field: 'contactName',
      };
    }
    if (!data.contactEmail) {
      return { question: "What's their email address?", field: 'contactEmail' };
    }
    return null;
  };

  const fetchCompanySummary = async (
    companyName: string,
  ): Promise<string | null> => {
    try {
      // Simple company info API call (you could use Clearbit, Apollo, or similar services)
      const response = await fetch(
        `/api/company-info?company=${encodeURIComponent(companyName)}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.summary) {
          return data.summary;
        }
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
    return null;
  };

  const extractInfoFromMessage = (
    message: string,
    field: string,
  ): string | null => {
    const cleaned = message.trim();

    if (field === 'contactEmail') {
      const emailMatch = cleaned.match(/[\w.-]+@[\w.-]+\.\w+/);
      return emailMatch ? emailMatch[0] : cleaned;
    }

    if (field === 'valueAmount') {
      // Extract numbers, handle k/K for thousands, m/M for millions
      const numberMatch = cleaned.match(
        /(\d+(?:,\d{3})*(?:\.\d+)?)\s*([kKmM])?/,
      );
      if (numberMatch && numberMatch[1]) {
        let value = parseFloat(numberMatch[1].replace(/,/g, ''));
        const suffix = numberMatch[2]?.toLowerCase();
        if (suffix === 'k') value *= 1000;
        if (suffix === 'm') value *= 1000000;
        return value.toString();
      }
      // If just a number
      const simpleNumber = cleaned.match(/^\d+(?:,\d{3})*(?:\.\d+)?$/);
      if (simpleNumber) {
        return cleaned.replace(/,/g, '');
      }
      // If no valid number found, return null instead of the raw text
      return null;
    }

    if (field === 'valueCurrency') {
      const currencyMatch = cleaned.match(
        /\b(USD|EUR|GBP|CAD|AUD|JPY|CHF|SEK|NOK|DKK)\b/i,
      );
      return currencyMatch && currencyMatch[1]
        ? currencyMatch[1].toUpperCase()
        : cleaned.toUpperCase();
    }



    return cleaned;
  };

  const isValidData = (data: DealFormData): boolean => {
    return !!(
      data.companyName &&
      data.industry &&
      data.valueAmount &&
      !isNaN(Number(data.valueAmount)) && // Ensure valueAmount is a valid number
      data.contactName &&
      data.contactEmail &&
      /^[\w.-]+@[\w.-]+\.\w+$/.test(data.contactEmail)
    );
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsProcessing(true);

    try {
      // Extract information from user input
      const updatedDealData = { ...dealData };
      const extractedInfo = extractInfoFromMessage(
        currentInput,
        currentQuestion,
      );

      if (extractedInfo && currentQuestion) {
        updatedDealData[currentQuestion as keyof DealFormData] = extractedInfo;

        // Automatically set currency to USD when value amount is provided
        if (currentQuestion === 'valueAmount') {
          updatedDealData.valueCurrency = 'USD';
        }
      }

      setDealData(updatedDealData);

      // Check if we have all required data
      if (isValidData(updatedDealData)) {
        // Create the deal with the structure expected by the API
        const finalDeal = {
          companyName: updatedDealData.companyName!,
          industry: updatedDealData.industry!,
          dealValue: Number(updatedDealData.valueAmount!), // Send as number, not formatted string
          currency: updatedDealData.valueCurrency || 'USD',
          email: updatedDealData.contactEmail!,
          // Optional fields that might be useful
          contactName: updatedDealData.contactName!,
          stage: 'interested',
          // No user description during creation - can be added later
          description: null,
          // Keep company summary separate for AI context
          companySummary: updatedDealData.companySummary,
        };

        const aiMessage: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: `Perfect! ✅ I have all the information needed:\n\n📊 ${finalDeal.companyName}\n🏭 Industry: ${finalDeal.industry}\n💰 Value: ${finalDeal.dealValue}\n👤 Contact: ${finalDeal.contactName}\n📧 Email: ${finalDeal.email}\n\nCreating your deal now...`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);

        // Create the deal via parent component (which handles API call and state update)
        setTimeout(async () => {
          try {
            await onDealCreated(finalDeal);
            setTimeout(() => onClose(), 1500);
          } catch (error) {
            console.error('Error creating deal:', error);
          }
        }, 1000);
      } else {
        // Ask the next question
        const nextQ = getNextQuestion(updatedDealData);
        if (nextQ) {
          setCurrentQuestion(nextQ.field);

          // If we just got the company name, fetch company summary
          if (
            currentQuestion === 'companyName' &&
            updatedDealData.companyName
          ) {
            // Show "looking up company" message first
            const lookupMessage: Message = {
              id: generateMessageId(),
              role: 'assistant',
              content: `Perfect! I'm looking up information about ${updatedDealData.companyName}...`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, lookupMessage]);

            // Fetch company summary
            try {
              const companySummary = await fetchCompanySummary(
                updatedDealData.companyName,
              );

              // Store the company summary in deal data
              if (companySummary) {
                updatedDealData.companySummary = companySummary;
                setDealData(updatedDealData);
              }

              const aiMessage: Message = {
                id: generateMessageId(),
                role: 'assistant',
                content: companySummary
                  ? `Great! Here's what I found about ${updatedDealData.companyName}:\n\n📋 ${companySummary}\n\n${nextQ.question}`
                  : `Got it! ${nextQ.question}`,
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, aiMessage]);
            } catch (error) {
              console.error('Error fetching company summary:', error);
              const aiMessage: Message = {
                id: generateMessageId(),
                role: 'assistant',
                content: `Got it! ${nextQ.question}`,
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, aiMessage]);
            }
          } else {
            // Regular question flow
            const aiMessage: Message = {
              id: generateMessageId(),
              role: 'assistant',
              content: `Got it! ${nextQ.question}`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, aiMessage]);
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }

    setIsProcessing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClose = () => {
    setMessages([]);
    setInput('');
    setDealData({});
    setCurrentQuestion('');
    setMessageIdCounter(0);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="!fixed !inset-0 !m-0 !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 !transform-none overflow-hidden !rounded-none border-none bg-black/95 p-0"
        style={{
          position: 'fixed',
          top: '0px',
          left: '0px',
          right: '0px',
          bottom: '0px',
          width: '100vw',
          height: '100vh',
          maxWidth: 'none',
          maxHeight: 'none',
          transform: 'none',
          margin: '0px',
          padding: '0px',
        }}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5">
          <DialogTitle className="font-monument text-lg text-white sm:text-xl md:text-2xl">
            Create New Deal
          </DialogTitle>
        </DialogHeader>

        {/* Main Content */}
        <div className="flex h-[calc(100vh-60px)] flex-col sm:h-[calc(100vh-68px)] md:h-[calc(100vh-80px)]">
          {/* Chat Messages - Scrollable Area */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3 p-4 sm:space-y-4 sm:p-6 md:p-8">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3 sm:gap-4',
                    message.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {message.role === 'assistant' && (
                    <Avatar className="bg-designer-violet/20 h-8 w-8 shrink-0 sm:h-10 sm:w-10">
                      <AvatarFallback>
                        <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg p-3 text-sm sm:max-w-[70%] sm:text-base md:p-4',
                      message.role === 'assistant'
                        ? 'glassmorphism text-white'
                        : 'bg-designer-violet/20 border-designer-violet/30 border text-white',
                    )}
                  >
                    <div className="leading-relaxed break-words whitespace-pre-wrap">
                      {message.content}
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <Avatar className="bg-designer-blue/20 h-8 w-8 shrink-0 sm:h-10 sm:w-10">
                      <AvatarFallback>
                        <User className="h-4 w-4 sm:h-5 sm:w-5" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area - Fixed at bottom */}
          <div className="flex-shrink-0 border-t border-white/10 bg-black/50 backdrop-blur-sm">
            {/* Deal Data Summary */}
            {Object.keys(dealData).length > 0 && (
              <div className="mx-4 mt-3 mb-3 rounded-lg bg-white/5 p-3 sm:mx-6 sm:p-4 md:mx-8">
                <p className="mb-2 text-sm text-white/60">
                  Collected Information:
                </p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {dealData.companyName && (
                    <span className="bg-designer-violet/20 text-designer-violet rounded px-2 py-1">
                      Company: {dealData.companyName}
                    </span>
                  )}
                  {dealData.industry && (
                    <span className="rounded bg-blue-500/20 px-2 py-1 text-blue-400">
                      Industry: {dealData.industry}
                    </span>
                  )}
                  {dealData.valueAmount && (
                    <span className="rounded bg-green-500/20 px-2 py-1 text-green-400">
                      Value: USD {dealData.valueAmount}
                    </span>
                  )}
                  {dealData.contactName && (
                    <span className="rounded bg-yellow-500/20 px-2 py-1 text-yellow-400">
                      Contact: {dealData.contactName}
                    </span>
                  )}
                  {dealData.contactEmail && (
                    <span className="rounded bg-purple-500/20 px-2 py-1 text-purple-400">
                      Email: {dealData.contactEmail}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Input Field */}
            <div className="p-4 sm:p-6 md:p-8">
              <div className="flex gap-3">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your response..."
                  disabled={isProcessing}
                  className="focus-visible:ring-designer-violet/50 flex-1 border-white/10 bg-black/40 text-sm sm:text-base"
                  style={{
                    minHeight: '44px',
                    maxHeight: '44px',
                    height: '44px',
                    resize: 'none',
                    overflow: 'hidden',
                  }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isProcessing}
                  className="bg-designer-violet hover:bg-designer-violet/90 px-4 sm:px-6"
                  style={{
                    minHeight: '44px',
                    height: '44px',
                  }}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" />
                  ) : (
                    <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
