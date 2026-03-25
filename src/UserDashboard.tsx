import { useEffect, useRef, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { SOCIAL_PLATFORMS } from "./socialIcons";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.port === "5173"
    ? "http://127.0.0.1:3001"
    : "");

type ConnectedAccount = {
  platform: string;
  username: string;
  connected: boolean;
};

type UserDashboardProps = {
  user: User;
  onLogout: () => void;
  onBackToCreator: () => void;
  onTimezoneChange?: (tz: string) => void;
  hasProSubscription?: boolean;
  onShowPaywall?: () => void;
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "calendar", label: "Calendar" },
  { id: "accounts", label: "Accounts" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

export function UserDashboard({ user, onLogout, onBackToCreator, onTimezoneChange, hasProSubscription, onShowPaywall }: UserDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({});
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [isSticky, setIsSticky] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [scheduledPosts, setScheduledPosts] = useState<Array<{ date: string; name: string; status: string; socialCount: number; caption: string; format: string; assetUrl: string | null }>>([]);
  const [selectedPostIdx, setSelectedPostIdx] = useState<string | null>(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [totalImpressions, setTotalImpressions] = useState<any>(null);
  const [analyticsPlatform, setAnalyticsPlatform] = useState("all");
  const [previewPost, setPreviewPost] = useState<{ assetUrl: string; caption: string; format: string; name: string; time: string; status: string } | null>(null);
  const [facebookPages, setFacebookPages] = useState<Array<{ id: string; name: string }>>([]);
  const [linkedinPages, setLinkedinPages] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFacebookPage, setSelectedFacebookPage] = useState<string | null>(() => localStorage.getItem("botface_fb_page"));
  const [selectedLinkedinPage, setSelectedLinkedinPage] = useState<string | null>(() => localStorage.getItem("botface_li_page"));
  const [showPageSelector, setShowPageSelector] = useState<string | null>(null);
  const [userTimezone, setUserTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
  );

  const profileUsername = `botface_${user.id}`;

  const fetchConnectedAccounts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/social/accounts/${profileUsername}`);
      const data = await res.json();
      if (data.accounts && Array.isArray(data.accounts)) {
        setConnectedAccounts(data.accounts.map((a: any) => ({
          platform: a.platform || a.type || "",
          username: a.username || a.name || "",
          connected: true,
        })));
      }
    } catch {
      // silently fail
    }
  }, [profileUsername]);

  useEffect(() => {
    fetchConnectedAccounts();
  }, [fetchConnectedAccounts]);

  // Re-fetch when window regains focus (user returns from connect flow)
  useEffect(() => {
    const handleFocus = async () => {
      await fetchConnectedAccounts();
      // After reconnecting, check if we need to fetch FB/LinkedIn pages
      fetchPagesIfNeeded();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchConnectedAccounts]);

  async function fetchPagesIfNeeded() {
    try {
      // Fetch Facebook pages
      const fbRes = await fetch(`${API_BASE}/api/uploadposts/facebook/pages?profile=${profileUsername}`);
      const fbData = await fbRes.json().catch(() => ({}));
      if (fbData.pages?.length > 0) {
        setFacebookPages(fbData.pages.map((p: any) => ({ id: p.page_id || p.id, name: p.page_name || p.name })));
        if (!selectedFacebookPage && fbData.pages.length > 0) {
          setShowPageSelector("facebook");
        }
      }
      // Fetch LinkedIn pages
      const liRes = await fetch(`${API_BASE}/api/uploadposts/linkedin/pages?profile=${profileUsername}`);
      const liData = await liRes.json().catch(() => ({}));
      if (liData.pages?.length > 0) {
        setLinkedinPages(liData.pages.map((p: any) => ({ id: p.id, name: p.name })));
        if (!selectedLinkedinPage && liData.pages.length > 0 && !showPageSelector) {
          setShowPageSelector("linkedin");
        }
      }
    } catch {}
  }

  // Fetch pages on mount
  useEffect(() => { fetchPagesIfNeeded(); }, [profileUsername]);

  async function handleConnect(platformName: string) {
    setConnectingPlatform(platformName);
    try {
      await fetch(`${API_BASE}/api/social/create-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: profileUsername }),
      }).catch(() => {});

      const res = await fetch(`${API_BASE}/api/social/connect-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profileUsername,
          platforms: [platformName.toLowerCase()],
          redirect_url: window.location.origin + "/dashboard",
        }),
      });
      const data = await res.json();
      if (data.access_url) {
        window.open(data.access_url, "_blank");
      }
    } catch (error) {
      console.error("Connect error:", error);
    } finally {
      setConnectingPlatform(null);
    }
  }

  // Fetch scheduled posts from Supabase for calendar
  useEffect(() => {
    async function fetchScheduledPosts() {
      try {
        const { supabase } = await import("./supabase");
        const { data } = await supabase
          .from("pipeline_jobs")
          .select("scheduled_for, pipeline_config, status, result_asset_url, result_post_urls")
          .eq("user_id", user.id)
          .not("scheduled_for", "is", null)
          .order("scheduled_for", { ascending: true });
        if (data) {
          setScheduledPosts(data.map((j: any) => {
            // "completed" in DB means job worker finished (generated + scheduled on )
            // But if scheduled_for is in the future, it hasn't actually been published yet
            const scheduledTime = new Date(j.scheduled_for);
            const isActuallyPosted = j.status === "completed" && scheduledTime <= new Date();
            const displayStatus = j.status === "failed" ? "failed"
              : isActuallyPosted ? "completed"
              : "pending";
            return {
              date: j.scheduled_for,
              name: j.pipeline_config?.name || j.pipeline_config?.post_type || "Post",
              status: displayStatus,
              socialCount: j.pipeline_config?.socials?.length || 0,
              caption: j.pipeline_config?.guidance || "",
              format: j.pipeline_config?.format || j.pipeline_config?.post_type || "Image",
              assetUrl: j.result_asset_url || null,
            };
          }));
        }
      } catch {}
    }
    fetchScheduledPosts();
  }, [profileUsername]);

  // Fetch analytics from 
  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const [analyticsRes, impressionsRes] = await Promise.all([
          fetch(`${API_BASE}/api/analytics/${profileUsername}?platforms=instagram,tiktok,youtube,facebook,x,threads`),
          fetch(`${API_BASE}/api/analytics/impressions/${profileUsername}?period=last_month&breakdown=true`),
        ]);
        const analyticsData = await analyticsRes.json().catch(() => null);
        const impressionsData = await impressionsRes.json().catch(() => null);
        if (analyticsData) setAnalytics(analyticsData);
        if (impressionsData) setTotalImpressions(impressionsData);
      } catch {}
    }
    fetchAnalytics();
  }, [profileUsername]);

  // Update slider position
  useEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (el) {
      setSliderStyle({
        width: el.offsetWidth,
        left: el.offsetLeft,
      });
    }
  }, [activeTab]);

  // Scroll spy
  useEffect(() => {
    const handleScroll = () => {
      // Sticky check
      if (heroRef.current) {
        const anchorTop = heroRef.current.offsetTop;
        // When anchor scrolls into view, switch navbar from bottom to top
        setIsSticky(window.scrollY >= anchorTop - 56);
      }
      // Find active section
      const containerHeight = 56;
      for (const tab of [...tabs].reverse()) {
        const section = sectionRefs.current.get(tab.id);
        if (section) {
          const top = section.offsetTop - containerHeight - 10;
          if (window.scrollY >= top) {
            setActiveTab(tab.id);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToSection(tabId: string) {
    const section = sectionRefs.current.get(tabId);
    if (section) {
      const top = section.offsetTop - 56 + 1;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setActiveTab(tabId);
  }

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

  // ─── Voice agent event listeners ───
  useEffect(() => {
    const handleGetAnalytics = () => {
      const allPlatforms = analytics ? Object.keys(analytics).filter((k: string) => analytics[k]?.followers != null) : [];
      const totals = { followers: 0, reach: 0, likes: 0, comments: 0, shares: 0 };
      for (const p of allPlatforms) {
        const d = analytics[p];
        totals.followers += d.followers || 0;
        totals.reach += d.reach || d.views || d.impressions || 0;
        totals.likes += d.likes || 0;
        totals.comments += d.comments || 0;
        totals.shares += d.shares || 0;
      }
      const parts = [];
      if (allPlatforms.length > 0) {
        parts.push(`Connected platforms: ${allPlatforms.join(", ")}`);
        parts.push(`Followers: ${totals.followers.toLocaleString()}, Reach: ${totals.reach.toLocaleString()}, Likes: ${totals.likes.toLocaleString()}, Comments: ${totals.comments.toLocaleString()}`);
      }
      if (totalImpressions?.total_impressions != null) {
        parts.push(`Total impressions (30 days): ${totalImpressions.total_impressions.toLocaleString()}`);
      }
      // Add daily breakdown if available
      if (totalImpressions?.per_day) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        const todayVal = totalImpressions.per_day[fmt(today)];
        const yesterdayVal = totalImpressions.per_day[fmt(yesterday)];
        const twoDaysAgoVal = totalImpressions.per_day[fmt(twoDaysAgo)];
        const dailyParts = [];
        if (todayVal != null) dailyParts.push(`Today: ${todayVal.toLocaleString()} impressions`);
        if (yesterdayVal != null) dailyParts.push(`Yesterday: ${yesterdayVal.toLocaleString()} impressions`);
        if (twoDaysAgoVal != null) dailyParts.push(`2 days ago: ${twoDaysAgoVal.toLocaleString()} impressions`);
        if (dailyParts.length > 0) parts.push(`Daily breakdown: ${dailyParts.join(", ")}`);

        // Last 7 days total
        let last7 = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const val = totalImpressions.per_day[fmt(d)];
          if (val != null) last7 += val;
        }
        if (last7 > 0) parts.push(`Last 7 days total: ${last7.toLocaleString()} impressions`);
      }
      // Per-platform timeseries for recent days
      for (const p of allPlatforms) {
        const ts = analytics[p]?.reach_timeseries;
        if (ts && ts.length > 0) {
          const recent = ts.slice(-3);
          parts.push(`${p} recent reach: ${recent.map((d: any) => `${d.date}: ${d.value}`).join(", ")}`);
        }
      }
      parts.push(`Posts created: ${scheduledPosts.length}, Published: ${scheduledPosts.filter((p) => p.status === "completed").length}, Scheduled: ${scheduledPosts.filter((p) => p.status === "pending").length}`);
      window.dispatchEvent(new CustomEvent("botface-analytics-response", { detail: { summary: parts.join(". ") || "No analytics data yet." } }));
    };

    const handleGetCalendar = () => {
      const now = new Date();
      const upcoming = scheduledPosts
        .filter((p) => new Date(p.date) >= now && p.status === "pending")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 10);
      const recent = scheduledPosts
        .filter((p) => p.status === "completed")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);
      const parts = [];
      if (upcoming.length > 0) {
        parts.push(`Upcoming posts: ${upcoming.map((p) => `${p.name} on ${new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`).join(", ")}`);
      } else {
        parts.push("No upcoming scheduled posts");
      }
      if (recent.length > 0) {
        parts.push(`Recent posts: ${recent.map((p) => `${p.name} on ${new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`).join(", ")}`);
      }
      window.dispatchEvent(new CustomEvent("botface-calendar-response", { detail: { summary: parts.join(". ") } }));
    };

    const handleScrollTo = (e: Event) => {
      const section = (e as CustomEvent).detail?.section;
      if (section) {
        const el = sectionRefs.current.get(section);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          setActiveTab(section);
        }
      }
    };

    window.addEventListener("botface-get-analytics", handleGetAnalytics);
    window.addEventListener("botface-get-calendar", handleGetCalendar);
    window.addEventListener("botface-scroll-to", handleScrollTo);
    return () => {
      window.removeEventListener("botface-get-analytics", handleGetAnalytics);
      window.removeEventListener("botface-get-calendar", handleGetCalendar);
      window.removeEventListener("botface-scroll-to", handleScrollTo);
    };
  }, [analytics, totalImpressions, scheduledPosts]);

  return (
    <div className="ud-shell">
      {/* Tab navigation — sticks to top when scrolled past */}
      <div className="ud-hero-tabs-anchor" ref={heroRef}>
        <div
          className={`ud-tab-container ${isSticky ? "ud-tab-container--sticky" : ""}`}
          ref={tabContainerRef}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`ud-tab ${activeTab === tab.id ? "ud-tab--active" : ""}`}
              ref={(el) => { if (el) tabRefs.current.set(tab.id, el); }}
              onClick={() => scrollToSection(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <span className="ud-tab-slider" style={sliderStyle} />
        </div>
      </div>

      {/* Sections */}
      <main className="ud-main">

        {/* Overview */}
        <section className="ud-section" id="tab-overview" ref={(el) => { if (el) sectionRefs.current.set("overview", el); }}>
          <h2>Overview</h2>
          <div className="ud-stats-grid">
            <div className="ud-stat-card">
              <span className="ud-stat-value">{scheduledPosts.length}</span>
              <span className="ud-stat-label">Posts Created</span>
            </div>
            <div className="ud-stat-card">
              <span className="ud-stat-value">{scheduledPosts.filter((p) => p.status === "completed").length}</span>
              <span className="ud-stat-label">Published</span>
            </div>
            <div className="ud-stat-card">
              <span className="ud-stat-value">{scheduledPosts.filter((p) => p.status === "pending").length}</span>
              <span className="ud-stat-label">Scheduled</span>
            </div>
            <div className="ud-stat-card">
              <span className="ud-stat-value">1</span>
              <span className="ud-stat-label">Brands</span>
            </div>
          </div>
          <details className="ud-recent">
            <summary className="ud-recent-toggle"><h3>Recent Activity</h3><span className="ud-recent-arrow">›</span></summary>
            {scheduledPosts.filter((p) => p.status === "completed").length > 0 ? (
              <div className="ud-recent-list">
                {scheduledPosts.filter((p) => p.status === "completed" || p.status === "pending").slice(0, 5).map((p, i) => {
                  const d = new Date(p.date);
                  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                  const actionLabel = p.status === "completed" ? "Posted" : p.status === "failed" ? "Failed" : "Scheduled";
                  return (
                    <div key={i} className="ud-recent-item">
                      <span className={`ud-calendar-dot ${p.status === "completed" ? "ud-calendar-dot--done" : "ud-calendar-dot--pending"}`} />
                      <div>
                        <strong>{p.format === "Video" ? "📹" : "🖼"} {p.caption ? p.caption.substring(0, 50) + (p.caption.length > 50 ? "..." : "") : p.name}</strong>
                        <span className="meta">{timeStr} · {actionLabel} · {p.socialCount} platform{p.socialCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="ud-empty-state">
              <p>Activity from your pipelines will show here.</p>
            </div>
            )}
          </details>
        </section>

        {/* Calendar */}
        <section className="ud-section" id="tab-calendar" ref={(el) => { if (el) sectionRefs.current.set("calendar", el); }} onClick={() => setSelectedCalendarDay(null)}>
          <h2>Content Calendar</h2>
          {(() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
            const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });

            // Map scheduled posts to day numbers
            const postsByDay = new Map<number, Array<{ name: string; status: string; time: string; socialCount: number; caption: string; format: string; assetUrl: string | null }>>();
            for (const post of scheduledPosts) {
              const d = new Date(post.date);
              if (d.getFullYear() === year && d.getMonth() === month) {
                const day = d.getDate();
                if (!postsByDay.has(day)) postsByDay.set(day, []);
                postsByDay.get(day)!.push({
                  name: post.name,
                  status: post.status,
                  time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  socialCount: post.socialCount || 0,
                  caption: post.caption || "",
                  format: post.format || "Image",
                  assetUrl: post.assetUrl || null,
                });
              }
            }

            return (
              <>
                <p className="ud-calendar-month">{monthName}</p>
                <div className="ud-calendar-grid">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="ud-calendar-header">{day}</div>
                  ))}
                  {Array.from({ length: 42 }).map((_, i) => {
                    const dayNum = i - offset + 1;
                    const isValid = dayNum > 0 && dayNum <= daysInMonth;
                    const isToday = isValid && dayNum === now.getDate();
                    const posts = isValid ? postsByDay.get(dayNum) : undefined;
                    const isSelected = selectedCalendarDay === dayNum;
                    return (
                      <div
                        key={i}
                        className={`ud-calendar-cell ${!isValid ? "ud-calendar-cell--empty" : ""} ${isToday ? "ud-calendar-cell--today" : ""} ${posts ? "ud-calendar-cell--has-post" : ""} ${isSelected ? "ud-calendar-cell--selected" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isValid && posts) setSelectedCalendarDay(isSelected ? null : dayNum);
                          else setSelectedCalendarDay(null);
                        }}
                        style={isValid && posts ? { cursor: "pointer", position: "relative" } : undefined}
                      >
                        {isValid && (
                          <>
                            {posts && (() => {
                              const totalPosts = posts.reduce((sum, p) => sum + (p.socialCount || 1), 0);
                              return (
                                <div className="ud-calendar-post-count">
                                  <span>{posts.length} pipeline{posts.length !== 1 ? "s" : ""}</span>
                                  <span>{totalPosts} post{totalPosts !== 1 ? "s" : ""}</span>
                                </div>
                              );
                            })()}
                            <span className="ud-calendar-day">{dayNum} <span className="ud-calendar-day-month">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]}</span></span>
                            {posts && (
                              <div className="ud-calendar-dots">
                                {posts.map((p, j) => {
                                  const postTime = new Date(`${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}T${p.time}`);
                                  const isPast = postTime < now;
                                  const dotClass = p.status === "completed" ? "ud-calendar-dot--done"
                                    : p.status === "failed" ? "ud-calendar-dot--failed"
                                    : isPast ? "ud-calendar-dot--failed"
                                    : "ud-calendar-dot--scheduled";
                                  return <span key={j} className={`ud-calendar-dot ${dotClass}`} />;
                                })}
                              </div>
                            )}
                            {isSelected && posts && (
                              <div className="ud-calendar-day-popup" onClick={(e) => e.stopPropagation()}>
                                <div className="ud-calendar-day-popup-header">
                                  <strong>{monthName.split(" ")[0]} {dayNum}</strong>
                                  <button className="ud-calendar-popover-close" onClick={(e) => { e.stopPropagation(); setSelectedCalendarDay(null); }}>×</button>
                                </div>
                                <div className="ud-calendar-day-popup-list">
                                {posts.map((p, j) => {
                                  const thumbUrl = p.assetUrl
                                    ? (p.assetUrl.startsWith("data:") ? p.assetUrl
                                      : p.assetUrl.startsWith("http://localhost") ? `${API_BASE}${new URL(p.assetUrl).pathname}`
                                      : p.assetUrl.startsWith("/") ? `${API_BASE}${p.assetUrl}`
                                      : p.assetUrl)
                                    : null;
                                  return (
                                  <div
                                    key={j}
                                    className="ud-calendar-day-popup-item"
                                    style={{ cursor: thumbUrl ? "pointer" : undefined }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (thumbUrl) setPreviewPost({ assetUrl: thumbUrl, caption: p.caption, format: p.format, name: p.name, time: p.time, status: p.status });
                                    }}
                                  >
                                    {thumbUrl && (
                                      p.format === "Video"
                                        ? <video className="ud-calendar-day-popup-thumb" src={thumbUrl} muted />
                                        : <img className="ud-calendar-day-popup-thumb" src={thumbUrl} alt="" />
                                    )}
                                    <div className="ud-calendar-day-popup-info">
                                      <span className="ud-calendar-day-popup-type">{p.format === "Video" ? "📹 Video" : "🖼 Image"}</span>
                                      <span className={`ud-calendar-day-popup-status ${p.status === "completed" ? "ud-status--posted" : p.status === "failed" ? "ud-status--failed" : "ud-status--scheduled"}`}>
                                        {p.status === "completed" ? "Posted" : p.status === "failed" ? "Failed" : "Scheduled"}
                                      </span>
                                      {p.caption && <p className="ud-calendar-day-popup-caption">{p.caption}</p>}
                                      <span className="meta">{p.time} · {p.socialCount} platform{p.socialCount !== 1 ? "s" : ""}</span>
                                    </div>
                                  </div>
                                  );
                                })}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {scheduledPosts.length === 0 && (
                  <div className="ud-empty-state" style={{ marginTop: 16 }}>
                    <p>No posts scheduled yet. Create a pipeline to start automating.</p>
                  </div>
                )}
              </>
            );
          })()}
        </section>

        {/* Connected Accounts */}
        <section className="ud-section" id="tab-accounts" ref={(el) => { if (el) sectionRefs.current.set("accounts", el); }}>
          <h2>Connected Accounts</h2>
          <div className="ud-accounts-grid">
            {[
              { name: "Instagram", socialId: "instagram" },
              { name: "TikTok", socialId: "tiktok" },
              { name: "LinkedIn", socialId: "linkedin" },
              { name: "X", socialId: "x" },
              { name: "Facebook", socialId: "facebook" },
              { name: "YouTube", socialId: "youtube" },
            ].map((account) => {
              const social = SOCIAL_PLATFORMS.find((s) => s.id === account.socialId);
              const isConnected = connectedAccounts.some(
                (a) => a.platform.toLowerCase() === account.socialId
              );
              const isConnecting = connectingPlatform === account.name;
              return (
                <div key={account.name} className="ud-account-card">
                  <span className="ud-account-icon" style={{ color: social?.color }} dangerouslySetInnerHTML={{ __html: social?.icon || "" }} />
                  <div className="ud-account-info">
                    <strong>{account.name}</strong>
                    <span className="ud-account-status">
                      {isConnected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  <button
                    className="ud-connect-button"
                    disabled={isConnecting}
                    onClick={() => handleConnect(account.name)}
                  >
                    {isConnecting ? "Connecting..." : isConnected ? "Reconnect" : "Connect"}
                  </button>
                  <span className={`ud-connect-status-dot ${isConnected ? "ud-connect-status-dot--connected" : ""}`}>
                    {isConnected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </span>
                </div>
              );
            })}
          </div>

        </section>

        {/* Analytics */}
        <section className="ud-section" id="tab-analytics" ref={(el) => { if (el) sectionRefs.current.set("analytics", el); }}>
          <div className="ud-analytics-header">
            <h2>Analytics</h2>
            <select
              className="ud-analytics-platform-select"
              value={analyticsPlatform}
              onChange={(e) => setAnalyticsPlatform(e.target.value)}
            >
              <option value="all">All platforms</option>
              {analytics && Object.keys(analytics).filter((k) => analytics[k]?.followers != null).map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          {(() => {
            const allPlatforms = analytics ? Object.keys(analytics).filter((k) => analytics[k]?.followers != null) : [];
            const platforms = analyticsPlatform === "all" ? allPlatforms : allPlatforms.filter((p) => p === analyticsPlatform);
            const totals = { followers: 0, reach: 0, likes: 0, comments: 0, shares: 0 };
            for (const p of platforms) {
              const d = analytics[p];
              totals.followers += d.followers || 0;
              totals.reach += d.reach || d.views || d.impressions || 0;
              totals.likes += d.likes || 0;
              totals.comments += d.comments || 0;
              totals.shares += d.shares || 0;
            }

            let chartData: { date: string; value: number }[] = [];
            if (analyticsPlatform === "all" && totalImpressions?.per_day) {
              chartData = Object.entries(totalImpressions.per_day).map(([date, value]) => ({ date, value: value as number }));
            } else if (platforms.length > 0 && analytics[platforms[0]]?.reach_timeseries) {
              chartData = analytics[platforms[0]].reach_timeseries;
            }
            const maxVal = Math.max(1, ...chartData.map((d) => d.value));

            return allPlatforms.length === 0 && !totalImpressions ? (
              <div className="ud-empty-state">
                <p>Analytics will appear here once you start publishing content.</p>
                <div className="ud-placeholder-chart">
                  {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 50, 95].map((h, i) => (
                    <div key={i} className="ud-chart-bar" style={{ height: `${h}%`, opacity: 0.15 }} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="ud-stat-row ud-stat-row--inline">
                  <div className="ud-stat-card"><span className="ud-stat-value">{totals.followers.toLocaleString()}</span><span className="ud-stat-label">Followers</span></div>
                  <div className="ud-stat-card"><span className="ud-stat-value">{totals.reach.toLocaleString()}</span><span className="ud-stat-label">Reach</span></div>
                  <div className="ud-stat-card"><span className="ud-stat-value">{totals.likes.toLocaleString()}</span><span className="ud-stat-label">Likes</span></div>
                  <div className="ud-stat-card"><span className="ud-stat-value">{totals.comments.toLocaleString()}</span><span className="ud-stat-label">Comments</span></div>
                </div>
                {totalImpressions?.total_impressions != null && (
                  <div style={{ marginTop: 12 }}>
                    <span className="meta">Total impressions (30 days)</span>
                    <strong style={{ display: "block", fontSize: "1.4rem", marginTop: 4 }}>{totalImpressions.total_impressions.toLocaleString()}</strong>
                  </div>
                )}
                {chartData.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <span className="meta">Reach / Views (30 days)</span>
                    <div className="ud-analytics-chart">
                      {chartData.map((d, i) => (
                        <div key={i} className="ud-chart-bar-wrap" title={`${d.date}: ${d.value.toLocaleString()}`}>
                          <span className="ud-chart-bar-value">{d.value > 0 ? d.value.toLocaleString() : ""}</span>
                          <div className="ud-chart-bar ud-chart-bar--active" style={{ height: `${(d.value / maxVal) * 100}%` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {totalImpressions?.per_platform && analyticsPlatform === "all" && (
                  <div style={{ marginTop: 12 }}>
                    <span className="meta">By platform</span>
                    <div className="ud-platform-breakdown">
                      {Object.entries(totalImpressions.per_platform).map(([platform, value]) => (
                        <div key={platform} className="ud-platform-row">
                          <span style={{ textTransform: "capitalize" }}>{platform}</span>
                          <strong>{(value as number).toLocaleString()}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </section>

        {/* Settings */}
        <section className="ud-section" id="tab-settings" ref={(el) => { if (el) sectionRefs.current.set("settings", el); }}>
          <h2>Settings</h2>
          <div className="ud-settings-group">
            <div className="ud-setting-row">
              <div>
                <strong>Email</strong>
                <p className="ud-setting-value">{user.email}</p>
              </div>
            </div>
            <div className="ud-setting-row">
              <div>
                <strong>Account Created</strong>
                <p className="ud-setting-value">{new Date(user.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="ud-setting-row">
              <div>
                <strong>Timezone</strong>
                <p className="ud-setting-value">{userTimezone}</p>
              </div>
              <select
                className="ud-timezone-select"
                value={userTimezone}
                onChange={(e) => {
                  setUserTimezone(e.target.value);
                  onTimezoneChange?.(e.target.value);
                }}
              >
                {[
                  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                  "America/Toronto", "America/Vancouver", "America/Sao_Paulo", "America/Mexico_City",
                  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid",
                  "Europe/Amsterdam", "Europe/Istanbul", "Europe/Moscow",
                  "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
                  "Asia/Singapore", "Asia/Hong_Kong", "Asia/Jakarta",
                  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
                  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg",
                  "UTC",
                ].map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="ud-setting-row">
              <div>
                <strong>Plan</strong>
                <p className="ud-setting-value">{hasProSubscription ? "Pro" : "Free"}</p>
              </div>
              {hasProSubscription ? (
                <span className="ud-plan-badge">Active</span>
              ) : (
                <button className="ud-action-button" onClick={onShowPaywall}>Upgrade</button>
              )}
            </div>
          </div>
          <button className="ud-logout-button" onClick={onLogout}>
            Sign out
          </button>
        </section>
      </main>

      {/* Post preview overlay */}
      {previewPost && (
        <div className="ud-preview-overlay" onClick={() => setPreviewPost(null)}>
          <div className="ud-preview-card" onClick={(e) => e.stopPropagation()}>
            <button className="ud-preview-close" onClick={() => setPreviewPost(null)}>×</button>
            <div className="ud-preview-media">
              {previewPost.format === "Video" ? (
                <video src={previewPost.assetUrl} controls autoPlay muted playsInline />
              ) : (
                <img src={previewPost.assetUrl} alt={previewPost.name} />
              )}
            </div>
            <div className="ud-preview-details">
              <span className={`ud-calendar-day-popup-status ${previewPost.status === "completed" ? "ud-status--posted" : "ud-status--scheduled"}`}>
                {previewPost.status === "completed" ? "Posted" : "Scheduled"} · {previewPost.time}
              </span>
              {previewPost.caption && <p className="ud-preview-caption">{previewPost.caption}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
