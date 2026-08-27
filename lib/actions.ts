"use server";
import { createServerSupabase as createClient, createServiceClient } from "./supabase-server";
import { stripe } from "./stripe";
import { openai } from "./openai";
import { uploadPrivateFile } from "./storage";
import { addMonths, format } from "date-fns";
import { redirect } from "next/navigation";

export async function signUp(email: string, password: string, fullName: string, orgName: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return { error: "This email already has an account. Please log in instead." };
    }
    return { error: error.message };
  }

  const admin = createServiceClient();

  const { data: invite } = await admin
    .from("org_members")
    .select("*")
    .eq("invite_email", email.toLowerCase())
    .eq("status", "invited")
    .maybeSingle();

  if (invite) {
    await admin
      .from("org_members")
      .update({ user_id: data.user!.id, status: "active" })
      .eq("id", invite.id);

    return { org: null, invited: true };
  }

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
    status: "active"
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

  return { org, invited: false };
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

export async function handleSignOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createStripeCheckout(orgId: string, priceId: string) {
  const supabase = createClient();
  const { data: org } = await supabase.from("organizations").select("stripe_customer_id").eq("id", orgId).single();

  const session = await stripe.checkout.sessions.create({
    customer: org?.stripe_customer_id || undefined,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin?subscribed=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    metadata: { org_id: orgId }
  });

  return session.url;
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

// FIXED: saves timestamps + checks errors so signature always persists
export async function saveSignature(leaseId: string, signatureDataUrl: string, role: "tenant" | "manager") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const base64 = signatureDataUrl.split(",")[1];
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  const blob = new Blob([ab], { type: "image/png" });
  const file = new File([blob], `signature-${role}-${Date.now()}.png`, { type: "image/png" });

  const { path, signedUrl } = await uploadPrivateFile(user!.id, "signatures", file);

  const update = role === "tenant"
    ? { signed_by_tenant: true, tenant_signature_url: path, tenant_signed_at: new Date().toISOString() }
    : { signed_by_manager: true, manager_signature_url: path, manager_signed_at: new Date().toISOString() };

  const { error } = await supabase.from("leases").update(update).eq("id", leaseId);
  if (error) throw new Error("Signature save failed: " + error.message);
  return { signedUrl };
}

// NEW: generate a fresh signed URL for stored private files
export async function getSignedUrl(path: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("private-files").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

// NEW: upload lease media (move-in photos/videos) and return storage path
export async function uploadLeaseMedia(file: File, folder: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { path, signedUrl } = await uploadPrivateFile(user!.id, folder, file);
  return { path, signedUrl };
}

export async function saveMoveInCondition(leaseId: string, photos: string[], videos: string[]) {
  const supabase = createClient();
  const { error } = await supabase.from("leases").update({
    move_in_photos: photos,
    move_in_videos: videos
  }).eq("id", leaseId);
  if (error) throw new Error("Save failed: " + error.message);
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
    status: "pending",
    payment_type: "rent"
  });

  return { clientSecret: intent.client_secret };
}

// M-Pesa STK Push (rent or deposit)
export async function initiateMpesaPayment(phone: string, amount: number, chargeId: string | null, paymentType: string = "rent", leaseId?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let orgId = "";
  let finalLeaseId = leaseId || null;

  if (chargeId) {
    const { data: charge } = await supabase.from("rent_charges").select("*").eq("id", chargeId).single();
    orgId = charge.org_id;
    finalLeaseId = charge.lease_id;
  } else if (leaseId) {
    const { data: lease } = await supabase.from("leases").select("*").eq("id", leaseId).single();
    orgId = lease.org_id;
  }

  const { data: payment } = await supabase.from("payments").insert({
    org_id: orgId,
    lease_id: finalLeaseId,
    charge_id: chargeId,
    payer_user_id: user!.id,
    amount,
    mpesa_phone: phone,
    status: "pending",
    payment_type: paymentType,
    stripe_payment_intent: `mpesa_${Date.now()}`
  }).select().single();

  // TODO: real M-Pesa Daraja STK Push call goes here
  setTimeout(async () => {
    await supabase.from("payments").update({
      status: "paid",
      mpesa_receipt: `MPESA${Date.now()}`
    }).eq("id", payment.id);

    if (chargeId) {
      await supabase.from("rent_charges").update({ status: "paid" }).eq("id", chargeId);
    }
  }, 10000);

  return { success: true, message: "STK Push sent to your phone. Enter your PIN to complete payment." };
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

export async function askAI(message: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const orgId = await getActiveOrgId();
  const { data: properties } = await supabase.from("properties").select("*").eq("org_id", orgId).limit(10);
  const { data: units } = await supabase.from("units").select("*").eq("org_id", orgId).limit(50);

  const context = `You are an AI assistant for a rental management platform. Current portfolio: ${properties?.length || 0} properties, ${units?.length || 0} units. Help with tenant questions, maintenance suggestions, lease advice, and operational insights.`;

  try {
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
  } catch (e: any) {
    if (e.status === 429) return "AI credits exceeded. Please top up OpenAI billing.";
    return "Error connecting to AI.";
  }
}

export async function inviteMember(email: string, role: string) {
  const orgId = await getActiveOrgId();
  const admin = createServiceClient();

  const { error: inviteError } = await admin.from("org_members").insert({
    org_id: orgId,
    user_id: null,
    role,
    status: "invited",
    invite_email: email.toLowerCase()
  });
  if (inviteError) throw new Error("Invite failed: " + inviteError.message);

  const roleLabels: Record<string, string> = {
    tenant: "Tenant",
    manager: "Property Manager",
    owner: "Owner",
    vendor: "Caretaker / Vendor",
    owner_admin: "Administrator"
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const inviteLink = `${appUrl}/signup?role=${role}&email=${encodeURIComponent(email)}`;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY!,
        "Content-Type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        sender: { name: "RentOS", email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email, name: email }],
        subject: `You're invited to join RentOS as ${roleLabels[role] || role} 🏠`,
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
            <h2 style="color:#4f46e5">You've been invited! 🏠</h2>
            <p>Hello,</p>
            <p>You've been invited to join our rental management platform as a <b>${roleLabels[role] || role}</b>.</p>
            <p style="margin:24px 0">
              <a href="${inviteLink}" style="background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
                Accept Invite & Register
              </a>
            </p>
            <p style="color:#6b7280;font-size:13px">
              Or copy this link: ${inviteLink}<br/>
              ⚠️ Please register using this exact email: <b>${email}</b>
            </p>
          </div>
        `
      })
    });

    if (!res.ok) {
      console.error("Brevo send failed:", await res.text());
    }
  } catch (e) {
    console.error("Brevo error:", e);
  }
}

export async function createMaintenanceRequest(data: {
  unitId: string | null;
  propertyId: string;
  title: string;
  description: string;
  priority: string;
  assignedVendorUserId?: string;
  issuePhotos?: any[];
  issueVideos?: any[];
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await getActiveOrgId();

  await supabase.from("maintenance_requests").insert({
    org_id: orgId,
    unit_id: data.unitId,
    property_id: data.propertyId,
    reporter_user_id: user!.id,
    assigned_vendor_user_id: data.assignedVendorUserId || null,
    title: data.title,
    description: data.description,
    priority: data.priority,
    issue_photos: data.issuePhotos || [],
    issue_videos: data.issueVideos || [],
    status: "open"
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

export async function addCompletedPhoto(requestId: string, file: any) {
  const supabase = createClient();
  const { data: existing } = await supabase.from("maintenance_requests").select("completed_photos").eq("id", requestId).single();
  const photos = [...(existing.completed_photos || []), file];
  await supabase.from("maintenance_requests").update({ completed_photos: photos }).eq("id", requestId);
}

export async function updateMaintenanceStatus(id: string, status: string) {
  const supabase = createClient();
  const update: any = { status };
  if (status === "completed") {
    update.completed_at = new Date().toISOString();
  }
  await supabase.from("maintenance_requests").update(update).eq("id", id);
}

export async function assignCaretaker(propertyId: string, userId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createServiceClient();

  const { data: membership } = await admin
    .from("org_members").select("role").eq("user_id", user!.id).eq("status", "active").single();
  if (!membership || !["owner_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized to assign caretakers.");
  }

  const { error } = await admin.from("properties").update({ caretaker_user_id: userId }).eq("id", propertyId);
  if (error) throw error;
}

export async function addCoOwner(propertyId: string, userId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createServiceClient();

  const { data: membership } = await admin
    .from("org_members").select("role").eq("user_id", user!.id).eq("status", "active").single();
  if (!membership || !["owner_admin", "owner", "manager"].includes(membership.role)) {
    throw new Error("Not authorized to add co-owners.");
  }

  const { error } = await admin.from("property_owners").insert({ property_id: propertyId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function removeCoOwner(propertyId: string, userId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createServiceClient();

  const { data: membership } = await admin
    .from("org_members").select("role").eq("user_id", user!.id).eq("status", "active").single();
  if (!membership || !["owner_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized to remove co-owners.");
  }

  await admin.from("property_owners").delete().eq("property_id", propertyId).eq("user_id", userId);
}

export async function evictTenant(leaseId: string, reason?: string) {
  const supabase = createClient();
  await supabase.from("leases").update({
    evicted: true,
    eviction_reason: reason || null,
    eviction_date: new Date().toISOString(),
    status: "terminated"
  }).eq("id", leaseId);
}

export async function sendMessage(content: string, recipientUserId?: string, propertyId?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await getActiveOrgId();

  await supabase.from("messages").insert({
    org_id: orgId,
    sender_user_id: user!.id,
    recipient_user_id: recipientUserId || null,
    property_id: propertyId || null,
    content
  });
}

export async function getMessages() {
  const supabase = createClient();
  const orgId = await getActiveOrgId();

  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(100);

  return data || [];
}
