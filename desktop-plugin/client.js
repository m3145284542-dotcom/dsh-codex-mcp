window.__ModuleLoader__.load({
  id: "dsh-codex-desktop-bridge",
  factory: () => ({
    inject: ["uiWorkspace"],
    apply(ctx) {
      let stopped = false;
      let opened = null;
      let busy = false;
      const lifetime = new AbortController();
      const endpoint = "/api/codex-desktop-bridge/navigation";
      async function poll() {
        if (stopped || busy) return;
        busy = true;
        try {
          const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: lifetime.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const value = await response.json();
          if (stopped) return;
          if (value.requestId && value.sessionId && opened !== value.requestId) {
            ctx.uiWorkspace.openSession(value.sessionId);
            opened = value.requestId;
          }
          if (value.requestId) await fetch(endpoint, {
            method: "POST", credentials: "same-origin", signal: lifetime.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: value.requestId }),
          });
        } catch (error) {
          console.debug("Codex desktop bridge waiting for Host", error.message);
          if (!stopped) await new Promise(resolve => setTimeout(resolve, 1000));
        } finally {
          busy = false;
          if (!stopped) poll();
        }
      }
      poll();
      ctx.effect(() => () => { stopped = true; lifetime.abort(); });
    },
  }),
});
