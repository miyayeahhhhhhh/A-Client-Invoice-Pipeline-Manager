/**
 * auth.js — FreelanceFlow Authentication Module
 *
 * Responsibilities:
 *  - Field-level and form-level validation
 *  - Simulated async API call with 1.5s loading state
 *  - Session persistence via localStorage (remember me) / sessionStorage
 *  - Clean error messaging and UI state management
 *  - Exports an auth state API consumed by app.js
 */

// ─── Mock user store (simulates a backend user database) ─────────
const MOCK_USERS = [
  {
    id: 'usr_001',
    email: 'alex@freelanceflow.io',
    password: 'Demo@1234',
    name: 'Alex Rivera',
    initials: 'AR',
  },
  {
    id: 'usr_002',
    email: 'sam@studio.dev',
    password: 'Studio#99',
    name: 'Sam Chen',
    initials: 'SC',
  },
];

// ─── Storage keys ─────────────────────────────────────────────────
const STORAGE_KEY_SESSION = 'ff_session';
const STORAGE_KEY_REMEMBER = 'ff_remember_email';

// ─── Validation rules ─────────────────────────────────────────────
const VALIDATION = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD_MIN_LENGTH: 6,
};

// ─── Internal state ───────────────────────────────────────────────
let _currentUser = null;
let _onLoginSuccess = null; // callback injected by app.js

// ─── DOM references (scoped to auth module) ───────────────────────
const dom = {
  authScreen:      () => document.getElementById('auth-screen'),
  appWorkspace:    () => document.getElementById('app-workspace'),
  loginForm:       () => document.getElementById('login-form'),
  emailInput:      () => document.getElementById('email'),
  passwordInput:   () => document.getElementById('password'),
  emailError:      () => document.getElementById('email-error'),
  passwordError:   () => document.getElementById('password-error'),
  globalError:     () => document.getElementById('auth-global-error'),
  globalErrorText: () => document.getElementById('auth-global-error-text'),
  loginBtn:        () => document.getElementById('login-btn'),
  togglePassword:  () => document.getElementById('toggle-password'),
  eyeOpen:         () => document.getElementById('eye-open'),
  eyeClosed:       () => document.getElementById('eye-closed'),
  rememberMe:      () => document.getElementById('remember-me'),
  fgEmail:         () => document.getElementById('fg-email'),
  fgPassword:      () => document.getElementById('fg-password'),
};


// ═══════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Validates the email field.
 * @param {string} value
 * @returns {{ valid: boolean, message: string }}
 */
function validateEmail(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, message: 'Email address is required.' };
  }
  if (!VALIDATION.EMAIL_REGEX.test(trimmed)) {
    return { valid: false, message: 'Enter a valid email address (e.g. you@example.com).' };
  }
  return { valid: true, message: '' };
}

/**
 * Validates the password field.
 * @param {string} value
 * @returns {{ valid: boolean, message: string }}
 */
function validatePassword(value) {
  if (!value) {
    return { valid: false, message: 'Password is required.' };
  }
  if (value.length < VALIDATION.PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters.` };
  }
  return { valid: true, message: '' };
}


// ═══════════════════════════════════════════════════════════════════
// UI STATE HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Sets a field's error state in the UI.
 * @param {HTMLElement} fieldGroup - The .form-group wrapper element
 * @param {HTMLElement} errorEl - The error span element
 * @param {string} message - Empty string clears the error
 */
function setFieldError(fieldGroup, errorEl, message) {
  const input = fieldGroup.querySelector('.form-input');
  if (message) {
    errorEl.textContent = message;
    input?.classList.add('form-input--error');
  } else {
    errorEl.textContent = '';
    input?.classList.remove('form-input--error');
  }
}

/**
 * Shows or hides the global error alert with a message.
 * @param {string|null} message - null hides the alert
 */
function setGlobalError(message) {
  const alertEl = dom.globalError();
  const textEl = dom.globalErrorText();
  if (message) {
    textEl.textContent = message;
    alertEl.classList.remove('hidden');
  } else {
    alertEl.classList.add('hidden');
    textEl.textContent = '';
  }
}

/**
 * Puts the login button into a loading/spinner state.
 * @param {boolean} loading
 */
function setLoginLoading(loading) {
  const btn = dom.loginBtn();
  if (loading) {
    btn.classList.add('btn--loading');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  } else {
    btn.classList.remove('btn--loading');
    btn.disabled = false;
    btn.setAttribute('aria-busy', 'false');
  }
}

/**
 * Clears all field-level errors and the global error banner.
 */
function clearAllErrors() {
  setFieldError(dom.fgEmail(), dom.emailError(), '');
  setFieldError(dom.fgPassword(), dom.passwordError(), '');
  setGlobalError(null);
}


// ═══════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Persists a user session to storage.
 * Uses localStorage if "remember me" is checked, sessionStorage otherwise.
 * @param {Object} user - The authenticated user object
 * @param {boolean} remember
 */
function persistSession(user, remember) {
  const sessionData = {
    userId:   user.id,
    name:     user.name,
    initials: user.initials,
    email:    user.email,
    loginAt:  Date.now(),
  };

  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionData));

  if (remember) {
    localStorage.setItem(STORAGE_KEY_REMEMBER, user.email);
  } else {
    localStorage.removeItem(STORAGE_KEY_REMEMBER);
  }
}

/**
 * Reads the current session from storage (localStorage or sessionStorage).
 * @returns {Object|null} - Session data or null if no valid session
 */
function readSession() {
  const fromLocal = localStorage.getItem(STORAGE_KEY_SESSION);
  if (fromLocal) {
    try {
      return JSON.parse(fromLocal);
    } catch {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  }

  const fromSession = sessionStorage.getItem(STORAGE_KEY_SESSION);
  if (fromSession) {
    try {
      return JSON.parse(fromSession);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY_SESSION);
    }
  }

  return null;
}

/**
 * Destroys the active session from both storage locations.
 */
function destroySession() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
  sessionStorage.removeItem(STORAGE_KEY_SESSION);
  _currentUser = null;
}

/**
 * Returns the currently authenticated user, or null.
 * @returns {Object|null}
 */
function getCurrentUser() {
  return _currentUser;
}


// ═══════════════════════════════════════════════════════════════════
// SIMULATED API CALL
// ═══════════════════════════════════════════════════════════════════

/**
 * Simulates a network round-trip to an authentication endpoint.
 * Resolves with a user object on success, rejects with an error message on failure.
 *
 * Intentional 1.5s delay to demonstrate realistic loading states.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>}
 */
function simulateAuthApiCall(email, password) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const normalizedEmail = email.trim().toLowerCase();

      const user = MOCK_USERS.find(
        (u) => u.email.toLowerCase() === normalizedEmail
      );

      if (!user) {
        // Deliberately vague: don't reveal whether the email exists
        reject(new Error('No account found with those credentials. Please check your email and password.'));
        return;
      }

      if (user.password !== password) {
        reject(new Error('Incorrect password. Please try again.'));
        return;
      }

      // Omit the raw password from the resolved user object
      const { password: _omit, ...safeUser } = user;
      resolve(safeUser);
    }, 1500);
  });
}


// ═══════════════════════════════════════════════════════════════════
// TRANSITION BETWEEN SCREENS
// ═══════════════════════════════════════════════════════════════════

/**
 * Hides the auth screen and reveals the app workspace.
 * Fires the onLoginSuccess callback so app.js can initialize.
 * @param {Object} user
 */
function transitionToApp(user) {
  _currentUser = user;
  dom.authScreen().classList.add('hidden');
  dom.appWorkspace().classList.remove('hidden');

  if (typeof _onLoginSuccess === 'function') {
    _onLoginSuccess(user);
  }
}

/**
 * Logs out: destroys session, hides workspace, shows auth screen.
 */
function logout() {
  destroySession();
  dom.appWorkspace().classList.add('hidden');
  dom.authScreen().classList.remove('hidden');

  // Reset form UI
  dom.loginForm().reset();
  clearAllErrors();
  setLoginLoading(false);

  // Restore remembered email if present
  const remembered = localStorage.getItem(STORAGE_KEY_REMEMBER);
  if (remembered) {
    dom.emailInput().value = remembered;
    dom.rememberMe().checked = true;
  }
}


// ═══════════════════════════════════════════════════════════════════
// FORM SUBMISSION HANDLER
// ═══════════════════════════════════════════════════════════════════

/**
 * Handles the login form submit event.
 * Validates fields → shows loading → simulates API → transitions or shows error.
 * @param {Event} event
 */
async function handleLoginSubmit(event) {
  event.preventDefault();
  clearAllErrors();

  const emailVal    = dom.emailInput().value;
  const passwordVal = dom.passwordInput().value;
  const rememberVal = dom.rememberMe().checked;

  // Validate both fields and collect results
  const emailResult    = validateEmail(emailVal);
  const passwordResult = validatePassword(passwordVal);

  let hasError = false;

  if (!emailResult.valid) {
    setFieldError(dom.fgEmail(), dom.emailError(), emailResult.message);
    hasError = true;
  }

  if (!passwordResult.valid) {
    setFieldError(dom.fgPassword(), dom.passwordError(), passwordResult.message);
    hasError = true;
  }

  if (hasError) {
    // Focus first errored field for accessibility
    if (!emailResult.valid) {
      dom.emailInput().focus();
    } else {
      dom.passwordInput().focus();
    }
    return;
  }

  // All fields valid — begin async authentication
  setLoginLoading(true);

  try {
    const user = await simulateAuthApiCall(emailVal, passwordVal);
    persistSession(user, rememberVal);
    transitionToApp(user);
  } catch (error) {
    setLoginLoading(false);
    setGlobalError(error.message);

    // Shake animation on the card for tactile feedback
    const card = document.querySelector('.auth-card');
    card.style.animation = 'none';
    card.offsetHeight; // force reflow
    card.style.animation = 'shake 0.4s ease';
  }
}


// ═══════════════════════════════════════════════════════════════════
// INLINE VALIDATION (blur events)
// ═══════════════════════════════════════════════════════════════════

/**
 * Validates a field on blur, giving the user early feedback
 * without being intrusive while they're still typing.
 */
function handleEmailBlur() {
  const result = validateEmail(dom.emailInput().value);
  if (!result.valid) {
    setFieldError(dom.fgEmail(), dom.emailError(), result.message);
  } else {
    setFieldError(dom.fgEmail(), dom.emailError(), '');
  }
}

function handlePasswordBlur() {
  const result = validatePassword(dom.passwordInput().value);
  if (!result.valid) {
    setFieldError(dom.fgPassword(), dom.passwordError(), result.message);
  } else {
    setFieldError(dom.fgPassword(), dom.passwordError(), '');
  }
}

/**
 * Clears a field error on input so the UI recovers immediately
 * once the user starts correcting their mistake.
 */
function handleEmailInput() {
  if (dom.emailInput().value.trim()) {
    setFieldError(dom.fgEmail(), dom.emailError(), '');
  }
  setGlobalError(null);
}

function handlePasswordInput() {
  if (dom.passwordInput().value) {
    setFieldError(dom.fgPassword(), dom.passwordError(), '');
  }
  setGlobalError(null);
}


// ═══════════════════════════════════════════════════════════════════
// PASSWORD VISIBILITY TOGGLE
// ═══════════════════════════════════════════════════════════════════

function handleTogglePassword() {
  const input = dom.passwordInput();
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  dom.eyeOpen().classList.toggle('hidden', isPassword);
  dom.eyeClosed().classList.toggle('hidden', !isPassword);
  dom.togglePassword().setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
}


// ═══════════════════════════════════════════════════════════════════
// SHAKE KEYFRAME INJECTION
// ═══════════════════════════════════════════════════════════════════

function injectShakeKeyframe() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%       { transform: translateX(-6px); }
      40%       { transform: translateX(6px); }
      60%       { transform: translateX(-4px); }
      80%       { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);
}


// ═══════════════════════════════════════════════════════════════════
// MODULE INITIALIZER
// ═══════════════════════════════════════════════════════════════════

/**
 * Bootstraps the auth module.
 * Checks for an existing session before showing the login screen.
 *
 * @param {Function} onLoginSuccess - Callback from app.js, receives user object
 */
function initAuth(onLoginSuccess) {
  _onLoginSuccess = onLoginSuccess;

  injectShakeKeyframe();

  // ── Bind events ──────────────────────────────────────────────
  dom.loginForm().addEventListener('submit', handleLoginSubmit);

  dom.emailInput().addEventListener('blur',  handleEmailBlur);
  dom.emailInput().addEventListener('input', handleEmailInput);

  dom.passwordInput().addEventListener('blur',  handlePasswordBlur);
  dom.passwordInput().addEventListener('input', handlePasswordInput);

  dom.togglePassword().addEventListener('click', handleTogglePassword);

  // ── Pre-fill remembered email ─────────────────────────────────
  const rememberedEmail = localStorage.getItem(STORAGE_KEY_REMEMBER);
  if (rememberedEmail) {
    dom.emailInput().value = rememberedEmail;
    dom.rememberMe().checked = true;
  }

  // ── Check for existing session (auto-login on reload) ─────────
  const existingSession = readSession();
  if (existingSession) {
    _currentUser = existingSession;
    // Immediately transition — no need to re-authenticate
    transitionToApp(existingSession);
    return;
  }

  // No existing session — show the login screen normally
  dom.authScreen().classList.remove('hidden');
}


// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

export { initAuth, logout, getCurrentUser };
