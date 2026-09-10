---
title: "Fixing an SSE stream that dies at two minutes"
description: "I wired up AG-UI's reference endpoint and it ran, until my streams started dying at two minutes. Keepalives did nothing for me, and the timeout was never mine to raise."
date: "2026-09-10"
tags:
  - sse
  - go
  - redis
---

I got a chance to serve an [AG-UI](https://docs.ag-ui.com) endpoint, so I
started where the protocol points. AG-UI's
[LangGraph integration](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/langgraph/python/ag_ui_langgraph/endpoint.py)
ships a helper that registers the endpoint for me. It calls `@app.post(path)`
and returns a `StreamingResponse`. I wired it into my backend and it ran.

Then I started losing streams. About two minutes into a run the stream would
stop, and I was left with half an answer on the client.

My first guess was an idle timeout. I assumed something in front was hanging up
on a stream that had gone quiet, and I knew the standard fix: send a keepalive
so the connection never looks idle. I added one. I still lost the stream at two
minutes.

So I took it that whatever sits in front counts the age of the connection and
hangs up at two minutes, whether or not bytes are moving. I asked the infra
team to raise the limit and they turned me down. I never did learn which layer
sets that number.

That settled the shape of my problem. Every run I stream longer than two
minutes gets cut, and I have to survive it from my side.

Normally I would let the browser reconnect for me. `EventSource` does it for
free: it retries on its own and sends back a `Last-Event-ID` header naming the
last event it saw, so the server can carry on from there. I could not use any
of it. That machinery is GET only, and AG-UI answers on POST, which puts me on
`fetch` and a `ReadableStream`. Those will stream a response. Recovering one is
my job.

I hit the second wall right behind the first. My endpoint runs on several pods,
so even once I write reconnect by hand, the retry goes through the load
balancer and lands wherever it lands. If I keep the half-finished run in the
process that started it, only that process can answer, and I am back to pinning
traffic with sticky sessions.

So I needed two things. Work that keeps going after my client is gone, and a
record of that work any pod can read.

I built [reconnectable-sse](https://github.com/ssupawat/reconnectable-sse) to
try it out. My production endpoint is Python. This was a concept I wanted to
test, so the language was free, and I used it as an excuse to get familiar with
Go. Read it for the shape.

I got the idea down to two lines:

```go
if !streamExists(r.Context(), key) {
    go runEventGenerator(streamID, string(body))
}

runSSEResponse(r.Context(), streamID, lastEventID, w, flusher)
```

I give `runSSEResponse` the request context, so a disconnect stops it, which is
what I want, since there is nobody left to write to. I give
`runEventGenerator` `context.Background()`, and it keeps running. Hand it the
request context instead and the disconnect kills the work itself, leaving me
nothing to come back to.

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
The shaded band is api-1's generator. It starts on the first request and runs to
completion on <code>context.Background()</code>, through the drop, through the
reconnect, and regardless of the fact that api-2 is the one talking to the
client now.
</figcaption>
</figure>

Resume then came down to an offset. Redis returns an entry id on every `XADD`.
I send that id out as the SSE `id:`, the client sends it back on the retry, and
I put it into `XREAD` as the starting point. No cursor table, no bookkeeping.
The id my client is holding is the offset.

I ran it and it does what I wanted. My client can drop mid-stream, come back
through a different pod, and pick up where it stopped.

I left edges in it. I start the generator under a check-then-act, so two
concurrent first requests with the same stream id can both start one. I never
cancel a generator whose client stays away. And I made my client remember its
last event id across the drop.

Design, endpoints, and how to run it: [github.com/ssupawat/reconnectable-sse](https://github.com/ssupawat/reconnectable-sse)
