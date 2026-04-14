import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchMailchimp(path: string): Promise<any> {
  const apiKey = Deno.env.get("MAILCHIMP_API_KEY")!;
  const server = Deno.env.get("MAILCHIMP_SERVER_PREFIX")!;
  const res = await fetch(`https://${server}.api.mailchimp.com/3.0${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Mailchimp API error: ${res.status} ${await res.text()}`);
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Synkroniser kampanjer
    const campaignsRes = await fetchMailchimp("/campaigns?count=100&sort_field=send_time&sort_dir=DESC");
    let campaignCount = 0;
    for (const c of campaignsRes.campaigns || []) {
      if (c.status !== "sent") continue;
      const { error } = await supabase.from("campaigns").upsert({
        mailchimp_id: c.id,
        subject: c.settings.subject_line,
        from_name: c.settings.from_name,
        reply_to: c.settings.reply_to,
        send_time: c.send_time,
        emails_sent: c.emails_sent,
        list_id: c.recipients.list_id,
        list_name: c.recipients.list_name,
        opens: c.report_summary?.opens || 0,
        unique_opens: c.report_summary?.unique_opens || 0,
        open_rate: c.report_summary?.open_rate || 0,
        clicks: c.report_summary?.clicks || 0,
        unique_clicks: c.report_summary?.subscriber_clicks || 0,
        click_rate: c.report_summary?.click_rate || 0,
        unsubscribes: c.report_summary?.unsubscribed || 0,
        bounce_rate: c.report_summary?.bounce_rate || 0,
      }, { onConflict: "mailchimp_id" });
      if (!error) campaignCount++;
    }

    // Synkroniser lister og abonnenter
    const listsRes = await fetchMailchimp("/lists?count=50");
    let subscriberCount = 0;
    for (const list of listsRes.lists || []) {
      await supabase.from("subscriber_lists").upsert({
        mailchimp_list_id: list.id,
        name: list.name,
        member_count: list.stats.member_count,
        unsubscribe_count: list.stats.unsubscribe_count,
        cleaned_count: list.stats.cleaned_count,
        campaign_count: list.stats.campaign_count,
        open_rate: list.stats.open_rate,
        click_rate: list.stats.click_rate,
        last_synced: new Date().toISOString(),
      }, { onConflict: "mailchimp_list_id" });

      const membersRes = await fetchMailchimp(`/lists/${list.id}/members?count=200&status=subscribed`);
      for (const m of membersRes.members || []) {
        const { error } = await supabase.from("subscribers").upsert({
          mailchimp_id: m.id,
          email: m.email_address,
          list_id: list.id,
          status: m.status,
          open_rate: m.stats?.avg_open_rate || 0,
          click_rate: m.stats?.avg_click_rate || 0,
          member_rating: m.member_rating || 0,
          signup_date: m.timestamp_signup || m.timestamp_opt,
          last_changed: m.last_changed,
          tags: m.tags?.map((t: any) => t.name) || [],
        }, { onConflict: "mailchimp_id" });
        if (!error) subscriberCount++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      synced: { campaigns: campaignCount, lists: listsRes.lists?.length || 0, subscribers: subscriberCount },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
