const listenersKey = Symbol("listeners");

export default function EventTargetMixin(Base) {
  // Based on https://github.com/piranna/EventTarget.js
  return class EventTarget extends Base {
    constructor(...args) {
      super(...args);
      this[listenersKey] = {};
    }

    addEventListener(type, callback) {
      if (!callback) {
        return;
      }

      let listenersOfType = this[listenersKey][type];
      if (!listenersOfType) {
        this[listenersKey][type] = [];
        listenersOfType = this[listenersKey][type];
      }

      // Don't add the same callback twice.
      if (listenersOfType.includes(callback)) {
        return;
      }

      listenersOfType.push(callback);
    }

    dispatchEvent(event) {
      if (!(event instanceof Event)) {
        throw TypeError("Argument to dispatchEvent must be an Event");
      }

      let stopImmediatePropagation = false;
      let defaultPrevented = false;

      Object.defineProperties(event, {
        cancelable: { value: true, enumerable: true },
        defaultPrevented: { enumerable: true, get: () => defaultPrevented },
        isTrusted: { value: false, enumerable: true },
        target: { value: this, enumerable: true },
        timeStamp: { value: new Date().getTime(), enumerable: true },
      });

      event.preventDefault = function () {
        if (this.cancelable) {
          defaultPrevented = true;
        }
      };
      event.stopImmediatePropagation = function () {
        stopImmediatePropagation = true;
      };
      event.stopPropagation = function () {
        // This is a no-op because we don't support event bubbling.
      };

      const type = event.type;
      const listenersOfType = this[listenersKey][type] || [];
      for (const listener of listenersOfType) {
        if (stopImmediatePropagation) {
          break;
        }
        listener.call(this, event);
      }

      return !event.defaultPrevented;
    }

    removeEventListener(type, callback) {
      if (!callback) {
        return;
      }

      let listenersOfType = this[listenersKey][type];
      if (!listenersOfType) {
        return;
      }

      // Remove callback from listeners.
      listenersOfType = listenersOfType.filter(
        (listener) => listener !== callback
      );

      // If there are no more listeners for this type, remove the type.
      if (listenersOfType.length === 0) {
        delete this[listenersKey][type];
      } else {
        this[listenersKey][type] = listenersOfType;
      }
    }
  };
}
