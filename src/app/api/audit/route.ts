import { GoogleGenAI } from "@google/genai";
import algosdk from "algosdk";

export const runtime = "nodejs";

const algod = new algosdk.Algodv2(
  "",
  "https://testnet-api.algonode.cloud",
  "",
);

export async function POST(request: Request) {
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
        const { source } = (await request.json()) as {
          source?: string;
        };

        if (!source?.trim()) {
          throw new Error(
            "Paste contract source before starting an audit.",
          );
        }

        send("request");

        const mnemonic = process.env.AGENT_MNEMONIC;
        const merchant = process.env.MERCHANT_ADDRESS;

        const amount = Number(
          process.env.SERVICE_PRICE_MICROALGOS ?? "100000",
        );

        if (!mnemonic || !merchant) {
          throw new Error(
            "Missing AGENT_MNEMONIC or MERCHANT_ADDRESS.",
          );
        }

        const agent = algosdk.mnemonicToSecretKey(mnemonic);

        send("signing");

        const transaction =
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: agent.addr,
            receiver: merchant,
            amount,
            suggestedParams: await algod
              .getTransactionParams()
              .do(),
            note: new TextEncoder().encode(
              "AgentPay contract audit",
            ),
          });

        const signedTransaction = transaction.signTxn(agent.sk);

        send("broadcasting");

        const { txid } =
          await algod
            .sendRawTransaction(signedTransaction)
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

        const confirmedTransaction = info.txn.txn;
        const payment = confirmedTransaction.payment;

        const verified =
          Boolean(info.confirmedRound) &&
          confirmedTransaction.sender.toString() ===
            agent.addr.toString() &&
          payment?.receiver.toString() === merchant &&
          Number(payment?.amount) === amount;

        if (!verified) {
          throw new Error(
            "Payment confirmation did not match the required scan fee.",
          );
        }

        send("verified");

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
          throw new Error(
            "GEMINI_API_KEY is missing.",
          );
        }

        send("auditing");

        const ai = new GoogleGenAI({
          apiKey,
        });

        const prompt = `Review the following smart contract for potential security risks, logic mistakes, and unsafe implementation patterns.

Identify the contract language or ecosystem.

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

If no obvious issue is found, say so.

Do not claim that the contract is completely secure.

This is an automated AI-assisted review, not a professional security audit.

CONTRACT:

${source}`;

        try {
          const response =
            await ai.models.generateContent({
              model: "gemini-3.6-flash",
              contents: prompt,
            });

          send("complete", {
            report:
              response.text ??
              "AI returned no review.",
          });
        } catch (aiError) {
          console.error(
            "Gemini review failed:",
            aiError,
          );

          const message =
            aiError instanceof Error
              ? aiError.message
              : "AI review failed.";

          const isQuotaError =
            message.includes("429") ||
            message.includes("RESOURCE_EXHAUSTED") ||
            message.toLowerCase().includes("quota");

          const isServiceBusy =
            message.includes("503") ||
            message.includes("UNAVAILABLE") ||
            message.toLowerCase().includes(
              "high demand",
            );

          if (isQuotaError) {
            send("complete", {
              report: `## AI review temporarily unavailable

Your payment was successfully verified on Algorand TestNet.

The AI review could not be completed because the current Gemini API usage limit has been reached.

### What you can do

Please try again after the API quota becomes available.

Your blockchain payment and verification workflow completed successfully.

> This result is not a contract-specific security review.`,
            });

            return;
          }

          if (isServiceBusy) {
            send("complete", {
              report: `## AI review temporarily unavailable

Your payment was successfully verified on Algorand TestNet.

The AI review service is currently experiencing high demand.

Please try again shortly to receive a contract-specific review.

> This result is not a contract-specific security review.`,
            });

            return;
          }

          send("complete", {
            report: `## AI review could not be completed

Your payment was successfully verified on Algorand TestNet.

An unexpected error occurred while generating the contract review.

Please try again later.

> This result is not a contract-specific security review.`,
          });
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}