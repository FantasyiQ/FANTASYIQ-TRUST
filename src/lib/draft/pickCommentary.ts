// FantasyiQ Trust — Pick Commentary Engine v3.4
// Combines prospect identity + roster context + DTV note into one
// human-readable paragraph per pick.

interface PickCommentaryInput {
    playerName:        string;
    prospectIdentity:  string;
    rosterContextNote: string;
    dtvNote:           string;
}

export function computePickCommentary(input: PickCommentaryInput): string {
    const { playerName, prospectIdentity, rosterContextNote, dtvNote } = input;
    const parts: string[] = [];

    // Lead with prospect identity
    parts.push(`${playerName} is ${prospectIdentity}.`);

    // Roster context (already ends with a period from rosterContext.ts)
    if (rosterContextNote) {
        const note = rosterContextNote.trim();
        parts.push(note.endsWith('.') ? note : `${note}.`);
    }

    // DTV addendum
    if (dtvNote) {
        const note = dtvNote.trim();
        parts.push(note.endsWith('.') ? note : `${note}.`);
    }

    return parts.join(' ');
}
