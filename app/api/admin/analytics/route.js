import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // ── Parallel Supabase queries ──
    const [pitchesRes, votesRes, tagsRes] = await Promise.all([
      supabaseAdmin
        .from("pitches")
        .select("id, title, name, file_type, file_name, text_content, schools, mux_asset_id, mux_playback_id, created_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("pitch_votes")
        .select("id, pitch_id, voter_email, voter_key, created_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("pitch_tags")
        .select("pitch_id, tag_id, tags ( id, name )")
    ]);

    const pitches = pitchesRes.data || [];
    const votes = votesRes.data || [];
    const tagAssociations = tagsRes.data || [];

    // ── Pitch type classification ──
    const classifyType = (p) => {
      if (p.file_type === "video") return "video";
      if (/\.(mp3|wav|ogg|aac|m4a|webm)$/i.test(p.file_name || "")) return "audio";
      return "text";
    };

    // Compute vote counts per pitch from votes data
    const voteCountMap = {};
    votes.forEach((v) => { voteCountMap[v.pitch_id] = (voteCountMap[v.pitch_id] || 0) + 1; });
    pitches.forEach((p) => { p.vote_count = voteCountMap[p.id] || 0; });

    const typeBreakdown = { video: 0, audio: 0, text: 0 };
    pitches.forEach((p) => { typeBreakdown[classifyType(p)]++; });

    // ── Activity timeline (submissions + votes per day, last 30 days) ──
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const timeline = [];
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      timeline.push({ date: dateStr, submissions: 0, votes: 0 });
    }
    const timelineMap = {};
    timeline.forEach((t) => { timelineMap[t.date] = t; });

    pitches.forEach((p) => {
      const d = p.created_at?.slice(0, 10);
      if (d && timelineMap[d]) timelineMap[d].submissions++;
    });
    votes.forEach((v) => {
      const d = v.created_at?.slice(0, 10);
      if (d && timelineMap[d]) timelineMap[d].votes++;
    });

    // ── Top pitches by votes ──
    const topPitchesByVotes = [...pitches]
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
      .slice(0, 7)
      .map((p) => ({ title: p.title, name: p.name, votes: p.vote_count || 0, type: classifyType(p) }));

    // ── Tag popularity ──
    const tagCounts = {};
    tagAssociations.forEach((ta) => {
      const tagName = ta.tags?.name;
      if (tagName) tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
    });
    const tagPopularity = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ── School distribution ──
    const schoolCounts = {};
    pitches.forEach((p) => {
      (p.schools || []).forEach((s) => {
        schoolCounts[s] = (schoolCounts[s] || 0) + 1;
      });
    });
    const schoolDistribution = Object.entries(schoolCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ── Unique voters ──
    const uniqueVoters = new Set(votes.map((v) => v.voter_key || v.voter_email)).size;

    // ── Votes per day average ──
    const voteDays = new Set(votes.map((v) => v.created_at?.slice(0, 10)));
    const avgVotesPerDay = voteDays.size > 0 ? Math.round(votes.length / voteDays.size * 10) / 10 : 0;

    // ── Mux video analytics ──
    let muxData = { totalViews: null, totalWatchTime: null, topVideos: [], viewsTimeline: [] };

    const videoPitches = pitches.filter((p) => p.mux_asset_id);
    if (videoPitches.length > 0) {
      try {
        const mux = getMuxClient();

        // Get views for each video asset
        const videoMetrics = await Promise.all(
          videoPitches.slice(0, 20).map(async (pitch) => {
            try {
              const views = await mux.data.videoViews.list({
                filters: [`asset_id:${pitch.mux_asset_id}`],
                timeframe: ["30:days"],
                limit: 100,
              });
              const viewData = views.data || [];
              const totalViews = viewData.length;
              const totalWatchTime = viewData.reduce((sum, v) => sum + (v.watch_time || 0), 0);
              return {
                title: pitch.title,
                name: pitch.name,
                assetId: pitch.mux_asset_id,
                views: totalViews,
                watchTime: totalWatchTime,
              };
            } catch {
              return { title: pitch.title, name: pitch.name, assetId: pitch.mux_asset_id, views: 0, watchTime: 0 };
            }
          })
        );

        muxData.totalViews = videoMetrics.reduce((s, v) => s + v.views, 0);
        muxData.totalWatchTime = videoMetrics.reduce((s, v) => s + v.watchTime, 0);
        muxData.topVideos = videoMetrics
          .sort((a, b) => b.views - a.views)
          .slice(0, 5);
      } catch (muxErr) {
        console.error("Mux analytics error:", muxErr.message);
        // muxData stays with null values — frontend shows N/A
      }
    }

    return NextResponse.json({
      summary: {
        totalPitches: pitches.length,
        totalVotes: votes.length,
        uniqueVoters,
        avgVotesPerDay,
        avgVotesPerPitch: pitches.length > 0 ? Math.round(votes.length / pitches.length * 10) / 10 : 0,
      },
      typeBreakdown,
      timeline,
      topPitchesByVotes,
      tagPopularity,
      schoolDistribution,
      mux: muxData,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
