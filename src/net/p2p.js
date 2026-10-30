// Direct connections between the players of a match (WebRTC data channels). Supabase Realtime then
// only carries the handshake: game updates go straight from browser to browser, without the trip to
// the Supabase server, without its 100 messages a second limit, and over an unreliable channel, so a
// lost packet is skipped instead of holding up every newer update behind it (what a WebSocket does).
//
// Every pair of players gets one connection; the player with the smaller peer id makes the offer.
// If a pair cannot connect directly (some school or company networks block it; there is no relay
// server), the game keeps using Supabase for that pair.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const GIVE_UP_MS = 9000; // no open channel after this long: count the pair as failed
const MAX_TRIES = 2;

export class P2P {
  // `signal(to, data)`: send a handshake message through Supabase. `onData(from, text)`: a message
  // arrived on a direct channel.
  constructor(me, signal, onData) {
    this.me = me;
    this.signal = signal;
    this.onData = onData;
    this.links = new Map(); // peer -> { pc, dc, open, failed, tries, timer, pending }
    this.ok = typeof RTCPeerConnection === 'function';
  }

  // The match's players changed: connect to new ones, drop ones who left.
  sync(peers) {
    if (!this.ok) return;
    const want = new Set(peers.filter((k) => k !== this.me));
    for (const k of [...this.links.keys()]) if (!want.has(k)) this.drop(k);
    for (const k of want) {
      if (!this.links.has(k) && this.me < k) this.connect(k, 1);
    }
  }

  link(peer) {
    let l = this.links.get(peer);
    if (!l) {
      l = { pc: null, dc: null, open: false, failed: false, tries: 0, timer: null, pending: [] };
      this.links.set(peer, l);
    }
    return l;
  }

  makePc(peer, l) {
    if (l.pc) {
      try {
        l.pc.close();
      } catch (e) {
        // Ignore.
      }
    }
    const pc = new RTCPeerConnection({ iceServers: ICE });
    l.pc = pc;
    l.open = false;
    l.dc = null;
    l.pending = [];
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal(peer, { k: 'ice', c: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (l.pc !== pc) return;
      if (pc.connectionState === 'failed') this.fail(peer, l);
    };
    pc.ondatachannel = (e) => this.useChannel(peer, l, e.channel);
    clearTimeout(l.timer);
    l.timer = setTimeout(() => {
      if (l.pc === pc && !l.open) this.fail(peer, l);
    }, GIVE_UP_MS);
    return pc;
  }

  async connect(peer, tryNo) {
    const l = this.link(peer);
    l.tries = tryNo;
    l.failed = false;
    const pc = this.makePc(peer, l);
    // Unordered, never resent: an old car position is worthless once a newer one exists.
    this.useChannel(peer, l, pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }));
    try {
      await pc.setLocalDescription(await pc.createOffer());
      this.signal(peer, { k: 'offer', sdp: pc.localDescription.sdp, n: tryNo });
    } catch (e) {
      this.fail(peer, l);
    }
  }

  useChannel(peer, l, dc) {
    l.dc = dc;
    dc.onopen = () => {
      if (l.dc !== dc) return;
      l.open = true;
      l.failed = false;
      clearTimeout(l.timer);
    };
    dc.onclose = () => {
      if (l.dc === dc) l.open = false;
    };
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') this.onData(peer, e.data);
    };
  }

  fail(peer, l) {
    l.open = false;
    clearTimeout(l.timer);
    if (this.me < peer && l.tries < MAX_TRIES) {
      this.connect(peer, l.tries + 1);
      return;
    }
    l.failed = true;
    if (l.pc) {
      try {
        l.pc.close();
      } catch (e) {
        // Ignore.
      }
    }
    l.pc = null;
  }

  // A handshake message from Supabase.
  async onSignal(from, msg) {
    if (!this.ok || !msg || typeof msg !== 'object') return;
    try {
      if (msg.k === 'offer' && typeof msg.sdp === 'string') {
        const l = this.link(from);
        l.tries = Number(msg.n) || 1;
        l.failed = false;
        const pc = this.makePc(from, l);
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        this.signal(from, { k: 'answer', sdp: pc.localDescription.sdp });
        this.flush(l);
      } else if (msg.k === 'answer' && typeof msg.sdp === 'string') {
        const l = this.links.get(from);
        if (!l || !l.pc || l.pc.signalingState !== 'have-local-offer') return;
        await l.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        this.flush(l);
      } else if (msg.k === 'ice' && msg.c) {
        const l = this.links.get(from);
        if (!l || !l.pc) return;
        if (l.pc.remoteDescription) await l.pc.addIceCandidate(msg.c);
        else l.pending.push(msg.c);
      }
    } catch (e) {
      // A broken handshake ends in fail() through the timer.
    }
  }

  async flush(l) {
    const list = l.pending;
    l.pending = [];
    for (const c of list) {
      try {
        await l.pc.addIceCandidate(c);
      } catch (e) {
        // Ignore one bad candidate.
      }
    }
  }

  isOpen(peer) {
    const l = this.links.get(peer);
    return !!(l && l.open && l.dc && l.dc.readyState === 'open');
  }

  // Send to every open channel. Returns the peers it reached.
  send(text) {
    const sent = new Set();
    for (const [k, l] of this.links) {
      if (!this.isOpen(k)) continue;
      try {
        l.dc.send(text);
        sent.add(k);
      } catch (e) {
        // A full or closing channel: this update goes through Supabase instead.
      }
    }
    return sent;
  }

  drop(peer) {
    const l = this.links.get(peer);
    if (!l) return;
    clearTimeout(l.timer);
    if (l.pc) {
      try {
        l.pc.close();
      } catch (e) {
        // Ignore.
      }
    }
    this.links.delete(peer);
  }

  close() {
    for (const k of [...this.links.keys()]) this.drop(k);
  }
}
