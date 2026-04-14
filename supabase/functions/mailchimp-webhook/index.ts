import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contentType = req.headers.get("content-type") || "";
    let eventData: Record<string, any>;

    if (contentType.includes("application/json")) {
      eventData = await req.json();
    } else {
      const formData = await req.formData();
      eventData = Object.fromEntries(formData.entries());
      if (eventData.data && typeof eventData.data === "string") {
        try { eventData.data = JSON.parse(eventData.data); } catch {}
      }
    }

    const eventType = eventData.type || eventData.event_type || "unknown";
    const email = eventData.data?.email || eventData.email || "";
    const subject = eventData.data?.subject || eventData.subject || null;
    const sender = eventData.data?.from_name || eventData.sender || null;
    let clickedUrl = null;
    let bounceType = null;
    let bounceDetail = null;

    if (eventType === "click") {
      clickedUrl = eventData.data?.url || eventData.url || null;
cat > supabase/functions/mailchimp-webhook/index.ts << 'ENDOFFILE'
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contentType = req.headers.get("content-type") || "";
    let eventData: Record<string, any>;

    if (contentType.includes("application/json")) {
      eventData = await req.json();
    } else {
      const formData = await req.formData();
      eventData = Object.fromEntries(formData.entries());
      if (eventData.data && typeof eventData.data === "string") {
        try { eventData.data = JSON.parse(eventData.data); } catch {}
      }
    }

    const eventType = eventData.type || eventData.event_type || "unknown";
    const email = eventData.data?.email || eventData.email || "";
    const subject = eventData.data?.subject || eventData.subject || null;
    const sender = eventData.data?.from_name || eventData.sender || null;
    let clickedUrl = null;
    let bounceType = null;
    let bounceDetail = null;

    if (eventType === "click") {
      clickedUrl = eventData.data?.url || eventData.url || null;
    }
    if (eventType === "hard_bounce" || eventType === "soft_bounce") {
      bounceType = eventType;
      bounceDetail = eventData.data?.reason || null;
    }

    const { error } = await supabase.from("mailchimp_events").insert({
      event_type: eventType,
      event_timestamp: eventData.fired_at || new Date().toISOString(),
      email,
      subject,
      sender,
      clicked_url: clickedUrl,
      bounce_type: bounceType,
      bounce_detail: bounceDetail,
      action_data: eventData.data || null,
      raw_event: eventData,
    });

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
