const SWIPE_DISTANCE_PX = 48;
const SWIPE_DOMINANCE = 1.4;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function normalizeLocalPoint(clientPoint, rect) {
  const clientX = finite(clientPoint?.clientX) ? clientPoint.clientX : clientPoint?.x;
  const clientY = finite(clientPoint?.clientY) ? clientPoint.clientY : clientPoint?.y;
  if (
    !finite(clientX)
    || !finite(clientY)
    || !finite(rect?.left)
    || !finite(rect?.top)
    || !finite(rect?.width)
    || !finite(rect?.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return { x: 0, y: 0 };
  }

  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function classifyBackgroundSwipe(sample) {
  if (
    !sample
    || sample.interactiveStart
    || sample.pointerCount !== 1
    || sample.canceled
    || sample.owned
  ) return null;

  const deltaX = sample.end?.x - sample.start?.x;
  const deltaY = sample.end?.y - sample.start?.y;
  if (!finite(deltaX) || !finite(deltaY)) return null;

  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  if (horizontal < SWIPE_DISTANCE_PX || horizontal < vertical * SWIPE_DOMINANCE) return null;
  return deltaX < 0 ? 'next' : 'previous';
}

export function amountFromHold(elapsedMs, ratePerSecond, max) {
  if (!finite(elapsedMs) || !finite(ratePerSecond) || !finite(max)) return 0;
  if (elapsedMs <= 0 || ratePerSecond <= 0 || max <= 0) return 0;
  return Math.min(max, (elapsedMs / 1_000) * ratePerSecond);
}

function startedOnInteractiveElement(event) {
  if (event.interactiveStart === true) return true;
  const target = event.target;
  return typeof target?.closest === 'function'
    && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
}

export function createPointerRouter({ canvas, hitTest, handlers = {} }) {
  if (!canvas || typeof canvas.addEventListener !== 'function') {
    throw new TypeError('createPointerRouter requires an event target canvas');
  }
  if (typeof hitTest !== 'function') {
    throw new TypeError('createPointerRouter requires hitTest');
  }

  let active = null;
  let background = null;
  let recoveryMode = false;

  const makeSample = (event) => ({
    pointerId: event.pointerId,
    client: { x: event.clientX, y: event.clientY },
    local: normalizeLocalPoint(event, canvas.getBoundingClientRect()),
    originalEvent: event,
  });

  const releaseCapture = (pointerId) => {
    try {
      canvas.releasePointerCapture?.(pointerId);
    } catch {
      // Capture can already have been released by the browser.
    }
  };

  const cancelActive = ({ release = true, event = null } = {}) => {
    if (!active) return;
    const current = active;
    active = null;
    handlers.pointerCancel?.(current.owner, event ? makeSample(event) : current.lastSample);
    if (release) releaseCapture(current.pointerId);
  };

  const onPointerDown = (event) => {
    if (recoveryMode) return;

    if (active) return;
    if (background) {
      if (background.pointerId !== event.pointerId) background.pointerCount = 2;
      return;
    }

    const sample = makeSample(event);
    const owner = hitTest(sample);
    if (owner != null) {
      active = { pointerId: event.pointerId, owner, lastSample: sample };
      canvas.setPointerCapture?.(event.pointerId);
      handlers.pointerStart?.(owner, sample);
      return;
    }

    background = {
      pointerId: event.pointerId,
      start: sample.client,
      end: sample.client,
      pointerCount: 1,
      interactiveStart: startedOnInteractiveElement(event),
      canceled: false,
      owned: false,
    };
  };

  const onPointerMove = (event) => {
    if (active?.pointerId === event.pointerId) {
      const sample = makeSample(event);
      active.lastSample = sample;
      handlers.pointerMove?.(active.owner, sample);
    } else if (background?.pointerId === event.pointerId) {
      background.end = { x: event.clientX, y: event.clientY };
    }
  };

  const onPointerUp = (event) => {
    if (active?.pointerId === event.pointerId) {
      const current = active;
      const sample = makeSample(event);
      active = null;
      handlers.pointerEnd?.(current.owner, sample);
      releaseCapture(event.pointerId);
      return;
    }

    if (background?.pointerId === event.pointerId) {
      background.end = { x: event.clientX, y: event.clientY };
      const gesture = background;
      background = null;
      const direction = classifyBackgroundSwipe(gesture);
      if (direction) handlers.backgroundSwipe?.(direction, gesture);
    }
  };

  const onPointerCancel = (event) => {
    if (active?.pointerId === event.pointerId) {
      cancelActive({ event });
    } else if (background?.pointerId === event.pointerId) {
      background = null;
    }
  };

  const onLostPointerCapture = (event) => {
    if (active?.pointerId === event.pointerId) cancelActive({ release: false, event });
  };

  const listeners = {
    pointerdown: onPointerDown,
    pointermove: onPointerMove,
    pointerup: onPointerUp,
    pointercancel: onPointerCancel,
    lostpointercapture: onLostPointerCapture,
  };
  for (const [type, listener] of Object.entries(listeners)) {
    canvas.addEventListener(type, listener);
  }

  return {
    getOwner: () => active?.owner ?? null,
    setRecoveryMode(enabled) {
      recoveryMode = Boolean(enabled);
      if (recoveryMode) {
        cancelActive();
        background = null;
      }
    },
    dispose() {
      cancelActive();
      background = null;
      for (const [type, listener] of Object.entries(listeners)) {
        canvas.removeEventListener(type, listener);
      }
    },
  };
}
