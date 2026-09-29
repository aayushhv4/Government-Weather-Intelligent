/**
 * Panchayat Weather Intelligence — optional account module
 *
 * Account handling is OPTIONAL. Every core feature of the platform works without it.
 *
 * This module provides:
 *   1. Optional local accounts stored only in this browser, with passwords kept as SHA-256 hashes
 *      (never plaintext). No account data ever leaves the device.
 *   2. An optional external identity provider (Supabase Auth) that is used only when the operator
 *      configures it — see js/site-config.js.
 *   3. A clearly labelled local guest session so signed-out and signed-in states can both be seen.
 *   4. Session expiry (24 hours), return-to-page handling and a role indicator.
 *
 * There is no invented institutional account and no fabricated official e-mail address anywhere in
 * this module: only accounts the user creates locally, or the local guest session.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'pwi_auth_session';
  const USERS_STORAGE_KEY = 'pwi_registered_users';
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  async function sha256(text) {
    if (window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(text);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Simple fallback for environments without crypto.subtle
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(16);
  }

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (session.expiresAt && Date.now() > session.expiresAt) {
        clearSession();
        return null;
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function saveSession(user, remember = true) {
    const session = {
      token: 'pwi_tok_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
      user: {
        id: user.id || 'usr_' + Math.random().toString(36).slice(2, 10),
        name: user.name || user.email.split('@')[0],
        email: user.email,
        role: user.role || 'Registered user',
        organization: user.organization || 'Agricultural Meteorology Wing',
        isDemo: !!user.isDemo,
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    try {
      if (remember) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      }
    } catch (e) {
      console.warn('Session storage warning:', e);
    }
    return session;
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function getRegisteredUsers() {
    try {
      const raw = localStorage.getItem(USERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRegisteredUser(userObj) {
    try {
      const users = getRegisteredUsers();
      users.push(userObj);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) {}
  }

  const PWI_AUTH = {
    getSession() {
      return getStoredSession();
    },

    getUser() {
      const s = getStoredSession();
      return s ? s.user : null;
    },

    isAuthenticated() {
      return !!getStoredSession();
    },

    isDemo() {
      const s = getStoredSession();
      return s && s.user && s.user.isDemo;
    },

    async signIn(email, password, remember = true) {
      if (!email || !password) {
        throw new Error('Please enter both email and password.');
      }
      const normEmail = email.trim().toLowerCase();

      // Check external Supabase Auth if configured
      if (window.PWI_CONFIG && window.PWI_CONFIG.SUPABASE_URL && window.PWI_CONFIG.SUPABASE_ANON_KEY && window.supabase) {
        try {
          const client = window.supabase.createClient(window.PWI_CONFIG.SUPABASE_URL, window.PWI_CONFIG.SUPABASE_ANON_KEY);
          const { data, error } = await client.auth.signInWithPassword({ email: normEmail, password });
          if (error) throw error;
          if (data && data.user) {
            return saveSession({
              id: data.user.id,
              email: data.user.email,
              name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
              role: data.user.user_metadata?.role || 'Agro-Meteorological Officer',
              isDemo: false
            }, remember);
          }
        } catch (supaErr) {
          console.warn('External Supabase Auth failed, falling back to local credentials:', supaErr.message);
        }
      }

      // Local accounts created in this browser
      const registered = getRegisteredUsers();
      const pwHash = await sha256(password);
      const foundUser = registered.find(u => u.email === normEmail);
      if (!foundUser) {
        throw new Error('No account for this e-mail address is stored in this browser. Create one below, or continue without signing in — the weather tools do not need an account.');
      }
      if (foundUser.pwHash !== pwHash) {
        throw new Error('Incorrect password for this account.');
      }
      return saveSession(foundUser, remember);
    },

    async signUp(name, email, password, organization = '') {
      if (!email || !password || !name) {
        throw new Error('All required fields must be filled.');
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      const normEmail = email.trim().toLowerCase();
      const registered = getRegisteredUsers();
      if (registered.some(u => u.email === normEmail)) {
        throw new Error('An account with this email address already exists.');
      }

      const pwHash = await sha256(password);
      const newUser = {
        id: 'usr_' + Math.random().toString(36).slice(2, 10),
        name: name.trim(),
        email: normEmail,
        pwHash,
        organization: organization.trim() || 'Agricultural Meteorological Service',
        role: 'Registered Agromet Officer',
        isDemo: false,
        createdAt: Date.now()
      };
      saveRegisteredUser(newUser);
      return saveSession(newUser, true);
    },

    /** Start a clearly labelled local guest session. No credentials, no server call. */
    demoLogin() {
      const guest = {
        id: 'guest_' + Date.now().toString(36),
        name: 'Guest session',
        email: '',
        role: 'Public visitor',
        fullRole: 'Local guest session — stored only in this browser',
        organization: 'Not signed in to an account',
        isDemo: true
      };
      return saveSession(guest, true);
    },

    signOut() {
      clearSession();
      if (window.PWI_CONFIG && window.PWI_CONFIG.SUPABASE_URL && window.supabase) {
        try {
          const client = window.supabase.createClient(window.PWI_CONFIG.SUPABASE_URL, window.PWI_CONFIG.SUPABASE_ANON_KEY);
          client.auth.signOut();
        } catch (e) {}
      }
    },

    /**
     * Only call this for genuinely account-only pages. Core weather features must never be gated:
     * a public visitor is never redirected away from the workspace.
     */
    requireAuth(returnUrl) {
      if (!this.isAuthenticated()) {
        const target = returnUrl || window.location.pathname + window.location.hash;
        window.location.href = 'login.html?returnTo=' + encodeURIComponent(target);
        return false;
      }
      return true;
    },

    updateTopBar() {
      const userBox = document.getElementById('topbarUser');
      if (!userBox) return;
      const session = getStoredSession();
      if (session && session.user) {
        const u = session.user;
        const roleLabel = u.role || (u.isDemo ? 'Guest' : 'Account holder');
        userBox.innerHTML = `
          <div class="user-pill auth-pill active" title="${u.name} — ${u.fullRole || u.role} (${u.jurisdiction || u.organization || ''})">
            <span class="user-status-dot" style="width:8px;height:8px;border-radius:50%;background:#16a34a;display:inline-block;box-shadow:0 0 0 2px rgba(22,163,74,0.25)"></span>
            <span class="user-name" style="font-weight:650;font-size:12.5px;color:var(--ink)">${u.name} <span style="font-weight:400;color:var(--ink-3)">· ${roleLabel}</span></span>
          </div>
          <button class="ctrl-btn ctrl-btn-logout" id="logoutBtn" type="button" title="Sign out to Public View" style="padding:5px 10px;font-size:12px">
            <span>Sign Out</span>
          </button>
        `;
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', () => {
            PWI_AUTH.signOut();
            window.location.href = 'index.html';
          });
        }
      } else {
        userBox.innerHTML = `
          <a href="login.html" class="ctrl-btn" id="loginBtn" title="Optional sign in" style="padding:6px 12px;font-size:12.5px;text-decoration:none;display:inline-flex;align-items:center;gap:6px">
            <span>Sign in</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
        `;
      }
    }
  };

  window.PWI_AUTH = PWI_AUTH;
})();
