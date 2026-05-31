import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createSpeechRecognition,
  getRecognitionErrorMessage,
  isSpeechRecognitionSupported,
} from "../utils/speechRecognition";
import {
  createSpeechUtterance,
  getAvailableVoices,
  getSpeechSynthesis,
  isTextToSpeechSupported,
} from "../utils/textToSpeech";

const VOICE_SETTINGS_KEY = "workflowos_ai_copilot_voice_settings";

const DEFAULT_SETTINGS = {
  autoReadResponses: false,
  autoSendTranscript: false,
  rate: 1,
  language: "en-US",
  voiceName: "",
};

function loadSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY));
    return {
      ...DEFAULT_SETTINGS,
      ...(saved || {}),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function useVoiceAssistant({ onTranscriptFinal } = {}) {
  const [settings, setSettings] = useState(loadSettings);
  const [voiceState, setVoiceState] = useState("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voices, setVoices] = useState([]);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);

  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const onTranscriptFinalRef = useRef(onTranscriptFinal);

  const speechSupported = useMemo(() => isSpeechRecognitionSupported(), []);
  const ttsSupported = useMemo(() => isTextToSpeechSupported(), []);

  useEffect(() => {
    onTranscriptFinalRef.current = onTranscriptFinal;
  }, [onTranscriptFinal]);

  useEffect(() => {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!ttsSupported) return undefined;

    const synth = getSpeechSynthesis();
    const refreshVoices = () => setVoices(getAvailableVoices());

    refreshVoices();
    synth?.addEventListener?.("voiceschanged", refreshVoices);

    return () => {
      synth?.removeEventListener?.("voiceschanged", refreshVoices);
    };
  }, [ttsSupported]);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    setVoiceState("processing");
  }, []);

  const cancelListening = useCallback(() => {
    listeningRef.current = false;
    finalTranscriptRef.current = "";
    recognitionRef.current?.abort();
    setInterimTranscript("");
    setFinalTranscript("");
    setVoiceError("");
    setVoiceState("idle");
  }, []);

  const startListening = useCallback(() => {
    if (!speechSupported) {
      setVoiceError("Voice input is not supported in this browser.");
      setVoiceState("error");
      return;
    }

    if (listeningRef.current) {
      stopListening();
      return;
    }

    const recognition = createSpeechRecognition({
      language: settings.language,
      continuous: false,
    });

    if (!recognition) {
      setVoiceError("Voice input is not supported in this browser.");
      setVoiceState("error");
      return;
    }

    finalTranscriptRef.current = "";
    setInterimTranscript("");
    setFinalTranscript("");
    setVoiceError("");
    setVoiceState("listening");

    recognition.onresult = (event) => {
      let interim = "";
      let committed = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || "";

        if (event.results[index].isFinal) {
          committed += transcript;
        } else {
          interim += transcript;
        }
      }

      if (committed) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${committed}`.trim();
        setFinalTranscript(finalTranscriptRef.current);
      }

      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event) => {
      const message = getRecognitionErrorMessage(event.error);

      listeningRef.current = false;
      setVoiceError(message);
      setVoiceState(event.error === "aborted" ? "idle" : "error");
    };

    recognition.onend = () => {
      const transcript = finalTranscriptRef.current.trim();

      listeningRef.current = false;
      recognitionRef.current = null;
      setInterimTranscript("");

      if (transcript) {
        setVoiceState("idle");
        onTranscriptFinalRef.current?.(transcript, {
          autoSend: settings.autoSendTranscript,
        });
        return;
      }

      setVoiceState((current) => (current === "error" ? "error" : "idle"));
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;

    try {
      recognition.start();
    } catch {
      listeningRef.current = false;
      setVoiceError("Voice input could not start. Please try again.");
      setVoiceState("error");
    }
  }, [settings.autoSendTranscript, settings.language, speechSupported, stopListening]);

  const cancelSpeaking = useCallback(() => {
    getSpeechSynthesis()?.cancel();
    setSpeakingMessageId(null);
  }, []);

  const speak = useCallback(
    (messageId, text) => {
      if (!ttsSupported || !text?.trim()) return;

      const synth = getSpeechSynthesis();

      if (speakingMessageId === messageId) {
        cancelSpeaking();
        return;
      }

      synth?.cancel();

      const utterance = createSpeechUtterance(text, settings, voices);
      if (!utterance || !synth) return;

      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);

      setSpeakingMessageId(messageId);
      synth.speak(utterance);
    },
    [cancelSpeaking, settings, speakingMessageId, ttsSupported, voices]
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      getSpeechSynthesis()?.cancel();
    };
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((current) => ({
      ...current,
      ...patch,
    }));
  }, []);

  return {
    settings,
    updateSettings,
    voiceState,
    interimTranscript,
    finalTranscript,
    voiceError,
    voices,
    speechSupported,
    ttsSupported,
    speakingMessageId,
    startListening,
    stopListening,
    cancelListening,
    speak,
    cancelSpeaking,
  };
}
