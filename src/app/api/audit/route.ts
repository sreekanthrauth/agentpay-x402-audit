import { GoogleGenAI } from "@google/genai";
import algosdk from "algosdk";

export const runtime = "nodejs";

const algod = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, payload: Record<string, string> = {}) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event, ...payload })}\n\n`),
        );
      }

      try {
        const { source } = (await request.json()) as { source?: string };

        if (!source?.trim()) {
          throw new Error("Paste contract source before starting an audit.");
        }

        send("request");

        const mnemonic = process.env.AGENT_MNEMONIC;
        const merchant = process.env.MERCHANT_ADDRESS;
        const amount = Number(process.env.SERVICE_PRICE_MICROALGOS ?? "100000");

        if (!mnemonic || !merchant) {
          throw new Error("Missing AGENT_MNEMONIC or MERCHANT_ADDRESS.");
        }

        const agent = algosdk.mnemonicToSecretKey(mnemonic);

        send("signing");

        const transaction = algosdk.makePaymentTxnWithSuggestedParamsFromObject(
          {
            sender: agent.addr,
            receiver: merchant,
            amount,
            suggestedParams: await algod.getTransactionParams().do(),
            note: new TextEncoder().encode("AgentPay contract audit"),
          },
        );

        const signedTransaction = transaction.signTxn(agent.sk);

        send("broadcasting");

        const { txid } = await algod.sendRawTransaction(signedTransaction).do();

        send("submitted", {
          transactionId: txid,
          explorerUrl: `https://lora.algokit.io/testnet/transaction/${txid}`,
        });

        await algosdk.waitForConfirmation(algod, txid, 8);

        send("confirmed");

        const info = await algod.pendingTransactionInformation(txid).do();
        const confirmedTransaction = info.txn.txn;
        const payment = confirmedTransaction.payment;

        const verified =
          Boolean(info.confirmedRound) &&
          confirmedTransaction.sender.toString() === agent.addr.toString() &&
          payment?.receiver.toString() === merchant &&
          Number(payment?.amount) === amount;

        if (!verified) {
          throw new Error(
            "Payment confirmation did not match the required scan fee.",
          );
        }

        send("verified");

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");

        send("auditing");

        const ai = new GoogleGenAI({ apiKey });



        const prompt = `You are an AI assistant performing a defensive security review of smart contract source code provided by its developer.

Review the submitted smart contract for potential security issues, logic errors, unsafe patterns, and implementation mistakes.

The contract may be written in Solidity, TEAL, PyTeal, or another smart contract language. First identify the language and ecosystem from the code.

This is a defensive code review. Do not provide instructions for exploiting, attacking, stealing funds from, or abusing a contract.

Return the report in this format:

## Contract Overview
Briefly explain what the contract does and identify its language/ecosystem.

## Risk Summary
Give a short overall summary of the security and implementation risks found.

## Findings

Group findings by severity:

### Critical
### High
### Medium
### Low
### Informational

For every finding include:

- **Issue**
- **Why it matters**
- **Affected code or function**
- **Recommended fix**

If no issues are found for a severity level, say "No significant issues identified."

Do not claim that the contract is completely safe.

State that this is an automated AI review and not a replacement for a professional security audit.

SMART CONTRACT SOURCE CODE:

${source}`;

        const models = [
          "gemini-3.6-flash",
          "gemini-2.5-flash",
        ];

        let response;
        let lastError: unknown;

        for (const model of models) {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              response = await ai.models.generateContent({
                model,
                contents: prompt,
              });

              break;
            } catch (error) {
              lastError = error;

              if (attempt < 3) {
                const delay = 1000 * Math.pow(2, attempt - 1);

                await new Promise((resolve) =>
                  setTimeout(resolve, delay)
                );
              }
            }
          }

          if (response) break;
        }

        if (!response) {
          throw lastError;
        }

        send("complete", {
          report: response.text ?? "AI returned no security report.",
        });
        
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Audit failed.",
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
