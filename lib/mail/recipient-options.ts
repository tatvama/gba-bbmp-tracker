/**
 * Contact rows → selectable email recipients (PURE, framework-free, unit-tested).
 *
 * The important idea: a recipient list is a list of ADDRESSES, not of contact
 * records. Several officers legitimately share one office mailbox — in the real
 * directory 64 contacts hold only 61 distinct addresses, with three ARO office
 * Gmails shared by two officers each (arokgn@, aromsnbbmp@, aropadmanabhanagar@).
 *
 * Modelling one option per contact was wrong in three ways at once: React threw
 * "two children with the same key" on the shared address; a checkbox keyed by
 * email could not distinguish the two rows; and the salutation would silently
 * name whichever of the two officers happened to be encountered first.
 *
 * So options are merged by address, and every officer sharing it is listed. The
 * caller then knows exactly who a message reaches.
 */

/** One contact row, as read from the database. */
export interface ContactEmailRow {
  id: string;
  full_name: string | null;
  official_title: string | null;
  designation: string | null;
  email: string | null;
  officer_status: string | null;
}

/** An officer sharing a mailbox. */
export interface OptionOfficer {
  contactId: string;
  name: string;
  designation: string | null;
  status: string | null;
}

export interface RecipientOption {
  /** The address. Unique across options, so it is a safe React key. */
  email: string;
  /** Everyone who shares this mailbox — one entry in the ordinary case. */
  officers: OptionOfficer[];
  /** Display label: the officer's name, or "A (+1 more)" for a shared mailbox. */
  label: string;
  /**
   * The contact to attribute a send to. Null when the mailbox is shared, because
   * picking one of two officers arbitrarily would put a wrong name on the letter
   * and a wrong officer_id on the audit row.
   */
  contactId: string | null;
  /** Only when unambiguous — same reasoning as contactId. */
  designation: string | null;
  /** Only when unambiguous. */
  name: string | null;
  /** True when any officer sharing this address is the one resolved for the case. */
  suggested: boolean;
  /** Short explanation shown next to the option. */
  note: string | null;
}

const clean = (v: string | null | undefined): string => (v ?? "").trim();

/** "Sri" + "Nataraj" → "Sri Nataraj". Kept local so this module stays pure. */
function displayName(row: Pick<ContactEmailRow, "official_title" | "full_name">): string {
  const title = clean(row.official_title);
  const name = clean(row.full_name);
  return (title ? `${title} ${name}` : name).trim();
}

/**
 * Merge contact rows into one option per address.
 *
 * @param rows        contact rows; those without a usable email are dropped
 * @param isUsable    address validator (injected so this module needs no imports)
 * @param suggestedContactId  the officer resolved for the complaint, if any
 */
export function mergeRecipientOptions(
  rows: readonly ContactEmailRow[],
  isUsable: (email: unknown) => boolean,
  suggestedContactId: string | null,
): RecipientOption[] {
  const byEmail = new Map<string, OptionOfficer[]>();

  for (const row of rows) {
    if (!isUsable(row.email)) continue;
    const email = clean(row.email).toLowerCase();
    const officer: OptionOfficer = {
      contactId: row.id,
      name: displayName(row) || "(unnamed)",
      designation: clean(row.designation) || null,
      status: clean(row.officer_status) || null,
    };
    const list = byEmail.get(email);
    if (list) list.push(officer);
    else byEmail.set(email, [officer]);
  }

  const options: RecipientOption[] = [];
  for (const [email, officers] of byEmail) {
    officers.sort((a, b) => a.name.localeCompare(b.name));
    const shared = officers.length > 1;
    const suggested = suggestedContactId != null && officers.some((o) => o.contactId === suggestedContactId);
    const only = officers[0]!;

    // When a mailbox is shared, prefer the resolved officer for attribution —
    // that one IS unambiguous, because the system picked them specifically.
    const attributed = suggested ? officers.find((o) => o.contactId === suggestedContactId)! : shared ? null : only;

    options.push({
      email,
      officers,
      label: shared ? `${only.name} (+${officers.length - 1} more)` : only.name,
      contactId: attributed?.contactId ?? null,
      designation: attributed?.designation ?? null,
      name: attributed?.name ?? null,
      suggested,
      note: suggested
        ? "Resolved for this complaint"
        : shared
          ? `Shared mailbox — ${officers.length} officers`
          : only.status && only.status !== "Active"
            ? only.status
            : null,
    });
  }

  // Suggested first, then alphabetical: the list is long and the pick that matters
  // should never need scrolling for.
  options.sort((a, b) => (a.suggested === b.suggested ? a.label.localeCompare(b.label) : a.suggested ? -1 : 1));
  return options;
}
