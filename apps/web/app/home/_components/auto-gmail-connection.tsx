'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Loader2, Mail, Calendar } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { Button } from '@kit/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@kit/ui/dialog';

interface AutoGmailConnectionProps {
  accountId: string;
  hasGmailConnected: boolean;
  userEmail?: string;
}

export function AutoGmailConnection({ 
  accountId, 
  hasGmailConnected, 
  userEmail 
}: AutoGmailConnectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  
  // Check if this is a first login or if auto-connection was skipped
  const isFirstLogin = searchParams.get('first_login') === 'true';
  const autoConnectionSkipped = searchParams.get('gmail_skipped') === 'true';

  useEffect(() => {
    // Only auto-connect if:
    // 1. This is a first login OR
    // 2. User doesn't have Gmail connected AND hasn't explicitly skipped it
    const shouldAutoConnect = (isFirstLogin || !hasGmailConnected) && !autoConnectionSkipped;
    
    if (shouldAutoConnect && !isConnecting) {
      // Small delay to ensure page is loaded
      setTimeout(() => {
        setShowDialog(true);
      }, 1000);
    }
  }, [isFirstLogin, hasGmailConnected, autoConnectionSkipped, isConnecting]);

  const handleAutoConnect = async () => {
    setIsConnecting(true);
    
    try {
      toast.info('Setting up Gmail & Calendar integration...');
      
      // Generate Gmail OAuth URL
      const connectResponse = await fetch('/api/auth/gmail/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId }),
      });

      if (connectResponse.ok) {
        const { redirectUrl } = await connectResponse.json();
        if (redirectUrl) {
          // Add a parameter to track this is auto-connection
          const autoConnectUrl = new URL(redirectUrl);
          autoConnectUrl.searchParams.set('auto_connect', 'true');
          
          window.location.href = autoConnectUrl.toString();
          return;
        }
      }

      toast.error('Failed to start Gmail connection');
      setIsConnecting(false);
    } catch (error) {
      console.error('Auto Gmail connection error:', error);
      toast.error('Failed to start Gmail connection');
      setIsConnecting(false);
    }
  };

  const handleSkip = () => {
    setShowDialog(false);
    // Add parameter to prevent showing again during this session
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('gmail_skipped', 'true');
    router.replace(currentUrl.pathname + currentUrl.search);
    
    toast.info('Gmail connection skipped. You can connect later from Settings → Emails');
  };

  if (!showDialog) {
    return null;
  }

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <Calendar className="h-5 w-5 text-green-600" />
            Complete Your Setup
          </DialogTitle>
          <DialogDescription>
            To get the most out of Vellora, let's connect your Gmail and Google Calendar. 
            This enables:
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <span>Automatic email sync with your deals</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-600" />
              <span>Smart meeting scheduling and transcription</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 text-center">🤖</span>
              <span>AI insights from your communications</span>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleAutoConnect}
              disabled={isConnecting}
              className="flex-1"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Connect Gmail & Calendar
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={isConnecting}
            >
              Skip for now
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            You'll be redirected to Google to authorize access. We only read emails 
            and create calendar events - never send emails without your permission.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
} 