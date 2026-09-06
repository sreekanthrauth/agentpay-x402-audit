import { GoogleGenAI } from "@google/genai";
import algosdk from "algosdk";

export const runtime = "nodejs";

const algod = new algosdk.Algodv2(
  "",
  "https://testnet-api.algonode.cloud",
  ""
);

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, payload: Record<string, string> = {}) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event, ...payload })}\n\n`)
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

        const transaction =
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: agent.addr,
            receiver: merchant,
            amount,
            suggestedParams: await algod.getTransactionParams().do(),
            note: new TextEncoder().encode("AgentPay contract audit"),
          });

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
          throw new Error("Payment confirmation did not match the required scan fee.");
        }

        send("verified");

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");

        send("auditing");

        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `Audit this Algorand TEAL or PyTeal contract.

Give a short risk summary, then findings grouped by severity:
Critical, High, Medium, Low, Informational.
For each finding, explain the risk and a practical fix.
Do not claim the code is completely safe.

CONTRACT:
${source}`,
        });

        send("complete", {
          report: response.text ?? "Gemini returned no audit report.",
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