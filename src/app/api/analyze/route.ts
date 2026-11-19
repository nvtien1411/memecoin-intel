import { NextResponse } from "next/server";
import { analyzeToken } from "@/lib/analyze";
import { isValidAddress, guessFamily } from "@/lib/chains";
import { cacheGet, cacheSet } from "@/lib/http";
import type { AnalysisResult, ChainId } from "@/lib/types";

const VALID_CHAINS: ChainId[] = ["solana", "bsc", "base", "ethereum", "robinhood"];

export async function POST(req: Request) {
  let body: { address?: string; chain?: string } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = (body?.address ?? "").trim();
  const chainParam = (body?.chain ?? "").trim() as ChainId | "";
  const chain = VALID_CHAINS.includes(chainParam as ChainId) ? (chainParam as ChainId) : null;

  if (!address) {
    return NextResponse.json({ error: "Missing token address" }, { status: 400 });
  }
  if (!isValidAddress(address)) {
    return NextResponse.json(
      { error: "Not a valid Solana or EVM contract address" },
      { status: 400 },
    );
  }
  if (!guessFamily(address) && !chain) {
    return NextResponse.json({ error: "Unrecognized address format" }, { status: 400 });
  }

  const key = `analysis:${chain ?? "auto"}:${address.toLowerCase()}`;
  const cached = cacheGet<AnalysisResult>(key);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    const result = await analyzeToken({ address, chain });
    cacheSet(key, result, 60_000);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  const chain = (url.searchParams.get("chain") ?? "") as ChainId | "";
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });
  try {
    const result = await analyzeToken({
      address,
      chain: VALID_CHAINS.includes(chain as ChainId) ? (chain as ChainId) : null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 502 },
    );
  }
}
