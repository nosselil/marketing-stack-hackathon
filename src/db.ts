import { supabase } from "./supabase";

// ─── Brand persistence ───

export async function saveBrand(userId: string, brandData: any, brandColors: any) {
  const row = {
    user_id: userId,
    name: brandData.brand?.name || "Brand",
    url: brandData.brand?.url || "",
    logo_url: brandData.brand?.logoCandidates?.[0]?.url || "",
    brand_data: brandData,
    brand_colors: brandColors || {},
    product_type: brandData.brand?.productType || "",
    language: brandData.brand?.languageLabel || "English",
    fonts: brandData.brand?.fonts || [],
    timezone: brandData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  // Check if user already has a brand saved
  const { data: existing } = await supabase
    .from("user_brands")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (existing?.id) {
    // Update existing
    const { data, error } = await supabase
      .from("user_brands")
      .update(row)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) console.error("[db] Update brand error:", error);
    else console.log("[db] Brand updated for user", userId);
    return data;
  }

  // Insert new
  const { data, error } = await supabase
    .from("user_brands")
    .insert(row)
    .select()
    .single();
  if (error) console.error("[db] Insert brand error:", error);
  else console.log("[db] Brand inserted for user", userId);
  return data;
}

export async function loadBrands(userId: string) {
  const { data, error } = await supabase
    .from("user_brands")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) console.error("Load brands error:", error);
  return data || [];
}

export async function deleteBrand(brandId: string) {
  const { error } = await supabase.from("user_brands").delete().eq("id", brandId);
  if (error) console.error("Delete brand error:", error);
}

// ─── Pipeline persistence ───

function buildSocialsConfig(pipeline: any): Array<{ platform: string; pageId?: string }> {
  const socials: string[] = pipeline.socials || [];
  return socials.map((platform: string) => {
    const entry: { platform: string; pageId?: string } = { platform };
    if (platform === "facebook" && pipeline.facebookPageId) {
      entry.pageId = pipeline.facebookPageId;
    }
    if (platform === "linkedin" && pipeline.linkedinPageId) {
      entry.pageId = pipeline.linkedinPageId;
    }
    return entry;
  });
}

export async function savePipeline(userId: string, pipeline: any, brandId?: string) {
  const row = {
    user_id: userId,
    brand_id: brandId || null,
    name: pipeline.name,
    post_type: pipeline.postType,
    format: pipeline.format,
    thumbnail_url: pipeline.thumbnailUrl,
    socials: pipeline.socials,
    frequency: pipeline.frequency,
    preferred_time: pipeline.preferredTime || "09:00",
    guidance: pipeline.guidance || "",
    reference_images: pipeline.referenceImages || [],
    facebook_page_id: pipeline.facebookPageId || null,
    linkedin_page_id: pipeline.linkedinPageId || null,
    socials_config: buildSocialsConfig(pipeline),
    enabled: pipeline.enabled,
    last_generated: pipeline.lastGenerated ? new Date(pipeline.lastGenerated).toISOString() : null,
    last_posted: pipeline.lastPosted ? new Date(pipeline.lastPosted).toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  // Check if pipeline has a UUID (existing) or a client-generated ID (new)
  if (pipeline.dbId) {
    const { data, error } = await supabase
      .from("user_pipelines")
      .update(row)
      .eq("id", pipeline.dbId)
      .select()
      .single();
    if (error) console.error("[db] Update pipeline error:", error);
    else console.log("[db] Pipeline updated:", pipeline.dbId);
    return data;
  }

  const { data, error } = await supabase
    .from("user_pipelines")
    .insert(row)
    .select()
    .single();

  if (error) console.error("[db] Insert pipeline error:", error);
  else console.log("[db] Pipeline inserted:", data?.id);
  return data;
}

export async function loadPipelines(userId: string) {
  const { data, error } = await supabase
    .from("user_pipelines")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) console.error("Load pipelines error:", error);
  return (data || []).map((row: any) => {
    // Extract page IDs from socials_config if present, fall back to legacy columns
    const socialsConfig: Array<{ platform: string; pageId?: string }> = row.socials_config || [];
    const fbFromConfig = socialsConfig.find((s: any) => s.platform === "facebook")?.pageId || null;
    const liFromConfig = socialsConfig.find((s: any) => s.platform === "linkedin")?.pageId || null;

    return {
      id: row.id,
      dbId: row.id,
      name: row.name,
      postType: row.post_type,
      format: row.format,
      thumbnailUrl: row.thumbnail_url,
      socials: (row.socials || []).map((s: string) => s === "twitter" ? "x" : s),
      frequency: row.frequency,
      preferredTime: row.preferred_time || "09:00",
      guidance: row.guidance || "",
      referenceImages: row.reference_images || [],
      enabled: row.enabled,
      lastGenerated: row.last_generated,
      lastPosted: row.last_posted,
      nextScheduled: row.next_scheduled,
      generatedExamples: [],
      facebookPageId: fbFromConfig || row.facebook_page_id || null,
      linkedinPageId: liFromConfig || row.linkedin_page_id || null,
    };
  });
}

export async function deletePipeline(pipelineId: string) {
  const { error } = await supabase.from("user_pipelines").delete().eq("id", pipelineId);
  if (error) console.error("Delete pipeline error:", error);
}

// ─── Generated assets persistence ───

export async function saveGeneratedAsset(userId: string, asset: any, brandId?: string, pipelineId?: string) {
  const { data, error } = await supabase
    .from("generated_assets")
    .insert({
      user_id: userId,
      brand_id: brandId || null,
      pipeline_id: pipelineId || null,
      title: asset.title || "",
      format: asset.format || "Image",
      preview_url: asset.previewUrl || "",
      media_url: asset.mediaUrl || "",
      provider: asset.provider || "",
      status: asset.status || "",
      metadata: asset.generationDebug || {},
    })
    .select()
    .single();

  if (error) console.error("Save asset error:", error);
  return data;
}

export async function loadGeneratedAssets(userId: string) {
  const { data, error } = await supabase
    .from("generated_assets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) console.error("Load assets error:", error);
  return data || [];
}
