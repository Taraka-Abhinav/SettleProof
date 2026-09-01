/**
 * Schema-shaped narration proposals captured for the key-free demo.
 *
 * A replay is accepted only when the complete source narration fingerprint and
 * quoted evidence span still agree. Editing the input invalidates the replay.
 * Ground truth is never read here.
 */
import { sha256HexSync } from './sha256.ts';

export interface NarrationProposal {
  extractedOrderId: string;
  confidence: number;
  evidenceSpan: string;
  sourceFingerprint: string;
  replayed: true;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const narrationProposalReplay: NarrationProposal[] = Array.from(
  { length: 12 },
  (_, offset) => {
    const orderNumber = 260067 + offset;
    const customerNumber = 67 + offset;
    const evidenceSpan = `invoice aur ${orderNumber}`;
    const sourceNarration = `Aurelia web checkout · ${evidenceSpan} · Customer ${customerNumber}`;
    return {
      extractedOrderId: `AUR-${orderNumber}`,
      confidence: 0.96 - (offset % 3) * 0.01,
      evidenceSpan,
      sourceFingerprint: sha256HexSync(sourceNarration),
      replayed: true as const,
    };
  },
);

const replayBySource = new Map(
  narrationProposalReplay.map((proposal) => [proposal.sourceFingerprint, proposal]),
);

export function getReplayedNarrationProposal(sourceNarration: string) {
  const proposal = replayBySource.get(sha256HexSync(sourceNarration)) ?? null;
  if (!proposal) return null;
  const evidenceIsPresent = normalize(sourceNarration).includes(
    normalize(proposal.evidenceSpan),
  );
  return evidenceIsPresent ? proposal : null;
}
