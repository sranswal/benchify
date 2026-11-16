import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const fixtureOrigin = new URL(process.env.BENCHIFY_FIXTURE_ORIGIN || "http://127.0.0.1:8000").origin;

export function createAgentServer() {
  return createServer(async (request, response) => {
    function send(status, body) {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    }

    if (request.method !== "POST" || request.url !== "/execute") {
      return send(404, { detail: "Unknown route." });
    }
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16_000) return send(413, { detail: "Request too large." });
      }
      const { meeting, window, search_url } = JSON.parse(body);
      const search = new URL(search_url);
      if (search.origin !== fixtureOrigin || !/^\/api\/v1\/fixture\/[\da-f-]{36}\/search$/.test(search.pathname)) {
        return send(400, { detail: "Invalid fixture URL." });
      }
      const options = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: meeting.subject + " release notes" }),
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      };
      let result = await fetch(search, options);
      if (result.status === 503 || result.status === 429) {
        await result.body?.cancel();
        result = await fetch(search, options);
      }
      if (!result.ok) return send(502, { detail: "Fixture search failed." });
      const { sources } = await result.json();
      const findings = sources
        .filter(source => source.primary && source.published_date >= window[0] && source.published_date <= window[1])
        .flatMap(source => {
          const quote = source.content.match(/[^.!?]+\bon [A-Za-z]+ \d{1,2}, \d{4}\./)?.[0].trim();
          if (!quote || !quote.toLowerCase().includes(meeting.subject.toLowerCase())) return [];
          const dateText = quote.match(/\bon ([A-Za-z]+ \d{1,2}, \d{4})\.$/)[1];
          const timestamp = Date.parse(dateText + " UTC");
          if (!Number.isFinite(timestamp)) return [];
          const date = new Date(timestamp).toISOString().slice(0, 10);
          if (date < window[0] || date > window[1]) return [];
          return [{ claim: { statement: quote, development_date: date },
            status: "supported", evidence: [{ ...source, quote }] }];
        });
      send(200, { findings, questions: ["How can we validate the export in our environment?"],
        usage: { input_tokens: 0, output_tokens: 0 } });
    } catch {
      send(502, { detail: "Agent execution failed." });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.BENCHIFY_HTTP_AGENT_PORT || 8001);
  createAgentServer().listen(port, "127.0.0.1", () => console.log("Benchify HTTP agent listening on " + port));
}
