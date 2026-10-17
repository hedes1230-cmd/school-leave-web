// Never delete an Auth account when the profile write may already have committed.
export async function saveRegistration({ saveProfile, readProfile, deleteAccount }) {
    try {
        await saveProfile();
        return { status: 'saved' };
    } catch (error) {
        let profile;
        try { profile = await readProfile(); }
        catch { return { status: 'recovery-required', error }; }
        if (profile) return { status: 'saved' };
        try {
            await deleteAccount();
            return { status: 'rolled-back', error };
        } catch {
            return { status: 'recovery-required', error };
        }
    }
}
