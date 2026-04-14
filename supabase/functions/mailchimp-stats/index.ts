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

    const url = new URL(req.url);
    const report = url.searchParams.get("report") || "overview";
    let data: any;

    switch (report) {
      case "overview": {
        const [campaignsRes, subscribersRes, eventsRes, listsRes] = await Promise.all([
          supabase.from("campaigns").select("*").order("send_time", { ascending: false }).limit(10),
          supabase.from("subscribers").select("*", { count: "exact", head: true }),
          supabase.from("mailchimp_events").select("event_type, id"),
          supabase.from("subscriber_lists").select("*"),
        ]);
        const campaigns = campaignsRes.data || [];
        const avgOpen = campaigns.length > 0 ? campaigns.reduce((s, c) => s + (c.open_rate || 0), 0) / campaigns.length : 0;
        const avgClick = campaigns.length > 0 ? campaigns.reduce((s, c) => s + (c.click_rate || 0), 0) / campaigns.length : 0;
        data = {
          total_subscribers: subscribersRes.count || 0,
          total_campaigns: campaigns.length,
          total_events: eventsRes.data?.length || 0,
          avg_open_rate: Math.round(avgOpen * 10000) / 100,
          avg_click_rate: Math.round(avgClick * 10000) / 100,
          recent_campaigns: campaigns.slice(0, 5).map(c => ({
            subject: c.subject, send_time: c.send_time, emails_sent: c.emails_sent,
            open_rate: Math.round((c.open_rate || 0) * 10000) / 100,
            click_rate: Math.round((c.click_rate || 0) * 10000) / 100,
          })),
          lists: (listsRes.data || []).map(l => ({ name: l.name, members: l.member_count, open_rate: l.open_rate, click_rate: l.click_rate })),
        };
        break;
      }
      case "campaigns": {
        const { data: campaigns } = await supabase.from("campaigns").select("*").order("send_time", { ascending: false }).limit(50);
        data = { campaigns: (campaigns || []).map(c => ({
          mailchimp_id: c.mailchimp_id, subject: c.subject, from_name: c.from_name,
          send_time: c.send_time, emails_sent: c.emails_sent,
          open_rate: Math.round((c.open_rate || 0) * 10000) / 100,
          click_rate: Math.round((c.click_rate || 0) * 10000) / 100,
          unsubscribes: c.unsubscribes, bounce_rate: Math.round((c.bounce_rate || 0) * 10000) / 100,
        }))};
        break;
      }
      case "subscribers": {
        const { data: subs } = await supabase.from("subscribers").select("*").order("open_rate", { ascending: false }).limit(100);
        const subscribers = subs || [];
        const ratingDist: Record<number, number> = {};
        subscribers.forEach(s => { ratingDist[s.member_rating || 0] = (ratingDist[s.member_rating || 0] || 0) + 1; });
        data = {
          total: subscribers.length,
          top_engaged: subscribers.slice(0, 10).map(s => ({ email: s.email, open_rate: s.open_rate, click_rate: s.click_rate, rating: s.member_rating })),
          rating_distribution: ratingDist,
        };
        break;
      }
      case "events": {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: events } = await supabase.from("mailchimp_events")
          .select("event_type, email, event_timestamp, subject, clicked_url")
          .gte("event_timestamp", thirtyDaysAgo).order("event_timestamp", { ascending: false }).limit(200);
        const typeCounts: Record<string, number> = {};
        (events || []).forEach(e => { typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1; });
        data = { period: "last_30_days", event_counts: typeCounts, total_events: events?.length || 0, recent: (events || []).slice(0, 20) };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Bruk: ?report=overview|campaigns|subscribers|events" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ report, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stats error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
