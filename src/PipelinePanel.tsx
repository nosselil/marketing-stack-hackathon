import { useEffect, useRef, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { SOCIAL_PLATFORMS } from "./socialIcons";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.port === "5173"
    ? "http://127.0.0.1:3001"
    : "");

type SocialPage = {
  id: string;
  name: string;
  platform: string;
};

export type Pipeline = {
  id: string;
  dbId?: string;
  name: string;
  postType: string;
  format: string;
  thumbnailUrl: string | null;
  socials: string[];
  frequency: string;
  preferredTime: string;
  guidance: string;
  referenceImages: string[];
  enabled: boolean;
  lastGenerated: string | null;
  lastPosted: string | null;
  nextScheduled: string | null;
  generatedExamples: Array<{ id: string; url: string; date: string }>;
  facebookPageId?: string | null;
  linkedinPageId?: string | null;
};

export type ConnectedAccount = {
  platform: string;
  username: string;
  connected: boolean;
};

type TestGenerateResult = { url: string; caption: string; format: string };

type PipelinePanelProps = {
  pipelines: Pipeline[];
  onUpdate: (pipelines: Pipeline[]) => void;
  brandName: string;
  connectedAccounts?: ConnectedAccount[];
  onTestPipeline?: (pipeline: Pipeline) => Promise<void> | void;
  onTestGenerate?: (pipeline: Pipeline) => Promise<TestGenerateResult | null>;
  onTestPost?: (pipeline: Pipeline, assetUrl: string, caption: string) => Promise<void>;
  onConnectAccounts?: () => void;
  profileUsername?: string;
  voiceTranscript?: string | null;
  voiceIsSpeaking?: boolean;
  voiceStarted?: boolean;
  onStartVoice?: () => void;
  onEndVoice?: () => void;
  hasProSubscription?: boolean;
  onShowPaywall?: () => void;
};

const POST_TYPES = [
  { id: "graphic", label: "Graphic Post", format: "Image", requiresPro: false },
  { id: "lifestyle", label: "Lifestyle Shot", format: "Image", requiresPro: false },
  { id: "kling-video", label: "Loop Video", format: "Video", requiresPro: true },
  { id: "remotion-video", label: "Motion Design Video", format: "Video", requiresPro: true },
];

const SOCIALS = SOCIAL_PLATFORMS;

const FREQUENCIES = [
  "Every day",
  "Every 2 days",
  "Every 3 days",
  "Weekly",
  "Twice a week",
  "3x per week",
];

export function PipelinePanel({ pipelines, onUpdate, brandName, connectedAccounts = [], onTestPipeline, onTestGenerate, onTestPost, onConnectAccounts, profileUsername, voiceTranscript, voiceIsSpeaking, voiceStarted, onStartVoice, onEndVoice, hasProSubscription, onShowPaywall }: PipelinePanelProps) {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const [availablePages, setAvailablePages] = useState<SocialPage[]>([]);
  const [testingPipelineId, setTestingPipelineId] = useState<string | null>(null);
  const [testResultMessage, setTestResultMessage] = useState<{ pipelineId: string; type: "success" | "error"; text: string } | null>(null);
  const [timelinePopup, setTimelinePopup] = useState<number | null>(null);

  // Test modal state — each pipeline gets its own persistent session
  type TestModalSession = {
    generating: boolean;
    result: TestGenerateResult | null;
    error: string | null;
    autoPost: boolean;
    posting: boolean;
    postedAt: string | null;
    elapsedMs: number;
    generationCount: number;
  };
  const [testSessions, setTestSessions] = useState<Record<string, TestModalSession>>({});
  const [testModalPipelineId, setTestModalPipelineId] = useState<string | null>(null);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const testModalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to get/update the current modal's session
  const testModalPipeline = testModalPipelineId ? pipelines.find((p) => p.id === testModalPipelineId) || null : null;
  const testSession = testModalPipelineId ? (testSessions[testModalPipelineId] || { generating: false, result: null, error: null, autoPost: false, posting: false, postedAt: null, elapsedMs: 0, generationCount: 0 }) : null;

  function updateTestSession(pipelineId: string, patch: Partial<TestModalSession>) {
    setTestSessions((prev) => ({
      ...prev,
      [pipelineId]: { ...(prev[pipelineId] || { generating: false, result: null, error: null, autoPost: false, posting: false, postedAt: null, elapsedMs: 0, generationCount: 0 }), ...patch },
    }));
  }

  const fetchPages = useCallback(async () => {
    if (!profileUsername) return;
    // Fetch Facebook pages
    try {
      const fbRes = await fetch(`${API_BASE}/api/uploadposts/facebook/pages?profile=${profileUsername}`);
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        const pages: SocialPage[] = (fbData.pages || fbData || []).map((p: any) => ({
          id: p.id || p.page_id,
          name: p.name || p.page_name,
          platform: "facebook",
        }));
        // Also try LinkedIn pages from the same pattern
        try {
          const liRes = await fetch(`${API_BASE}/api/uploadposts/linkedin/pages?profile=${profileUsername}`);
          if (liRes.ok) {
            const liData = await liRes.json();
            const liPages: SocialPage[] = (liData.pages || liData || []).map((p: any) => ({
              id: p.id || p.page_id,
              name: p.name || p.page_name,
              platform: "linkedin",
            }));
            setAvailablePages([...pages, ...liPages]);
            return;
          }
        } catch {
          // LinkedIn pages endpoint may not exist
        }
        setAvailablePages(pages);
      }
    } catch {
      // Pages endpoint may not be available
    }
  }, [profileUsername]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // Listen for voice agent events
  useEffect(() => {
    const handleSelect = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id) setSelectedPipelineId(detail.id);
    };
    const handleOpenTest = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const pipeline = pipelines.find((p) => p.id === detail?.id);
      if (pipeline) openTestModal(pipeline);
    };
    const handleCloseTest = () => closeTestModal();
    const handleSetAutopost = (e: Event) => {
      const enabled = (e as CustomEvent).detail?.enabled;
      if (testModalPipelineId) {
        updateTestSession(testModalPipelineId, { autoPost: !!enabled });
      }
    };
    const handleTriggerGenerate = () => handleTestGenerate();
    const handleShowNewForm = () => setShowNewForm(true);
    const handleHideNewForm = () => setShowNewForm(false);

    window.addEventListener("botface-select-pipeline", handleSelect);
    window.addEventListener("botface-open-test-modal", handleOpenTest);
    window.addEventListener("botface-close-test-modal", handleCloseTest);
    window.addEventListener("botface-set-autopost", handleSetAutopost);
    window.addEventListener("botface-trigger-test-generate", handleTriggerGenerate);
    window.addEventListener("botface-show-new-form", handleShowNewForm);
    window.addEventListener("botface-hide-new-form", handleHideNewForm);
    return () => {
      window.removeEventListener("botface-select-pipeline", handleSelect);
      window.removeEventListener("botface-open-test-modal", handleOpenTest);
      window.removeEventListener("botface-close-test-modal", handleCloseTest);
      window.removeEventListener("botface-set-autopost", handleSetAutopost);
      window.removeEventListener("botface-trigger-test-generate", handleTriggerGenerate);
      window.removeEventListener("botface-show-new-form", handleShowNewForm);
      window.removeEventListener("botface-hide-new-form", handleHideNewForm);
    };
  }, [pipelines, testModalPipelineId]);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) || null;

  // Test modal helpers
  function openTestModal(pipeline: Pipeline) {
    setTestModalPipelineId(pipeline.id);
    setTestModalVisible(true);
  }

  function closeTestModal() {
    setTestModalVisible(false);
  }

  // Keep a ref so the async generate callback can read the latest autoPost value
  const testSessionsRef = useRef(testSessions);
  testSessionsRef.current = testSessions;

  const MAX_TEST_GENERATIONS = 2;

  async function handleTestGenerate() {
    const pid = testModalPipelineId;
    const pipeline = testModalPipeline;
    if (!pid || !pipeline || !onTestGenerate) return;
    const currentSession = testSessions[pid];
    const count = currentSession?.generationCount || 0;
    if (count >= MAX_TEST_GENERATIONS) {
      updateTestSession(pid, { error: `You've used all ${MAX_TEST_GENERATIONS} test generations for this pipeline. Tests are limited to avoid excessive API usage.` });
      return;
    }
    updateTestSession(pid, { generating: true, result: null, error: null, elapsedMs: 0, generationCount: count + 1 });
    const startTime = Date.now();
    if (testModalTimerRef.current) clearInterval(testModalTimerRef.current);
    testModalTimerRef.current = setInterval(() => {
      updateTestSession(pid, { elapsedMs: Date.now() - startTime });
    }, 500);
    try {
      const result = await onTestGenerate(pipeline);
      if (testModalTimerRef.current) clearInterval(testModalTimerRef.current);
      if (result) {
        updateTestSession(pid, { result, generating: false });
        // Auto-post if toggle was on (read from ref to avoid stale closure)
        const latestSession = testSessionsRef.current[pid];
        if (latestSession?.autoPost && onTestPost) {
          updateTestSession(pid, { posting: true });
          try {
            await onTestPost(pipeline, result.url, result.caption);
            updateTestSession(pid, { postedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), posting: false });
          } catch (e) {
            updateTestSession(pid, { error: e instanceof Error ? e.message : "Posting failed.", posting: false });
          }
        }
      } else {
        updateTestSession(pid, { error: "Generation returned no result.", generating: false });
      }
    } catch (e) {
      if (testModalTimerRef.current) clearInterval(testModalTimerRef.current);
      updateTestSession(pid, { error: e instanceof Error ? e.message : "Generation failed.", generating: false });
    }
  }

  async function handleTestPost() {
    const pid = testModalPipelineId;
    const pipeline = testModalPipeline;
    const session = pid ? testSessions[pid] : null;
    if (!pid || !pipeline || !session?.result || !onTestPost) return;
    updateTestSession(pid, { posting: true });
    try {
      await onTestPost(pipeline, session.result.url, session.result.caption);
      updateTestSession(pid, { postedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), posting: false });
    } catch (e) {
      updateTestSession(pid, { error: e instanceof Error ? e.message : "Posting failed.", posting: false });
    }
  }

  // Render the test modal
  const testModal = (testModalVisible && testModalPipeline && testSession) ? (
    <div className="test-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeTestModal(); }}>
      <div className="test-modal-card">
        <button className="test-modal-close" onClick={closeTestModal}>&times;</button>

        {/* Header */}
        <div className="test-modal-header">
          <div className="test-modal-thumb">
            {testModalPipeline.thumbnailUrl ? (
              <img src={testModalPipeline.thumbnailUrl} alt="" />
            ) : (
              <div className="pipeline-thumb-placeholder">{testModalPipeline.format === "Video" ? "\uD83C\uDFAC" : "\uD83D\uDDBC\uFE0F"}</div>
            )}
          </div>
          <div className="test-modal-header-info">
            <h3>{testModalPipeline.name}</h3>
            <span className="meta">{testModalPipeline.postType} · {testModalPipeline.format}</span>
          </div>
        </div>

        {/* Preview frame */}
        <div className="test-modal-preview">
          {testSession.generating ? (
            <div className="test-modal-preview-loading">
              <div className="generation-progress">
                <div className="generation-progress-bar">
                  <div className="generation-progress-fill" style={{ width: `${Math.min(95, (testSession.elapsedMs / 1000 / (testModalPipeline.format === "Video" ? 120 : 45)) * 100)}%` }} />
                </div>
                <div className="generation-progress-info">
                  <strong>{(testSession.elapsedMs / 1000).toFixed(0)}s</strong>
                  <span className="meta">~{testModalPipeline.format === "Video" ? "2min" : "45s"} estimated</span>
                </div>
                <span className="test-modal-loader-label">Generating {testModalPipeline.format === "Video" ? "video" : "image"}...</span>
              </div>
            </div>
          ) : testSession.result ? (
            <div className="test-modal-preview-result">
              {testSession.result.format === "Video" || testSession.result.url.endsWith(".mp4") ? (
                <video src={testSession.result.url} controls autoPlay muted loop playsInline className="test-modal-media" />
              ) : (
                <img src={testSession.result.url} alt="Generated asset" className="test-modal-media" />
              )}
            </div>
          ) : (
            <div className="test-modal-preview-empty">
              <span>{testModalPipeline.format === "Video" ? "\uD83C\uDFAC" : "\uD83D\uDDBC\uFE0F"}</span>
              <p>Click Generate to create a test asset</p>
            </div>
          )}
        </div>

        {/* Caption */}
        {testSession.result && (
          <div className="test-modal-caption">
            <span className="meta">Caption</span>
            <p>{testSession.result.caption}</p>
          </div>
        )}

        {/* Error */}
        {testSession.error && (
          <div className="test-modal-error">{testSession.error}</div>
        )}

        {/* Controls */}
        <div className="test-modal-controls">
          {!testSession.result && !testSession.generating && (
            <>
              <label className="test-modal-toggle">
                <input
                  type="checkbox"
                  checked={testSession.autoPost}
                  onChange={(e) => testModalPipelineId && updateTestSession(testModalPipelineId, { autoPost: e.target.checked })}
                />
                <span className="test-modal-toggle-switch" />
                <span className="test-modal-toggle-label">Auto-post when ready</span>
              </label>
              <button className="test-modal-generate-btn" onClick={handleTestGenerate} disabled={!onTestGenerate || (testSession.generationCount >= MAX_TEST_GENERATIONS)}>
                Generate ({MAX_TEST_GENERATIONS - (testSession.generationCount || 0)} left)
              </button>
            </>
          )}
          {testSession.generating && (
            <button className="test-modal-generate-btn" disabled>
              Generating...
            </button>
          )}
          {testSession.result && !testSession.postedAt && !testSession.posting && (
            <button className="test-modal-post-btn" onClick={handleTestPost} disabled={!onTestPost}>
              Post Now
            </button>
          )}
          {testSession.posting && (
            <button className="test-modal-post-btn" disabled>
              Posting...
            </button>
          )}
          {testSession.postedAt && (
            <button className="test-modal-posted-btn" disabled>
              Posted at {testSession.postedAt}
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  function addPipeline(pipeline: Pipeline) {
    onUpdate([...pipelines, pipeline]);
    setSelectedPipelineId(pipeline.id);
    setShowNewForm(false);
  }

  function updatePipeline(id: string, updates: Partial<Pipeline>) {
    onUpdate(pipelines.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  function handleDeletePipeline(id: string) {
    const pipeline = pipelines.find((p) => p.id === id);
    onUpdate(pipelines.filter((p) => p.id !== id));
    if (selectedPipelineId === id) setSelectedPipelineId(null);
    if (testModalPipelineId === id) { setTestModalVisible(false); setTestModalPipelineId(null); }
    setTestSessions((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (pipeline?.dbId) {
      import("./db").then(({ deletePipeline }) => {
        deletePipeline(pipeline.dbId!).catch(() => {});
      });
      // Cancel any pending jobs for this pipeline
      fetch(`${API_BASE}/api/pipelines/cancel-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId: pipeline.dbId }),
      }).catch(() => {});
    }
  }

  // Pipeline detail view
  if (selectedPipeline) {
    return (
      <div className="pipeline-detail">
        <button className="pipeline-back" onClick={() => setSelectedPipelineId(null)}>
          ← All Pipelines
        </button>

        <div className="pipeline-detail-header">
          <div className="pipeline-detail-thumb">
            {selectedPipeline.thumbnailUrl ? (
              <img src={selectedPipeline.thumbnailUrl} alt="" />
            ) : (
              <div className="pipeline-thumb-placeholder">{selectedPipeline.format === "Video" ? "🎬" : "🖼️"}</div>
            )}
          </div>
          <div className="pipeline-detail-info">
            <h3>{selectedPipeline.name}</h3>
            <span className="meta">{selectedPipeline.postType} · {selectedPipeline.format}</span>
          </div>
          <div className={`pipeline-status ${selectedPipeline.enabled ? "active" : "paused"}`}>
            {selectedPipeline.enabled ? "Active" : "Paused"}
          </div>
        </div>

        {/* Generated examples carousel */}
        {selectedPipeline.generatedExamples.length > 0 && (
          <div className="pipeline-section">
            <span className="meta">Recent Generations</span>
            <div className="pipeline-examples-scroll">
              {selectedPipeline.generatedExamples.map((ex) => (
                <div key={ex.id} className="pipeline-example-card">
                  <img src={ex.url} alt="" />
                  <span className="meta">{ex.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected accounts for this pipeline */}
        <div className="pipeline-section">
          <span className="meta">Post to</span>
          <div className="pipeline-socials-grid">
            {SOCIALS.map((social) => {
              const isSelected = selectedPipeline.socials.includes(social.id);
              const connectedAccount = connectedAccounts.find((a) => {
                const p = a.platform.toLowerCase();
                const s = social.id.toLowerCase();
                return a.connected && p === s;
              });
              const isFb = social.id === "facebook";
              const isLi = social.id === "linkedin";
              const needsPage = (isFb || isLi) && isSelected && connectedAccount;
              const pages = availablePages.filter((pg) => pg.platform === social.id);
              const thisPageId = isFb ? selectedPipeline.facebookPageId : isLi ? selectedPipeline.linkedinPageId : null;
              const currentPage = pages.find((pg) => pg.id === thisPageId);

              return (
                <div key={social.id} className={`pipeline-social-chip ${isSelected ? "selected" : ""}`}>
                  <button
                    className="pipeline-social-chip-btn"
                    onClick={() => {
                      const next = isSelected
                        ? selectedPipeline.socials.filter((s) => s !== social.id)
                        : [...selectedPipeline.socials, social.id];
                      updatePipeline(selectedPipeline.id, { socials: next });
                    }}
                  >
                    <span className="social-icon-svg" style={{ color: social.color }} dangerouslySetInnerHTML={{ __html: social.icon }} />
                  </button>
                  {needsPage && pages.length > 0 ? (
                    <select
                      className="pipeline-page-dropdown"
                      value={thisPageId || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const newPageId = e.target.value || null;
                        if (isFb) {
                          updatePipeline(selectedPipeline.id, { facebookPageId: newPageId });
                        } else {
                          updatePipeline(selectedPipeline.id, { linkedinPageId: newPageId });
                        }
                      }}
                    >
                      <option value="">Select page...</option>
                      {pages.map((pg) => (
                        <option key={pg.id} value={pg.id}>{pg.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="pipeline-social-chip-label" onClick={() => {
                      const next = isSelected
                        ? selectedPipeline.socials.filter((s) => s !== social.id)
                        : [...selectedPipeline.socials, social.id];
                      updatePipeline(selectedPipeline.id, { socials: next });
                    }}>{connectedAccount ? `@${connectedAccount.username}` : social.label}</span>
                  )}
                  {isSelected && (
                    <span className={`pipeline-connect-badge ${connectedAccount ? (needsPage && !currentPage ? "not-connected" : "connected") : "not-connected"}`}>
                      {connectedAccount ? (needsPage && !currentPage ? "!" : "✓") : "!"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const hasUnconnected = selectedPipeline.socials.some((s) => {
              const sl = s.toLowerCase();
              return !connectedAccounts.find((a) => {
                const p = a.platform.toLowerCase();
                return a.connected && p === sl;
              });
            });
            const needsFbPage = selectedPipeline.socials.includes("facebook") && !selectedPipeline.facebookPageId && availablePages.some((p) => p.platform === "facebook");
            const needsLiPage = selectedPipeline.socials.includes("linkedin") && !selectedPipeline.linkedinPageId && availablePages.some((p) => p.platform === "linkedin");
            const needsPage = needsFbPage || needsLiPage;
            return (hasUnconnected || needsPage) ? (
              <div className="pipeline-connect-cta">
                <p className="pipeline-connect-warning">
                  {hasUnconnected ? "Some selected accounts are not connected." : "Select the Facebook or LinkedIn page to post to."}
                </p>
                {hasUnconnected && (
                  <button className="pipeline-connect-btn" onClick={onConnectAccounts}>
                    Connect Accounts
                  </button>
                )}
              </div>
            ) : null;
          })()}
        </div>

        {/* Frequency + Time */}
        <div className="pipeline-section">
          <span className="meta">Schedule</span>
          <div className="pipeline-schedule-row">
            <select
              className="pipeline-select"
              value={selectedPipeline.frequency}
              onChange={(e) => updatePipeline(selectedPipeline.id, { frequency: e.target.value })}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <input
              type="time"
              className="pipeline-time-input"
              value={selectedPipeline.preferredTime || "09:00"}
              onChange={(e) => updatePipeline(selectedPipeline.id, { preferredTime: e.target.value })}
            />
          </div>
        </div>

        {/* Content direction */}
        <div className="pipeline-section">
          <span className="meta">Content Direction</span>
          <textarea
            className="pipeline-textarea"
            placeholder="E.g. Focus on product benefits, use minimal text, highlight pricing..."
            value={selectedPipeline.guidance}
            onChange={(e) => updatePipeline(selectedPipeline.id, { guidance: e.target.value })}
            rows={3}
          />
        </div>

        {/* Reference images */}
        <div className="pipeline-section">
          <span className="meta">Reference Images</span>
          <div className="pipeline-ref-images">
            {selectedPipeline.referenceImages.map((img, i) => (
              <div key={i} className="pipeline-ref-img">
                <img src={img} alt="" />
                <button
                  className="pipeline-ref-remove"
                  onClick={() => {
                    updatePipeline(selectedPipeline.id, {
                      referenceImages: selectedPipeline.referenceImages.filter((_, j) => j !== i),
                    });
                  }}
                >✕</button>
              </div>
            ))}
            <button
              className="pipeline-ref-add"
              onClick={() => refImageInputRef.current?.click()}
            >
              <Plus size={16} />
            </button>
          </div>
          <input
            ref={refImageInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              files.forEach((file) => {
                const reader = new FileReader();
                reader.onload = () => {
                  updatePipeline(selectedPipeline.id, {
                    referenceImages: [...selectedPipeline.referenceImages, reader.result as string],
                  });
                };
                reader.readAsDataURL(file);
              });
            }}
          />
        </div>

        {/* Stats */}
        <div className="pipeline-section">
          <span className="meta">Activity</span>
          <div className="pipeline-stats">
            <div className="pipeline-stat-row">
              <span>Last generated</span>
              <span className="meta">{selectedPipeline.lastGenerated ? new Date(selectedPipeline.lastGenerated).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}</span>
            </div>
            <div className="pipeline-stat-row">
              <span>Last posted</span>
              <span className="meta">{selectedPipeline.lastPosted ? new Date(selectedPipeline.lastPosted).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}</span>
            </div>
            <div className="pipeline-stat-row">
              <span>Next scheduled</span>
              <span className="meta">{selectedPipeline.nextScheduled ? new Date(selectedPipeline.nextScheduled).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not scheduled"}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {/* Test result message */}
        {testResultMessage && testResultMessage.pipelineId === selectedPipeline.id && (
          <div className={`pipeline-test-result ${testResultMessage.type}`} style={{
            padding: "8px 12px",
            marginBottom: 8,
            borderRadius: 6,
            fontSize: 13,
            background: testResultMessage.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: testResultMessage.type === "success" ? "#16a34a" : "#dc2626",
          }}>
            {testResultMessage.text}
          </div>
        )}

        <div className="pipeline-actions">
          <button
            className="pipeline-test-btn"
            disabled={testingPipelineId === selectedPipeline.id}
            onClick={() => {
              if (onTestGenerate) {
                openTestModal(selectedPipeline);
              } else if (onTestPipeline) {
                // Legacy fallback
                setTestingPipelineId(selectedPipeline.id);
                setTestResultMessage(null);
                (async () => {
                  try {
                    await onTestPipeline(selectedPipeline);
                    setTestResultMessage({ pipelineId: selectedPipeline.id, type: "success", text: "Test completed successfully. Check your connected accounts." });
                  } catch (err) {
                    setTestResultMessage({ pipelineId: selectedPipeline.id, type: "error", text: err instanceof Error ? err.message : "Test failed. Please try again." });
                  } finally {
                    setTestingPipelineId(null);
                  }
                })();
              }
            }}
          >
            {testingPipelineId === selectedPipeline.id ? "\u23F3 Testing..." : "\u25B6 Test Pipeline"}
          </button>
          <button
            className={`pipeline-toggle-btn ${selectedPipeline.enabled ? "active" : ""}`}
            onClick={() => updatePipeline(selectedPipeline.id, { enabled: !selectedPipeline.enabled })}
          >
            {selectedPipeline.enabled ? "Pause" : "Activate"}
          </button>
          <button className="pipeline-delete-btn" onClick={() => handleDeletePipeline(selectedPipeline.id)}>
            Delete
          </button>
        </div>
        {testModal}
      </div>
    );
  }

  // New pipeline form
  if (showNewForm) {
    return <>{testModal}<NewPipelineForm brandName={brandName} onAdd={addPipeline} onCancel={() => setShowNewForm(false)} hasProSubscription={hasProSubscription} onShowPaywall={onShowPaywall} /></>;
  }

  // Build today's timeline (midnight to midnight, user's local time)
  const timelineData = (() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const totalMinutes = 24 * 60;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowPct = (nowMinutes / totalMinutes) * 100;

    const markers = [
      { label: "12am", hour: 0 },
      { label: "2am", hour: 2 },
      { label: "4am", hour: 4 },
      { label: "6am", hour: 6 },
      { label: "8am", hour: 8 },
      { label: "10am", hour: 10 },
      { label: "12pm", hour: 12 },
      { label: "2pm", hour: 14 },
      { label: "4pm", hour: 16 },
      { label: "6pm", hour: 18 },
      { label: "8pm", hour: 20 },
      { label: "10pm", hour: 22 },
    ].map((m) => ({ ...m, pct: (m.hour * 60) / totalMinutes * 100 }));

    const items: { time: Date; name: string; format: string; postType: string; pct: number }[] = [];
    for (const p of pipelines) {
      if (!p.enabled) continue;
      const [h, m] = (p.preferredTime || "09:00").split(":").map(Number);
      const postTime = new Date(todayStart);
      postTime.setHours(h, m, 0, 0);
      const postMinutes = h * 60 + m;
      items.push({
        time: postTime,
        name: p.name,
        format: p.format,
        postType: p.postType,
        pct: (postMinutes / totalMinutes) * 100,
      });
    }
    return { nowPct, markers, items: items.sort((a, b) => a.pct - b.pct) };
  })();

  // Pipeline list view
  return (
    <div className="pipeline-list">
      {/* Voice agent bar */}
      {voiceStarted && (
        <div className="pipeline-voice-bar">
          <div className="pipeline-voice-left">
            <div className={`voice-agent-dot ${voiceIsSpeaking ? "voice-agent-dot--speaking" : ""}`} />
            <div className="pipeline-voice-text">
              <span className="meta">{voiceIsSpeaking ? "MS is speaking..." : "Listening..."}</span>
              {voiceTranscript && <p className="pipeline-voice-transcript">{voiceTranscript}</p>}
              {onEndVoice && (
                <button className="pipeline-voice-end-btn" onClick={onEndVoice}>
                  End call
                </button>
              )}
            </div>
          </div>
          <div className="pipeline-voice-avatar">
            <img src="/botface-dashboard.webp" alt="MS" className={voiceIsSpeaking ? "speaking" : ""} />
          </div>
        </div>
      )}
      {!voiceStarted && onStartVoice && (
        <button className="voice-agent-start-btn pipeline-voice-btn" onClick={onStartVoice}>
          <span>🎙</span> Talk to MS
        </button>
      )}

      {/* Today's timeline (midnight to midnight) */}
      {pipelines.length > 0 && (
        <div className="pipeline-timeline">
          <div className="pipeline-timeline-labels">
            {timelineData.markers.map((m) => (
              <span key={m.label} style={{ position: "absolute", left: `${m.pct}%`, transform: "translateX(-50%)" }}>{m.label}</span>
            ))}
          </div>
          <div className="pipeline-timeline-track">
            <div className="pipeline-timeline-now" style={{ left: `${timelineData.nowPct}%` }} title={`Now — ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} />
            {timelineData.items.map((item, i) => (
              <div
                key={i}
                className={`pipeline-timeline-post ${item.pct < timelineData.nowPct ? "pipeline-timeline-post--past" : ""}`}
                style={{ left: `${item.pct}%` }}
              >
                <span
                  className="pipeline-timeline-post-dot"
                  onMouseEnter={() => setTimelinePopup(i)}
                  onMouseLeave={() => setTimelinePopup(null)}
                />
                {timelinePopup === i && (
                  <div className="pipeline-timeline-popover">
                    <span className="pipeline-timeline-popover-type">{item.format === "Video" ? "📹 Video" : "🖼 Image"}</span>
                    <strong>{item.name}</strong>
                    <span className="meta">{item.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {pipelines.length === 0 ? (
        <div className="pipeline-empty">
          <p>No pipelines yet</p>
          <span className="meta">Create a pipeline to automate content creation and posting.</span>
        </div>
      ) : (
        pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="pipeline-card"
            onClick={() => setSelectedPipelineId(pipeline.id)}
          >
            <div className="pipeline-card-thumb">
              {pipeline.thumbnailUrl ? (
                <img src={pipeline.thumbnailUrl} alt="" />
              ) : (
                <div className="pipeline-thumb-placeholder">{pipeline.format === "Video" ? "🎬" : "🖼️"}</div>
              )}
            </div>
            <div className="pipeline-card-info">
              <strong>{pipeline.name}</strong>
              <span className="meta">{pipeline.postType} · {pipeline.frequency}</span>
              <div className="pipeline-card-socials">
                {pipeline.socials.map((s) => {
                  const social = SOCIALS.find((x) => x.id === s);
                  return social ? <span key={s} title={social.label} className="social-icon-svg-sm" style={{ color: social.color }} dangerouslySetInnerHTML={{ __html: social.icon }} /> : null;
                })}
              </div>
            </div>
            <div className={`pipeline-status-dot ${pipeline.enabled ? "active" : ""}`} />
          </div>
        ))
      )}
      <button className="pipeline-add-btn" onClick={() => setShowNewForm(true)}>
        <Plus size={16} />
        New Pipeline
      </button>
      {testModal}
    </div>
  );
}

function NewPipelineForm({
  brandName,
  onAdd,
  onCancel,
  hasProSubscription,
  onShowPaywall,
}: {
  brandName: string;
  onAdd: (p: Pipeline) => void;
  onCancel: () => void;
  hasProSubscription?: boolean;
  onShowPaywall?: () => void;
}) {
  const [postType, setPostType] = useState(POST_TYPES[0].id);
  const [selectedSocials, setSelectedSocials] = useState<string[]>(["instagram"]);
  const [frequency, setFrequency] = useState("Every day");
  const [preferredTime, setPreferredTime] = useState("09:00");
  const [guidance, setGuidance] = useState("");

  const typeInfo = POST_TYPES.find((t) => t.id === postType) || POST_TYPES[0];

  return (
    <div className="pipeline-new-form">
      <button className="pipeline-back" onClick={onCancel}>← Cancel</button>
      <h3>New Pipeline</h3>

      <div className="pipeline-section">
        <span className="meta">Post Type</span>
        <div className="pipeline-type-grid">
          {POST_TYPES.map((type) => {
            const locked = type.requiresPro && !hasProSubscription;
            return (
              <button
                key={type.id}
                className={`pipeline-type-option ${postType === type.id ? "selected" : ""} ${locked ? "pipeline-type-locked" : ""}`}
                onClick={() => {
                  if (locked) { onShowPaywall?.(); return; }
                  setPostType(type.id);
                }}
              >
                <span>{type.format === "Video" ? "🎬" : "🖼️"}</span>
                <span>{type.label}</span>
                {locked && <span className="pipeline-lock-icon">🔒</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pipeline-section">
        <span className="meta">Post to</span>
        <div className="pipeline-socials-grid">
          {SOCIALS.map((social) => {
            const isSelected = selectedSocials.includes(social.id);
            return (
              <button
                key={social.id}
                className={`pipeline-social-chip ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  setSelectedSocials((prev) =>
                    isSelected ? prev.filter((s) => s !== social.id) : [...prev, social.id]
                  );
                }}
              >
                <span className="social-icon-svg" style={{ color: social.color }} dangerouslySetInnerHTML={{ __html: social.icon }} />
                <span>{social.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pipeline-section">
        <span className="meta">Schedule</span>
        <div className="pipeline-schedule-row">
          <select className="pipeline-select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input
            type="time"
            className="pipeline-time-input"
            value={preferredTime}
            onChange={(e) => setPreferredTime(e.target.value)}
          />
        </div>
      </div>

      <div className="pipeline-section">
        <span className="meta">Content Direction (optional)</span>
        <textarea
          className="pipeline-textarea"
          placeholder="E.g. Focus on product benefits, showcase customer reviews..."
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          rows={2}
        />
      </div>

      <button
        className="pipeline-create-btn"
        onClick={() => {
          onAdd({
            id: `pipeline-${Date.now()}`,
            name: `${typeInfo.label} for ${brandName}`,
            postType: typeInfo.label,
            format: typeInfo.format,
            thumbnailUrl: null,
            socials: selectedSocials,
            frequency,
            preferredTime,
            guidance,
            referenceImages: [],
            enabled: true,
            lastGenerated: null,
            lastPosted: null,
            nextScheduled: null,
            generatedExamples: [],
          });
        }}
      >
        Create Pipeline
      </button>
    </div>
  );
}
