(() => {
  const standalone = window.matchMedia('(display-mode: standalone)');
  const isInstalled = () => standalone.matches || navigator.standalone === true;
  if (isInstalled()) return;

  let installPrompt;
  const controls = [];
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  for (const [index, parent] of [document.querySelector('#welcome'), document.querySelector('#pause-overlay')].entries()) {
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

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    for (const { button, help } of controls) {
      button.textContent = 'Install Coastline';
      help.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });
  function hideInstalledControls() {
    installPrompt = undefined;
    for (const { container } of controls) container.hidden = true;
  }
  window.addEventListener('appinstalled', hideInstalledControls);
  standalone.addEventListener('change', () => { if (isInstalled()) hideInstalledControls(); });
})();
