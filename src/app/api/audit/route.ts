import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import algosdk from "algosdk";

export const runtime = "nodejs";

const algod = new algosdk.Algodv2(
  "",
  "https://testnet-api.algonode.cloud",
  "",
);

const AUDIT_SYSTEM_PROMPT = `
You are an AI smart contract security reviewer.

Review the submitted smart contract for:

- Security vulnerabilities
- Logic mistakes
- Unsafe implementation patterns

First identify the contract language or blockchain ecosystem.

Return a concise but useful review using this format:

## Contract Overview
Briefly explain what the contract does.

## Risk Summary
Give a short summary of the main risks.

## Findings

For each important finding include:

- Severity: Critical, High, Medium, Low, or Informational
- Issue
- Why it matters
- Suggested fix

Only report issues reasonably supported by the submitted code.

If no obvious issue is found, clearly say so.

Do not claim that the contract is completely secure.

This is an automated AI-assisted review, not a professional security audit.
`;

function buildPrompt(source: string) {
  return `${AUDIT_SYSTEM_PROMPT}

CONTRACT:

${source}`;
}

async function auditWithGroq(
  source: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing.");
  }

  const groq = new Groq({
    apiKey,
  });

  const completion =
    await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "user",
          content: buildPrompt(source),
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 1200,
    });

  const report =
    completion.choices[0]?.message?.content;

  if (!report) {
    throw new Error(
      "Groq returned an empty review.",
    );
  }

  return report;
}

async function auditWithGemini(
  source: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const ai = new GoogleGenAI({
    apiKey,
  });

  const response =
    await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: buildPrompt(source),
    });

  if (!response.text) {
    throw new Error(
      "Gemini returned an empty review.",
    );
  }

  return response.text;
}

async function auditWithOpenRouter(
  source: string,
): Promise<string> {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing.",
    );
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          {
            role: "user",
            content: buildPrompt(source),
          },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    },
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `OpenRouter failed: ${errorText}`,
    );
  }

  const data = await response.json();

  const report =
    data.choices?.[0]?.message?.content;

  if (!report) {
    throw new Error(
      "OpenRouter returned an empty review.",
    );
  }

  return report;
}

export async function POST(
  request: Request,
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(
        event: string,
        payload: Record<string, string> = {},
      ) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              event,
              ...payload,
            })}\n\n`,
          ),
        );
      }

      try {
        const { source } =
          (await request.json()) as {
            source?: string;
          };

        if (!source?.trim()) {
          throw new Error(
            "Paste contract source before starting an audit.",
          );
        }

        send("request");

        const mnemonic =
          process.env.AGENT_MNEMONIC;

        const merchant =
          process.env.MERCHANT_ADDRESS;

        const amount = Number(
          process.env
            .SERVICE_PRICE_MICROALGOS ??
          "100000",
        );

        if (!mnemonic || !merchant) {
          throw new Error(
            "Missing AGENT_MNEMONIC or MERCHANT_ADDRESS.",
          );
        }

        const agent =
          algosdk.mnemonicToSecretKey(
            mnemonic,
          );

        send("signing");

        const transaction =
          algosdk.makePaymentTxnWithSuggestedParamsFromObject(
            {
              sender: agent.addr,
              receiver: merchant,
              amount,
              suggestedParams:
                await algod
                  .getTransactionParams()
                  .do(),
              note:
                new TextEncoder().encode(
                  "AgentPay contract audit",
                ),
            },
          );

        const signedTransaction =
          transaction.signTxn(agent.sk);

        send("broadcasting");

        const { txid } =
          await algod
            .sendRawTransaction(
              signedTransaction,
            )
            .do();

        send("submitted", {
          transactionId: txid,
          explorerUrl:
            `https://lora.algokit.io/testnet/transaction/${txid}`,
        });

        await algosdk.waitForConfirmation(
          algod,
          txid,
          8,
        );

        send("confirmed");

        const info =
          await algod
            .pendingTransactionInformation(txid)
            .do();

        const confirmedTransaction =
          info.txn.txn;

        const payment =
          confirmedTransaction.payment;

        const verified =
          Boolean(info.confirmedRound) &&
          confirmedTransaction.sender
            .toString() ===
          agent.addr.toString() &&
          payment?.receiver.toString() ===
          merchant &&
          Number(payment?.amount) ===
          amount;

        if (!verified) {
          throw new Error(
            "Payment confirmation did not match the required scan fee.",
          );
        }

        send("verified");

        const auditStartedAt = Date.now();

        // 1. GROQ — primary provider.
        try {
          send("auditing", {
            provider: "Groq",
            estimate:
              "Usually completes in under 15 seconds",
          });

          const report =
            await auditWithGroq(source);

          const duration =
            (
              (Date.now() -
                auditStartedAt) /
              1000
            ).toFixed(1);

          send("complete", {
            report,
            provider: "Groq",
            duration: `${duration} seconds`,
          });

          return;
        } catch (error) {
          console.error(
            "Groq review failed:",
            error,
          );

          send("switching", {
            provider: "Gemini",
            message:
              "Primary AI unavailable. Switching to backup provider.",
            estimate:
              "Usually completes in under 20 seconds",
          });
        }

        // 2. GEMINI — backup provider.
        try {
          const report =
            await auditWithGemini(source);

          const duration =
            (
              (Date.now() -
                auditStartedAt) /
              1000
            ).toFixed(1);

          send("complete", {
            report,
            provider: "Gemini",
            duration: `${duration} seconds`,
          });

          return;
        } catch (error) {
          console.error(
            "Gemini review failed:",
            error,
          );

          send("switching", {
            provider: "OpenRouter",
            message:
              "Backup AI unavailable. Trying another provider.",
            estimate:
              "Usually completes in under 30 seconds",
          });
        }

        // 3. OPENROUTER — final fallback.
        try {
          const report =
            await auditWithOpenRouter(
              source,
            );

          const duration =
            (
              (Date.now() -
                auditStartedAt) /
              1000
            ).toFixed(1);

          send("complete", {
            report,
            provider: "OpenRouter",
            duration: `${duration} seconds`,
          });

          return;
        } catch (error) {
          console.error(
            "OpenRouter review failed:",
            error,
          );

          const message =
            error instanceof Error
              ? error.message
              : "Unknown OpenRouter error.";

          throw new Error(
            `All AI providers failed. Final error: ${message}`,
          );
        }
      } catch (error) {
        send("error", {
          message:
            error instanceof Error
              ? error.message
              : "Audit failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":
        "text/event-stream",
      "Cache-Control":
        "no-cache, no-transform",
      Connection:
        "keep-alive",
    },
  });
}