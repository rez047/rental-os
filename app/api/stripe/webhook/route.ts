import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (event.type === "checkout.session.completed") {
    const session: any = event.data.object;
    await supabase.from("organizations").update({
      stripe_subscription_id: session.subscription,
      plan: "pro",
      subscription_status: "active"
    }).eq("id", session.metadata.org_id);
  }

  if (event.type === "payment_intent.succeeded") {
    const pi: any = event.data.object;
    const chargeId = pi.metadata.charge_id;
    if (chargeId) {
      await supabase.from("payments").update({
        status: "succeeded",
        paid_at: new Date().toISOString(),
        receipt_url: pi.charges.data[0]?.receipt_url
      }).eq("stripe_payment_intent", pi.id);

      const { data: charge } = await supabase.from("rent_charges").select("*").eq("id", chargeId).single();
      if (charge) {
        const newPaid = Number(charge.amount_paid) + Number(pi.amount) / 100;
        await supabase.from("rent_charges").update({
          amount_paid: newPaid,
          status: newPaid >= charge.amount ? "paid" : "partial"
        }).eq("id", chargeId);
      }
    }
  }

  return NextResponse.json({ received: true });
}
