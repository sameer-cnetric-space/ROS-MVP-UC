import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export async function DELETE(request: Request) {
  try {
    // Get account ID from query parameters
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify account access
    const { data: membership } = await supabase
      .from('accounts_memberships')
      .select('account_role')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to this account' },
        { status: 403 },
      );
    }

    const { dealId, contactId } = await request.json();

    if (!dealId || !contactId) {
      return NextResponse.json(
        { error: 'Deal ID and Contact ID are required' },
        { status: 400 },
      );
    }

    // First verify the deal belongs to this account
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id')
      .eq('id', dealId)
      .eq('account_id', accountId)
      .single();

    if (dealError || !deal) {
      return NextResponse.json(
        { error: 'Deal not found or access denied' },
        { status: 404 },
      );
    }

    // Delete the deal-contact relationship
    const { error: deleteError } = await supabase
      .from('deal_contacts')
      .delete()
      .eq('deal_id', dealId)
      .eq('contact_id', contactId);

    if (deleteError) {
      console.error('Error removing contact from deal:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove contact from deal' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Contact removed from deal successfully',
    });
  } catch (error) {
    console.error('Error in DELETE /api/deals/delete-contact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
