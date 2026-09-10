---
title: "Fixing an SSE stream that dies at two minutes"
description: "An AG-UI endpoint has to answer on POST, it scales out, and something in front of it times out. Three constraints that add up to writing your own resume."
date: "2026-09-10"
tags:
  - sse
  - go
  - redis
---

A chance to serve an [AG-UI](https://docs.ag-ui.com) endpoint came with two
constraints I do not get to negotiate. Together, with a timeout sitting in
front of them, they add up to writing your own reconnect.

**The endpoint has to answer on POST.** Not a preference: AG-UI's
[LangGraph integration](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/langgraph/python/ag_ui_langgraph/endpoint.py)
registers `@app.post(path)` returning a `StreamingResponse`, and wiring that
reference endpoint into my backend is where I started. It is a POST handler and
a stream, nothing more. No keepalive, no resume. And `EventSource`, the thing
that gives server-sent events their reconnection for free, is GET only, so the
automatic retry and the `Last-Event-ID` header naming the last event the client
saw go with it. `fetch` and a `ReadableStream` stream the response; neither of
them recovers it.

**The endpoint scales out.** So a half-finished run cannot live in the process
that started it, or that process is the only one able to serve a retry. Sticky
sessions would paper over it, and would still lose to a restart.

Then the part that makes it a requirement rather than a nicety: **something in
front cuts the connection at around two minutes.** Keepalives are the answer to
a proxy hanging up on a quiet stream. I tried, and it made no difference, which
points at a cap on connection lifetime rather than an idle timeout. Raising it
was not on the table. So the disconnect is not an edge case; it is scheduled,
and the runs I need to stream outlive two minutes.

So reconnect has to be written by hand. And once you are writing it by hand,
the scale-out problem can be fixed in the same pass: put the stream somewhere
every pod can see.

[reconnectable-sse](https://github.com/ssupawat/reconnectable-sse) puts it
in Redis. The endpoint itself is Python; this proves the concept rather than
the implementation, so the language was a free choice and I took it as an
excuse to get familiar with Go. Read it for the shape, not for code to lift.
Two goroutines per stream, sharing nothing but a key:

```go
if !streamExists(r.Context(), key) {
    go runEventGenerator(streamID, string(body))
}

runSSEResponse(r.Context(), streamID, lastEventID, w, flusher)
```

The design is those two lines. `runSSEResponse` takes the request context, so a
disconnect cancels it, which is what should happen when there is nobody left to
write to. `runEventGenerator` takes `context.Background()` and keeps going. Had
it used the request context, a disconnect would cancel the work itself, and
there would be nothing left to resume *to*.

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

The rest follows from that. Redis returns a monotonic entry id on every `XADD`;
it goes out as the SSE `id:`, the client sends it back on the retry, and it goes
into `XREAD` as the starting offset. No cursor table, no reconciliation. The id
the client is holding *is* the offset.

It is a proof of concept and it has edges. The generator starts under a
check-then-act, so two concurrent first requests with the same stream id can
both start one. Nothing cancels a generator whose client never returns. And the
client still has to persist its last event id across the drop. The server can
make a stream resumable, not make the client remember.

Design, endpoints, and how to run it: [github.com/ssupawat/reconnectable-sse](https://github.com/ssupawat/reconnectable-sse)
