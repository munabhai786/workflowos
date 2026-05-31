export function isTextToSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getSpeechSynthesis() {
  if (!isTextToSpeechSupported()) return null;
  return window.speechSynthesis;
}

export function getAvailableVoices() {
  const synth = getSpeechSynthesis();
  return synth ? synth.getVoices() : [];
}

export function createSpeechUtterance(text, settings = {}, voices = []) {
  if (typeof window === "undefined" || !("SpeechSynthesisUtterance" in window)) {
    return null;
  }

  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.rate = Number(settings.rate) || 1;
  utterance.lang = settings.language || "en-US";

  const preferredVoice = voices.find(
    (voice) => voice.name === settings.voiceName
  );

  if (preferredVoice) {
    utterance.voice = preferredVoice;
    utterance.lang = preferredVoice.lang;
  }

  return utterance;
}
