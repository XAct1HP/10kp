import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

// GET — fetch recent vote mappings (admin only)
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("pitch_votes")
      .select(`
        id,
        pitch_id,
        user_id,
        voter_name,
        voter_email,
        created_at,
        pitches (
          title,
          name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const votes = (data || []).map((vote) => ({
      id: vote.id,
      pitch_id: vote.pitch_id,
      user_id: vote.user_id,
      voter_name: vote.voter_name,
      voter_email: vote.voter_email,
      created_at: vote.created_at,
      pitch_title: vote.pitches?.title || "Untitled pitch",
      pitch_submitter: vote.pitches?.name || "Unknown submitter",
    }));

    return NextResponse.json(votes);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
