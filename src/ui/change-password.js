export async function changeAccountPassword({ auth, EmailAuthProvider, reauthenticateWithCredential, updatePassword }, current, next, confirmation) {
    if (!current || !next || !confirmation) throw new Error('Preencha os três campos.');
    if (next !== confirmation) throw new Error('A confirmação não corresponde à nova senha.');
    if (next.length < 6) throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
    if (next === current) throw new Error('Escolha uma senha diferente da atual.');
    const user = auth.currentUser;
    if (!user?.email) throw new Error('Entre novamente na sua conta para mudar a senha.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
    if (auth.currentUser !== user) throw new Error('Sua sessão mudou. Entre novamente e tente outra vez.');
    await updatePassword(user, next);
}

export function setupChangePassword({ document, changePassword, onSuccess }) {
    const dialog = document.getElementById('modal-mudar-senha');
    const form = document.getElementById('form-mudar-senha');
    const error = document.getElementById('mudar-senha-erro');
    const submit = document.getElementById('btn-salvar-senha');
    const close = document.getElementById('btn-fechar-mudar-senha');
    let saving = false;
    const reset = () => { form.reset(); error.textContent = ''; };
    document.body.appendChild(dialog);
    document.getElementById('btn-mudar-senha').addEventListener('click', () => {
        if (dialog.open || saving) return;
        reset(); dialog.showModal();
    });
    close.addEventListener('click', () => { if (!saving) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('close', reset);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (saving) return;
        saving = true; error.textContent = '';
        submit.disabled = close.disabled = true; submit.textContent = 'Salvando…';
        form.setAttribute('aria-busy', 'true');
        const fields = [...form.querySelectorAll('input')];
        const values = fields.map(field => field.value);
        fields.forEach(field => { field.disabled = true; });
        try {
            await changePassword(...values);
            if (dialog.open) { dialog.close(); onSuccess(); }
        } catch (failure) {
            const messages = {
                'auth/wrong-password': 'A senha atual está incorreta.',
                'auth/invalid-credential': 'A senha atual está incorreta.',
                'auth/weak-password': 'A nova senha não atende aos requisitos de segurança.',
                'auth/password-does-not-meet-requirements': 'A nova senha não atende aos requisitos de segurança.',
                'auth/network-request-failed': 'Confira sua conexão e tente novamente.',
                'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
                'auth/requires-recent-login': 'Entre novamente na sua conta para mudar a senha.'
            };
            if (dialog.open) error.textContent = messages[failure.code] || (failure.code ? 'Não foi possível mudar a senha. Tente novamente.' : failure.message);
        } finally {
            saving = false; submit.disabled = close.disabled = false;
            fields.forEach(field => { field.disabled = false; });
            submit.textContent = 'Salvar nova senha'; form.removeAttribute('aria-busy');
        }
    });
    return { close() { dialog.close(); reset(); } };
}
