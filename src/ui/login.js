// Login screen: log in to the online account, create one, or play as guest.
// On claude.ai the claude.ai sign-in is the login. On the website it is an email and password
// (Supabase), and the profile is a row in the profiles table.
const $ = (id) => document.getElementById(id);

export class LoginScreen {
  constructor(game) {
    this.game = game;
    this.el = $('login');
    $('guestBtn').addEventListener('click', () => this.done(() => game.account.useGuest(game.legacyProfile())));
    $('loginBtn').addEventListener('click', () => this.done(() => game.account.loginOnline()));
    $('createBtn').addEventListener('click', () => this.create());
    $('mailLogin').addEventListener('click', () => this.mail(false));
    $('mailSignup').addEventListener('click', () => this.mail(true));
    $('logoutBtn').addEventListener('click', async () => {
      await game.account.signOut();
      this.show();
    });
    for (const id of ['newName', 'loginMail', 'loginPass']) {
      $(id).addEventListener('keydown', (e) => {
        e.stopPropagation(); // typing must not drive the game
        if (e.key !== 'Enter') return;
        if (id === 'newName') this.create();
        else this.mail(false);
      });
    }
  }

  get visible() {
    return !this.el.hidden;
  }

  async show() {
    const acc = this.game.account;
    this.el.hidden = false;
    for (const id of ['loginExisting', 'loginCreate', 'loginEmail', 'logoutBtn']) $(id).hidden = true;
    $('loginNote').textContent = '';
    $('loginStatus').textContent = 'Looking for your account...';
    $('guestBtn').disabled = false;
    await acc.detect();
    if (this.el.hidden) return;
    const web = acc.backend === 'supabase';
    if (web && acc.signedIn) {
      $('logoutMail').textContent = acc.email;
      $('logoutBtn').hidden = false;
    }
    if (acc.online && acc.remote) {
      $('loginStatus').textContent = 'Welcome back.';
      $('loginName').textContent = acc.remote.name;
      $('loginExisting').hidden = false;
      $('loginNote').textContent = web ? 'Your profile is saved online, so it follows you to any device.' : 'Your account is saved online with your claude.ai sign-in, so it follows you to any device.';
    } else if (acc.online) {
      $('loginStatus').textContent = 'Create your profile.';
      $('loginCreate').hidden = false;
      $('newName').value = acc.data.name && acc.data.name !== 'PLAYER' ? acc.data.name : '';
      $('loginNote').textContent = web ? 'Pick the name other players will see.' : 'It is saved online with your claude.ai sign-in. No password needed.';
      setTimeout(() => $('newName').focus(), 50);
    } else if (web) {
      $('loginStatus').textContent = 'Log in to play online.';
      $('loginEmail').hidden = false;
      $('loginNote').textContent = 'New here? Type an email and a password, then Create account. Guests can play everything except online matches.';
    } else {
      $('loginStatus').textContent = 'Online accounts are not available here.';
      $('loginNote').textContent = 'They work on the game website, or when you open the game from its claude.ai link while signed in. As a guest, your progress is saved in this browser only.';
    }
  }

  async mail(signup) {
    const acc = this.game.account;
    const email = $('loginMail').value.trim();
    const pass = $('loginPass').value;
    if (!email || pass.length < 6) {
      $('loginNote').textContent = 'Type your email and a password of at least 6 characters.';
      return;
    }
    $('mailLogin').disabled = true;
    $('mailSignup').disabled = true;
    $('loginNote').textContent = signup ? 'Creating your account...' : 'Logging in...';
    let r;
    try {
      r = signup ? await acc.signUp(email, pass) : await acc.signIn(email, pass);
    } catch (e) {
      r = { ok: false, error: 'Could not reach the server. Check your internet and try again.' };
    }
    $('mailLogin').disabled = false;
    $('mailSignup').disabled = false;
    if (!r.ok) {
      $('loginNote').textContent = r.error || 'That did not work. Try again.';
      return;
    }
    if (r.confirm) {
      $('loginNote').textContent = `Check ${email} for a confirmation link, click it, then come back and log in.`;
      return;
    }
    $('loginPass').value = '';
    this.show();
  }

  async create() {
    const name = $('newName').value.trim();
    if (!name) {
      $('loginNote').textContent = 'Type a player name first.';
      return;
    }
    $('createBtn').disabled = true;
    $('loginNote').textContent = 'Creating your profile...';
    try {
      await this.game.account.createOnline(name, $('carryGuest').checked);
      this.hide();
      this.game.onLogin();
    } catch (e) {
      $('loginNote').textContent = e && e.code === 'invalid_argument'
        ? 'This view is not allowed to save an account (you need edit access to the game). Play as guest instead.'
        : 'Could not create the profile right now. Try again, or play as guest.';
    }
    $('createBtn').disabled = false;
  }

  done(fn) {
    this.game.audio.init();
    fn();
    this.hide();
    this.game.onLogin();
  }

  hide() {
    this.el.hidden = true;
  }
}
