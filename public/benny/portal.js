import RFB from '/benny/novnc/core/rfb.js';
import KeyTable from '/benny/novnc/core/input/keysym.js';
import keysyms from '/benny/novnc/core/input/keysymdef.js';

const open = document.getElementById('open');
const done = document.getElementById('done');
const status = document.getElementById('status');
const screen = document.getElementById('screen');
const keyboardControls = document.getElementById('keyboard-controls');
const keyboardInput = document.getElementById('keyboard-input');
const reconnect = document.getElementById('reconnect');
let ticket = location.hash.slice(1);
history.replaceState(null, '', location.pathname); // keep the capability out of copied URLs/referrers
let rfb;
let polling;
let pollVersion = 0;
let replacesSentinel = false;
const resetKeyboard = () => { keyboardInput.value = '_'; keyboardInput.setSelectionRange(1, 1); replacesSentinel = false; };
const stopView = () => {
  screen.hidden = true; done.hidden = true; keyboardControls.hidden = true; reconnect.hidden = true;
  keyboardInput.blur(); keyboardInput.value = '';
  rfb?.disconnect(); rfb = undefined;
};
document.getElementById('keyboard').addEventListener('click', () => {
  if (!rfb) return;
  rfb.focusOnClick = false;
  resetKeyboard(); keyboardInput.focus({ preventScroll: true });
});
keyboardInput.addEventListener('blur', () => { keyboardInput.value = ''; if (rfb) rfb.focusOnClick = true; });
keyboardInput.addEventListener('beforeinput', () => {
  replacesSentinel = keyboardInput.selectionStart === 0 && keyboardInput.selectionEnd > 0;
});
// A masked editable input summons the phone keyboard. Keep only a sentinel
// between events, never an accumulated password, clipboard value or local history.
const typeKeys = event => {
  if (event.isComposing) return;
  if (document.activeElement !== keyboardInput) { keyboardInput.value = ''; return; }
  const value = keyboardInput.value;
  if (rfb && !keyboardControls.hidden) {
    if (!value) rfb.sendKey(KeyTable.XK_BackSpace, 'Backspace');
    else for (const character of !replacesSentinel && value.startsWith('_') ? value.slice(1) : value) {
      rfb.sendKey(keysyms.lookup(character.codePointAt(0)), null);
    }
  }
  resetKeyboard();
};
keyboardInput.addEventListener('input', typeKeys);
keyboardInput.addEventListener('compositionend', typeKeys);
keyboardInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); rfb?.sendKey(KeyTable.XK_Return, 'Enter'); }
});
document.getElementById('backspace').addEventListener('click', () => rfb?.sendKey(KeyTable.XK_BackSpace, 'Backspace'));
document.getElementById('enter').addEventListener('click', () => rfb?.sendKey(KeyTable.XK_Return, 'Enter'));
const request = async (path, body) => {
  const response = await fetch('/benny/portal/' + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Connection unavailable. Return to iMessage.');
  return result;
};
const poll = async () => {
  const version = ++pollVersion;
  try {
    const state = await request('status');
    if (version !== pollVersion) return;
    if (state.phase === 'login') {
      if (reconnect.hidden) status.textContent = `Sign in to ${state.provider}. Your passwords and codes stay out of the chat.`;
      if (!rfb) {
        screen.hidden = false; done.hidden = false; done.disabled = false;
        rfb = new RFB(screen, `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/benny/portal/stream`);
        rfb.scaleViewport = true;
        rfb.resizeSession = true; // request a legible viewport when the VNC server supports resizing
        const connection = rfb;
        rfb.addEventListener('connect', () => { if (rfb === connection) { keyboardControls.hidden = false; reconnect.hidden = true; } });
        rfb.addEventListener('disconnect', () => {
          if (rfb !== connection) return;
          keyboardInput.blur(); keyboardInput.value = ''; keyboardControls.hidden = true;
          if (!screen.hidden) {
            reconnect.hidden = false;
            status.textContent = 'Browser disconnected. Reconnect to the same session, or finish sign-in if it completed.';
          }
        });
      }
    } else {
      stopView();
      if (state.phase === 'setup_saved') {
        status.textContent = 'Browser session saved for setup—not verified. Return to iMessage. Automated reads and actions are not enabled; saved access expires within 24 hours.';
        clearTimeout(polling); return;
      }
      if (state.phase === 'confirm' || state.phase === 'idle') {
        status.textContent = 'Login saved and checked. Return to iMessage to confirm the account before further reads.';
        clearTimeout(polling); return;
      }
      if (state.phase === 'unavailable') throw new Error('Sign-in could not be verified. Request a fresh link in iMessage.');
      status.textContent = ['open', 'creating', 'inspect'].includes(state.phase) ? 'Opening your private browser…' : 'Saving the browser session. Account checks run only where configured. Return to iMessage for the result.';
    }
    polling = setTimeout(poll, 2000);
  } catch (error) { if (version === pollVersion) { stopView(); status.textContent = error.message; } }
};
open.addEventListener('click', async () => {
  open.disabled = true;
  try { await request('open', { ticket }); ticket = ''; open.hidden = true; await poll(); }
  catch (error) { status.textContent = error.message; }
});
done.addEventListener('click', async () => {
  done.disabled = true;
  ++pollVersion; clearTimeout(polling);
  try { await request('done', {}); stopView(); clearTimeout(polling); await poll(); }
  catch (error) { status.textContent = error.message; done.disabled = false; polling = setTimeout(poll, 2000); }
});
reconnect.addEventListener('click', () => {
  ++pollVersion; clearTimeout(polling); stopView(); void poll();
});
if (!ticket) { open.hidden = true; void poll(); }
window.addEventListener('hashchange', () => {
  if (!location.hash) return;
  ++pollVersion; clearTimeout(polling); stopView();
  ticket = location.hash.slice(1); history.replaceState(null, '', location.pathname);
  open.hidden = false; open.disabled = false; status.textContent = 'New connection link. Ready when you are.';
});
window.addEventListener('pagehide', () => { ++pollVersion; clearTimeout(polling); stopView(); });
window.addEventListener('pageshow', event => { if (event.persisted && !ticket) void poll(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keyboardInput.blur(); keyboardInput.value = ''; } });
