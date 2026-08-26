(() => {
  const EXPECTED = [
    { label: "pointerdown", names: ["pointerdown"] },
    { label: "dragstart", names: ["dragstart"] },
    { label: "payload-built", names: ["sender-payload-built"] },
    { label: "file-cache-result", names: ["sender-file-cache-completed", "sender-file-cache-failed", "sender-file-cache-skipped"] },
    { label: "transfer-registration-result", names: ["sender-registration-result"] },
    { label: "data-transfer-after-write", names: ["sender-datatransfer-after-write"] },
    { label: "destination-dragover", names: ["receiver-dragover-policy"] },
    { label: "physical-drop", names: ["receiver-physical-drop-claimed"] },
    { label: "byte-request", names: ["receiver-byte-request-started"] },
    { label: "byte-response", names: ["receiver-byte-request-result"] },
    { label: "file-reconstructed", names: ["receiver-file-reconstructed"] },
    { label: "input-assignment", names: ["receiver-input-assignment-result", "receiver-no-compatible-direct-target"] },
    { label: "receiver-handoff", names: ["receiver-handoff-completed"] },
    { label: "dragend", names: ["dragend"] }
  ];
  const CONTEXTS = ["filechute-sidepanel", "filechute-service-worker", "chatgpt", "google", "yandex", "framechute"];
  const ordered = (events) => [...events].sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0) || String(a.at || "").localeCompare(String(b.at || "")));
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const contextOf = (event) => event.component || event.source || "unknown";
  const isPhysical = (event) => event.eventOrigin !== "synthetic";

  function health(events) {
    const workerBoot = events.filter((event) => event.checkpoint === "worker-context-loaded").at(-1);
    const currentEvents = workerBoot ? events.filter((event) => Number(event.sequence) >= Number(workerBoot.sequence)) : events;
    return CONTEXTS.map((context) => {
      const records = currentEvents.filter((event) => contextOf(event) === context);
      const loaded = records.filter((event) => ["blackbox-context-loaded", "receiver-context-loaded", "worker-context-loaded"].includes(event.checkpoint)).at(-1);
      const ack = records.filter((event) => event.checkpoint === "blackbox-storage-ping-ack" && event.result === "ok").at(-1);
      const failed = records.filter((event) => event.checkpoint === "blackbox-storage-ping-failed").at(-1);
      const workerProvedStorage = context === "filechute-service-worker" && Boolean(loaded?.sequence);
      return { context, status: workerProvedStorage || (ack && (!failed || Number(ack.sequence) > Number(failed.sequence))) ? "ok" : loaded ? "degraded" : "unknown", loadedSequence: loaded?.sequence || null, persistenceAckSequence: ack?.sequence || null, lastFailureSequence: failed?.sequence || null };
    });
  }

  function signatures(records) {
    const found = records.map((event) => event.failureSignature);
    const has = (checkpoint, predicate = () => true) => records.some((event) => event.checkpoint === checkpoint && predicate(event));
    if (has("dragover", isPhysical) && !has("drop", isPhysical)) found.push("physical-dragover-without-physical-drop");
    if (has("receiver-physical-drop-claimed") && !has("receiver-byte-request-started")) found.push("physical-drop-without-worker-byte-request");
    if (has("receiver-byte-request-result", (e) => e.result === "ok") && !has("receiver-input-assignment-result", (e) => e.result === "ok")) found.push("byte-response-without-input-assignment");
    if (has("receiver-synthetic-construction-attempt")) found.push("synthetic-DragEvent-construction-attempted");
    if (has("receiver-synthetic-dispatch-attempt")) found.push("synthetic-DragEvent-dispatch-attempted");
    if (has("dragend", (e) => e.transfer?.dropEffect === "none" || e.dropEffect === "none")) found.push("dragend-dropEffect-none");
    if (has("pointerdown") && !has("dragstart")) found.push("pointerdown-without-dragstart");
    return unique(found);
  }

  function summarizeGroup(id, records, kind) {
    const checkpoints = records.map((event) => event.checkpoint);
    let lastGood = null;
    let firstMissing = null;
    for (const expected of EXPECTED) {
      const match = records.find((event) => expected.names.includes(event.checkpoint));
      if (!match || ["failed", "timeout"].includes(match.result)) { firstMissing = match?.checkpoint || expected.label; break; }
      lastGood = match.checkpoint;
    }
    const failed = records.find((event) => ["failed", "timeout"].includes(event.result));
    if (failed) firstMissing = failed.checkpoint;
    const owner = firstMissing === "dragstart" || (lastGood === "dragover" && firstMissing === "drop") ? "unknown / Chromium-owned boundary" : records.find((event) => event.checkpoint === firstMissing)?.handler || contextOf(records.at(-1) || {}) || "unknown";
    return { [kind]: id, attemptNumber: records.find((event) => event.attemptNumber)?.attemptNumber || null, transferToken: records.find((event) => event.transferToken)?.transferToken || null, receiverStrategy: records.find((event) => event.receiverStrategy)?.receiverStrategy || null, orderedCheckpoints: checkpoints, physicalEventCount: records.filter((event) => event.eventOrigin === "physical").length, syntheticEventCount: records.filter((event) => event.eventOrigin === "synthetic").length, failureSignatures: signatures(records), lastConfirmedGoodCheckpoint: lastGood, firstFailedOrMissingCheckpoint: firstMissing, owningComponent: owner };
  }

  function analyze(rawEvents) {
    const events = ordered((rawEvents || []).filter(Boolean));
    const attemptsMap = new Map();
    const tokensMap = new Map();
    for (const event of events) {
      if (event.attemptId) { if (!attemptsMap.has(event.attemptId)) attemptsMap.set(event.attemptId, []); attemptsMap.get(event.attemptId).push(event); }
      if (event.transferToken) { if (!tokensMap.has(event.transferToken)) tokensMap.set(event.transferToken, []); tokensMap.get(event.transferToken).push(event); }
    }
    // Join destination/worker records back to their sender attempt by transferToken.
    // The token is the only correlation key that crosses extension contexts.
    for (const records of attemptsMap.values()) {
      const tokens = unique(records.map((event) => event.transferToken));
      for (const token of tokens) {
        for (const event of tokensMap.get(token) || []) if (!records.includes(event)) records.push(event);
      }
      records.sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
    }
    const attempts = [...attemptsMap].map(([id, records]) => summarizeGroup(id, records, "attemptId"));
    const transfers = [...tokensMap].map(([id, records]) => summarizeGroup(id, records, "transferToken"));
    let best = null;
    let firstDivergence = null;
    for (const attempt of attempts) {
      const score = attempt.orderedCheckpoints.length;
      if (best) {
        const index = attempt.orderedCheckpoints.findIndex((checkpoint, i) => checkpoint !== best.orderedCheckpoints[i]);
        if (!firstDivergence && (index >= 0 || score < best.orderedCheckpoints.length)) {
          const boundary = index >= 0 ? index : score;
          firstDivergence = { attemptId: attempt.attemptId, previousMoreCompleteAttemptId: best.attemptId, lastConfirmedGoodCheckpoint: boundary ? attempt.orderedCheckpoints[boundary - 1] : null, firstDivergentCheckpoint: attempt.orderedCheckpoints[boundary] || `missing:${best.orderedCheckpoints[boundary] || "unknown"}`, owningComponent: attempt.owningComponent };
        }
      }
      if (!best || score > best.orderedCheckpoints.length) best = attempt;
    }
    return { algorithm: "filechute-first-divergence-v1", recorderHealth: health(events), attempts, transfers, physicalEventCount: events.filter((event) => event.eventOrigin === "physical").length, syntheticEventCount: events.filter((event) => event.eventOrigin === "synthetic").length, distinctFailureSignatures: unique(events.map((event) => event.failureSignature).concat(attempts.flatMap((attempt) => attempt.failureSignatures))), firstDivergentAttempt: firstDivergence };
  }
  globalThis.FileChuteBlackBoxAnalyzer = { analyze };
})();
