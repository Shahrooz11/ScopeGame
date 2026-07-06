// Shared thin WebSocket client for the SCOPE game.
// Usage: const c = new ScopeClient(); c.on("you", fn); c.connect(); c.send("order",{own,cross});
(function () {
  function ScopeClient() {
    this.ws = null; this.handlers = {}; this.queue = []; this.ready = false;
    this.url = window.SCOPE_WS; this._retry = 0; this._closedByUser = false;
  }
  ScopeClient.prototype.on = function (type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; };
  ScopeClient.prototype._emit = function (type, msg) { (this.handlers[type] || []).forEach(function (f) { f(msg); }); };
  ScopeClient.prototype.connect = function () {
    var self = this;
    if (!this.url || this.url.indexOf("REPLACE_ME") !== -1) {
      this._emit("fatal", { error: "WebSocket URL not set. Edit client/config.js with your deployed URL." });
      return;
    }
    this._closedByUser = false;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = function () { self.ready = true; self._retry = 0; self._emit("open", {}); self.queue.splice(0).forEach(function (m) { self.ws.send(m); }); };
    this.ws.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.ok === false) self._emit("error", msg);
      if (msg.type) self._emit(msg.type, msg);
      self._emit("message", msg);
    };
    this.ws.onclose = function () {
      self.ready = false; self._emit("close", {});
      if (!self._closedByUser) { self._retry++; setTimeout(function () { self.connect(); }, Math.min(5000, 500 * self._retry)); }
    };
    this.ws.onerror = function () { self._emit("wserror", {}); };
  };
  ScopeClient.prototype.send = function (action, payload) {
    var data = JSON.stringify(Object.assign({ action: action }, payload || {}));
    if (this.ready && this.ws && this.ws.readyState === 1) this.ws.send(data); else this.queue.push(data);
  };
  ScopeClient.prototype.close = function () { this._closedByUser = true; if (this.ws) this.ws.close(); };
  window.ScopeClient = ScopeClient;
})();
