import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("brokers")
      .select("id, name, slug")
      .order("name");

    if (error) {
      console.error("Failed to load brokers", error);
      return NextResponse.json({ error: "Unable to load brokers" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("Brokers endpoint failed", error);
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }
}
