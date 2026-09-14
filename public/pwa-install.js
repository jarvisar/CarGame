(() => {
  const appDisplay = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
  let installed = false;
  const isInstalled = () => installed || appDisplay.matches || navigator.standalone === true;
  if (isInstalled()) return;

  let installPrompt;
  const invitation = document.createElement('section');
  invitation.id = 'pwa-install-invitation';
  invitation.hidden = true;
  invitation.setAttribute('role', 'region');
  invitation.setAttribute('aria-labelledby', 'pwa-install-heading');
  invitation.setAttribute('aria-describedby', 'pwa-install-description');
  invitation.innerHTML = '<h2 id="pwa-install-heading">Install Coastline</h2><p id="pwa-install-description">Add the game to your home screen for quick access.</p>';
  document.body.append(invitation);
  // Old versions also saved automatic timeouts; only explicit dismissals count now.
  const dismissalKey = 'coastline-install-dismissed-v2';
  function dismissedRecently() {
    try { return Date.now() - Number(localStorage.getItem(dismissalKey)) < 7 * 24 * 60 * 60 * 1000; }
    catch { return false; }
  }
  let dismissTimer;
  function dismissInvitation(remember = false) {
    clearTimeout(dismissTimer);
    invitation.hidden = true;
    menuObserver.disconnect();
    if (remember) {
      try { localStorage.setItem(dismissalKey, String(Date.now())); } catch { /* Storage is optional. */ }
    }
  }
  function startDismissTimer() {
    clearTimeout(dismissTimer);
    if (!invitation.hidden && !invitation.contains(document.activeElement)) {
      dismissTimer = setTimeout(dismissInvitation, 8000);
    }
  }
  invitation.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') clearTimeout(dismissTimer); });
  invitation.addEventListener('pointerleave', startDismissTimer);
  invitation.addEventListener('focusin', () => clearTimeout(dismissTimer));
  invitation.addEventListener('focusout', () => setTimeout(startDismissTimer, 0));
  invitation.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') dismissInvitation(true);
  });
  invitation.addEventListener('keyup', event => event.stopPropagation());
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
          if (!invitation.hidden) dismissInvitation(true);
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

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pwa-install-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss install invitation');
  close.addEventListener('click', () => dismissInvitation(true));
  invitation.append(close);

  const loading = document.querySelector('#loading');
  const welcome = document.querySelector('#welcome');
  const menuObserver = new MutationObserver(() => {
    if (welcome?.classList.contains('hidden')) dismissInvitation();
  });
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
    invitation.hidden = false;
    if (welcome) menuObserver.observe(welcome, { attributes: true, attributeFilter: ['class'] });
    startDismissTimer();
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
    clearTimeout(dismissTimer);
    menuObserver.disconnect();
    invitation.remove();
    for (const { container } of controls) container.hidden = true;
  }
  window.addEventListener('appinstalled', hideInstalledControls);
  appDisplay.addEventListener('change', () => { if (isInstalled()) hideInstalledControls(); });
})();
