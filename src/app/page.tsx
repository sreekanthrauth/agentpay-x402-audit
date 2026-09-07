"use client";

import { FormEvent, useEffect, useState } from "react";

const stages = [
  {
    key: "request",
    step: "01",
    icon: "↳",
    title: "Contract received",
    description: "Your contract has entered the agent workflow.",
  },
  {
    key: "signing",
    step: "02",
    icon: "◈",
    title: "Payment authorized",
    description: "The agent authorizes the audit payment.",
  },
  {
    key: "broadcasting",
    step: "03",
    icon: "↑",
    title: "Transaction submitted",
    description: "Payment is sent to Algorand TestNet.",
  },
  {
    key: "confirmed",
    step: "04",
    icon: "✓",
    title: "Blockchain confirmed",
    description: "The transaction has been included on-chain.",
  },
  {
    key: "verified",
    step: "05",
    icon: "◎",
    title: "Payment verified",
    description: "Audit access has been securely unlocked.",
  },
  {
    key: "auditing",
    step: "06",
    icon: "✦",
    title: "AI analyzing",
    description: "The agent is reviewing your contract for risks.",
  },
  {
    key: "complete",
    step: "07",
    icon: "✓",
    title: "Security findings ready",
    description: "Your audit report is now available.",
  },
] as const;

type AuditFinding = {
  severity: string;
  issue: string;
  why: string;
  fix: string;
};

function cleanAuditText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getAuditSection(
  report: string,
  heading: string,
  nextHeadings: string[],
) {
  const start = report.search(
    new RegExp(`^##\\s+${heading}\\s*$`, "im"),
  );

  if (start === -1) return "";

  const afterHeading = report.slice(
    start + report.slice(start).indexOf("\n") + 1,
  );

  let end = afterHeading.length;

  for (const next of nextHeadings) {
    const match = afterHeading.search(
      new RegExp(`^##\\s+${next}\\s*$`, "im"),
    );

    if (match !== -1) {
      end = Math.min(end, match);
    }
  }

  return afterHeading.slice(0, end).trim();
}

function parseAuditReport(report: string) {
  const overview = cleanAuditText(
    getAuditSection(
      report,
      "Contract Overview",
      ["Risk Summary", "Findings"],
    ),
  );

  const riskSummary = cleanAuditText(
    getAuditSection(
      report,
      "Risk Summary",
      ["Findings"],
    ),
  );

  const findingsSection = getAuditSection(
    report,
    "Findings",
    [],
  );

  const findings: AuditFinding[] = findingsSection
    .split("\n")
    .filter(
      (line) =>
        line.trim().startsWith("|") &&
        !line.includes("---") &&
        !/severity\s*\|\s*issue/i.test(line),
    )
    .map((line) =>
      line
        .trim()
        .split("|")
        .slice(1, -1)
        .map((cell) => cleanAuditText(cell)),
    )
    .filter((cells) => cells.length >= 4)
    .map(([severity, issue, why, fix]) => ({
      severity,
      issue,
      why,
      fix,
    }));

  const conclusionMatch = findingsSection.match(
    /\*{0,2}Conclusion:?\*{0,2}\s*([\s\S]*)$/i,
  );

  const conclusion = conclusionMatch
    ? cleanAuditText(conclusionMatch[1])
    : "";

  return {
    overview,
    riskSummary,
    findings,
    conclusion,
  };
}

function severityClass(severity: string) {
  const normalized = severity.toLowerCase();

  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("low")) return "low";

  return "info";
}

function highestSeverity(findings: AuditFinding[]) {
  const order = ["critical", "high", "medium", "low", "info"];

  for (const level of order) {
    if (
      findings.some(
        (finding) =>
          severityClass(finding.severity) === level,
      )
    ) {
      return level;
    }
  }

  return "info";
}

function severityLabel(level: string) {
  return level === "info"
    ? "Informational"
    : level.charAt(0).toUpperCase() + level.slice(1);
}

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [source, setSource] = useState("");
  const [active, setActive] = useState("");
  const [status, setStatus] = useState(
    "Ready. Paste a smart contract to begin."
  );
  const [report, setReport] = useState("");
  const [tx, setTx] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [aiProvider, setAiProvider] = useState("");
  const [aiEstimate, setAiEstimate] = useState("");
  const [aiDuration, setAiDuration] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!source.trim() || loading) return;

    setLoading(true);
    setActive("");
    setStatus("Initializing secure agent workflow...");
    setReport("");
    setError("");
    setTx(null);
    setAiProvider("");
    setAiEstimate("");
    setAiDuration("");

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source,
        }),
      });

      if (!response.body) {
        throw new Error(
          "Could not receive transaction updates."
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, {
          stream: true,
        });

        const messages = buffer.split("\n\n");

        buffer = messages.pop() ?? "";

        for (const message of messages) {
          if (!message.startsWith("data: ")) continue;

          const data = JSON.parse(message.slice(6));

          if (data.event === "error") {
            throw new Error(data.message);
          }

          if (data.event === "submitted") {
            setTx({
              id: data.transactionId,
              url: data.explorerUrl,
            });
          }

          if (data.event === "auditing") {
            setActive("auditing");

            setAiProvider(data.provider ?? "");
            setAiEstimate(data.estimate ?? "");

            setStatus(
              data.provider
                ? `Analyzing with ${data.provider}...`
                : "AI analyzing...",
            );

            continue;
          }

          if (data.event === "switching") {
            setActive("auditing");

            setAiProvider(data.provider ?? "");
            setAiEstimate(data.estimate ?? "");

            setStatus(
              data.message ??
              `Switching to ${data.provider}...`,
            );

            continue;
          }

          if (data.event !== "submitted") {
            setActive(data.event);
          }

          const currentStage = stages.find(
            (stage) => stage.key === data.event,
          );

          setStatus(
            currentStage?.title ?? "Processing...",
          );

          if (data.event === "complete") {
            setReport(data.report);
            setAiProvider(data.provider ?? "");
            setAiDuration(data.duration ?? "");
            setStatus("Security findings ready");
          }
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Audit failed."
      );

      setStatus("Workflow stopped.");
    } finally {
      setLoading(false);
    }
  }

  const activeIndex = stages.findIndex(
    (stage) => stage.key === active
  );

  const hasContract = source.trim().length > 0;

  const parsedReport = report
    ? parseAuditReport(report)
    : null;

  const reportRiskLevel = parsedReport
    ? highestSeverity(parsedReport.findings)
    : "info";

  const workflowProgress =
    activeIndex >= 0
      ? ((activeIndex + 1) / stages.length) * 100
      : 0;

  return (
    <main className="shell">

      {/* HEADER */}

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
          </div>

          <div>
            <strong>AGENTPAY</strong>

            <small>
              Autonomous payment infrastructure
            </small>
          </div>
        </div>

        <div className="header-actions">
          <div className="network-status">
            <span className="network-dot" />

            <span>
              Algorand TestNet
            </span>
          </div>

          <button
            className="theme-toggle"
            type="button"
            onClick={() =>
              setTheme((current) =>
                current === "dark"
                  ? "light"
                  : "dark"
              )
            }
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      {/* HERO */}

      <section className="hero">
        <div className="eyebrow">
          <span className="pulse-dot" />
          AI SMART CONTRACT SECURITY
        </div>

        <h1 className="hero-title">
          <span className="hero-title-main">
            Paste a Smart Contract,
          </span>

          <span className="hero-title-accent">
            Get a security review.
          </span>
        </h1>


        <p className="hero-description">
          Submit your smart contract for an AI-powered security review. An AI agent handles the audit payment, which is verified on Algorand TestNet.
        </p>

        <div className="trust-row">
          <div>
            <span>✦</span>
            AI reviews your code
          </div>

          <div>
            <span>◈</span>
            Payment verified on-chain
          </div>

          <div>
            <span>✓</span>
            Clear security findings
          </div>
        </div>
      </section>


      {/* MAIN WORKSPACE */}

      <section className="how-it-works">
        <div className="how-heading">
          <p className="section-label">
            HOW IT WORKS
          </p>

          <h2>
            Five simple steps
          </h2>

          <p>
            A simple payment and AI review flow.
          </p>
        </div>

        <div className="how-flow">

          <div className="how-step">
            <div className="step-icon">{`{ }`}</div>

            <div className="step-number">01</div>

            <h3>Paste Contract Code</h3>

            <p>
              Add the smart contract code you want reviewed.
            </p>
          </div>

          <div className="flow-arrow">→</div>

          <div className="how-step">
            <div className="step-icon">◈</div>

            <div className="step-number">02</div>

            <h3>Agent Pays for Audit</h3>

            <p>
              The AI agent initiates payment for the contract review.
            </p>
          </div>

          <div className="flow-arrow">→</div>

          <div className="how-step">
            <div className="step-icon">⛓</div>

            <div className="step-number">03</div>

            <h3>Payment Verified on Algorand</h3>

            <p>
              The payment is confirmed and verified on-chain.
            </p>
          </div>

          <div className="flow-arrow">→</div>

          <div className="how-step">
            <div className="step-icon">✦</div>

            <div className="step-number">04</div>

            <h3>AI Reviews Contract</h3>

            <p>
              AI analyzes your contract for potential security issues.
            </p>
          </div>

          <div className="flow-arrow">→</div>

          <div className="how-step success-step">
            <div className="step-icon">✓</div>

            <div className="step-number">05</div>

            <h3>Get Security Findings</h3>

            <p>
              Review your security findings directly in the app.
            </p>
          </div>

        </div>
      </section>

      <section className="workspace">

        {/* LEFT */}

        <form onSubmit={submit}>

          <div className="step-label">
            <span>01</span>

            <p>
              CONTRACT INPUT
            </p>
          </div>

          <div className="form-title">
            <div>
              <h2>
                Add your contract
              </h2>

              <p>
                Paste the smart contract code you want the AI to review.
              </p>
            </div>

            <small>
              {source.length.toLocaleString()} chars
            </small>
          </div>

          <div
            className={`code-area ${hasContract
              ? "has-code"
              : ""
              }`}
          >

            <div className="code-area-top">

              <div className="code-area-title">
                <span className="code-icon">
                  {"{ }"}
                </span>

                <span>
                  Smart contract source
                </span>
              </div>

              <div className="code-status">
                <span className="code-status-dot" />

                {hasContract
                  ? "READY"
                  : "WAITING"}
              </div>

            </div>

            <div className="code-editor">

              {!hasContract && (
                <div className="empty-code-state">
                  <div className="empty-code-icon">
                    {"{ }"}
                  </div>

                  <strong>
                    Paste your contract here
                  </strong>

                  <span>
                    Add your TEAL or PyTeal smart contract source code to begin.
                  </span>

                  <small>
                    READY WHEN YOU ARE
                  </small>
                </div>
              )}

              <textarea
                value={source}
                onChange={(e) =>
                  setSource(e.target.value)
                }
                placeholder="// Paste your contract source here..."
                spellCheck={false}
              />

            </div>

          </div>

          <button
            type="submit"
            disabled={!hasContract || loading}
          >
            {loading ? (
              <>
                <span className="button-spinner" />

                Agent workflow running
              </>
            ) : hasContract ? (
              <>
                Start secure audit

                <span className="button-arrow">
                  →
                </span>
              </>
            ) : (
              <>
                Paste a contract to continue
              </>
            )}
          </button>

          <div className="payment-note">
            <span>◈</span>

            <span>
              Audit payment is processed and verified on Algorand TestNet.
            </span>
          </div>

        </form>

        {/* RIGHT */}

        <aside>

          <div className="agent-card">

            <div className="agent-card-top">

              <div className="agent-identity">

                <div className="agent-avatar">
                  ✦
                </div>

                <div>
                  <span>
                    ACTIVE AI AGENT
                  </span>

                  <strong>
                    Security Analyst For Audit
                  </strong>
                </div>

              </div>

              <div
                className={`agent-status ${loading
                  ? "working"
                  : "idle"
                  }`}
              >
                <span />

                {loading
                  ? "WORKING"
                  : "READY"}
              </div>

            </div>

            <p>
              After payment is verified, the AI reviews your contract for potential security risks.
            </p>

          </div>

          <div className="panel-heading">
            <span className="section-label">
              LIVE ACTIVITY
            </span>

            <h2>
              Activity Flow
            </h2>
          </div>

          <div className="timeline">

            {stages.map(
              (stage, index) => {
                const complete =
                  activeIndex > index;

                const current =
                  active === stage.key;

                return (
                  <div
                    className={`stage ${complete
                      ? "complete"
                      : ""
                      } ${current
                        ? "current"
                        : ""
                      }`}
                    key={stage.key}
                  >

                    <div className="stage-rail">
                      <div className="marker">
                        {complete
                          ? "✓"
                          : stage.icon}
                      </div>

                      {index <
                        stages.length - 1 && (
                          <span className="rail-line" />
                        )}
                    </div>

                    <div className="stage-content">

                      <div className="stage-top">
                        <small>
                          STEP {stage.step}
                        </small>

                        {current && (
                          <span className="live-badge">
                            LIVE
                          </span>
                        )}
                      </div>

                      <strong>
                        {stage.title}
                      </strong>

                      <p>
                        {stage.description}
                      </p>

                    </div>

                  </div>
                );
              }
            )}

          </div>

          {tx && (
            <a
              href={tx.url}
              target="_blank"
              rel="noreferrer"
              className="transaction-card"
            >

              <div className="transaction-icon">
                ◈
              </div>

              <div>
                <span>
                  BLOCKCHAIN RECEIPT
                </span>

                <strong>
                  View transaction
                  <b> ↗</b>
                </strong>
              </div>

              <small>
                {tx.id}
              </small>

            </a>
          )}

        </aside>

      </section>

      {/* LIVE STATUS */}

      <section
        className={`live-status ${loading
          ? "processing"
          : report
            ? "success"
            : ""
          }`}
      >

        <div className="status-indicator">
          <span />
        </div>

        <div>
          <small>
            SYSTEM STATUS
          </small>

          <strong>
            {status}
          </strong>
        </div>

      </section>

      {loading && aiProvider && (
        <section className="ai-review-status">
          <div className="ai-review-status-icon">
            ✦
          </div>

          <div className="ai-review-status-content">
            <small>AI SECURITY REVIEW</small>

            <strong>
              Analyzing with {aiProvider}
            </strong>

            <p>
              {aiEstimate ||
                "Preparing your contract-specific security review."}
            </p>
          </div>

          <div className="ai-review-side">
            <span className="ai-review-provider">
              {aiProvider}
            </span>

            <div className="ai-review-live">
              <span />
              LIVE
            </div>
          </div>
        </section>
      )}

      {/* ERROR */}

      {error && (
        <section className="error-card">
          <span>!</span>

          <div>
            <strong>
              Workflow interrupted
            </strong>

            <p>
              {error}
            </p>
          </div>
        </section>
      )}

      {/* REPORT */}

      {report && (
        <section className="report">

          <div className="report-header">
            <div className="report-heading">
              <div className="report-kicker">
                <span className="report-kicker-icon">
                  ✦
                </span>

                AI SECURITY REVIEW
              </div>

              <h2>
                Security review ready.
              </h2>

              <p>
                A concise AI-assisted review of the submitted
                smart contract.
              </p>

              <div className="review-meta">
                {aiProvider && (
                  <span className="review-meta-item">
                    <b>✦</b>
                    {aiProvider}
                  </span>
                )}

                {aiDuration && (
                  <span className="review-meta-item">
                    <b>✓</b>
                    {aiDuration}
                  </span>
                )}
              </div>
            </div>

            <div className="report-status">
              <div className="success-check">
                ✓
              </div>

              <span>
                REVIEW COMPLETE
              </span>
            </div>
          </div>

          {parsedReport?.findings.length ? (
            <>
              <section className="report-summary-strip">
                <div className="summary-item">
                  <span className="summary-label">
                    FINDINGS
                  </span>

                  <strong>
                    {parsedReport.findings.length}
                    <em>
                      {parsedReport.findings.length === 1
                        ? " item to review"
                        : " items to review"}
                    </em>
                  </strong>
                </div>

                <div className="summary-divider" />

                <div className="summary-item">
                  <span className="summary-label">
                    HIGHEST RISK
                  </span>

                  <strong
                    className={`summary-risk ${reportRiskLevel}`}
                  >
                    {severityLabel(reportRiskLevel)}
                  </strong>
                </div>
              </section>

              <section className="report-grid">
                {parsedReport.overview && (
                  <article className="report-panel">
                    <div className="report-panel-heading">
                      <span className="panel-icon">
                        ⌘
                      </span>

                      <div>
                        <small>
                          CONTRACT OVERVIEW
                        </small>

                        <h3>
                          What it does
                        </h3>
                      </div>
                    </div>

                    <p>
                      {parsedReport.overview}
                    </p>
                  </article>
                )}

                {parsedReport.riskSummary && (
                  <article className="report-panel">
                    <div className="report-panel-heading">
                      <span className="panel-icon">
                        ◌
                      </span>

                      <div>
                        <small>
                          RISK SUMMARY
                        </small>

                        <h3>
                          What to watch
                        </h3>
                      </div>
                    </div>

                    <p>
                      {parsedReport.riskSummary}
                    </p>
                  </article>
                )}
              </section>

              <section className="findings-section">
                <div className="findings-heading">
                  <div>
                    <span className="section-label">
                      SECURITY FINDINGS
                    </span>

                    <h3>
                      Review these items
                    </h3>
                  </div>

                  <span className="findings-count">
                    {parsedReport.findings.length}
                  </span>
                </div>

                <div className="finding-list">
                  {parsedReport.findings.map(
                    (finding, index) => (
                      <article
                        className="finding-card"
                        key={`${finding.issue}-${index}`}
                      >
                        <div className="finding-top">
                          <span
                            className={`severity-badge ${severityClass(
                              finding.severity,
                            )}`}
                          >
                            {finding.severity}
                          </span>

                          <span className="finding-index">
                            {String(index + 1).padStart(
                              2,
                              "0",
                            )}
                          </span>
                        </div>

                        <h4>
                          {finding.issue}
                        </h4>

                        <div className="finding-details">
                          <div>
                            <span>
                              WHY IT MATTERS
                            </span>

                            <p>
                              {finding.why}
                            </p>
                          </div>

                          <div>
                            <span>
                              SUGGESTED FIX
                            </span>

                            <p>
                              {finding.fix}
                            </p>
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>
              </section>

              {parsedReport.conclusion && (
                <section className="conclusion-card">
                  <div className="conclusion-icon">
                    ✓
                  </div>

                  <div>
                    <span>
                      REVIEW NOTE
                    </span>

                    <p>
                      {parsedReport.conclusion}
                    </p>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="report-content">
              <pre>{report}</pre>
            </div>
          )}

          <p className="report-disclaimer">
            Automated AI-assisted review only. The absence
            of findings does not mean a contract is secure.
          </p>

        </section>
      )}

    </main>
  );
}