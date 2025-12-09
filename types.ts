
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isAudioPlaying?: boolean;
}

export enum CallState {
  IDLE = 'IDLE',
  DIALING = 'DIALING',
  CONNECTED = 'CONNECTED',
  ENDED = 'ENDED'
}

export interface ChatState {
  messages: Message[];
  status: CallState;
  isLoading: boolean;
  error: string | null;
}

export interface FeedbackCriteria {
  score: number; // 1-10
  feedback: string;
}

export interface FeedbackReport {
  professionalOpening: FeedbackCriteria;
  clearCommunication: FeedbackCriteria;
  targetedQuestions: FeedbackCriteria;
  activeListening: FeedbackCriteria;
  clearClosing: FeedbackCriteria;
  overallSummary: string;
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  companyName: string;
  companyColor: string; // Hex code
  isIncomingCall: boolean; // true = AI calls student, false = Student calls AI
  roleStudent: string;
  roleAI: string;
  context: string;
  assignment: string;
  systemInstruction: string;
  feedbackPrompt: string;
  avatarUrl: string;
  externalLink?: string;
}
