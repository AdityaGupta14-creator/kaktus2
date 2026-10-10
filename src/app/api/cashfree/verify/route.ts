import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }
    
    const isProd = process.env.CASHFREE_ENV === 'PRODUCTION';
    const endpoint = isProd 
      ? `https://api.cashfree.com/pg/orders/${orderId}` 
      : `https://sandbox.cashfree.com/pg/orders/${orderId}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID || '',
        'x-client-secret': process.env.CASHFREE_SECRET_KEY || '',
        'x-api-version': '2023-08-01',
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Cashfree Verify Order Error:', data);
      throw new Error(data.message || 'Failed to verify Cashfree order');
    }

    // data.order_status will be "PAID" if payment was successful
    return NextResponse.json({
      status: data.order_status,
      amount: data.order_amount,
      currency: data.order_currency,
      customer_id: data.customer_details?.customer_id
    });
  } catch (error: any) {
    console.error("Cashfree Verify API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
