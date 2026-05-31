export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionConstructor());
}

export function createSpeechRecognition({ language, continuous = false } = {}) {
  const SpeechRecognition = getSpeechRecognitionConstructor();

  if (!SpeechRecognition) {
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = continuous;
  recognition.interimResults = true;
  recognition.lang = language || "en-US";
  recognition.maxAlternatives = 1;

  return recognition;
}

export function getRecognitionErrorMessage(error) {
  const messages = {
    "not-allowed":
      "Microphone permission was denied. Enable microphone access in your browser settings.",
    "service-not-allowed":
      "Voice input is blocked by this browser or device.",
    "no-speech": "No speech was detected. Try again when you are ready.",
    "audio-capture":
      "No microphone was found. Check your input device and try again.",
    network: "Speech recognition had a network issue. Please try again.",
    aborted: "Listening was cancelled.",
  };

  return messages[error] || "Speech recognition failed. Please try again.";
}
