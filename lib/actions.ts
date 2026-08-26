"use server";
import { createServerSupabase as createClient, createServiceClient } from "./supabase-server";
import { stripe } from "./stripe";
import { openai } from "./openai";
import { uploadPrivateFile } from "./storage";
import { addMonths, format } from "date-fns";

export async function signUp(email: string, password: string, fullName: string, orgName: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;

  // Use service client to bypass RLS for initial org creation
  const admin = createServiceClient();

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
  
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: orgName, slug })
    .select()
    .single();

  if (orgError) throw orgError;

  await admin.from("org_members").insert({
    org_id: org.id,
    user_id: data.user!.id,
    role: "owner_admin",
    status: "active" // Explicitly set to active so getActiveOrgId works immediately
  });

  try {
    const customer = await stripe.customers.create({
      email,
      name: fullName,
      metadata: { org_id: org.id }
    });
    await admin
      .from("organizations")
      .update({ stripe_customer_id: customer.id })
      .eq("id", org.id);
  } catch (e) {
    console.error("Stripe customer creation skipped or failed:", e);
  }

  return { org };
}

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function createStripeCheckout(orgId: string, priceId: string) {
  const supabase = createClient();
  const { data: org } = await supabase.from("organizations").select("stripe_customer_id").eq("id", orgId).single();

  const session = await stripe.checkout.sessions.create({
    customer: org?.stripe_customer_id || undefined,
    mode: "subscription",
    payment_method_types:["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin?subscribed=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    metadata: { org_id: orgId }
  });

  return session.url;
}

export async function payRent(chargeId: string, amount: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: charge } = await supabase.from("rent_charges").select("*, leases(*)").eq("id", chargeId).single();

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    metadata: { charge_id: chargeId, org_id: charge.org_id, lease_id: charge.lease_id }
  });

  await supabase.from("payments").insert({
    org_id: charge.org_id,
    lease_id: charge.lease_id,
    charge_id: chargeId,
    payer_user_id: user!.id,
    amount,
    stripe_payment_intent: intent.id,
    status: "pending"
  });

  return { clientSecret: intent.client_secret };
}

export async function generateRentSchedule(leaseId: string) {
  const supabase = createClient();
  const { data: lease } = await supabase.from("leases").select("*").eq("id", leaseId).single();

  const start = new Date(lease.start_date);
  const end = new Date(lease.end_date);
  const charges = [];
  let current = new Date(start);

  while (current <= end) {
    charges.push({
      org_id: lease.org_id,
      lease_id: lease.id,
      tenant_user_id: lease.tenant_user_id,
      due_date: format(current, "yyyy-MM-dd"),
      amount: lease.monthly_rent
    });
    current = addMonths(current, 1);
  }

  await supabase.from("rent_charges").insert(charges);
  return { count: charges.length };
}

export async function uploadDocument(file: File, entityType: string, entityId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { path, signedUrl } = await uploadPrivateFile(user!.id, "documents", file);

  const { data } = await supabase.from("documents").insert({
    org_id: (await getActiveOrgId()),
    entity_type: entityType,
    entity_id: entityId,
    uploaded_by: user!.id,
    name: file.name,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size
  }).select().single();

  return data;
}

export async function saveSignature(leaseId: string, signatureDataUrl: string, role: "tenant" | "manager") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Convert data URL to file
  const base64 = signatureDataUrl.split(",")[1];
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  const blob = new Blob([ab], { type: "image/png" });
  const file = new File([blob], `signature-${role}-${Date.now()}.png`, { type: "image/png" });

  const { path, signedUrl } = await uploadPrivateFile(user!.id, "signatures", file);

  const update = role === "tenant"
    ? { signed_by_tenant: true, tenant_signature_url: path }
    : { signed_by_manager: true, manager_signature_url: path };

  await supabase.from("leases").update(update).eq("id", leaseId);
  return { signedUrl };
}

export async function askAI(message: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get context
  const orgId = await getActiveOrgId();
  const { data: properties } = await supabase.from("properties").select("*").eq("org_id", orgId).limit(10);
  const { data: units } = await supabase.from("units").select("*").eq("org_id", orgId).limit(50);

  const context = `You are an AI assistant for a rental management platform. Current portfolio: ${properties?.length || 0} properties, ${units?.length || 0} units. Help with tenant questions, maintenance suggestions, lease advice, and operational insights.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: context },
      { role: "user", content: message }
    ]
  });

  const reply = completion.choices[0].message.content;

  await supabase.from("ai_messages").insert([
    { org_id: orgId, user_id: user!.id, role: "user", content: message },
    { org_id: orgId, user_id: user!.id, role: "assistant", content: reply! }
  ]);

  return reply;
}

export async function inviteMember(email: string, role: string) {
  const supabase = createClient();
  const orgId = await getActiveOrgId();

  // For production: send invite email with magic link
  // For MVP: add placeholder (user joins later via invite flow)
  await supabase.from("org_members").insert({
    org_id: orgId,
    user_id: crypto.randomUUID(), // placeholder
    role,
    status: "invited",
    invite_email: email
  });
}

export async function getActiveOrgId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .single();
    
  if (!membership) throw new Error("No active organization found for user.");
  return membership.org_id;
}

export async function createMaintenanceRequest(data: {
  unitId: string; propertyId: string; title: string; description: string; priority: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await getActiveOrgId();

  await supabase.from("maintenance_requests").insert({
    org_id: orgId,
    unit_id: data.unitId,
    property_id: data.propertyId,
    reporter_user_id: user!.id,
    title: data.title,
    description: data.description,
    priority: data.priority
  });
}

export async function addMaintenancePhoto(requestId: string, file: File) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { path, signedUrl } = await uploadPrivateFile(user!.id, "maintenance", file);

  const { data: existing } = await supabase.from("maintenance_requests").select("photos").eq("id", requestId).single();
  const photos = [...(existing.photos || []), { path, signedUrl, uploaded_at: new Date().toISOString() }];
  await supabase.from("maintenance_requests").update({ photos }).eq("id", requestId);
}
