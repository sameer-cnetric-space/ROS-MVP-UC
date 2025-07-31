import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import OpenAI from 'openai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { deduplicatePainPoints, deduplicateNextSteps } from '~/lib/utils/deduplication';

// Lazy initialize OpenAI client to avoid build issues
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY not found. AI analysis will be skipped.');
    return null;
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const formatCurrencyWithSymbol = (amount: number, currency: string = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (error) {
    // Fallback if currency code is invalid
    return `${currency} ${amount.toLocaleString()}`;
  }
};

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServerClient();

    // Get accountId from query parameters
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 },
      );
    }

    // Get the current user from the session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the deal data from the request
    const dealData = await request.json();

    console.log('Creating deal with data:', dealData);

    console.log('\n=== 🔍 DEAL CREATION DEBUG ===');
    console.log('👤 Account ID:', accountId);
    console.log('📧 Email:', dealData.email);
    console.log('🏢 Company:', dealData.companyName);

    // Generate a highly unique deal_id for scale
    const generateScalableDealId = () => {
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString(36);
      const accountHash = accountId.replace(/-/g, '').substring(0, 6);
      const randomPart1 = Math.random().toString(36).substring(2, 6);
      const randomPart2 = Math.random().toString(36).substring(2, 6);
      const companyHash = dealData.companyName
        ? dealData.companyName
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 3)
            .toUpperCase()
        : 'UNK';

      return `DEAL-${year}-${companyHash}-${accountHash}-${randomPart1}-${randomPart2}`;
    };

    let dealId = generateScalableDealId();
    let retryCount = 0;
    const maxRetries = 5;

    console.log('\n=== 🎯 SCALABLE DEAL ID GENERATION ===');
    console.log('🆔 Generated deal_id:', dealId);
    console.log('📏 Length:', dealId.length);

    // Check for uniqueness and retry if needed
    while (retryCount < maxRetries) {
      const { data: existingDeal, error: checkError } = await supabase
        .from('deals')
        .select('deal_id')
        .eq('deal_id', dealId)
        .single();

      if (!existingDeal) {
        console.log('✅ Deal ID is unique!');
        break;
      }

      retryCount++;
      dealId = generateScalableDealId();
      console.log(`🔄 Retry ${retryCount}: Generated new deal_id:`, dealId);
    }

    if (retryCount >= maxRetries) {
      console.error(
        '❌ Failed to generate unique deal_id after',
        maxRetries,
        'attempts',
      );
      return NextResponse.json(
        { error: 'Failed to generate unique deal ID' },
        { status: 500 },
      );
    }

    const dealInsertData = {
      deal_id: dealId,
      account_id: accountId,
      company_name: dealData.companyName,
      industry: dealData.industry || 'Software & Technology',
      value_amount: dealData.dealValue || 0,
      primary_contact: dealData.email?.split('@')[0] || 'Contact',
      primary_email: dealData.email,
      stage: 'interested' as const,
      pain_points: dealData.painPoints ? deduplicatePainPoints(dealData.painPoints) : undefined,
      next_steps: deduplicateNextSteps(dealData.nextSteps || ['Schedule a meeting']),
      company_size: dealData.companySize,
      website: dealData.website,
      next_action: 'Initial outreach to establish contact',
      probability: 10,
      close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      momentum: 0,
      momentum_trend: 'steady' as const,
      relationship_insights: dealData.description || null, // Deal-specific description from user
      created_by: user.id,
      updated_by: user.id,
    };

    console.log('\n=== 💾 DEAL INSERT DEBUG ===');
    console.log(
      '📝 Deal data to insert:',
      JSON.stringify(dealInsertData, null, 2),
    );

    // Insert deal
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert(dealInsertData)
      .select()
      .single();

    if (dealError) {
      console.error('\n=== ❌ DEAL INSERT ERROR ===');
      console.error('Error code:', dealError.code);
      console.error('Error message:', dealError.message);
      console.error('Error details:', dealError.details);
      console.error('Error hint:', dealError.hint);

      return NextResponse.json(
        { error: 'Failed to create deal', details: dealError },
        { status: 500 },
      );
    }

    console.log('\n=== ✅ DEAL CREATED SUCCESSFULLY ===');
    console.log('🎉 Created deal ID:', deal.id);
    console.log('🆔 Auto-generated deal_id:', deal.deal_id);
    console.log('🏢 Company:', deal.company_name);

    // Create the primary contact in deal_contacts table (this is what the contacts API reads)
    const contactName = dealData.email?.split('@')[0] || 'Contact';
    const { data: dealContact, error: dealContactError } = await supabase
      .from('deal_contacts')
      .insert({
        deal_id: deal.id,
        name: contactName,
        email: dealData.email,
        role: 'Primary Contact',
        is_primary: true,
        is_decision_maker: true,
      })
      .select()
      .single();

    if (dealContactError) {
      console.error('❌ Error creating deal contact:', dealContactError);
    } else {
      console.log('✅ Successfully created deal contact:', dealContact);
    }

    // Also create in the general contacts table for future reference
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        account_id: accountId,
        name: contactName,
        email: dealData.email,
        role: 'Primary Contact',
        is_decision_maker: true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (contactError) {
      console.error('⚠️ Warning: Error creating general contact:', contactError);
      // This is not critical - the deal_contacts entry is what matters for the UI
    } else {
      console.log('✅ Successfully created general contact:', contact);
    }

    // Generate company description from domain/website
    console.log('\n=== 🌐 GENERATING COMPANY DESCRIPTION FROM DOMAIN ===');
    let companySummary = null;

    try {
      // Determine the website URL to use
      let websiteUrl = dealData.website;
      
      // If no website provided, try to extract domain from email
      if (!websiteUrl && dealData.email) {
        const emailDomain = dealData.email.split('@')[1];
        if (emailDomain && !emailDomain.includes('gmail.com') && !emailDomain.includes('yahoo.com') && !emailDomain.includes('outlook.com') && !emailDomain.includes('hotmail.com')) {
          websiteUrl = `https://${emailDomain}`;
          console.log('📧 Extracted domain from email:', websiteUrl);
        }
      }

      if (websiteUrl && dealData.companyName) {
        console.log('🌐 Fetching company info from domain:', websiteUrl);
        
        // Import CompanyInfoService dynamically to avoid import issues
        const { CompanyInfoService } = await import('~/lib/services/companyInfoService');
        
        // Use the CompanyInfoService to get detailed company information
        const companyInfo = await CompanyInfoService.fetchCompanyInfo(websiteUrl);
        
        if (companyInfo && companyInfo.summary) {
          companySummary = companyInfo.summary;
          console.log('✅ Company description generated from domain:', companySummary.substring(0, 100) + '...');
          
          // Update deal with company description in the dedicated field
          const { error: updateError } = await supabase
            .from('deals')
            .update({ 
              company_description: companySummary
            })
            .eq('id', deal.id);

          if (updateError) {
            console.error('❌ Error updating deal with company description:', updateError);
          } else {
            console.log('✅ Updated deal with AI-generated company description');
          }
        }
      } else {
        console.log('⚠️ No website/domain available or company name missing, skipping company description');
      }
    } catch (error) {
      console.error('❌ Error generating company description:', error);
      console.log('🔄 Falling back to basic company summary generation...');
      
      // Fallback to basic company summary if domain lookup fails
      try {
        const openai = getOpenAIClient();
        if (openai && dealData.companyName) {
          console.log('🤖 Generating basic company summary for:', dealData.companyName);

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a business intelligence analyst. Generate a brief, professional summary about a company for sales context. Focus on their business model, industry position, and potential pain points that a sales team should know. Keep it concise (2-3 sentences) and professional.',
              },
              {
                role: 'user',
                content: `Generate a brief business summary for a company called "${dealData.companyName}"${dealData.industry ? ` in the ${dealData.industry} industry` : ''}. Focus on what a sales team should know about this company - their business model, market position, and potential needs.`,
              },
            ],
            temperature: 0.3,
            max_tokens: 200,
          });

          companySummary = completion.choices[0]?.message?.content || '';
          
          if (companySummary) {
            console.log('✅ Fallback company summary generated:', companySummary.substring(0, 100) + '...');
            
            // Update deal with company summary in the dedicated field
            const { error: updateError } = await supabase
              .from('deals')
              .update({ 
                company_description: companySummary
              })
              .eq('id', deal.id);

            if (updateError) {
              console.error('❌ Error updating deal with fallback company summary:', updateError);
            } else {
              console.log('✅ Updated deal with fallback AI-generated company summary');
            }
          }
        }
      } catch (fallbackError) {
        console.error('❌ Fallback company summary generation also failed:', fallbackError);
      }
    }

    // Enhanced Feature: Fetch emails from primary contact and analyze with AI
    console.log('\n=== 📧 FETCHING EMAILS FROM PRIMARY CONTACT ===');
    let emailAnalysisResult = null;

    if (dealData.email) {
      try {
        // Fetch emails from or to the primary contact
        const { data: contactEmails, error: emailError } = await supabase
          .from('emails')
          .select('*')
          .eq('account_id', accountId)
          .or(`from_email.eq.${dealData.email},to_email.eq.${dealData.email}`)
          .order('received_at', { ascending: false })
          .limit(10);

        if (emailError) {
          console.log('⚠️ Error fetching emails:', emailError.message);
        } else if (contactEmails && contactEmails.length > 0) {
          console.log(
            `✅ Found ${contactEmails.length} emails with contact: ${dealData.email}`,
          );

          // Add emails as activities
          const emailActivities = contactEmails.map((email) => ({
            deal_id: deal.id,
            activity_type: 'email',
            title: `Email: ${email.subject || 'No Subject'}`,
            description: `${email.from_email === dealData.email ? 'Received' : 'Sent'} email from ${email.from_email} - ${email.subject || 'No Subject'}. ${email.body_text ? email.body_text.substring(0, 200) + '...' : ''}`,
            created_by: user.id,
            created_at: email.received_at,
          }));

          // Insert email activities
          const { error: activityError } = await supabase
            .from('deal_activities')
            .insert(emailActivities);

          if (activityError) {
            console.log(
              '⚠️ Error adding email activities:',
              activityError.message,
            );
          } else {
            console.log(
              `✅ Added ${emailActivities.length} email activities to deal`,
            );
          }

          // Analyze the latest email with OpenAI
          const latestEmail = contactEmails[0];
          if (
            latestEmail &&
            latestEmail.body_text &&
            process.env.OPENAI_API_KEY
          ) {
                console.log('🤖 Analyzing latest email with OpenAI...');

    try {
      const openai = getOpenAIClient();
      if (!openai) {
        console.log('🤖 OpenAI not available, skipping AI analysis');
        return NextResponse.json(deal, { status: 201 });
      }

      // Prepare email data for analysis
      const emailData = `From: ${latestEmail.from_email}
To: ${latestEmail.to_email}
Subject: ${latestEmail.subject || 'No Subject'}
Date: ${latestEmail.received_at}

Email Content:
${latestEmail.body_text.substring(0, 2000)} ${latestEmail.body_text.length > 2000 ? '...' : ''}`;

      const response = await (openai as any).responses.create({
        prompt: {
          id: "pmpt_6852f45360988195b074e18597a095870ecc8b94e1186b24",
          version: "3"
        },
        input: [],
        text: {
          format: {
            type: "text"
          }
        },
        reasoning: {},
        max_output_tokens: 500,
        store: true
      });

      const analysis = response.text || '';

              if (analysis) {
                console.log('✅ Email analysis complete');

                // Update deal with email analysis in relationship_insights
                const { error: updateError } = await supabase
                  .from('deals')
                  .update({
                    relationship_insights: analysis,
                    last_analysis_date: new Date().toISOString(),
                    updated_by: user.id,
                  })
                  .eq('id', deal.id);

                if (updateError) {
                  console.log(
                    '⚠️ Error storing email analysis:',
                    updateError.message,
                  );
                } else {
                  console.log(
                    '✅ Email analysis stored in deal relationship_insights',
                  );
                  emailAnalysisResult = analysis;
                }
              }
            } catch (aiError) {
              console.log(
                '⚠️ Error analyzing email with OpenAI:',
                aiError instanceof Error ? aiError.message : 'Unknown error',
              );
            }
          }
        } else {
          console.log('📭 No emails found for contact:', dealData.email);
        }
      } catch (error) {
        console.log(
          '⚠️ Error in email processing:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }

    // Trigger momentum scoring in the background for new deals (don't wait for it)
    if (deal?.id && accountId) {
      // Get the current URL to determine the correct port
      const currentUrl = new URL(request.url);
      const baseUrl = `${currentUrl.protocol}//${currentUrl.host}`;
      
      fetch(`${baseUrl}/api/momentum-scoring`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('Cookie') || '',
        },
        body: JSON.stringify({ dealId: deal.id, accountId })
      }).catch(error => {
        console.error('❌ Background momentum scoring failed for new deal:', error);
        console.error('❌ Attempted URL:', `${baseUrl}/api/momentum-scoring`);
      });
      console.log('🎯 Background momentum scoring triggered for new deal:', deal.company_name);
      console.log('🎯 Using URL:', `${baseUrl}/api/momentum-scoring`);
    }

    return NextResponse.json({
      success: true,
      deal,
      contact,
      emailAnalysis: emailAnalysisResult,
    });
  } catch (error) {
    console.error('Error in POST /api/deals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServerClient();

    // Get accountId from query parameters
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 },
      );
    }

    console.log('🔍 GET /api/deals - Starting...');

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('❌ Authentication failed:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('✅ User authenticated:', user.email, 'Account ID:', accountId);

    // Fetch deals for the current account
    console.log('🔍 Fetching deals for account_id:', accountId);

    const { data: deals, error } = await supabase
      .from('deals')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching deals:', error);
      return NextResponse.json(
        {
          error: 'Failed to fetch deals',
          details: error.message,
          code: error.code,
        },
        { status: 500 },
      );
    }

    // Transform database fields to match frontend interface
    const transformedDeals =
      deals?.map((deal) => ({
        id: deal.id,
        companyName: deal.company_name,
        industry: deal.industry,
        value: formatCurrencyWithSymbol(
          deal.value_amount || 0,
          deal.value_currency || 'USD',
        ),
        // contact: deal.primary_contact || 'Contact',
        contact: {
          name: deal.primary_contact || 'Contact',
          email: deal.primary_email || '',
          role: 'Primary Contact',
          isDecisionMaker: false, // Only set to true when confirmed through conversations/analysis
        },
        email: deal.primary_email,
        stage: deal.stage,
        source: deal.source || 'Unknown',
        createdAt: deal.created_at,
        closeDate: deal.close_date,
        probability: deal.probability,
        painPoints: deal.pain_points,
        nextSteps: deal.next_steps,
        companySize: deal.company_size,
        website: deal.website,
        dealTitle: deal.deal_title,
        nextAction: deal.next_action,
        relationshipInsights: deal.relationship_insights,
        description: deal.relationship_insights,
        companyDescription: deal.company_description,
        last_meeting_summary: deal.last_meeting_summary,
        momentum: deal.momentum || 0,
        momentumTrend: deal.momentum_trend || 'steady',
        momentumMarkers: [],
        lastMomentumChange: deal.last_momentum_change,
        blockers: deal.blockers,
        opportunities: deal.opportunities,
        // AI analysis fields
        greenFlags: deal.green_flags,
        redFlags: deal.red_flags,
        organizationalContext: deal.organizational_context,
        competitorMentions: deal.competitor_mentions,
        sentimentEngagement: deal.sentiment_engagement,
        lastAnalysisDate: deal.last_analysis_date,
        aiAnalysisRaw: deal.ai_analysis_raw,
      })) || [];

    return NextResponse.json(transformedDeals);
  } catch (error) {
    console.error('Error in GET /api/deals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
