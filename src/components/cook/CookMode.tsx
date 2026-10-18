"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { createChatSession } from "@/components/chat/chatSession";
import { playEarcon, unlockChime } from "@/lib/cook/chime";
import type { Recipe } from "@/lib/recipe/schema";
import type { UnitSystem } from "@/lib/recipe/units";
import { useCookStore } from "@/lib/store/cookStore";
import { buildVoiceContext } from "@/lib/voice/context";
import { runVoiceTool } from "@/lib/voice/tools";
import type { VoiceTurn } from "@/lib/voice/types";
import { voiceSupported, WakeWordListener, WebSpeechProvider } from "@/lib/voice/webSpeech";
import { CookModeView } from "./CookModeView";
import type { WakeState } from "./WakePill";

// Live cook mode (PRD §5.6, §5.7). Steps and timers come from the cook store; voice is the Web Speech
// stub: the wake listener hands over to a voice session, and the session hands back when it goes idle.

export type CookModeProps = {
  recipeKey: string;
  /** The working copy as shown now. Voice edits change it through the chat pipeline. */
  recipe: Recipe;
  allergies: string[];
  unit: UnitSystem;
  /** True when the user just pressed Start cooking (a gesture), so the mic may start. */
  armOnStart: boolean;
};

type Voice = { provider: WebSpeechProvider; listener: WakeWordListener };

const BLOCKED_NOTICE = "The microphone is blocked. Allow it for this site to use voice, or keep cooking by tapping.";
const UNSUPPORTED_NOTICE = "Voice works in Chrome or Edge. Steps and timers work here too.";
const subscribeNothing = () => () => {};

export function CookMode({ recipeKey, recipe, allergies, unit, armOnStart }: CookModeProps) {
  const cook = useCookStore(
    useShallow((state) => ({ currentStepId: state.currentStepId, doneStepIds: state.doneStepIds, timers: state.timers })),
  );
  const supported = useSyncExternalStore(subscribeNothing, voiceSupported, () => false);
  const [voice, setVoice] = useState<WakeState>(armOnStart && supported ? "armed" : "off");
  const [transcript, setTranscript] = useState<VoiceTurn[]>([]);
  const [notice, setNotice] = useState<string | null>(
    !supported ? UNSUPPORTED_NOTICE : armOnStart ? null : "Voice is off. Tap the mic to talk to Saffron.",
  );
  const voiceRef = useRef<Voice | null>(null);
  // Whether the wake word should listen between voice sessions. Off after End cooking or a blocked mic.
  const wantWakeRef = useRef(armOnStart);
  const latest = useRef({ recipe, allergies, unit });

  useEffect(() => {
    latest.current = { recipe, allergies, unit };
    voiceRef.current?.provider.updateContext(contextNow());
  });

  function contextNow() {
    const { recipe: current, allergies: list, unit: system } = latest.current;
    return buildVoiceContext(current, useCookStore.getState(), list, system);
  }

  useEffect(() => {
    if (!supported) return;
    const chat = createChatSession(recipeKey);
    const provider = new WebSpeechProvider({
      runTool: (call) =>
        runVoiceTool(call, {
          steps: () => latest.current.recipe.steps,
          async editRecipe(instruction) {
            const outcome = await chat.send(instruction);
            if (outcome.ok) return outcome.summary ? outcome.summary.replace(/[^.!?]$/, "$&.") : outcome.reply;
            return outcome.reason === "busy" ? "I'm still working on the last change." : "I couldn't change the recipe. Try again.";
          },
        }),
    });
    const listener = new WakeWordListener(
      (rest) => {
        playEarcon();
        void provider.start({ firstUtterance: rest, context: contextNow() });
      },
      (error) => {
        wantWakeRef.current = false;
        setVoice("off");
        setNotice(error === "unsupported" ? UNSUPPORTED_NOTICE : BLOCKED_NOTICE);
      },
    );
    const offStatus = provider.onStatus((status) => {
      if (status !== "idle") {
        setVoice(status);
        return;
      }
      if (wantWakeRef.current) listener.arm();
      setVoice(listener.isArmed ? "armed" : "off");
    });
    const offTurn = provider.onTurn((turn) => setTranscript((turns) => [...turns, turn].slice(-6)));
    voiceRef.current = { provider, listener };
    // The pill starts at "armed" when this runs; a blocked or missing mic reports back through onBlocked.
    if (wantWakeRef.current) listener.arm();
    return () => {
      offStatus();
      offTurn();
      listener.disarm();
      void provider.stop();
      chat.dispose();
      voiceRef.current = null;
    };
  }, [recipeKey, supported]);

  function tapToTalk() {
    unlockChime();
    const current = voiceRef.current;
    if (!current) {
      toast(notice ?? UNSUPPORTED_NOTICE);
      return;
    }
    if (voice === "listening" || voice === "thinking" || voice === "speaking") {
      void current.provider.stop();
      return;
    }
    wantWakeRef.current = true;
    setNotice(null);
    current.listener.disarm();
    void current.provider.start({ context: contextNow() });
  }

  function endCooking() {
    wantWakeRef.current = false;
    voiceRef.current?.listener.disarm();
    void voiceRef.current?.provider.stop();
    useCookStore.getState().end();
    toast("Cooking ended. Mic is off.");
  }

  return (
    <CookModeView
      recipe={recipe}
      currentStepId={cook.currentStepId}
      doneStepIds={cook.doneStepIds}
      timers={cook.timers}
      voice={voice}
      transcript={transcript}
      notice={notice}
      onFocusStep={(id) => useCookStore.getState().focusStep(id)}
      onMarkDone={(id) => useCookStore.getState().markDone(id)}
      onStartTimer={(step, index) => {
        unlockChime();
        if (step.timer && step.timer.max > 0) {
          useCookStore.getState().startTimer({ label: `Step ${index + 1}`, minutes: step.timer.max, stepId: step.id });
        }
      }}
      onCancelTimer={(id) => useCookStore.getState().cancelTimer(id)}
      onTapToTalk={tapToTalk}
      onEnd={endCooking}
    />
  );
}
