---
title: "Fixing an SSE stream that dies at two minutes"
description: "I wired up AG-UI's reference endpoint and it ran. Then my streams started dying at two minutes. Keepalives did nothing, and the timeout was never mine to raise."
date: "2026-09-10"
tags:
  - sse
  - go
  - redis
---

I got a chance to serve an [AG-UI](https://docs.ag-ui.com) endpoint. So I
started where the protocol points. AG-UI's
[LangGraph integration](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/langgraph/python/ag_ui_langgraph/endpoint.py)
ships a helper that registers the endpoint. It calls `@app.post(path)` and
returns a `StreamingResponse`. From there I wired it into my backend, and it
ran.

Then I started losing streams. About two minutes into a run, the stream would
stop. After that the client sat with half an answer.

My first guess was an idle timeout. Something in front was hanging up on a
stream that had gone quiet. The standard fix for that is a keepalive, because
it stops the connection from looking idle. So I added one. Even so, I still
lost the stream at two minutes.

So whatever sits in front counts the age of the connection. It hangs up at two
minutes, whether or not bytes are moving. Next I asked the infra team to raise
the limit, and they turned me down. In the end I never did learn which layer
sets that number.

That settled the shape of the problem. From then on, every run longer than two
minutes gets cut. And I have to survive it from my side.

Normally the browser would reconnect for me. `EventSource` does it for free.
First it retries on its own. Then it sends back a `Last-Event-ID` header. That
header names the last event the client saw. So the server carries on from
there. But I could not use any of it. That machinery is GET only, and AG-UI
answers on POST. So I am on `fetch` and a `ReadableStream`. Those will stream a
response. Even so, recovering one is my job.

The second wall came right behind the first. My endpoint runs on several pods.
So the retry goes through the load balancer, and it lands wherever it lands. If
the half-finished run lives in the process that started it, only that process
can answer. Then I am back to pinning traffic with sticky sessions.

So I needed two things. First, the work has to keep going after the client is
gone. Second, any pod has to be able to read a record of it.

I built [reconnectable-sse](https://github.com/ssupawat/reconnectable-sse) to
try it out. My production endpoint is Python. But this was a concept, and the
language was free. So I used it as an excuse to get familiar with Go. In the
end the shape is the part that matters.

It comes down to two lines:

```go
if !streamExists(r.Context(), key) {
    go runEventGenerator(streamID, string(body))
}

runSSEResponse(r.Context(), streamID, lastEventID, w, flusher)
```

I give `runSSEResponse` the request context. So a disconnect stops it. That is
what I want, since there is nobody left to write to. Meanwhile
`runEventGenerator` gets `context.Background()`, and it keeps running. Hand it
the request context instead, and the disconnect kills the work itself. Then
nothing is left to come back to.

<figure style="margin:2.25rem 0;overflow-x:auto">
<svg viewBox="0 0 720 372" width="720" role="img" aria-label="Sequence diagram: a client streams from api-1, drops, and reconnects through api-2, which reads the same Redis stream from the client's last event id while api-1's generator keeps running." style="max-width:100%;min-width:560px;height:auto;display:block">
<defs>
<marker id="sse-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" fill-opacity=".75"/>
</marker>
</defs>
<g font-family="JetBrains Mono, SF Mono, Monaco, monospace" fill="currentColor">

<g fill="none" stroke="currentColor" stroke-opacity=".45">
<rect x="25" y="8" width="90" height="26" rx="4"/>
<rect x="215" y="8" width="90" height="26" rx="4"/>
<rect x="405" y="8" width="90" height="26" rx="4"/>
<rect x="600" y="8" width="90" height="26" rx="4"/>
</g>
<g font-size="12" text-anchor="middle">
<text x="70" y="26">client</text>
<text x="260" y="26">api-1</text>
<text x="450" y="26">api-2</text>
<text x="645" y="26">redis</text>
</g>

<g stroke="currentColor" stroke-opacity=".25" stroke-dasharray="3 4">
<line x1="70" y1="34" x2="70" y2="352"/>
<line x1="260" y1="34" x2="260" y2="352"/>
<line x1="450" y1="34" x2="450" y2="352"/>
<line x1="645" y1="34" x2="645" y2="352"/>
</g>

<rect x="257" y="96" width="6" height="234" rx="3" fill="currentColor" fill-opacity=".14"/>

<g font-size="11" fill-opacity=".55" letter-spacing=".04em">
<text x="25" y="58">1. FIRST CONNECTION</text>
<text x="25" y="214">2. RECONNECT, DIFFERENT POD</text>
</g>

<g stroke="currentColor" stroke-opacity=".8" marker-end="url(#sse-arrow)">
<line x1="72" y1="78" x2="254" y2="78"/>
<line x1="264" y1="104" x2="639" y2="104"/>
<line x1="639" y1="130" x2="266" y2="130" stroke-dasharray="4 3"/>
<line x1="254" y1="156" x2="76" y2="156"/>
<line x1="72" y1="252" x2="444" y2="252"/>
<line x1="454" y1="278" x2="639" y2="278"/>
<line x1="639" y1="304" x2="456" y2="304" stroke-dasharray="4 3"/>
<line x1="444" y1="330" x2="76" y2="330"/>
</g>

<g font-size="11" text-anchor="middle" fill-opacity=".85">
<text x="163" y="72">POST /v1/stream</text>
<text x="451" y="98">XADD token 1-3</text>
<text x="451" y="124">XREAD</text>
<text x="165" y="150">SSE events 1-3</text>
<text x="165" y="230">POST + X-Stream-Id</text>
<text x="165" y="242">+ X-Last-Event-Id</text>
<text x="546" y="272">XREAD from 4</text>
<text x="546" y="298">events 4-20, done</text>
<text x="165" y="324">SSE events 4-20 + done</text>
</g>

<g stroke="currentColor" stroke-opacity=".7">
<line x1="159" y1="172" x2="171" y2="184"/>
<line x1="171" y1="172" x2="159" y2="184"/>
</g>
<text x="180" y="182" font-size="11" fill-opacity=".6">connection drops</text>

</g>
</svg>
<figcaption style="font-size:.85rem;opacity:.7;margin-top:.85rem;line-height:1.5">
The shaded band is api-1's generator. It starts on the first request and runs
to completion on <code>context.Background()</code>. It keeps going through the
drop and the reconnect, even though api-2 is the one talking to the client
now.
</figcaption>
</figure>

Resume then came down to an offset. Redis returns an entry id on every `XADD`.
That id goes out as the SSE `id`. Then the client sends it back on the retry.
From there it goes into `XREAD` as the starting point. So there is no cursor
table and no bookkeeping. In the end the id the client is holding is the
offset.

I ran it. It does what I wanted. After a drop mid-stream, a client comes back
through a different pod and picks up where it stopped.

Still, I left edges in it. The generator starts under a check-then-act. So two
concurrent first requests with the same stream id can both start one. Also,
nothing cancels a generator whose client stays away. And I made the client
remember its last event id across the drop.

Design, endpoints, and how to run it: [github.com/ssupawat/reconnectable-sse](https://github.com/ssupawat/reconnectable-sse)
