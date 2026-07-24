/**
 * Tiny in-app toast for release debugging of PDF/Gemini path.
 * Uses Alert only for hard failures; soft status goes to console.warn.
 */
import { Alert } from 'react-native';

let lastGeminiNote = '';

export function setLastGeminiNote(note: string) {
  lastGeminiNote = note;
}

export function getLastGeminiNote(): string {
  return lastGeminiNote;
}

export function alertPdfPipelineError(title: string, message: string) {
  Alert.alert(title, message);
}
