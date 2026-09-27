export type SyncTrigger = 'manual' | 'startup' | 'interval' | 'sign-in' | 'scaffold';

// Decides when the membership screen opens: every time the person asks for a sync or
// signs in, but only once per plugin session for the automatic startup and interval
// syncs, which keep running so the vault syncs on its own after payment.
export class PaywallGate {
	private gated = false;
	private shownThisSession = false;

	get active(): boolean {
		return this.gated;
	}

	/** Records a 402 and returns whether to open the membership screen for it. */
	blocked(trigger: SyncTrigger): boolean {
		this.gated = true;
		const automatic = trigger === 'startup' || trigger === 'interval';
		if (automatic && this.shownThisSession) return false;
		this.shownThisSession = true;
		return true;
	}

	/** A sync went through (or the person signed out): a later 402 counts as new. */
	clear(): void {
		this.gated = false;
		this.shownThisSession = false;
	}
}
