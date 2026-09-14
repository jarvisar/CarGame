(() => {
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installed = false;
  const isInstalled = () => installed || standalone.matches || navigator.standalone === true;
  if (isInstalled()) return;

  let installPrompt;
  const invitation = document.createElement('dialog');
  invitation.id = 'pwa-install-invitation';
  invitation.setAttribute('aria-labelledby', 'pwa-install-heading');
  invitation.setAttribute('aria-describedby', 'pwa-install-description');
  invitation.innerHTML = '<h2 id="pwa-install-heading">Take the scenic route with you.</h2><p id="pwa-install-description">Add Coastline to your home screen for a full-screen drive, even offline after your first visit.</p>';
  document.body.append(invitation);
  const dismissalKey = 'coastline-install-dismissed';
  function dismissedRecently() {
    try { return Date.now() - Number(localStorage.getItem(dismissalKey)) < 7 * 24 * 60 * 60 * 1000; }
    catch { return false; }
  }
  invitation.addEventListener('close', () => {
    try { localStorage.setItem(dismissalKey, String(Date.now())); } catch { /* Storage is optional. */ }
  });
  const controls = [];
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  for (const [index, parent] of [document.querySelector('#welcome'), document.querySelector('#pause-overlay'), invitation].entries()) {
    if (!parent) continue;
    const container = document.createElement('div');
    container.className = 'pwa-install';
    // Keep keyboard activation of the install button out of driving controls.
    for (const type of ['keydown', 'keyup']) container.addEventListener(type, event => event.stopPropagation());
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pwa-install-button';
    button.textContent = 'Add to home screen';
    const help = document.createElement('p');
    help.id = `pwa-install-help-${index}`;
    help.className = 'pwa-install-help';
    help.hidden = true;
    help.setAttribute('role', 'status');
    button.setAttribute('aria-controls', help.id);
    button.setAttribute('aria-expanded', 'false');
    container.append(button, help);
    parent.append(container);
    controls.push({ container, button, help });
    button.addEventListener('click', async () => {
      if (installPrompt) {
        const prompt = installPrompt;
        installPrompt = undefined;
        button.disabled = true;
        try {
          await prompt.prompt();
          await prompt.userChoice;
          if (invitation.open) invitation.close();
        } catch {
          showHelp();
        } finally {
          button.disabled = false;
          for (const control of controls) control.button.textContent = 'Add to home screen';
        }
      } else {
        help.hidden = !help.hidden;
        if (!help.hidden) showHelp();
        button.setAttribute('aria-expanded', String(!help.hidden));
      }
      function showHelp() {
        help.textContent = ios
          ? 'On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. Keep Open as Web App on if shown, then tap Add.'
          : 'Open your browser menu and choose Install app or Add to Home screen. If you are using an in-app browser, open this page in Chrome, Edge, or Safari first.';
        help.hidden = false;
        button.setAttribute('aria-expanded', 'true');
      }
    });
  }

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'pwa-install-later';
  later.textContent = 'Not now';
  later.autofocus = true;
  later.addEventListener('click', () => invitation.close());
  invitation.append(later);

  const loading = document.querySelector('#loading');
  let ready = false;
  const observer = new MutationObserver(showWhenReady);
  if (loading) observer.observe(loading, { attributes: true, attributeFilter: ['class'] });
  async function showWhenReady() {
    if (ready || !loading?.classList.contains('loaded')) return;
    ready = true;
    observer.disconnect();
    // Wait for the loading screen's fade, then invite before driving begins.
    await Promise.allSettled(loading.getAnimations().map(animation => animation.finished));
    if (!window.isSecureContext || isInstalled() || dismissedRecently() ||
      document.querySelector('#error:not([hidden]), #welcome.hidden, dialog[open]')) return;
    invitation.showModal();
  }
  showWhenReady();

  window.addEventListener('beforeinstallprompt', event => {
    if (isInstalled()) return;
    event.preventDefault();
    installPrompt = event;
    for (const { button, help } of controls) {
      button.textContent = 'Install Coastline';
      help.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });
  function hideInstalledControls() {
    installed = true;
    installPrompt = undefined;
    observer.disconnect();
    if (invitation.open) invitation.close();
    invitation.remove();
    for (const { container } of controls) container.hidden = true;
  }
  window.addEventListener('appinstalled', hideInstalledControls);
  standalone.addEventListener('change', () => { if (isInstalled()) hideInstalledControls(); });
})();
