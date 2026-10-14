// Content script on the repair workbench: relays the page's ALLDATA requests
// to the extension's background worker and posts the answers back. Only
// messages from the page itself, on its own origin, are relayed.
(() => {
  const CHANNEL = "speedx-alldata";
  const version = chrome.runtime.getManifest().version;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || typeof data.id !== "string") return;
    const answer = (message) => window.postMessage({ channel: CHANNEL, id: data.id, ...message }, location.origin);

    if (data.direction === "ping") {
      answer({ direction: "pong", version });
      return;
    }
    if (data.direction !== "request" || typeof data.op !== "string") return;
    chrome.runtime.sendMessage({ op: data.op, args: data.args ?? {} }, (reply) => {
      const failure = chrome.runtime.lastError;
      if (failure || !reply) {
        answer({ direction: "response", ok: false, error: { code: "timeout", message: failure ? failure.message : "" } });
        return;
      }
      answer({ direction: "response", ...reply });
    });
  });
})();
