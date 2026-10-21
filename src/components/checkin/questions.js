export const CHECKIN_QUESTIONS = {
  learning: {
    instruction: "Listen carefully.",
    prompt: "Remember these words.",
    button: "Continue",
  },
  orientation: {
    instruction: "ORIENTATION",
    prompt: "Which one is today?",
  },
  fluency: {
    instruction: "FLUENCY",
    prompt: (category) => `Name as many ${category.toLowerCase()} as you can`,
    answerButton: "Tap to answer",
    stopButton: "Finish",
  },
  fluencyReview: {
    title: "Is this what you said?",
    retry: "Retry",
    fix: "Fix it",
    next: "Yes",
    correctionLabel: "Correct what you heard",
    cancel: "Cancel",
    save: "Save correction",
    emptyAnswer: "Nothing was heard yet.",
  },
  recall: {
    instruction: "FREE RECALL",
    prompt: "Now say the 3 words you heard at the start.",
    answerButton: "Tap to answer",
    stopButton: "Finish",
  },
  recallReview: {
    title: "Is this what you said?",
    retry: "Retry",
    fix: "Fix it",
    next: "Yes",
    correctionLabel: "Correct what you heard",
    cancel: "Cancel",
    save: "Save correction",
    emptyAnswer: "Nothing was heard yet.",
  },
  recognition: {
    instruction: "PICTURE RECOGNITION",
    prompt: "Tap the words from before.",
    button: "Finish",
  },
  feedback: {
    waiting: "Tap the microphone when you are ready.",
  },
};

export const CHECKIN_TASK_ORDER = [
  "learning",
  "orientation",
  "fluency",
  "recall",
  "recognition",
];
