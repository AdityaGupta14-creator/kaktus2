import { NextResponse } from 'next/server';
import { requireAuthenticatedUser, handleAuthError } from '@/lib/server/auth';
import { getPlanConfig } from '@/lib/server/plans';
import { db } from '@/lib/server/firebase-admin';

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { planId } = await req.json();

    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 });
    }

    // Temporarily disable payments
    return NextResponse.json({ 
      error: 'Payments are currently disabled. Please contact the administrator or check back later.' 
    }, { status: 403 });

    const planConfig = getPlanConfig(planId);
    if (!planConfig || planConfig.price <= 0) {
      return NextResponse.json({ error: 'Invalid plan for cashfree payment' }, { status: 400 });
    }

    const amount = planConfig.price;
    const customerId = user.uid.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) || 'guest';
    const orderId = `order_${Date.now()}_${customerId.substring(0, 10)}`;
    
    // Persist local order BEFORE calling Cashfree
    const paymentRef = db.collection('payments').doc(orderId);
    await paymentRef.set({
      id: orderId,
      uid: user.uid,
      email: user.email || null,
      planId: planId,
      txnId: orderId, // Use orderId as txnId for cashfree
      provider: 'cashfree',
      amount: amount,
      currency: 'INR',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    
    const isProd = process.env.CASHFREE_ENV === 'PRODUCTION';
    const endpoint = isProd ? 'https://api.cashfree.com/pg/orders' : 'https://sandbox.cashfree.com/pg/orders';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID || '',
        'x-client-secret': process.env.CASHFREE_SECRET_KEY || '',
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: customerId,
          customer_email: user.email || 'guest@example.com',
          customer_phone: '9999999999',
        },
        order_meta: {
          return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/verify-payment?order_id={order_id}&plan_id=${planId}`
        },
        order_tags: {
          uid: user.uid,
          planId: planId
        }
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Cashfree Create Order Error:', data);
      // Mark local order as failed
      await paymentRef.update({
        status: 'failed',
        failureReason: data.message || 'Cashfree API rejected order'
      });
      throw new Error(data.message || 'Failed to create Cashfree order');
    }

    // Update with Cashfree session if needed
    await paymentRef.update({
      cf_session_id: data.payment_session_id
    });

    return NextResponse.json({
      payment_session_id: data.payment_session_id,
      order_id: data.order_id
    });
  } catch (error: any) {
    if (error.name === 'AuthError') return handleAuthError(error);
    console.error("Cashfree Order API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
