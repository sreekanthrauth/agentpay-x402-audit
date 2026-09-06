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
    title: "AI agent analyzing",
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

          if (data.event !== "submitted") {
            setActive(data.event);
          }

          if (data.event === "submitted") {
            setTx({
              id: data.transactionId,
              url: data.explorerUrl,
            });
          }

          const currentStage = stages.find(
            (stage) => stage.key === data.event
          );

          setStatus(
            currentStage?.title ?? "Processing..."
          );

          if (data.event === "submitted") {
            setTx({
              id: data.transactionId,
              url: data.explorerUrl,
            });
          }

          if (data.event === "complete") {
            setReport(data.report);
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

        <h1>
          Paste a Smart Contract
          <br />
          <span>Get a security review.</span>
        </h1>

        <p className="hero-description">
          Submit your smart contract for an AI-powered security review. An AI agent handles the USDC payment, which is verified on Algorand TestNet.
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

            <h3>AI Agent Pays in USDC</h3>

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
              The facilitator verifies the payment on-chain.
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
              Agent activity
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

            <div>
              <span className="section-label">
                AI SECURITY REPORT
              </span>

              <h2>
                Analysis complete.
              </h2>

              <p>
                Your contract has completed the
                automated security workflow.
              </p>
            </div>

            <div className="success-check">
              ✓
            </div>

          </div>

          <div className="report-content">
            <pre>{report}</pre>
          </div>

        </section>
      )}

    </main>
  );
}