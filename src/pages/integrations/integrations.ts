/*  Script for the Integrations page: a list of the apps the AI can connect to,
    each showing whether the signed-in user has connected it. Connect asks /api/integrations
    for the app's sign-in URL and sends the browser there; the app then sends the user back
    to this page with ?connected=<provider> or ?error=<message>. Every failure is logged to
    the console and shown in an alert, so the actual reason is easy to see.
    Each app's details live in its own file in src/helpers/integrations/.
*/
import { authHeaders } from "../../services/client";
import { INTEGRATIONS, type Integration } from "../../helpers/integrations";

type Connection = { provider: string; account_label: string | null; updated_at: string };

type ApiResult = { ok: true; url?: string } | { ok: false; error: string };

async function initIntegrationsPage(root: HTMLElement): Promise<void> {
  root.innerHTML = "";
  root.classList.add("integrations-page");

  const banner = document.createElement("p");
  banner.className = "integrations-banner";
  banner.hidden = true;
  const list = document.createElement("ul");
  list.className = "integrations-list";
  root.append(banner, list);

  const showBanner = (message: string, isError: boolean) => {
    banner.textContent = message;
    banner.classList.toggle("is-error", isError);
    banner.hidden = false;
  };

  const reportError = (message: string) => {
    console.error(`[integrations] ${message}`);
    showBanner(message, true);
    alert(message);
  };

  // Show the result of a sign-in the provider just sent us back from, then tidy the URL.
  const params = new URLSearchParams(location.search);
  const connected = INTEGRATIONS.find((i) => i.provider === params.get("connected"));
  if (connected) showBanner(`${connected.name} is connected.`, false);
  const callbackError = params.get("error");
  if (params.size) history.replaceState(null, "", location.pathname);

  const headers = await authHeaders();
  if (!headers.authorization) showBanner("Sign in to connect your apps.", true);

  const signedIn = Boolean(headers.authorization);
  let connections: Connection[] = [];
  if (signedIn) {
    const loaded = await loadConnections(headers);
    if ("error" in loaded) {
      console.error(`[integrations] Couldn't load your connections: ${loaded.error}`);
      showBanner(`Couldn't load your connections: ${loaded.error}`, true);
    } else {
      connections = loaded.connections;
    }
  }

  const render = () => {
    list.innerHTML = "";
    for (const integration of INTEGRATIONS) {
      const connection = connections.find((c) => c.provider === integration.provider);
      list.append(renderCard(integration, connection));
    }
  };

  const renderCard = (integration: Integration, connection: Connection | undefined) => {
    const item = document.createElement("li");
    item.className = "integration-card";
    item.classList.toggle("is-connected", Boolean(connection));

    const text = document.createElement("div");
    text.className = "integration-card-text";
    const name = document.createElement("strong");
    name.textContent = integration.name;
    const description = document.createElement("span");
    description.textContent = connection
      ? `Connected${connection.account_label ? ` as ${connection.account_label}` : ""}.`
      : integration.description;
    text.append(name, description);

    const button = document.createElement("button");
    button.type = "button";
    button.className = connection ? "integration-connect is-secondary" : "integration-connect";
    button.textContent = connection ? "Disconnect" : "Connect";
    button.setAttribute("aria-label", `${button.textContent} ${integration.name}`);
    button.disabled = !signedIn;
    button.addEventListener("click", async () => {
      button.disabled = true;
      if (connection) {
        const result = await callApi("DELETE", integration.provider);
        if (result.ok) {
          connections = connections.filter((c) => c !== connection);
          render();
          return;
        }
        reportError(`Couldn't disconnect ${integration.name}: ${result.error}`);
      } else {
        const result = await callApi("POST", integration.provider);
        if (result.ok && result.url) return location.assign(result.url);
        reportError(
          `Couldn't start connecting ${integration.name}: ${result.ok ? "no sign-in URL returned" : result.error}`,
        );
      }
      button.disabled = false;
    });

    item.append(text, button);
    return item;
  };

  render();
  // After the list is on screen, so the alert doesn't block it from showing.
  if (callbackError) setTimeout(() => reportError(callbackError), 0);
}

// POST starts connecting (returns { url }); DELETE disconnects. On failure, carries the
// server's error message (or the network error) so it can be shown.
async function callApi(method: "POST" | "DELETE", provider: string): Promise<ApiResult> {
  try {
    const response = await fetch("/api/integrations", {
      method,
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ provider }),
    });
    const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (response.ok) return { ok: true, url: data?.url };
    return { ok: false, error: data?.error ?? `HTTP ${response.status} ${response.statusText}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function loadConnections(
  headers: Record<string, string>,
): Promise<{ connections: Connection[] } | { error: string }> {
  try {
    const response = await fetch("/api/integrations", { headers });
    const data = (await response.json().catch(() => null)) as
      | { connections?: Connection[]; error?: string }
      | null;
    if (response.ok && data?.connections) return { connections: data.connections };
    return { error: data?.error ?? `HTTP ${response.status} ${response.statusText}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const root = document.querySelector<HTMLDivElement>("#integrationsPageRoot");
if (root) initIntegrationsPage(root);
